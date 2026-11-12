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
    /// Profit report for a date range — aggregates daily profits and transaction counts.
    /// </summary>
    public async Task<ApiResponse<ProfitReportDto>> GetProfitReportAsync(Guid companyId, DateTime from, DateTime to)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        // bureau-local days, end day included; an omitted date means no limit
        var (rf, rt) = BureauClock.Range(from, to);
        var fromUtc = rf ?? DateTime.SpecifyKind(DateTime.MinValue, DateTimeKind.Utc);
        var toExclusive = rt ?? DateTime.SpecifyKind(DateTime.MaxValue, DateTimeKind.Utc);
        var exchanges = await _context.ExchangeTransactions.AsNoTracking()
            .Where(e => e.CompanyId == companyId
                        && e.TransactionDate >= fromUtc
                        && e.TransactionDate < toExclusive
                        && e.Status == "Completed"
                        && !e.IsDeleted)
            .ToListAsync();

        var dailyBreakdown = exchanges
            .GroupBy(e => e.TransactionDate.Date)
            .Select(g => new DailyProfitDto(
                Date: g.Key,
                KesProfit: g.Where(e => e.ProfitCurrency == baseCur).Sum(e => e.Profit),
                UsdProfit: g.Where(e => e.ProfitCurrency == Currency.USD).Sum(e => e.Profit),
                Transactions: g.Count()
            ))
            .OrderByDescending(d => d.Date)
            .ToList();

        var totalKesProfit = exchanges.Where(e => e.ProfitCurrency == baseCur).Sum(e => e.Profit);
        var totalUsdProfit = exchanges.Where(e => e.ProfitCurrency == Currency.USD).Sum(e => e.Profit);

        // Current USD sell rate for the KES equivalent of (legacy) USD profit
        var rate = await ActiveRateAsync(companyId, Currency.USD);
        var rateVal = rate?.SellRate ?? 0;
        var totalInKes = totalKesProfit + (totalUsdProfit * rateVal);

        // Average spread across the period
        decimal avgSpread = 0;
        if (exchanges.Count > 0)
        {
            var rates = await _context.ExchangeRates
                .Where(r => r.CompanyId == companyId && r.ForeignCurrency == Currency.USD
                            && r.EffectiveFrom >= from.Date && r.EffectiveFrom <= to.Date.AddDays(1))
                .ToListAsync();
            if (rates.Count > 0)
                avgSpread = rates.Average(r => r.SellRate - r.BuyRate);
            else if (rate != null)
                avgSpread = rate.SellRate - rate.BuyRate;
        }

        var report = new ProfitReportDto(
            FromDate: from.Date,
            ToDate: to.Date,
            TotalKesProfit: totalKesProfit,
            TotalUsdProfit: totalUsdProfit,
            TotalProfitInKes: totalInKes,
            TotalTransactions: exchanges.Count,
            AverageSpread: avgSpread,
            DailyBreakdown: dailyBreakdown,
            BaseCurrency: baseCur
        );

        return new ApiResponse<ProfitReportDto>(true, "Success", report);
    }

    /// <summary>
    /// Large transactions for CBK compliance reporting.
    /// Returns all exchanges where KES equivalent >= threshold.
    /// </summary>
    public async Task<ApiResponse<List<LargeTransactionReportDto>>> GetLargeTransactionsAsync(Guid companyId, DateTime from, DateTime to, decimal threshold)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        // bureau-local days, end day included; an omitted date means no limit
        var (rf, rt) = BureauClock.Range(from, to);
        var fromUtc = rf ?? DateTime.SpecifyKind(DateTime.MinValue, DateTimeKind.Utc);
        var toExclusive = rt ?? DateTime.SpecifyKind(DateTime.MaxValue, DateTimeKind.Utc);
        var exchanges = await _context.ExchangeTransactions.AsNoTracking()
            .Where(e => e.CompanyId == companyId
                        && e.TransactionDate >= fromUtc
                        && e.TransactionDate < toExclusive
                        && e.Status == "Completed"
                        && !e.IsDeleted)
            .ToListAsync();

        // Get client details for matching exchanges
        var clientIds = exchanges.Where(e => e.ClientId.HasValue).Select(e => e.ClientId!.Value).Distinct().ToList();
        var clients = await _context.Users
            .Where(u => clientIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u);

        var results = new List<LargeTransactionReportDto>();

        foreach (var e in exchanges)
        {
            decimal kesEquivalent = e.CurrencyGiven == baseCur
                ? e.AmountGiven
                : e.AmountReceived; // KES side of the exchange

            if (kesEquivalent < threshold) continue;

            User? client = e.ClientId.HasValue ? clients.GetValueOrDefault(e.ClientId.Value) : null;

            results.Add(new LargeTransactionReportDto(
                TransactionId: e.Id,
                Code: e.Code,
                Date: e.TransactionDate,
                ClientName: client?.FullName ?? e.ClientName ?? "Walk-in Client",
                ClientIdNumber: e.ClientIdNumber ?? client?.IdPassport ?? "N/A",
                ClientPhone: client?.WhatsAppNumber,
                Amount: e.AmountGiven,
                Currency: e.CurrencyGiven,
                KesEquivalent: kesEquivalent,
                TransactionType: $"{e.Direction} ({e.ExchangeType})"
            ));
        }

        return new ApiResponse<List<LargeTransactionReportDto>>(true, "Success",
            results.OrderByDescending(r => r.KesEquivalent).ToList());
    }

    /// <summary>
    /// Client's complete exchange history with totals.
    /// </summary>
    public async Task<ApiResponse<ClientExchangeHistoryDto>> GetClientExchangeHistoryAsync(Guid companyId, Guid clientId)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var client = await _context.Users.FindAsync(clientId);
        if (client == null || client.CompanyId != companyId)
            return new ApiResponse<ClientExchangeHistoryDto>(false, "Client not found", null);

        var exchanges = await _context.ExchangeTransactions.AsNoTracking()
            .Where(e => e.CompanyId == companyId && e.ClientId == clientId
                        && e.Status == "Completed" && !e.IsDeleted)
            .OrderByDescending(e => e.TransactionDate)
            .ToListAsync();

        var float_ = await GetOrCreateFloatAsync(companyId);

        var recentExchanges = exchanges.Take(20).Select(e =>
        {
            decimal kesEq = e.CurrencyGiven == baseCur ? e.AmountGiven : e.AmountReceived;
            return MapToExchangeDto(e, client.FullName, client.ClientType?.ToString() ?? "",
                kesEq >= float_.LargeTransactionThreshold);
        }).ToList();

        var history = new ClientExchangeHistoryDto(
            ClientId: clientId,
            ClientName: client.FullName,
            TotalExchanges: exchanges.Count,
            TotalKesExchanged: exchanges.Where(e => e.CurrencyGiven == baseCur).Sum(e => e.AmountGiven)
                             + exchanges.Where(e => e.CurrencyReceived == baseCur).Sum(e => e.AmountReceived),
            TotalUsdExchanged: exchanges.Where(e => e.CurrencyGiven == Currency.USD).Sum(e => e.AmountGiven)
                             + exchanges.Where(e => e.CurrencyReceived == Currency.USD).Sum(e => e.AmountReceived),
            TotalProfitGenerated: exchanges.Sum(e => e.Profit),
            FirstExchange: exchanges.LastOrDefault()?.TransactionDate,
            LastExchange: exchanges.FirstOrDefault()?.TransactionDate,
            RecentExchanges: recentExchanges
        );

        return new ApiResponse<ClientExchangeHistoryDto>(true, "Success", history);
    }

    /// <summary>
    /// USD Position — average cost inventory tracking.
    /// Shows current USD holdings, cost basis, and unrealized P&L based on current sell rate.
    /// </summary>
    public async Task<ApiResponse<UsdPositionDto>> GetUsdPositionAsync(Guid companyId)
    {
        var float_ = await GetOrCreateFloatAsync(companyId);
        var rate = await ActiveRateAsync(companyId, Currency.USD);

        var currentMarketRate = rate?.SellRate ?? 0;
        var marketValue = float_.UsdBalance * currentMarketRate;
        var unrealizedPnL = marketValue - float_.UsdTotalCost;
        var unrealizedPnLPercent = float_.UsdTotalCost > 0
            ? (unrealizedPnL / float_.UsdTotalCost) * 100
            : 0;

        var position = new UsdPositionDto(
            UsdBalance: float_.UsdBalance,
            AverageCostPerUsd: float_.UsdAverageCost,
            TotalCostBasis: float_.UsdTotalCost,
            CurrentMarketRate: currentMarketRate,
            CurrentMarketValue: marketValue,
            UnrealizedPnL: unrealizedPnL,
            UnrealizedPnLPercent: Math.Round(unrealizedPnLPercent, 2)
        );

        return new ApiResponse<UsdPositionDto>(true, "Success", position);
    }

    /// <summary>
    /// Float alerts — checks low balance thresholds and returns active warnings.
    /// </summary>
    public async Task<ApiResponse<List<FloatAlertDto>>> GetAlertsAsync(Guid companyId)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var float_ = await GetOrCreateFloatAsync(companyId);
        var alerts = new List<FloatAlertDto>();
        var now = DateTime.UtcNow;

        // Low KES balance
        if (float_.KesBalance < float_.LowKesThreshold)
        {
            alerts.Add(new FloatAlertDto(
                AlertType: "LowBalance",
                Message: $"{baseCur} float balance ({float_.KesBalance:N2}) is below threshold ({float_.LowKesThreshold:N2})",
                Currency: baseCur,
                CurrentBalance: float_.KesBalance,
                Threshold: float_.LowKesThreshold,
                Timestamp: now
            ));
        }

        // Low USD balance
        if (float_.UsdBalance < float_.LowUsdThreshold)
        {
            alerts.Add(new FloatAlertDto(
                AlertType: "LowBalance",
                Message: $"USD float balance (${float_.UsdBalance:N2}) is below threshold (${float_.LowUsdThreshold:N2})",
                Currency: Currency.USD,
                CurrentBalance: float_.UsdBalance,
                Threshold: float_.LowUsdThreshold,
                Timestamp: now
            ));
        }

        // Negative balance (critical)
        if (float_.KesBalance < 0)
        {
            alerts.Add(new FloatAlertDto(
                AlertType: "NegativeBalance",
                Message: $"CRITICAL: {baseCur} float is negative ({float_.KesBalance:N2})",
                Currency: baseCur,
                CurrentBalance: float_.KesBalance,
                Threshold: 0,
                Timestamp: now
            ));
        }

        if (float_.UsdBalance < 0)
        {
            alerts.Add(new FloatAlertDto(
                AlertType: "NegativeBalance",
                Message: $"CRITICAL: USD float is negative (${float_.UsdBalance:N2})",
                Currency: Currency.USD,
                CurrentBalance: float_.UsdBalance,
                Threshold: 0,
                Timestamp: now
            ));
        }

        // Negative UGX / EUR / ... float (critical)
        var negativeOthers = await _context.ExchangeFloatBalances
            .Where(b => b.CompanyId == companyId && b.Balance < 0)
            .ToListAsync();
        foreach (var b in negativeOthers)
        {
            alerts.Add(new FloatAlertDto(
                AlertType: "NegativeBalance",
                Message: $"CRITICAL: {b.Currency} float is negative ({b.Balance:N2})",
                Currency: b.Currency,
                CurrentBalance: b.Balance,
                Threshold: 0,
                Timestamp: now
            ));
        }

        // Unsettled profit alert (if profit is large)
        var unsettledProfit = float_.KesProfit + float_.UsdProfit;
        var highProfit = CurrencyInfo.FromKes(100_000m, baseCur);
        if (unsettledProfit > highProfit)
        {
            alerts.Add(new FloatAlertDto(
                AlertType: "HighUnsettledProfit",
                Message: $"Unsettled profit is high: {baseCur} {float_.KesProfit:N2} + USD {float_.UsdProfit:N2}. Consider settling.",
                Currency: null,
                CurrentBalance: unsettledProfit,
                Threshold: highProfit,
                Timestamp: now
            ));
        }

        return new ApiResponse<List<FloatAlertDto>>(true, "Success", alerts);
    }

    /// <summary>
    /// Update alert thresholds for the float.
    /// </summary>
    public async Task<ApiResponse<bool>> UpdateAlertThresholdsAsync(Guid companyId, decimal lowKes, decimal lowUsd, decimal largeTransaction)
    {
        if (lowKes < 0 || lowUsd < 0 || largeTransaction < 0)
            return new ApiResponse<bool>(false, "Thresholds must be non-negative", false);

        var float_ = await GetOrCreateFloatAsync(companyId);

        float_.LowKesThreshold = lowKes;
        float_.LowUsdThreshold = lowUsd;
        float_.LargeTransactionThreshold = largeTransaction;
        float_.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return new ApiResponse<bool>(true, "Thresholds updated", true);
    }
}
