using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public partial class ExchangeService
{
    // ==================== HELPER METHODS ====================

    private async Task<ExchangeFloat> GetOrCreateFloatAsync(Guid companyId)
    {
        var float_ = await _context.ExchangeFloats.FirstOrDefaultAsync(f => f.CompanyId == companyId);
        if (float_ != null) return float_;
        var baseCur = await _context.BaseCurrencyAsync(companyId);

        // Float doesn't exist — try to create it
        try
        {
            float_ = new ExchangeFloat
            {
                CompanyId = companyId,
                KesBalance = 0,   // Kes* columns = the company's base currency
                UsdBalance = 0,
                KesProfit = 0,
                UsdProfit = 0,
                // Defaults sized for the base currency (KES 50,000 ≈ UGX 1,400,000)
                LowKesThreshold = CurrencyInfo.FromKes(50_000m, baseCur),
                LowUsdThreshold = 500,
                LargeTransactionThreshold = CurrencyInfo.FromKes(500_000m, baseCur)
            };
            _context.ExchangeFloats.Add(float_);
            await _context.SaveChangesAsync();
            return float_;
        }
        catch (DbUpdateException)
        {
            // Another request created it first — detach our failed entity and re-query
            _context.Entry(float_!).State = EntityState.Detached;
            return await _context.ExchangeFloats.FirstAsync(f => f.CompanyId == companyId);
        }
    }

    // Both helpers check the bureau themselves, so no caller can touch another bureau's
    // account by passing its id (callers also validate first; this is the second lock).
    private async Task<decimal> GetAccountBalanceAsync(Guid companyId, AccountType type, Guid accountId)
    {
        return type switch
        {
            AccountType.Cash => (await _context.CashAccounts.FirstOrDefaultAsync(a => a.Id == accountId && a.CompanyId == companyId))?.Balance ?? 0,
            AccountType.Bank => (await _context.BankAccounts.FirstOrDefaultAsync(a => a.Id == accountId && a.CompanyId == companyId))?.Balance ?? 0,
            AccountType.Mpesa => (await _context.MpesaAgents.FirstOrDefaultAsync(a => a.Id == accountId && a.CompanyId == companyId))?.Balance ?? 0,
            _ => 0
        };
    }

    private async Task UpdateAccountBalanceAsync(Guid companyId, AccountType type, Guid accountId, decimal amount)
    {
        switch (type)
        {
            case AccountType.Cash:
                var cash = await _context.CashAccounts.FirstOrDefaultAsync(a => a.Id == accountId && a.CompanyId == companyId);
                if (cash != null) { cash.Balance += amount; cash.UpdatedAt = DateTime.UtcNow; }
                break;
            case AccountType.Bank:
                var bank = await _context.BankAccounts.FirstOrDefaultAsync(a => a.Id == accountId && a.CompanyId == companyId);
                if (bank != null) { bank.Balance += amount; bank.UpdatedAt = DateTime.UtcNow; }
                break;
            case AccountType.Mpesa:
                var mpesa = await _context.MpesaAgents.FirstOrDefaultAsync(a => a.Id == accountId && a.CompanyId == companyId);
                if (mpesa != null) { mpesa.Balance += amount; mpesa.UpdatedAt = DateTime.UtcNow; }
                break;
        }
    }

    /// <summary>
    /// FIXED: Create transaction with proper balance fields
    /// </summary>
    private async Task CreateFloatTransactionAsync(
        Guid companyId, Guid userId, AccountType accountType, Guid accountId,
        TransactionType txnType, decimal amount, Currency currency,
        decimal balanceBefore, decimal balanceAfter,
        string description, string? notes)
    {
        var transaction = new Transaction
        {
            Code = await CodeGenerator.GenerateTransactionCodeAsync(_context, companyId),
            CompanyId = companyId,
            Reference = "FLOAT-TXN",
            TransactionDate = DateTime.UtcNow,
            TransactionType = txnType,
            Amount = amount,
            Currency = currency,
            Description = description,
            Notes = notes,
            SourceAccountType = accountType,
            SourceAccountId = accountId,
            SourceBalanceBefore = balanceBefore,   // FIXED: Now included
            SourceBalanceAfter = balanceAfter,     // FIXED: Now included
            DestAccountType = accountType,
            DestAccountId = accountId,
            DestBalanceBefore = balanceBefore,     // FIXED: Now included
            DestBalanceAfter = balanceAfter,       // FIXED: Now included
            CreatedByUserId = userId
        };
        _context.Transactions.Add(transaction);
    }

    private static ExchangeRateResponseDto MapRateToResponse(ExchangeRate r) => new(
        r.Id, r.BuyRate, r.SellRate, r.EffectiveFrom, r.EffectiveTo, r.IsActive,
        r.ForeignCurrency, r.ForeignCurrency.ToString()
    );

    private static ExchangeResponseDto MapToExchangeDto(ExchangeTransaction e, string clientName, string clientType, bool isLarge) => new(
        e.Id, e.Code, e.TransactionDate, e.ClientId, clientName, clientType,
        e.ExchangeType, e.Direction, e.AmountGiven, e.CurrencyGiven,
        e.AmountReceived, e.CurrencyReceived, e.ExchangeRate,
        e.Profit, e.ProfitCurrency, e.Notes, e.Status, isLarge
    );

    private static DailySummaryDto MapToDailySummaryDto(DailyExchangeSummary d, List<DailyExchangeCurrencySummary> rows, Currency baseCur) => new(
        d.Date, 0, d.ExchangeCount,
        d.KesVolumeIn, d.KesVolumeOut,
        d.UsdVolumeIn, d.UsdVolumeOut,
        d.KesProfit, d.UsdProfit,
        d.OpeningKes, d.OpeningUsd,
        d.ClosingKes, d.ClosingUsd,
        d.KesVariance, d.UsdVariance,
        d.IsClosed,
        rows.OrderBy(r => r.Currency)
            .Select(r => new CurrencyDaySummaryDto(r.Currency, CurrencyInfo.Code(r.Currency),
                r.Opening, r.Closing, r.VolumeIn, r.VolumeOut, r.ActualCount, r.Variance))
            .ToList(),
        baseCur
    );

    private Task<List<DailyExchangeCurrencySummary>> DayCurrencyRowsAsync(Guid summaryId) =>
        _context.DailyExchangeCurrencySummaries
            .Where(r => r.DailyExchangeSummaryId == summaryId)
            .ToListAsync();

    /// <summary>
    /// Live day figures for currencies beyond KES/USD: every currency the float
    /// holds or that was traded today. Opening = recorded opening count when
    /// there is one, otherwise the current system balance (same rule as KES/USD).
    /// </summary>
    private async Task<List<CurrencyDaySummaryDto>> LiveOtherCurrencyDayAsync(
        Guid companyId, List<ExchangeTransaction> todayExchanges, List<DailyExchangeCurrencySummary>? rows)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var holdings = await _context.ExchangeFloatBalances
            .Where(b => b.CompanyId == companyId)
            .ToListAsync();
        var traded = todayExchanges.SelectMany(e => new[] { e.CurrencyGiven, e.CurrencyReceived });
        var currencies = holdings.Where(h => h.Balance != 0).Select(h => h.Currency)
            .Concat(traded)
            .Concat(rows?.Select(r => r.Currency) ?? Enumerable.Empty<Currency>())
            .Where(c => c != baseCur && c != Currency.USD)
            .Distinct().OrderBy(c => c).ToList();

        return currencies.Select(cur =>
        {
            var balance = holdings.FirstOrDefault(h => h.Currency == cur)?.Balance ?? 0;
            var row = rows?.FirstOrDefault(r => r.Currency == cur);
            return new CurrencyDaySummaryDto(cur, CurrencyInfo.Code(cur),
                row?.Opening ?? balance,
                balance,
                todayExchanges.Where(e => e.CurrencyGiven == cur).Sum(e => e.AmountGiven),
                todayExchanges.Where(e => e.CurrencyReceived == cur).Sum(e => e.AmountReceived),
                row?.ActualCount, row?.Variance);
        }).ToList();
    }
}
