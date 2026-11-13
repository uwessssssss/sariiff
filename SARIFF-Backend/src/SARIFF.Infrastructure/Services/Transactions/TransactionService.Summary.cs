
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public partial class TransactionService
{
    public async Task<ApiResponse<TransactionSummaryDto>> GetTodaySummaryAsync(Guid companyId)
    {
        var today = BureauClock.TodayStartUtc; // the bureau's day, not the UTC day
        var transactions = await _context.Transactions.AsNoTracking()
            .Where(t => t.CompanyId == companyId && !t.IsDeleted && t.TransactionDate >= today && t.TransactionDate < today.AddDays(1))
            .ToListAsync();

        // Money in/out of the bureau's own tills (cash, bank, M-Pesa), per currency.
        // Only asset legs count, each in its own amount and currency: a debit to an
        // asset is money in, a credit is money out. A transfer between two tills shows
        // as both (nets to zero); exchange statement lines (client↔client) and expense
        // categories move no till money and add nothing. (This used to read the source
        // leg's type for every row, so a client-destination entry was counted backwards.)
        var flows = new Dictionary<Currency, (decimal Debit, decimal Credit)>();
        void Add(Currency c, decimal amount, bool moneyIn)
        {
            flows.TryGetValue(c, out var f);
            flows[c] = moneyIn ? (f.Debit + amount, f.Credit) : (f.Debit, f.Credit + amount);
        }

        foreach (var t in transactions)
        {
            if (IsAssetAccount(t.SourceAccountType))
                Add(t.Currency, t.Amount, moneyIn: t.TransactionType == TransactionType.Debit);
            // A posting whose two sides are the same till (money into or out of the exchange
            // float) counts once, above: it used to show as the same amount in AND out.
            var sameAccount = t.SourceAccountType == t.DestAccountType && t.SourceAccountId == t.DestAccountId;
            if (!sameAccount && IsAssetAccount(t.DestAccountType))
                Add(t.CounterCurrency ?? t.Currency, t.CounterAmount ?? t.Amount,
                    moneyIn: t.TransactionType == TransactionType.Credit); // dest leg is the opposite type
        }

        flows.TryGetValue(Currency.KES, out var kesFlow);
        flows.TryGetValue(Currency.USD, out var usdFlow);
        decimal totalDebitKES = kesFlow.Debit, totalCreditKES = kesFlow.Credit;
        decimal totalDebitUSD = usdFlow.Debit, totalCreditUSD = usdFlow.Credit;

        var summary = new TransactionSummaryDto(
            TotalCount: transactions.Count,
            TotalDebitKES: totalDebitKES,
            TotalDebitUSD: totalDebitUSD,
            TotalCreditKES: totalCreditKES,
            TotalCreditUSD: totalCreditUSD,
            NetFlowKES: totalDebitKES - totalCreditKES,    // Positive = net inflow
            NetFlowUSD: totalDebitUSD - totalCreditUSD,
            ByCurrency: flows.OrderBy(f => f.Key)
                .Select(f => new CurrencyFlowTotalsDto(f.Key, CurrencyInfo.Code(f.Key),
                    f.Value.Debit, f.Value.Credit, f.Value.Debit - f.Value.Credit))
                .ToList()
        );

        return new ApiResponse<TransactionSummaryDto>(true, "Success", summary);
    }

    public async Task<ApiResponse<List<TransactionResponseDto>>> GetRecentAsync(Guid companyId, int count = 10)
    {
        var transactions = await _context.Transactions.AsNoTracking()
            .Where(t => t.CompanyId == companyId && !t.IsDeleted)
            .OrderByDescending(t => t.TransactionDate)
            .Take(count)
            .ToListAsync();

        await PreloadAccountNamesAsync(transactions);
        var items = new List<TransactionResponseDto>();
        foreach (var t in transactions)
        {
            items.Add(await MapToResponseAsync(t));
        }

        return new ApiResponse<List<TransactionResponseDto>>(true, "Success", items);
    }
}
