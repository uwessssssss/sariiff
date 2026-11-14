using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public partial class ExchangeService
{
    // ==================== MULTI-CURRENCY HELPERS ====================
    // KES and USD live in dedicated columns (ExchangeFloat, User.BalanceKES/USD).
    // Every other currency lives in a per-currency row (ExchangeFloatBalance,
    // ClientCurrencyBalance). These helpers hide that split.

    /// <summary>True for currencies kept in per-currency rows: anything but the base and USD.</summary>
    private static bool IsOtherCurrency(Currency c, Currency baseCur) => c != baseCur && c != Currency.USD;

    private Task<ExchangeRate?> ActiveRateAsync(Guid companyId, Currency foreign) =>
        _context.ExchangeRates
            .Where(r => r.CompanyId == companyId && r.IsActive && r.ForeignCurrency == foreign)
            .OrderByDescending(r => r.EffectiveFrom)
            .FirstOrDefaultAsync();

    private async Task<ExchangeFloatBalance> GetOrCreateOtherFloatAsync(Guid companyId, Currency currency)
    {
        var row = await _context.ExchangeFloatBalances
            .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.Currency == currency);
        if (row != null) return row;
        row = new ExchangeFloatBalance { CompanyId = companyId, Currency = currency };
        _context.ExchangeFloatBalances.Add(row);   // saved with the caller's SaveChanges
        return row;
    }

    /// <summary>
    /// Float balance in any currency. The Kes* columns hold the company's BASE
    /// currency (KES in Kenya, UGX in Uganda — names are historical), USD has
    /// its own columns, every other currency lives in ExchangeFloatBalances.
    /// </summary>
    private static decimal FloatBalance(ExchangeFloat f, ExchangeFloatBalance? other, Currency c, Currency baseCur) =>
        c == baseCur ? f.KesBalance
        : c == Currency.USD ? f.UsdBalance
        : other?.Currency == c ? other.Balance : 0;

    /// <summary>
    /// Bureau acquires foreign currency: quantity in, KES cost added (average cost).
    /// When the float is short (negative after selling more than it held, possible on
    /// account exchanges), the first units only close that short — they were already
    /// costed at the buy rate when sold — so only the remainder adds to stock cost.
    /// Adding the full cost there inflated the average cost and understated the next
    /// sale's profit.
    /// </summary>
    private static void AddForeign(ExchangeFloat f, ExchangeFloatBalance? other, Currency c, decimal qty, decimal kesCost)
    {
        static decimal StockCost(decimal balance, decimal qty, decimal kesCost)
        {
            if (balance >= 0 || qty <= 0) return kesCost;
            var intoStock = Math.Max(0m, qty - (-balance));
            return kesCost * intoStock / qty;
        }

        if (c == Currency.USD)
        {
            f.UsdTotalCost = Math.Max(0m, f.UsdTotalCost) + StockCost(f.UsdBalance, qty, kesCost);
            f.UsdBalance += qty;
            f.UsdAverageCost = f.UsdBalance > 0 ? f.UsdTotalCost / f.UsdBalance : 0;
            if (f.UsdBalance <= 0) f.UsdTotalCost = 0;
            return;
        }
        if (other == null || other.Currency != c) throw new InvalidOperationException($"No float row loaded for {c}");
        other.TotalCost = Math.Max(0m, other.TotalCost) + StockCost(other.Balance, qty, kesCost);
        other.Balance += qty;
        other.AverageCost = other.Balance > 0 ? other.TotalCost / other.Balance : 0;
        if (other.Balance <= 0) other.TotalCost = 0;
        other.UpdatedAt = DateTime.UtcNow;
    }

    /// <summary>
    /// Bureau disposes of foreign currency: quantity out, cost removed at average cost.
    /// Returns the KES cost removed. Never removes more cost than it holds (selling more
    /// than the stock used to push TotalCost negative).
    /// </summary>
    private static decimal RemoveForeign(ExchangeFloat f, ExchangeFloatBalance? other, Currency c, decimal qty)
    {
        if (c == Currency.USD)
        {
            var covered = Math.Min(qty, Math.Max(0m, f.UsdBalance));
            var cut = f.UsdBalance > 0 ? (covered / f.UsdBalance) * f.UsdTotalCost : 0;
            f.UsdBalance -= qty;
            f.UsdTotalCost -= cut;
            f.UsdAverageCost = f.UsdBalance > 0 ? f.UsdTotalCost / f.UsdBalance : 0;
            return cut;
        }
        if (other == null || other.Currency != c) throw new InvalidOperationException($"No float row loaded for {c}");
        var coveredOther = Math.Min(qty, Math.Max(0m, other.Balance));
        var cutOther = other.Balance > 0 ? (coveredOther / other.Balance) * other.TotalCost : 0;
        other.Balance -= qty;
        other.TotalCost -= cutOther;
        other.AverageCost = other.Balance > 0 ? other.TotalCost / other.Balance : 0;
        other.UpdatedAt = DateTime.UtcNow;
        return cutOther;
    }

    /// <summary>Average KES cost of one unit of a foreign currency held in the float (0 if none).</summary>
    private async Task<decimal> AverageCostAsync(Guid companyId, Currency foreign) =>
        foreign == Currency.USD
            ? await _context.ExchangeFloats.Where(f => f.CompanyId == companyId).Select(f => f.UsdAverageCost).FirstOrDefaultAsync()
            : await _context.ExchangeFloatBalances.Where(b => b.CompanyId == companyId && b.Currency == foreign).Select(b => b.AverageCost).FirstOrDefaultAsync();

    private async Task<decimal> ClientBalanceAsync(Guid companyId, User client, Currency c)
    {
        if (c == Currency.KES) return client.BalanceKES; // storage slot, not the base
        if (c == Currency.USD) return client.BalanceUSD;
        var row = await _context.ClientCurrencyBalances
            .FirstOrDefaultAsync(b => b.ClientId == client.Id && b.CompanyId == companyId && b.Currency == c && !b.IsDeleted);
        return row?.Balance ?? 0;
    }

    /// <summary>Moves a client's balance in any currency. Returns (before, after).</summary>
    private async Task<(decimal Before, decimal After)> AdjustClientBalanceAsync(Guid companyId, User client, Currency c, decimal delta)
    {
        if (c == Currency.KES) // storage slot, not the base
        {
            var b = client.BalanceKES; client.BalanceKES += delta; return (b, client.BalanceKES);
        }
        if (c == Currency.USD)
        {
            var b = client.BalanceUSD; client.BalanceUSD += delta; return (b, client.BalanceUSD);
        }
        var row = await _context.ClientCurrencyBalances
            .FirstOrDefaultAsync(b => b.ClientId == client.Id && b.CompanyId == companyId && b.Currency == c && !b.IsDeleted);
        if (row == null)
        {
            row = new ClientCurrencyBalance { CompanyId = companyId, ClientId = client.Id, Currency = c };
            _context.ClientCurrencyBalances.Add(row);
        }
        var before = row.Balance;
        row.Balance += delta;
        if (delta > 0) row.TotalIn += delta; else row.TotalOut += -delta;
        row.UpdatedAt = DateTime.UtcNow;
        return (before, row.Balance);
    }

    /// <summary>One leg of a client-account exchange, as a client statement line.</summary>
    private static Transaction ClientLeg(Guid companyId, Guid userId, Guid clientId, string exchangeCode,
        TransactionType type, decimal amount, Currency currency, decimal before, decimal after, string description,
        string? reference = null, string? notes = null) => new()
    {
        CompanyId = companyId,
        Reference = reference ?? $"EXC-{exchangeCode}",
        TransactionDate = DateTime.UtcNow,
        TransactionType = type,
        Amount = amount,
        Currency = currency,
        Description = description,
        Notes = notes ?? $"Exchange Code: {exchangeCode}",
        SourceAccountType = AccountType.Client,
        SourceAccountId = clientId,
        SourceBalanceBefore = before,
        SourceBalanceAfter = after,
        DestAccountType = AccountType.Client,
        DestAccountId = clientId,
        DestBalanceBefore = before,
        DestBalanceAfter = after,
        CreatedByUserId = userId
    };

    /// <summary>The currency an office account holds (mobile money: its network's currency). Null if not found.</summary>
    private async Task<Currency?> GetAccountCurrencyAsync(Guid companyId, AccountType type, Guid accountId) => type switch
    {
        AccountType.Cash => await _context.CashAccounts.Where(a => a.Id == accountId && a.CompanyId == companyId && !a.IsDeleted)
            .Select(a => (Currency?)a.Currency).FirstOrDefaultAsync(),
        AccountType.Bank => await _context.BankAccounts.Where(a => a.Id == accountId && a.CompanyId == companyId && !a.IsDeleted)
            .Select(a => (Currency?)a.Currency).FirstOrDefaultAsync(),
        AccountType.Mpesa => await _context.MpesaAgents.Where(a => a.Id == accountId && a.CompanyId == companyId && !a.IsDeleted)
                .Select(a => new { a.Currency }).FirstOrDefaultAsync() is { } m
            ? (Currency?)(m.Currency ?? await _context.BaseCurrencyAsync(companyId)) : null,
        _ => (Currency?)null
    };

    private async Task<ExchangeFloatDto> ToFloatDtoAsync(ExchangeFloat f)
    {
        var others = await _context.ExchangeFloatBalances
            .Where(b => b.CompanyId == f.CompanyId && b.Balance != 0)
            .OrderBy(b => b.Currency)
            .ToListAsync();
        // Include rows added in this unit of work but not yet re-queried
        var pending = _context.ExchangeFloatBalances.Local
            .Where(b => b.CompanyId == f.CompanyId && b.Balance != 0 && others.All(o => o.Id != b.Id));
        var list = others.Concat(pending).OrderBy(b => b.Currency)
            .Select(b => new FloatCurrencyBalanceDto(b.Currency, b.Currency.ToString(), b.Balance, b.AverageCost))
            .ToList();
        var baseCur = await _context.BaseCurrencyAsync(f.CompanyId);
        return new ExchangeFloatDto(f.Id, f.KesBalance, f.UsdBalance, f.KesProfit, f.UsdProfit, f.UsdAverageCost, f.UpdatedAt,
            list.Where(b => b.Currency != baseCur).ToList(), baseCur);
    }
}
