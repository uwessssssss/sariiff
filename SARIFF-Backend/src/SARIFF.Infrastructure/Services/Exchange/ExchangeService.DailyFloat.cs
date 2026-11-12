using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public partial class ExchangeService
{
    /// <summary>
    /// Get today's daily summary — builds it from live data if not closed.
    /// Morning: shows opening float + today's exchanges.
    /// Evening: shows full day summary before closing.
    /// </summary>
    public async Task<ApiResponse<DailySummaryDto>> GetTodaySummaryAsync(Guid companyId)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var today = BureauClock.TodayLocal;            // the summary's date: the bureau's calendar day
        var todayStartUtc = BureauClock.TodayStartUtc;  // ...which starts at this UTC instant

        // Check if there's an existing summary for today
        var existing = await _context.DailyExchangeSummaries
            .FirstOrDefaultAsync(d => d.CompanyId == companyId && d.Date == today && !d.IsDeleted);

        if (existing != null)
            return new ApiResponse<DailySummaryDto>(true, "Success",
                MapToDailySummaryDto(existing, await DayCurrencyRowsAsync(existing.Id), baseCur));

        // Build live summary from today's exchanges
        var float_ = await GetOrCreateFloatAsync(companyId);
        var todayExchanges = await _context.ExchangeTransactions.AsNoTracking()
            .Where(e => e.CompanyId == companyId && e.TransactionDate >= todayStartUtc
                        && e.Status == "Completed" && !e.IsDeleted)
            .ToListAsync();

        var totalTransactions = await _context.Transactions
            .CountAsync(t => t.CompanyId == companyId && t.TransactionDate >= todayStartUtc && !t.IsDeleted);

        var dto = new DailySummaryDto(
            Date: today,
            TotalTransactions: totalTransactions,
            ExchangeCount: todayExchanges.Count,
            KesVolumeIn: todayExchanges.Where(e => e.CurrencyGiven == baseCur).Sum(e => e.AmountGiven),
            KesVolumeOut: todayExchanges.Where(e => e.CurrencyReceived == baseCur).Sum(e => e.AmountReceived),
            UsdVolumeIn: todayExchanges.Where(e => e.CurrencyGiven == Currency.USD).Sum(e => e.AmountGiven),
            UsdVolumeOut: todayExchanges.Where(e => e.CurrencyReceived == Currency.USD).Sum(e => e.AmountReceived),
            KesProfit: todayExchanges.Where(e => e.ProfitCurrency == baseCur).Sum(e => e.Profit),
            UsdProfit: todayExchanges.Where(e => e.ProfitCurrency == Currency.USD).Sum(e => e.Profit),
            OpeningKes: float_.LastOpeningKes ?? float_.KesBalance,
            OpeningUsd: float_.LastOpeningUsd ?? float_.UsdBalance,
            ClosingKes: float_.KesBalance,
            ClosingUsd: float_.UsdBalance,
            KesVariance: null,
            UsdVariance: null,
            IsClosed: false,
            OtherCurrencies: await LiveOtherCurrencyDayAsync(companyId, todayExchanges, null),
            BaseCurrency: baseCur
        );

        return new ApiResponse<DailySummaryDto>(true, "Success", dto);
    }

    /// <summary>
    /// Record opening float — cashier physically counts KES/USD at start of day.
    /// Stores the opening snapshot and checks for variance against system balance.
    /// </summary>
    public async Task<ApiResponse<DailySummaryDto>> RecordOpeningFloatAsync(Guid companyId, Guid userId, OpeningFloatDto dto)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var today = BureauClock.TodayLocal;            // the summary's date: the bureau's calendar day
        var todayStartUtc = BureauClock.TodayStartUtc;  // ...which starts at this UTC instant
        var float_ = await GetOrCreateFloatAsync(companyId);

        // Check if already recorded today
        var existing = await _context.DailyExchangeSummaries
            .FirstOrDefaultAsync(d => d.CompanyId == companyId && d.Date == today && !d.IsDeleted);

        if (existing != null)
            return new ApiResponse<DailySummaryDto>(false, "Opening float already recorded for today",
                MapToDailySummaryDto(existing, await DayCurrencyRowsAsync(existing.Id), baseCur));

        // Record the opening physical count
        float_.LastOpeningDate = today;
        float_.LastOpeningKes = dto.KesCount;
        float_.LastOpeningUsd = dto.UsdCount;
        float_.UpdatedAt = DateTime.UtcNow;

        // Create daily summary with opening values
        var summary = new DailyExchangeSummary
        {
            CompanyId = companyId,
            Date = today,
            OpeningKes = dto.KesCount,
            OpeningUsd = dto.UsdCount,
            ClosingKes = float_.KesBalance,
            ClosingUsd = float_.UsdBalance,
            Notes = dto.Notes,
            IsClosed = false
        };

        _context.DailyExchangeSummaries.Add(summary);

        // UGX, EUR, ... opening counts (one row per currency)
        var openingRows = new List<DailyExchangeCurrencySummary>();
        foreach (var count in (dto.OtherCounts ?? new List<CurrencyCountDto>())
                     .Where(c => c.Currency != baseCur && c.Currency != Currency.USD)
                     .GroupBy(c => c.Currency).Select(g => g.Last()))
        {
            var holding = await _context.ExchangeFloatBalances
                .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.Currency == count.Currency);
            var row = new DailyExchangeCurrencySummary
            {
                CompanyId = companyId,
                DailyExchangeSummaryId = summary.Id,
                Date = today,
                Currency = count.Currency,
                Opening = count.Count,
                Closing = holding?.Balance ?? 0
            };
            _context.DailyExchangeCurrencySummaries.Add(row);
            openingRows.Add(row);
        }

        await _context.SaveChangesAsync();

        return new ApiResponse<DailySummaryDto>(true, "Opening float recorded", MapToDailySummaryDto(summary, openingRows, baseCur));
    }

    /// <summary>
    /// Record closing float — cashier physically counts KES/USD at end of day.
    /// Calculates variance (physical count - system balance).
    /// Locks the day from further edits.
    /// </summary>
    public async Task<ApiResponse<DailySummaryDto>> RecordClosingFloatAsync(Guid companyId, Guid userId, ClosingFloatDto dto)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var today = BureauClock.TodayLocal;            // the summary's date: the bureau's calendar day
        var todayStartUtc = BureauClock.TodayStartUtc;  // ...which starts at this UTC instant

        var summary = await _context.DailyExchangeSummaries
            .FirstOrDefaultAsync(d => d.CompanyId == companyId && d.Date == today && !d.IsDeleted);

        if (summary == null)
        {
            // No opening recorded — auto-create with current float as opening
            var floatForOpening = await GetOrCreateFloatAsync(companyId);
            summary = new DailyExchangeSummary
            {
                CompanyId = companyId,
                Date = today,
                OpeningKes = floatForOpening.KesBalance,
                OpeningUsd = floatForOpening.UsdBalance,
                IsClosed = false
            };
            _context.DailyExchangeSummaries.Add(summary);
        }

        if (summary.IsClosed)
            return new ApiResponse<DailySummaryDto>(false, "Today's summary is already closed",
                MapToDailySummaryDto(summary, await DayCurrencyRowsAsync(summary.Id), baseCur));

        var float_ = await GetOrCreateFloatAsync(companyId);

        // Compute today's exchange volumes
        var todayExchanges = await _context.ExchangeTransactions
            .Where(e => e.CompanyId == companyId && e.TransactionDate >= todayStartUtc
                        && e.Status == "Completed" && !e.IsDeleted)
            .ToListAsync();

        summary.ExchangeCount = todayExchanges.Count;
        summary.KesVolumeIn = todayExchanges.Where(e => e.CurrencyGiven == baseCur).Sum(e => e.AmountGiven);
        summary.KesVolumeOut = todayExchanges.Where(e => e.CurrencyReceived == baseCur).Sum(e => e.AmountReceived);
        summary.UsdVolumeIn = todayExchanges.Where(e => e.CurrencyGiven == Currency.USD).Sum(e => e.AmountGiven);
        summary.UsdVolumeOut = todayExchanges.Where(e => e.CurrencyReceived == Currency.USD).Sum(e => e.AmountReceived);
        summary.KesProfit = todayExchanges.Where(e => e.ProfitCurrency == baseCur).Sum(e => e.Profit);
        summary.UsdProfit = todayExchanges.Where(e => e.ProfitCurrency == Currency.USD).Sum(e => e.Profit);

        // Closing = system balance
        summary.ClosingKes = float_.KesBalance;
        summary.ClosingUsd = float_.UsdBalance;

        // Physical count vs system → variance (positive = surplus, negative = shortage)
        summary.ActualKesCount = dto.KesCount;
        summary.ActualUsdCount = dto.UsdCount;
        summary.KesVariance = dto.KesCount - float_.KesBalance;
        summary.UsdVariance = dto.UsdCount - float_.UsdBalance;

        summary.Notes = dto.Notes;
        summary.IsClosed = true;
        summary.ClosedByUserId = userId;
        summary.ClosedAt = DateTime.UtcNow;
        summary.UpdatedAt = DateTime.UtcNow;

        // UGX, EUR, ...: closing = system balance, variance = physical count - system
        var counts = (dto.OtherCounts ?? new List<CurrencyCountDto>())
            .GroupBy(c => c.Currency).ToDictionary(g => g.Key, g => g.Last().Count);
        var rows = await DayCurrencyRowsAsync(summary.Id);
        var live = await LiveOtherCurrencyDayAsync(companyId, todayExchanges, rows);
        var currencies = live.Select(l => l.Currency)
            .Concat(counts.Keys.Where(c => c != baseCur && c != Currency.USD))
            .Distinct().ToList();
        foreach (var cur in currencies)
        {
            var row = rows.FirstOrDefault(r => r.Currency == cur);
            if (row == null)
            {
                var holding = await _context.ExchangeFloatBalances
                    .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.Currency == cur);
                row = new DailyExchangeCurrencySummary
                {
                    CompanyId = companyId,
                    DailyExchangeSummaryId = summary.Id,
                    Date = today,
                    Currency = cur,
                    Opening = holding?.Balance ?? 0   // no opening count → system balance
                };
                _context.DailyExchangeCurrencySummaries.Add(row);
                rows.Add(row);
            }
            var l = live.FirstOrDefault(x => x.Currency == cur);
            row.Closing = l?.Closing ?? 0;
            row.VolumeIn = l?.VolumeIn ?? 0;
            row.VolumeOut = l?.VolumeOut ?? 0;
            if (counts.TryGetValue(cur, out var counted))
            {
                row.ActualCount = counted;
                row.Variance = counted - row.Closing;
            }
            row.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        return new ApiResponse<DailySummaryDto>(true, "Day closed successfully", MapToDailySummaryDto(summary, rows, baseCur));
    }

    /// <summary>
    /// Get daily summaries for a date range.
    /// </summary>
    public async Task<ApiResponse<List<DailySummaryDto>>> GetDailySummariesAsync(Guid companyId, DateTime from, DateTime to)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var summaries = await _context.DailyExchangeSummaries
            .Where(d => d.CompanyId == companyId && d.Date >= from.Date && d.Date <= to.Date && !d.IsDeleted)
            .OrderByDescending(d => d.Date)
            .ToListAsync();

        var ids = summaries.Select(s => s.Id).ToList();
        var allRows = await _context.DailyExchangeCurrencySummaries
            .Where(r => ids.Contains(r.DailyExchangeSummaryId))
            .ToListAsync();

        return new ApiResponse<List<DailySummaryDto>>(true, "Success",
            summaries.Select(s => MapToDailySummaryDto(s, allRows.Where(r => r.DailyExchangeSummaryId == s.Id).ToList(), baseCur)).ToList());
    }
}
