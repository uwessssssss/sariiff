
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using System.Globalization;
using System.Text;

namespace SARIFF.Infrastructure.Services;

public partial class ClientPortalService
{
    // ==================== PRIVATE HELPERS ====================

    private IQueryable<Transaction> GetClientTransactionsQuery(Guid companyId, Guid clientId)
    {
        // AccountType.Client = 3 in backend enums
        return _context.Transactions
            .Where(t => t.CompanyId == companyId && !t.IsDeleted &&
                ((t.SourceAccountType == AccountType.Client && t.SourceAccountId == clientId) ||
                 (t.DestAccountType == AccountType.Client && t.DestAccountId == clientId)));
    }

    private ClientTransactionDto MapToClientTransactionDto(Transaction txn, Guid clientId)
    {
        var isSource = txn.SourceAccountType == AccountType.Client && txn.SourceAccountId == clientId;

        // From client's perspective:
        // If client is SOURCE and TransactionType is Debit -> Client is debited (money out)
        // If client is SOURCE and TransactionType is Credit -> Client is credited (money in)
        // If client is DEST and TransactionType is Debit -> Client is credited (money in)
        // If client is DEST and TransactionType is Credit -> Client is debited (money out)
        
        string type;
        decimal amount, balanceBefore, balanceAfter;
        Currency currency;

        if (isSource)
        {
            // Client is the primary account
            type = txn.TransactionType == TransactionType.Debit ? "Debit" : "Credit";
            amount = txn.Amount;
            currency = txn.Currency;
            balanceBefore = txn.SourceBalanceBefore;
            balanceAfter = txn.SourceBalanceAfter;
        }
        else
        {
            // Client is the counter account
            type = txn.TransactionType == TransactionType.Debit ? "Credit" : "Debit";
            amount = txn.CounterAmount ?? txn.Amount;
            currency = txn.CounterCurrency ?? txn.Currency;
            balanceBefore = txn.DestBalanceBefore;
            balanceAfter = txn.DestBalanceAfter;
        }

        return new ClientTransactionDto
        {
            Id = txn.Id,
            Code = txn.Code,
            Date = txn.TransactionDate,
            Time = BureauClock.ToLocal(txn.TransactionDate).ToString("HH:mm"), // bureau time, not UTC
            Type = type,
            TransactionType = txn.TransactionType,
            Description = txn.Description,
            Amount = amount,
            Currency = currency,
            BalanceBefore = balanceBefore,
            BalanceAfter = balanceAfter,
            Reference = txn.Reference,
            Notes = txn.Notes,
            Status = txn.ReconciliationStatus,
            CreatedAt = txn.CreatedAt,
            CounterAccountType = isSource ? txn.DestAccountType : txn.SourceAccountType,
            ExchangeRate = txn.ExchangeRate,
            CounterAmount = isSource ? txn.CounterAmount : txn.Amount,
            CounterCurrency = isSource ? txn.CounterCurrency : txn.Currency,
            IsReversed = txn.DeletedAt.HasValue && !txn.IsDeleted,
            IsReversal = txn.Reference.StartsWith("REV-")
        };
    }

    /// <summary>The currency of the CLIENT's side of a posting (the counter currency when the
    /// client is the second side of a cross-currency posting).</summary>
    private static Currency LegCurrency(Transaction txn, Guid clientId) =>
        txn.SourceAccountType == AccountType.Client && txn.SourceAccountId == clientId
            ? txn.Currency
            : txn.CounterCurrency ?? txn.Currency;

    /// <summary>
    /// Every posting on the client's account, oldest first, as the client sees it, with a
    /// running balance per currency that starts from the account's opening balances. The last
    /// line of each currency ends on the client's current balance in that currency.
    /// </summary>
    private async Task<List<ClientTransactionDto>> LedgerAsync(Guid companyId, Guid clientId)
    {
        var client = await _context.Users.FirstOrDefaultAsync(u => u.Id == clientId && u.CompanyId == companyId);
        var running = new Dictionary<Currency, decimal>
        {
            [Currency.KES] = client?.OpeningBalanceKES ?? 0,
            [Currency.USD] = client?.OpeningBalanceUSD ?? 0
        };
        // UGX, EUR, ... openings live in ClientCurrencyBalances.
        foreach (var o in await _context.ClientCurrencyBalances
                     .Where(b => b.ClientId == clientId && b.CompanyId == companyId && !b.IsDeleted)
                     .Select(b => new { b.Currency, b.OpeningBalance }).ToListAsync())
            running[o.Currency] = o.OpeningBalance;

        var transactions = await GetClientTransactionsQuery(companyId, clientId)
            .OrderBy(t => t.TransactionDate).ThenBy(t => t.CreatedAt)
            .ToListAsync();

        var lines = new List<ClientTransactionDto>(transactions.Count);
        foreach (var txn in transactions)
        {
            var line = MapToClientTransactionDto(txn, clientId);
            running.TryGetValue(line.Currency, out var balance);
            line.BalanceBefore = balance;
            balance += line.Type == "Credit" ? line.Amount : -line.Amount;
            line.BalanceAfter = balance;
            running[line.Currency] = balance;
            lines.Add(line);
        }
        return lines;
    }

    /// <summary>Money in / out per currency beyond KES and USD, on the client's own side.</summary>
    private List<CurrencyFlowDto> OtherCurrencyFlows(List<Transaction> transactions, Guid clientId) =>
        transactions
            .GroupBy(t => LegCurrency(t, clientId))
            .Where(g => g.Key != Currency.KES && g.Key != Currency.USD)
            .OrderBy(g => (int)g.Key)
            .Select(g =>
            {
                var (cin, cout, _, _) = CalculateInOutForCurrency(g.ToList(), clientId, g.Key);
                return new CurrencyFlowDto { Currency = g.Key, CurrencyCode = g.Key.ToString(), Income = cin, Expenses = cout };
            })
            .ToList();

    /// <summary>The bureau's name, as its clients' statements and receipts should show it.</summary>
    private async Task<string> BureauNameAsync(Guid companyId) =>
        await _context.Companies.Where(c => c.Id == companyId).Select(c => c.Name).FirstOrDefaultAsync() ?? string.Empty;

    private async Task<ClientProfileDto> BuildProfileAsync(Guid companyId, User client)
    {
        var transactions = await GetClientTransactionsQuery(companyId, client.Id).ToListAsync();
        var (inKES, outKES, inUSD, outUSD) = CalculateInOut(transactions, client.Id);

        // Balances in currencies beyond KES/USD (UGX, EUR, ...)
        var otherBalances = await _context.ClientCurrencyBalances
            .Where(b => b.ClientId == client.Id && b.CompanyId == companyId && !b.IsDeleted)
            .OrderBy(b => b.Currency)
            .Select(b => new CurrencyBalanceDto
            {
                Currency = b.Currency,
                CurrencyCode = b.Currency.ToString(),
                Balance = b.Balance,
                OpeningBalance = b.OpeningBalance,
                TotalIn = b.TotalIn,
                TotalOut = b.TotalOut
            })
            .ToListAsync();

        return new ClientProfileDto
        {
            Id = client.Id,
            Code = client.Code,
            FullName = client.FullName,
            Email = client.Email,
            WhatsAppNumber = client.WhatsAppNumber,
            IdPassport = client.IdPassport,
            ClientType = client.ClientType ?? ClientType.Temporary,
            BalanceKES = client.BalanceKES,
            BalanceUSD = client.BalanceUSD,
            OpeningBalanceKES = client.OpeningBalanceKES,
            OpeningBalanceUSD = client.OpeningBalanceUSD,
            TotalInKES = inKES,
            TotalOutKES = outKES,
            TotalInUSD = inUSD,
            TotalOutUSD = outUSD,
            IsActive = client.IsActive,
            CreatedAt = client.CreatedAt,
            LastLoginAt = client.LastLoginAt,
            OtherBalances = otherBalances,
            CompanyName = await BureauNameAsync(companyId)
        };
    }

    private (decimal inKES, decimal outKES, decimal inUSD, decimal outUSD) CalculateInOut(
        List<Transaction> transactions, Guid clientId)
    {
        decimal inKES = 0, outKES = 0, inUSD = 0, outUSD = 0;

        foreach (var txn in transactions)
        {
            var isSource = txn.SourceAccountType == AccountType.Client && txn.SourceAccountId == clientId;

            decimal amount;
            Currency currency;
            bool isCredit;

            if (isSource)
            {
                amount = txn.Amount;
                currency = txn.Currency;
                isCredit = txn.TransactionType == TransactionType.Credit;
            }
            else
            {
                amount = txn.CounterAmount ?? txn.Amount;
                currency = txn.CounterCurrency ?? txn.Currency;
                isCredit = txn.TransactionType == TransactionType.Debit;
            }

            if (currency == Currency.KES)
            {
                if (isCredit) inKES += amount;
                else outKES += amount;
            }
            else if (currency == Currency.USD)
            {
                if (isCredit) inUSD += amount;
                else outUSD += amount;
            }
            // Other currencies (UGX, EUR, ...) are handled by
            // CalculateInOutForCurrency, not folded into USD here.
        }

        return (inKES, outKES, inUSD, outUSD);
    }

    /// <summary>
    /// In/out flow for a single specific currency (used for UGX, EUR, ... in
    /// analytics). Returns the flow in the first two slots; the last two are
    /// always zero and exist only to mirror CalculateInOut's shape.
    /// </summary>
    private (decimal cin, decimal cout, decimal _a, decimal _b) CalculateInOutForCurrency(
        List<Transaction> transactions, Guid clientId, Currency target)
    {
        decimal cin = 0, cout = 0;
        foreach (var txn in transactions)
        {
            var isSource = txn.SourceAccountType == AccountType.Client && txn.SourceAccountId == clientId;
            decimal amount;
            Currency currency;
            bool isCredit;
            if (isSource)
            {
                amount = txn.Amount;
                currency = txn.Currency;
                isCredit = txn.TransactionType == TransactionType.Credit;
            }
            else
            {
                amount = txn.CounterAmount ?? txn.Amount;
                currency = txn.CounterCurrency ?? txn.Currency;
                isCredit = txn.TransactionType == TransactionType.Debit;
            }
            if (currency != target) continue;
            if (isCredit) cin += amount;
            else cout += amount;
        }
        return (cin, cout, 0, 0);
    }
}
