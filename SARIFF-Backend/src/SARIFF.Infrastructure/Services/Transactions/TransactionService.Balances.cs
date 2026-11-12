
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public partial class TransactionService
{
    /// <summary>
    /// FIXED: Now uses accountId for cash accounts where appropriate
    /// </summary>
    private async Task<decimal?> MpesaBalanceInAsync(Guid companyId, Guid accountId, Currency currency)
    {
        var agent = await _context.MpesaAgents
            .Where(m => m.CompanyId == companyId && m.Id == accountId && !m.IsDeleted)
            .Select(m => new { m.Balance, m.Currency })
            .FirstOrDefaultAsync();
        if (agent == null) return null;
        var holds = agent.Currency ?? await _context.BaseCurrencyAsync(companyId);
        return holds == currency ? agent.Balance : null;
    }

    private async Task<decimal?> GetAccountBalanceAsync(Guid companyId, AccountType type, Guid accountId, Currency currency)
    {
        return type switch
        {
            // The account's currency must match the money posted to it. Without this a USD
            // amount posted to "Cash KES" was subtracted from shillings with no error.
            AccountType.Cash => await _context.CashAccounts
                .Where(c => c.CompanyId == companyId && c.Id == accountId && !c.IsDeleted && c.Currency == currency)
                .Select(c => (decimal?)c.Balance)
                .FirstOrDefaultAsync(),
            AccountType.Bank => await _context.BankAccounts
                .Where(b => b.CompanyId == companyId && b.Id == accountId && !b.IsDeleted && b.Currency == currency)
                .Select(b => (decimal?)b.Balance)
                .FirstOrDefaultAsync(),
            // A mobile money wallet holds its network's currency (M-Pesa = KES, MTN MoMo = UGX);
            // older wallets without one stored hold the home currency.
            AccountType.Mpesa => await MpesaBalanceInAsync(companyId, accountId, currency),
            AccountType.Client => currency == Currency.KES
                ? await _context.Users.Where(u => u.Id == accountId && u.CompanyId == companyId && !u.IsDeleted).Select(u => (decimal?)u.BalanceKES).FirstOrDefaultAsync()
                : currency == Currency.USD
                    ? await _context.Users.Where(u => u.Id == accountId && u.CompanyId == companyId && !u.IsDeleted).Select(u => (decimal?)u.BalanceUSD).FirstOrDefaultAsync()
                    // Other currencies (UGX, EUR, ...) live in ClientCurrencyBalances.
                    // A missing row means a zero balance for a valid client.
                    : await _context.Users.AnyAsync(u => u.Id == accountId && u.CompanyId == companyId && !u.IsDeleted)
                        ? (await _context.ClientCurrencyBalances
                            .Where(b => b.ClientId == accountId && b.CompanyId == companyId && b.Currency == currency && !b.IsDeleted)
                            .Select(b => (decimal?)b.Balance)
                            .FirstOrDefaultAsync()) ?? 0m
                        : null,
            AccountType.Expense => 0m, // Expense categories don't track running balance
            _ => null
        };
    }

    /// <summary>
    /// Writes an account's new balance. <paramref name="expectedBefore"/> is the balance the new
    /// one was worked out from: if the row now holds something else, another posting got in
    /// between, and writing would silently erase it — so this refuses (the caller rolls back and
    /// asks the user to retry). With BalanceLock on PostgreSQL this never fires; it is the guard
    /// for anything that skips the lock.
    /// </summary>
    private async Task UpdateAccountBalanceAsync(Guid companyId, AccountType type, Guid accountId, Currency currency, decimal expectedBefore, decimal newBalance)
    {
        void Same(decimal now)
        {
            if (now != expectedBefore)
                throw new DbUpdateConcurrencyException($"{type} {accountId}: balance is {now}, expected {expectedBefore}");
        }
        switch (type)
        {
            case AccountType.Cash:
                var cash = await _context.CashAccounts.FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Id == accountId && !c.IsDeleted);
                if (cash != null) { Same(cash.Balance); cash.Balance = newBalance; cash.UpdatedAt = DateTime.UtcNow; }
                break;
            case AccountType.Bank:
                var bank = await _context.BankAccounts.FirstOrDefaultAsync(b => b.Id == accountId && b.CompanyId == companyId && !b.IsDeleted);
                if (bank != null) { Same(bank.Balance); bank.Balance = newBalance; bank.UpdatedAt = DateTime.UtcNow; }
                break;
            case AccountType.Mpesa:
                var mpesa = await _context.MpesaAgents.FirstOrDefaultAsync(m => m.Id == accountId && m.CompanyId == companyId && !m.IsDeleted);
                if (mpesa != null) { Same(mpesa.Balance); mpesa.Balance = newBalance; mpesa.UpdatedAt = DateTime.UtcNow; }
                break;
            case AccountType.Client:
                var client = await _context.Users.FirstOrDefaultAsync(u => u.Id == accountId && u.CompanyId == companyId && !u.IsDeleted);
                if (client != null)
                {
                    if (currency == Currency.KES) { Same(client.BalanceKES); client.BalanceKES = newBalance; }
                    else if (currency == Currency.USD) { Same(client.BalanceUSD); client.BalanceUSD = newBalance; }
                    else
                    {
                        // Other currencies (UGX, EUR, ...): upsert the per-currency row.
                        var ccb = await _context.ClientCurrencyBalances
                            .FirstOrDefaultAsync(b => b.ClientId == accountId && b.CompanyId == companyId && b.Currency == currency && !b.IsDeleted);
                        if (ccb == null)
                        {
                            ccb = new ClientCurrencyBalance
                            {
                                CompanyId = companyId,
                                ClientId = accountId,
                                Currency = currency,
                                Balance = 0,
                                OpeningBalance = 0
                            };
                            _context.ClientCurrencyBalances.Add(ccb);
                        }
                        Same(ccb.Balance);
                        var delta = newBalance - ccb.Balance;
                        if (delta > 0) ccb.TotalIn += delta;
                        else ccb.TotalOut += Math.Abs(delta);
                        ccb.Balance = newBalance;
                        ccb.UpdatedAt = DateTime.UtcNow;
                    }
                    client.UpdatedAt = DateTime.UtcNow;
                }
                break;
            case AccountType.Expense:
                // Expense categories don't track running balance - no update needed
                break;
        }
    }

    /// <summary>
    /// TXN-yyyyMMdd-NNNN, unique per bureau per day across any number of API
    /// instances (same atomic counter as codes). It used to be "transactions dated
    /// today + 1", which two simultaneous requests — or a back-dated entry — could repeat.
    /// </summary>
    private async Task<string> GenerateReferenceAsync(Guid companyId)
    {
        var prefix = $"TXN-{BureauClock.TodayLocal:yyyyMMdd}-"; // the bureau's date
        var last = await _context.Transactions.IgnoreQueryFilters()
            .Where(t => t.CompanyId == companyId && t.Reference.StartsWith(prefix))
            .Select(t => t.Reference)
            .OrderByDescending(r => r.Length).ThenByDescending(r => r)
            .FirstOrDefaultAsync();
        var dbMax = last != null && int.TryParse(last[prefix.Length..], out var n) ? n : 0;
        var next = await CodeGenerator.NextAsync(_context, $"{companyId}_{prefix}", dbMax);
        return $"{prefix}{next:D4}";
    }

    private static string AccountLabel(AccountType t) => t switch
    {
        AccountType.Cash => "cash account",
        AccountType.Bank => "bank account",
        AccountType.Mpesa => "mobile money account",
        AccountType.Client => "client account",
        _ => "account"
    };

    /// <summary>Logging must never break the request that triggered it.</summary>
    private async Task SafeWarnAsync(Guid companyId, Guid userId, string message)
    {
        try { await _systemLog.LogWarningAsync("TransactionService", message, companyId, userId); }
        catch { /* the warning itself failed; nothing more we can do */ }
    }

    // Names for a whole page of transactions, fetched in one query per account type.
    // Mapping a list used to run up to two queries PER ROW (2,000 for a 1,000-row page).
    private readonly Dictionary<(AccountType, Guid), string> _accountNames = new();

    public async Task<List<TransactionResponseDto>> ToResponsesAsync(IReadOnlyCollection<Transaction> transactions)
    {
        await PreloadAccountNamesAsync(transactions);
        var list = new List<TransactionResponseDto>(transactions.Count);
        foreach (var t in transactions) list.Add(await MapToResponseAsync(t));
        return list;
    }

    private async Task PreloadAccountNamesAsync(IReadOnlyCollection<Transaction> txns)
    {
        var ids = txns.SelectMany(t => new[] { (t.SourceAccountType, t.SourceAccountId), (t.DestAccountType, t.DestAccountId) })
            .Where(k => !_accountNames.ContainsKey(k)).Distinct().ToList();
        List<Guid> Of(AccountType type) => ids.Where(k => k.Item1 == type).Select(k => k.Item2).Distinct().ToList();

        var bankIds = Of(AccountType.Bank);
        if (bankIds.Count > 0)
            foreach (var b in await _context.BankAccounts.IgnoreQueryFilters().AsNoTracking().Where(b => bankIds.Contains(b.Id)).Select(b => new { b.Id, b.BankName }).ToListAsync())
                _accountNames[(AccountType.Bank, b.Id)] = b.BankName;
        var agentIds = Of(AccountType.Mpesa);
        if (agentIds.Count > 0)
            foreach (var m in await _context.MpesaAgents.IgnoreQueryFilters().AsNoTracking().Where(m => agentIds.Contains(m.Id)).Select(m => new { m.Id, m.AgentName }).ToListAsync())
                _accountNames[(AccountType.Mpesa, m.Id)] = m.AgentName;
        var clientIds = Of(AccountType.Client);
        if (clientIds.Count > 0)
            foreach (var u in await _context.Users.IgnoreQueryFilters().AsNoTracking().Where(u => clientIds.Contains(u.Id)).Select(u => new { u.Id, u.FullName }).ToListAsync())
                _accountNames[(AccountType.Client, u.Id)] = u.FullName;
        var categoryIds = Of(AccountType.Expense);
        if (categoryIds.Count > 0)
            foreach (var c in await _context.ExpenseCategories.IgnoreQueryFilters().AsNoTracking().Where(c => categoryIds.Contains(c.Id)).Select(c => new { c.Id, c.Name }).ToListAsync())
                _accountNames[(AccountType.Expense, c.Id)] = c.Name;
    }

    private async Task<string> GetAccountNameAsync(AccountType type, Guid accountId)
    {
        if (_accountNames.TryGetValue((type, accountId), out var known)) return known;
        return type switch
        {
            AccountType.Cash => "Cash",
            AccountType.Bank => await _context.BankAccounts.Where(b => b.Id == accountId).Select(b => b.BankName).FirstOrDefaultAsync() ?? "Bank",
            AccountType.Mpesa => await _context.MpesaAgents.Where(m => m.Id == accountId).Select(m => m.AgentName).FirstOrDefaultAsync() ?? "M-Pesa",
            AccountType.Client => await _context.Users.Where(u => u.Id == accountId).Select(u => u.FullName).FirstOrDefaultAsync() ?? "Client",
            // Expense postings point at their category: show its name, not "Unknown".
            AccountType.Expense => await _context.ExpenseCategories.Where(c => c.Id == accountId).Select(c => c.Name).FirstOrDefaultAsync() ?? "Expense",
            _ => "Unknown"
        };
    }

    private async Task<TransactionResponseDto> MapToResponseAsync(Transaction t) => new(
        t.Id,
        t.Code,
        t.Reference,
        t.TransactionDate,
        t.TransactionType,
        t.Amount,
        t.Currency,
        t.Description,
        t.Notes,
        t.ExchangeRate,
        t.SourceAccountType,
        t.SourceAccountId,
        SourceAccountName: await GetAccountNameAsync(t.SourceAccountType, t.SourceAccountId),
        t.SourceBalanceBefore,
        t.SourceBalanceAfter,
        t.DestAccountType,
        t.DestAccountId,
        DestAccountName: await GetAccountNameAsync(t.DestAccountType, t.DestAccountId),
        t.DestBalanceBefore,
        t.DestBalanceAfter,
        t.CounterAmount,
        t.CounterCurrency,
        t.ReconciliationStatus,
        t.CreatedAt,
        IsReversed: t.DeletedAt.HasValue && !t.IsDeleted,   // Original that was reversed
        IsReversal: t.Reference.StartsWith("REV-")          // The reversal entry
    );
}
