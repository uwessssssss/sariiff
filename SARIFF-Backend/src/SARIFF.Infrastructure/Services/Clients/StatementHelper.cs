
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Helper class for generating statement lines with TRADITIONAL ACCOUNTING rules
/// 
/// ACCOUNTING RULES:
/// ┌─────────────────┬────────────────────┬────────────────────┐
/// │ Account Type    │ DEBIT              │ CREDIT             │
/// ├─────────────────┼────────────────────┼────────────────────┤
/// │ ASSET           │ Balance INCREASES  │ Balance DECREASES  │
/// │ (Cash/Bank/     │ (money comes IN)   │ (money goes OUT)   │
/// │  M-Pesa)        │                    │                    │
/// ├─────────────────┼────────────────────┼────────────────────┤
/// │ LIABILITY       │ Balance DECREASES  │ Balance INCREASES  │
/// │ (Client)        │ (client owes less) │ (client owes more) │
/// └─────────────────┴────────────────────┴────────────────────┘
/// 
/// STATEMENT COLUMNS (for Asset accounts like Cash/Bank/M-Pesa):
/// - Debit column = Money IN (balance increased)
/// - Credit column = Money OUT (balance decreased)
/// 
/// STATEMENT COLUMNS (for Liability accounts like Client):
/// - Debit column = Money OUT (balance decreased)
/// - Credit column = Money IN (balance increased)
/// </summary>
public class StatementHelper
{
    private readonly AppDbContext _context;

    public StatementHelper(AppDbContext context)
    {
        _context = context;
    }

    // Related-account names for statement lines, loaded in bulk (3 queries for a
    // whole statement) instead of one query per line.
    private readonly Dictionary<(AccountType, Guid), (string Name, string? Code, string? Phone)> _related = new();

    private static bool ViewerIsSource(Transaction txn, AccountType viewerAccountType, Guid viewerAccountId, Currency? viewerCurrency) =>
        viewerAccountType == AccountType.Cash && viewerCurrency.HasValue
            ? txn.SourceAccountType == AccountType.Cash && txn.Currency == viewerCurrency.Value
            : txn.SourceAccountType == viewerAccountType && txn.SourceAccountId == viewerAccountId;

    /// <summary>Loads every counterparty of these lines in one query per account type.</summary>
    public async Task PreloadRelatedAsync(IEnumerable<Transaction> transactions, AccountType viewerAccountType, Guid viewerAccountId, Currency? viewerCurrency)
    {
        var wanted = transactions
            .Select(t => ViewerIsSource(t, viewerAccountType, viewerAccountId, viewerCurrency)
                ? (t.DestAccountType, t.DestAccountId)
                : (t.SourceAccountType, t.SourceAccountId))
            .Where(k => !_related.ContainsKey(k))
            .Distinct()
            .ToList();

        var clientIds = wanted.Where(k => k.Item1 == AccountType.Client).Select(k => k.Item2).Distinct().ToList();
        var bankIds = wanted.Where(k => k.Item1 == AccountType.Bank).Select(k => k.Item2).Distinct().ToList();
        var agentIds = wanted.Where(k => k.Item1 == AccountType.Mpesa).Select(k => k.Item2).Distinct().ToList();

        if (clientIds.Count > 0)
            foreach (var c in await _context.Users.IgnoreQueryFilters().AsNoTracking()
                         .Where(u => clientIds.Contains(u.Id))
                         .Select(u => new { u.Id, u.FullName, u.Code, u.WhatsAppNumber }).ToListAsync())
                _related[(AccountType.Client, c.Id)] = (c.FullName, c.Code, c.WhatsAppNumber);
        if (bankIds.Count > 0)
            foreach (var b in await _context.BankAccounts.IgnoreQueryFilters().AsNoTracking()
                         .Where(x => bankIds.Contains(x.Id))
                         .Select(x => new { x.Id, x.BankName, x.AccountNumber, x.Code }).ToListAsync())
                _related[(AccountType.Bank, b.Id)] = ($"{b.BankName} - {b.AccountNumber}", b.Code, null);
        if (agentIds.Count > 0)
            foreach (var m in await _context.MpesaAgents.IgnoreQueryFilters().AsNoTracking()
                         .Where(x => agentIds.Contains(x.Id))
                         .Select(x => new { x.Id, x.AgentName, x.AgentNumber, x.Code }).ToListAsync())
                _related[(AccountType.Mpesa, m.Id)] = ($"{m.AgentName} - {m.AgentNumber}", m.Code, null);
    }

    /// <summary>
    /// Creates a statement line with proper transaction action types for both accounts
    /// </summary>
    public async Task<StatementLineDto> CreateStatementLineAsync(
        Transaction txn, 
        AccountType viewerAccountType, 
        Guid viewerAccountId,
        Currency? viewerCurrency = null)
    {
        // Determine if viewer is source or dest
        bool isSource = ViewerIsSource(txn, viewerAccountType, viewerAccountId, viewerCurrency);
        
        // ==================== THIS ACCOUNT'S DATA ====================
        decimal amount, balanceBefore, balanceAfter;
        Currency currency;
        
        if (isSource)
        {
            amount = txn.Amount;
            currency = txn.Currency;
            balanceBefore = txn.SourceBalanceBefore;
            balanceAfter = txn.SourceBalanceAfter;
        }
        else
        {
            amount = txn.CounterAmount ?? txn.Amount;
            currency = txn.CounterCurrency ?? txn.Currency;
            balanceBefore = txn.DestBalanceBefore;
            balanceAfter = txn.DestBalanceAfter;
        }

        // ==================== DETERMINE ACTIONS ====================
        // TRADITIONAL ACCOUNTING:
        // - TransactionType refers to SOURCE account action
        // - DEST account gets the OPPOSITE action
        //
        // If viewer is SOURCE:
        //   - Use the transaction type directly
        //
        // If viewer is DEST:
        //   - Use the OPPOSITE of transaction type

        string thisAccountAction;
        string relatedAccountAction;
        decimal? debit = null;
        decimal? credit = null;
        
        if (isSource)
        {
            // Viewer is source - use transaction type directly
            thisAccountAction = txn.TransactionType == TransactionType.Debit ? "Debit" : "Credit";
            relatedAccountAction = txn.TransactionType == TransactionType.Debit ? "Credit" : "Debit";
            
            if (txn.TransactionType == TransactionType.Debit)
                debit = amount;
            else
                credit = amount;
        }
        else
        {
            // Viewer is dest - use OPPOSITE of transaction type
            thisAccountAction = txn.TransactionType == TransactionType.Debit ? "Credit" : "Debit";
            relatedAccountAction = txn.TransactionType == TransactionType.Debit ? "Debit" : "Credit";
            
            if (txn.TransactionType == TransactionType.Debit)
                credit = amount;  // Dest gets credit when source is debited
            else
                debit = amount;   // Dest gets debit when source is credited
        }

        // ==================== RELATED ACCOUNT ====================
        var relatedAccount = await GetRelatedAccountAsync(txn, isSource, relatedAccountAction);

        return new StatementLineDto(
            TransactionId: txn.Id,
            TransactionCode: txn.Code,
            Date: txn.TransactionDate,
            Reference: txn.Reference,
            Description: txn.Description,
            TransactionType: txn.TransactionType,
            
            // This account
            ThisAccountAction: thisAccountAction,
            Debit: debit,
            Credit: credit,
            Amount: amount,
            Currency: currency,
            BalanceBefore: balanceBefore,
            BalanceAfter: balanceAfter,
            
            // Related account
            RelatedAccount: relatedAccount,
            
            // Forex
            ExchangeRate: txn.ExchangeRate,
            CounterAmount: isSource ? txn.CounterAmount : txn.Amount,
            CounterCurrency: isSource ? txn.CounterCurrency : txn.Currency,
            
            // Meta
            Notes: txn.Notes,
            ReconciliationStatus: txn.ReconciliationStatus,
            
            // Reversal status
            IsReversed: txn.DeletedAt.HasValue && !txn.IsDeleted,
            IsReversal: txn.Reference.StartsWith("REV-")
        );
    }

    /// <summary>
    /// Gets related account details with action type
    /// </summary>
    private async Task<RelatedAccountDto> GetRelatedAccountAsync(
        Transaction txn, 
        bool viewerIsSource, 
        string relatedAction)
    {
        AccountType relatedType;
        Guid relatedId;
        decimal relatedAmount, relatedBalanceBefore, relatedBalanceAfter;
        Currency relatedCurrency;

        if (viewerIsSource)
        {
            relatedType = txn.DestAccountType;
            relatedId = txn.DestAccountId;
            relatedAmount = txn.CounterAmount ?? txn.Amount;
            relatedCurrency = txn.CounterCurrency ?? txn.Currency;
            relatedBalanceBefore = txn.DestBalanceBefore;
            relatedBalanceAfter = txn.DestBalanceAfter;
        }
        else
        {
            relatedType = txn.SourceAccountType;
            relatedId = txn.SourceAccountId;
            relatedAmount = txn.Amount;
            relatedCurrency = txn.Currency;
            relatedBalanceBefore = txn.SourceBalanceBefore;
            relatedBalanceAfter = txn.SourceBalanceAfter;
        }

        // Get related account details
        string accountName = "Unknown";
        string? accountCode = null;
        string? clientCode = null;
        string? clientPhone = null;

        if (_related.TryGetValue((relatedType, relatedId), out var known))
        {
            accountName = known.Name;
            accountCode = known.Code;
            if (relatedType == AccountType.Client) { clientCode = known.Code; clientPhone = known.Phone; }
        }
        else switch (relatedType)
        {
            case AccountType.Client:
                var client = await _context.Users.FirstOrDefaultAsync(u => u.Id == relatedId);
                if (client != null)
                {
                    accountName = client.FullName;
                    accountCode = client.Code;
                    clientCode = client.Code;
                    clientPhone = client.WhatsAppNumber;
                }
                break;
            case AccountType.Bank:
                var bank = await _context.BankAccounts.FirstOrDefaultAsync(b => b.Id == relatedId);
                if (bank != null)
                {
                    accountName = $"{bank.BankName} - {bank.AccountNumber}";
                    accountCode = bank.Code;
                }
                break;
            case AccountType.Mpesa:
                var mpesa = await _context.MpesaAgents.FirstOrDefaultAsync(m => m.Id == relatedId);
                if (mpesa != null)
                {
                    accountName = $"{mpesa.AgentName} - {mpesa.AgentNumber}";
                    accountCode = mpesa.Code;
                }
                break;
            case AccountType.Cash:
                accountName = $"Cash {relatedCurrency}";
                accountCode = "CASH";
                break;
        }

        return new RelatedAccountDto(
            AccountId: relatedId,
            AccountType: relatedType,
            AccountName: accountName,
            AccountCode: accountCode,
            Currency: relatedCurrency,
            Action: relatedAction,
            Amount: relatedAmount,
            BalanceBefore: relatedBalanceBefore,
            BalanceAfter: relatedBalanceAfter,
            ClientCode: clientCode,
            ClientPhone: clientPhone
        );
    }

    /// <summary>
    /// Calculates debit and credit totals for an account from transactions
    /// 
    /// TRADITIONAL ACCOUNTING:
    /// - For ASSET accounts: Debit = money IN, Credit = money OUT
    /// - For LIABILITY accounts: Debit = money OUT, Credit = money IN
    /// </summary>
    public (decimal totalDebit, decimal totalCredit) CalculateTransactionTotals(
        List<Transaction> transactions,
        AccountType accountType,
        Guid accountId,
        Currency? currency = null)
    {
        decimal totalDebit = 0, totalCredit = 0;

        foreach (var txn in transactions)
        {
            bool isSource;
            decimal amount;

            if (accountType == AccountType.Cash && currency.HasValue)
            {
                isSource = txn.SourceAccountType == AccountType.Cash && txn.Currency == currency.Value;
                amount = isSource ? txn.Amount : (txn.CounterAmount ?? txn.Amount);
            }
            else
            {
                isSource = txn.SourceAccountType == accountType && txn.SourceAccountId == accountId;
                amount = isSource ? txn.Amount : (txn.CounterAmount ?? txn.Amount);
            }

            // Determine the action for THIS account
            // Source gets the transaction type directly
            // Dest gets the opposite
            bool isDebit;
            if (isSource)
            {
                isDebit = txn.TransactionType == TransactionType.Debit;
            }
            else
            {
                // Dest gets opposite: if source is Debit, dest is Credit and vice versa
                isDebit = txn.TransactionType == TransactionType.Credit;
            }

            if (isDebit)
                totalDebit += amount;
            else
                totalCredit += amount;
        }

        return (totalDebit, totalCredit);
    }

    /// <summary>
    /// Debit/credit totals for EVERY currency an account touched (KES, USD, UGX,
    /// EUR, ...). Same leg logic as CalculateTransactionTotalsByCurrency.
    /// </summary>
    public Dictionary<Currency, (decimal Debit, decimal Credit)> CalculateTotalsPerCurrency(
        IEnumerable<Transaction> transactions,
        AccountType accountType,
        Guid accountId)
    {
        var totals = new Dictionary<Currency, (decimal Debit, decimal Credit)>();
        foreach (var txn in transactions)
        {
            var isSource = txn.SourceAccountType == accountType && txn.SourceAccountId == accountId;
            var amount = isSource ? txn.Amount : txn.CounterAmount ?? txn.Amount;
            var currency = isSource ? txn.Currency : txn.CounterCurrency ?? txn.Currency;
            bool isDebit = isSource
                ? txn.TransactionType == TransactionType.Debit
                : txn.TransactionType == TransactionType.Credit;
            totals.TryGetValue(currency, out var t);
            totals[currency] = isDebit ? (t.Debit + amount, t.Credit) : (t.Debit, t.Credit + amount);
        }
        return totals;
    }

    /// <summary>
    /// Calculates debit and credit totals per currency for multi-currency accounts (like clients)
    /// </summary>
    public (decimal debitKES, decimal creditKES, decimal debitUSD, decimal creditUSD) CalculateTransactionTotalsByCurrency(
        List<Transaction> transactions,
        AccountType accountType,
        Guid accountId)
    {
        decimal debitKES = 0, creditKES = 0, debitUSD = 0, creditUSD = 0;

        foreach (var txn in transactions)
        {
            var isSource = txn.SourceAccountType == accountType && txn.SourceAccountId == accountId;
            
            decimal amount;
            Currency currency;
            
            if (isSource)
            {
                amount = txn.Amount;
                currency = txn.Currency;
            }
            else
            {
                amount = txn.CounterAmount ?? txn.Amount;
                currency = txn.CounterCurrency ?? txn.Currency;
            }

            // Source gets transaction type, Dest gets opposite
            bool isDebit = isSource 
                ? txn.TransactionType == TransactionType.Debit 
                : txn.TransactionType == TransactionType.Credit;

            if (currency == Currency.KES)
            {
                if (isDebit) debitKES += amount;
                else creditKES += amount;
            }
            else if (currency == Currency.USD)
            {
                if (isDebit) debitUSD += amount;
                else creditUSD += amount;
            }
            // UGX, EUR, ... are NOT folded into USD — their totals come from
            // ClientCurrencyBalance (TotalIn/TotalOut) on the client DTO.
        }

        return (debitKES, creditKES, debitUSD, creditUSD);
    }

    /// <summary>
    /// Helper to determine if an account type is an asset
    /// </summary>
    public static bool IsAssetAccount(AccountType accountType)
    {
        return accountType switch
        {
            AccountType.Cash => true,
            AccountType.Bank => true,
            AccountType.Mpesa => true,
            AccountType.Client => false,
            AccountType.Expense => false, // Expense accounts are not asset accounts
            _ => true
        };
    }

    /// <summary>
    /// FIX #1 (CRITICAL): Build statement lines with DYNAMICALLY COMPUTED running balances.
    /// 
    /// The original code stored SourceBalanceAfter/DestBalanceAfter as frozen point-in-time snapshots.
    /// When a transaction is reversed/deleted, subsequent transactions still show stale balance-after values.
    /// 
    /// This method computes the running balance from the opening balance forward, so statements
    /// are always accurate regardless of reversals.
    /// 
    /// Transactions MUST be ordered chronologically (oldest first) before calling this method.
    /// </summary>
    public async Task<List<StatementLineDto>> BuildStatementLinesWithRunningBalanceAsync(
        List<Transaction> transactions,
        AccountType viewerAccountType,
        Guid viewerAccountId,
        decimal openingBalance,
        Currency? viewerCurrency = null,
        decimal? openingBalanceSecondary = null,
        Currency? secondaryCurrency = null)
    {
        var lines = new List<StatementLineDto>();
        await PreloadRelatedAsync(transactions, viewerAccountType, viewerAccountId, viewerCurrency);

        // Track running balance PER CURRENCY.
        // Client accounts have KES + USD. Other accounts have one currency.
        var runningBalances = new Dictionary<Currency, decimal>();

        if (viewerCurrency.HasValue)
            runningBalances[viewerCurrency.Value] = openingBalance;

        if (secondaryCurrency.HasValue && openingBalanceSecondary.HasValue)
            runningBalances[secondaryCurrency.Value] = openingBalanceSecondary.Value;

        // Fallback: if no currency specified, use a single tracker
        decimal fallbackBalance = openingBalance;

        foreach (var txn in transactions)
        {
            var line = await CreateStatementLineAsync(txn, viewerAccountType, viewerAccountId, viewerCurrency);

            var lineCurrency = line.Currency;
            decimal balanceBefore, computedBalanceAfter;

            if (runningBalances.ContainsKey(lineCurrency))
            {
                // Currency-specific running balance
                balanceBefore = runningBalances[lineCurrency];

                if (IsAssetAccount(viewerAccountType))
                    computedBalanceAfter = balanceBefore + (line.Debit ?? 0) - (line.Credit ?? 0);
                else
                    computedBalanceAfter = balanceBefore - (line.Debit ?? 0) + (line.Credit ?? 0);

                runningBalances[lineCurrency] = computedBalanceAfter;
            }
            else if (!viewerCurrency.HasValue)
            {
                // No currency filter — single fallback balance
                balanceBefore = fallbackBalance;

                if (IsAssetAccount(viewerAccountType))
                    computedBalanceAfter = balanceBefore + (line.Debit ?? 0) - (line.Credit ?? 0);
                else
                    computedBalanceAfter = balanceBefore - (line.Debit ?? 0) + (line.Credit ?? 0);

                fallbackBalance = computedBalanceAfter;
            }
            else
            {
                // Transaction currency doesn't match any tracked currency — 
                // show it but don't compute balance (no opening balance for this currency)
                balanceBefore = 0;
                computedBalanceAfter = 0;
            }

            var correctedLine = line with
            {
                BalanceBefore = balanceBefore,
                BalanceAfter = computedBalanceAfter
            };

            lines.Add(correctedLine);
        }

        return lines;
    }

    /// <summary>
    /// Correct statement for ONE currency of ONE account over a period.
    ///
    /// The running balance is computed over the account's whole history up to the
    /// period end, then cut to the period, so:
    ///  • Opening balance = balance just before the period starts (not the day the account opened)
    ///  • Closing balance = balance after the last line in the period (not today's balance)
    ///  • Totals = this period, this currency only — KES is never added to USD
    ///  • A Debit/Credit filter hides lines but can't corrupt the running balance
    ///  • An end date with no time ("2026-10-26") includes that whole day
    /// So Opening ± period totals = Closing, always.
    /// </summary>
    public async Task<StatementDto> BuildPeriodStatementAsync(
        IQueryable<Transaction> accountTransactions,   // every transaction touching the account; NOT date/type filtered
        AccountType accountType,
        Guid accountId,
        string accountName,
        string accountCode,
        Currency currency,
        decimal accountOpeningBalance,                 // balance when the account was opened, in this currency
        StatementFilterDto filter)
    {
        // Bureau-local days as UTC bounds; the end day is included in full.
        var (startUtc, endExclusive) = BureauClock.Range(filter.StartDate, filter.EndDate);

        // Opening balance = account opening ± everything before the period, summed by the
        // database with the SAME leg rule CreateStatementLineAsync uses per line:
        //   viewer is source → Amount in Currency, debit when TransactionType is Debit
        //   viewer is dest   → CounterAmount ?? Amount in CounterCurrency ?? Currency, debit when Credit
        // Only the period's rows are loaded, so a 5-year-old account costs the same as a new one.
        var opening = accountOpeningBalance;
        var start = startUtc;
        if (start.HasValue)
        {
            var startAt = start.Value;
            var pre = accountTransactions.AsNoTracking().Where(t => t.TransactionDate < startAt);
            var isCash = accountType == AccountType.Cash;

            var asSource = pre.Where(t => isCash
                ? t.SourceAccountType == AccountType.Cash && t.Currency == currency
                : t.SourceAccountType == accountType && t.SourceAccountId == accountId);
            var asDest = pre.Where(t => !(isCash
                    ? t.SourceAccountType == AccountType.Cash && t.Currency == currency
                    : t.SourceAccountType == accountType && t.SourceAccountId == accountId))
                .Where(t => (t.CounterCurrency ?? t.Currency) == currency);

            var srcDebit = await asSource.Where(t => t.Currency == currency && t.TransactionType == TransactionType.Debit).SumAsync(t => t.Amount);
            var srcCredit = await asSource.Where(t => t.Currency == currency && t.TransactionType != TransactionType.Debit).SumAsync(t => t.Amount);
            var dstDebit = await asDest.Where(t => t.TransactionType != TransactionType.Debit).SumAsync(t => t.CounterAmount ?? t.Amount);
            var dstCredit = await asDest.Where(t => t.TransactionType == TransactionType.Debit).SumAsync(t => t.CounterAmount ?? t.Amount);

            var debit = srcDebit + dstDebit;
            var credit = srcCredit + dstCredit;
            opening = IsAssetAccount(accountType)
                ? accountOpeningBalance + debit - credit
                : accountOpeningBalance - debit + credit;
        }

        var periodRows = await accountTransactions
            .AsNoTracking()
            .Where(t => !start.HasValue || t.TransactionDate >= start.Value)
            .Where(t => !endExclusive.HasValue || t.TransactionDate < endExclusive.Value)
            .OrderBy(t => t.TransactionDate)
            .ThenBy(t => t.CreatedAt)
            .ToListAsync();

        var period = (await BuildStatementLinesWithRunningBalanceAsync(
                periodRows, accountType, accountId, opening, currency))
            .Where(l => l.Currency == currency)
            .ToList();

        var closing = period.Count > 0 ? period[^1].BalanceAfter : opening;
        var totalDebit = period.Sum(l => l.Debit ?? 0);
        var totalCredit = period.Sum(l => l.Credit ?? 0);

        var shown = filter.TransactionType is { } onlyType
            ? period.Where(l => l.TransactionType == onlyType).ToList()
            : period.ToList();
        shown.Reverse(); // newest first for display

        return new StatementDto(
            AccountName: accountName,
            AccountCode: accountCode,
            AccountType: accountType,
            Currency: currency,
            PeriodStart: filter.StartDate,
            PeriodEnd: filter.EndDate,
            OpeningBalance: opening,
            ClosingBalance: closing,
            TotalDebit: totalDebit,
            TotalCredit: totalCredit,
            NetMovement: closing - opening,
            Transactions: shown);
    }

    // ==================== SQL TOTALS ====================
    // Same leg rule as CalculateTransactionTotals / CalculateTotalsPerCurrency,
    // computed by the database: source leg = the transaction type on Amount in
    // Currency; destination leg = the opposite type on CounterAmount ?? Amount in
    // CounterCurrency ?? Currency. Two GROUP BY queries for any number of accounts.

    public async Task<Dictionary<Guid, Dictionary<Currency, (decimal Debit, decimal Credit)>>> TotalsByAccountAsync(
        Guid companyId, AccountType accountType, IReadOnlyCollection<Guid> accountIds)
    {
        var result = new Dictionary<Guid, Dictionary<Currency, (decimal Debit, decimal Credit)>>();
        if (accountIds.Count == 0) return result;
        var ids = accountIds.ToList();
        var q = _context.Transactions.AsNoTracking().Where(t => t.CompanyId == companyId && !t.IsDeleted);

        var src = await q.Where(t => t.SourceAccountType == accountType && ids.Contains(t.SourceAccountId))
            .GroupBy(t => new { Id = t.SourceAccountId, Cur = t.Currency })
            .Select(g => new
            {
                g.Key.Id, g.Key.Cur,
                Debit = g.Sum(t => t.TransactionType == TransactionType.Debit ? t.Amount : 0m),
                Credit = g.Sum(t => t.TransactionType == TransactionType.Debit ? 0m : t.Amount),
            }).ToListAsync();

        var dst = await q.Where(t => t.DestAccountType == accountType && ids.Contains(t.DestAccountId))
            .GroupBy(t => new { Id = t.DestAccountId, Cur = t.CounterCurrency ?? t.Currency })
            .Select(g => new
            {
                g.Key.Id, g.Key.Cur,
                Debit = g.Sum(t => t.TransactionType == TransactionType.Credit ? (t.CounterAmount ?? t.Amount) : 0m),
                Credit = g.Sum(t => t.TransactionType == TransactionType.Credit ? 0m : (t.CounterAmount ?? t.Amount)),
            }).ToListAsync();

        foreach (var r in src.Select(x => (x.Id, x.Cur, x.Debit, x.Credit)).Concat(dst.Select(x => (x.Id, x.Cur, x.Debit, x.Credit))))
        {
            if (!result.TryGetValue(r.Id, out var perCur)) result[r.Id] = perCur = new();
            perCur.TryGetValue(r.Cur, out var t);
            perCur[r.Cur] = (t.Debit + r.Debit, t.Credit + r.Credit);
        }
        return result;
    }

    /// <summary>All-currency debit/credit for one account (bank, mobile money), in SQL.</summary>
    public async Task<(decimal Debit, decimal Credit)> TotalsForAccountAsync(Guid companyId, AccountType accountType, Guid accountId)
    {
        var all = await TotalsByAccountAsync(companyId, accountType, new[] { accountId });
        if (!all.TryGetValue(accountId, out var perCur)) return (0, 0);
        return (perCur.Values.Sum(v => v.Debit), perCur.Values.Sum(v => v.Credit));
    }

    /// <summary>Cash totals for one currency (cash legs are matched by currency), in SQL.</summary>
    public async Task<(decimal Debit, decimal Credit)> CashTotalsAsync(Guid companyId, Currency currency)
    {
        var q = _context.Transactions.AsNoTracking().Where(t => t.CompanyId == companyId && !t.IsDeleted);
        var src = await q.Where(t => t.SourceAccountType == AccountType.Cash && t.Currency == currency)
            .GroupBy(t => 1)
            .Select(g => new
            {
                Debit = g.Sum(t => t.TransactionType == TransactionType.Debit ? t.Amount : 0m),
                Credit = g.Sum(t => t.TransactionType == TransactionType.Debit ? 0m : t.Amount),
            }).FirstOrDefaultAsync();
        // A transaction whose source is this cash currency is the source leg only
        // (CalculateTransactionTotals treats it as source, never also as dest).
        var dst = await q.Where(t => t.DestAccountType == AccountType.Cash && (t.CounterCurrency ?? t.Currency) == currency
                                     && !(t.SourceAccountType == AccountType.Cash && t.Currency == currency))
            .GroupBy(t => 1)
            .Select(g => new
            {
                Debit = g.Sum(t => t.TransactionType == TransactionType.Credit ? (t.CounterAmount ?? t.Amount) : 0m),
                Credit = g.Sum(t => t.TransactionType == TransactionType.Credit ? 0m : (t.CounterAmount ?? t.Amount)),
            }).FirstOrDefaultAsync();
        return ((src?.Debit ?? 0) + (dst?.Debit ?? 0), (src?.Credit ?? 0) + (dst?.Credit ?? 0));
    }
}
