using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public class ReportService : IReportService
{
    private readonly AppDbContext _context;
    private readonly ITransactionService _transactionService;

    public ReportService(AppDbContext context, ITransactionService transactionService)
    {
        _context = context;
        _transactionService = transactionService;
    }



    public async Task<ApiResponse<DailyReportDto>> GetDailyReportAsync(Guid companyId, DateTime date)
{
    // The bureau's calendar day as UTC bounds (00:00 EAT = 21:00 UTC the day before).
    var startOfDay = BureauClock.DayStartUtc(date);
    var endOfDay = startOfDay.AddDays(1);

    var cashAccounts = await _context.CashAccounts
        .Where(c => c.CompanyId == companyId && !c.IsDeleted)
        .ToListAsync();
    var bankAccounts = await _context.BankAccounts
        .Where(b => b.CompanyId == companyId && !b.IsDeleted)
        .ToListAsync();
    var mpesaAgents = await _context.MpesaAgents
        .Where(m => m.CompanyId == companyId && !m.IsDeleted)
        .ToListAsync();
    var homeCur = await _context.BaseCurrencyAsync(companyId);

    // Balances AS OF the chosen day. The accounts only store today's balance, so walk it
    // back: closing = balance now − everything posted after the day; opening = closing −
    // the day's own movement. (Before Nov 2026 every date showed the accounts' ORIGINAL
    // opening balances as "opening" and TODAY's balances as "closing".)
    var afterDay = await NetMovementAsync(companyId, endOfDay, null);
    var onDay = await NetMovementAsync(companyId, startOfDay, endOfDay);
    decimal Net(Dictionary<(AccountType, Guid, Currency), decimal> net, AccountType type, Guid id, Currency cur) =>
        type == AccountType.Cash
            ? net.Where(k => k.Key.Item1 == AccountType.Cash && k.Key.Item3 == cur).Sum(k => k.Value)   // one till per currency
            : net.Where(k => k.Key.Item1 == type && k.Key.Item2 == id).Sum(k => k.Value);
    // Copies carrying the day's figures (Balance = closing, OpeningBalance = opening); the
    // tracked accounts themselves are not touched.
    cashAccounts = cashAccounts.Select(c =>
    {
        var close = c.Balance - Net(afterDay, AccountType.Cash, c.Id, c.Currency);
        return new CashAccount { Id = c.Id, CompanyId = c.CompanyId, Currency = c.Currency, Balance = close, OpeningBalance = close - Net(onDay, AccountType.Cash, c.Id, c.Currency) };
    }).ToList();
    bankAccounts = bankAccounts.Select(b =>
    {
        var close = b.Balance - Net(afterDay, AccountType.Bank, b.Id, b.Currency);
        return new BankAccount { Id = b.Id, CompanyId = b.CompanyId, Currency = b.Currency, Balance = close, OpeningBalance = close - Net(onDay, AccountType.Bank, b.Id, b.Currency) };
    }).ToList();
    mpesaAgents = mpesaAgents.Select(m =>
    {
        var cur = MobileMoney.CurrencyOf(m, homeCur);
        var close = m.Balance - Net(afterDay, AccountType.Mpesa, m.Id, cur);
        return new MpesaAgent { Id = m.Id, CompanyId = m.CompanyId, Currency = m.Currency, Provider = m.Provider, Balance = close, OpeningBalance = close - Net(onDay, AccountType.Mpesa, m.Id, cur) };
    }).ToList();

    // FIX: Use >= startOfDay AND < endOfDay instead of .Date == date.Date
    var transactions = await _context.Transactions.AsNoTracking()
        .Where(t => t.CompanyId == companyId && 
                    !t.IsDeleted &&
                    t.TransactionDate >= startOfDay && 
                    t.TransactionDate < endOfDay)
        .OrderByDescending(t => t.TransactionDate)
        .ToListAsync();

    var summary = new TransactionSummaryDto(
        transactions.Count,
        transactions.Where(t => t.TransactionType == TransactionType.Debit && t.Currency == Currency.KES).Sum(t => t.Amount),
        transactions.Where(t => t.TransactionType == TransactionType.Debit && t.Currency == Currency.USD).Sum(t => t.Amount),
        transactions.Where(t => t.TransactionType == TransactionType.Credit && t.Currency == Currency.KES).Sum(t => t.Amount),
        transactions.Where(t => t.TransactionType == TransactionType.Credit && t.Currency == Currency.USD).Sum(t => t.Amount),
        0, 0,
        transactions.GroupBy(t => t.Currency).OrderBy(g => g.Key)
            .Select(g =>
            {
                var d = g.Where(t => t.TransactionType == TransactionType.Debit).Sum(t => t.Amount);
                var c = g.Where(t => t.TransactionType == TransactionType.Credit).Sum(t => t.Amount);
                return new CurrencyFlowTotalsDto(g.Key, CurrencyInfo.Code(g.Key), d, c, d - c);
            }).ToList());

    var opening = new OpeningBalancesDto(
        cashAccounts.FirstOrDefault(c => c.Currency == Currency.KES)?.OpeningBalance ?? 0,
        cashAccounts.FirstOrDefault(c => c.Currency == Currency.USD)?.OpeningBalance ?? 0,
        bankAccounts.Where(b => b.Currency == Currency.KES).Sum(b => b.OpeningBalance),
        bankAccounts.Where(b => b.Currency == Currency.USD).Sum(b => b.OpeningBalance),
        CurrencyRollup.HomeWallets(mpesaAgents, homeCur, opening: true),
        CurrencyRollup.CashBank(cashAccounts, bankAccounts, opening: true),
        CurrencyRollup.Wallets(mpesaAgents, homeCur, opening: true));

    var closing = new ClosingBalancesDto(
        cashAccounts.FirstOrDefault(c => c.Currency == Currency.KES)?.Balance ?? 0,
        cashAccounts.FirstOrDefault(c => c.Currency == Currency.USD)?.Balance ?? 0,
        bankAccounts.Where(b => b.Currency == Currency.KES).Sum(b => b.Balance),
        bankAccounts.Where(b => b.Currency == Currency.USD).Sum(b => b.Balance),
        CurrencyRollup.HomeWallets(mpesaAgents, homeCur, opening: false),
        CurrencyRollup.CashBank(cashAccounts, bankAccounts, opening: false),
        CurrencyRollup.Wallets(mpesaAgents, homeCur, opening: false));

    // One query for the day's rows plus a few for account names. (Before Nov 2026 this
    // re-read every transaction one by one: 6,000 queries and ~6 s on a busy day.)
    var txnDtos = await _transactionService.ToResponsesAsync(transactions);

    return new ApiResponse<DailyReportDto>(true, "Success", 
        new DailyReportDto(DateTime.SpecifyKind(date.Date, DateTimeKind.Utc), opening, summary, closing, txnDtos)); // the day as picked
}

    /// <summary>
    /// How much each till, bank account and wallet moved between two instants, keyed by
    /// (account type, account id, currency). Same side rule as the account statements: on
    /// the first side a Debit adds to the account; on the second side a Credit does, in the
    /// counter amount and currency. Summed by the database, so a long history costs little.
    /// </summary>
    private async Task<Dictionary<(AccountType, Guid, Currency), decimal>> NetMovementAsync(Guid companyId, DateTime fromUtc, DateTime? toExclusiveUtc)
    {
        var q = _context.Transactions.AsNoTracking()
            .Where(t => t.CompanyId == companyId && !t.IsDeleted && t.TransactionDate >= fromUtc);
        if (toExclusiveUtc.HasValue) { var to = toExclusiveUtc.Value; q = q.Where(t => t.TransactionDate < to); }

        var first = await q.Where(t => t.SourceAccountType != AccountType.Client)
            .GroupBy(t => new { Type = t.SourceAccountType, Id = t.SourceAccountId, t.Currency, t.TransactionType })
            .Select(g => new { g.Key.Type, g.Key.Id, g.Key.Currency, g.Key.TransactionType, Sum = g.Sum(t => t.Amount) })
            .ToListAsync();
        // A posting whose two sides are the same account (float funding) counts once, above.
        var second = await q.Where(t => t.DestAccountType != AccountType.Client
                                        && !(t.DestAccountType == t.SourceAccountType && t.DestAccountId == t.SourceAccountId))
            .GroupBy(t => new { Type = t.DestAccountType, Id = t.DestAccountId, Currency = t.CounterCurrency ?? t.Currency, t.TransactionType })
            .Select(g => new { g.Key.Type, g.Key.Id, g.Key.Currency, g.Key.TransactionType, Sum = g.Sum(t => t.CounterAmount ?? t.Amount) })
            .ToListAsync();

        var net = new Dictionary<(AccountType, Guid, Currency), decimal>();
        void Add(AccountType type, Guid id, Currency cur, decimal v) { net.TryGetValue((type, id, cur), out var n); net[(type, id, cur)] = n + v; }
        foreach (var r in first) Add(r.Type, r.Id, r.Currency, r.TransactionType == TransactionType.Debit ? r.Sum : -r.Sum);
        foreach (var r in second) Add(r.Type, r.Id, r.Currency, r.TransactionType == TransactionType.Debit ? -r.Sum : r.Sum);
        return net;
    }

    public async Task<ApiResponse<PagedResult<TransactionResponseDto>>> GetTransactionReportAsync(Guid companyId, ReportFilterDto filter, int page, int pageSize)
    {
        return await _transactionService.GetAllAsync(companyId, page, pageSize, filter);
    }

    public async Task<ApiResponse<ClientBalanceReportDto>> GetClientBalanceReportAsync(Guid companyId, string? balanceType = null)
    {
        var query = _context.Users.Where(u => u.CompanyId == companyId && u.Role == UserRole.Client);
        var ccbs = _context.ClientCurrencyBalances.Where(b => b.CompanyId == companyId && !b.IsDeleted);

        // A client account is a liability: a deposit (Credit) raises it. So a POSITIVE
        // balance is a credit balance — money the bureau holds for (owes) the client — and a
        // NEGATIVE one is a debit balance — the client owes the bureau. This report had it
        // the other way round (Nov 2026): every depositor was listed as owing the bureau.
        // In ANY currency — a client owing only UGX still counts.
        if (balanceType == "debit")
            query = query.Where(u => u.BalanceKES < 0 || u.BalanceUSD < 0 || ccbs.Any(b => b.ClientId == u.Id && b.Balance < 0));
        else if (balanceType == "credit")
            query = query.Where(u => u.BalanceKES > 0 || u.BalanceUSD > 0 || ccbs.Any(b => b.ClientId == u.Id && b.Balance > 0));

        var clients = await query.ToListAsync();
        var clientIds = clients.Select(c => c.Id).ToList();
        var others = await ccbs.Where(b => clientIds.Contains(b.ClientId) && b.Balance != 0).ToListAsync();
        var othersByClient = others.GroupBy(b => b.ClientId).ToDictionary(g => g.Key, g => g.OrderBy(b => b.Currency).ToList());

        var items = clients.Select(c =>
        {
            othersByClient.TryGetValue(c.Id, out var mine);
            mine ??= new List<ClientCurrencyBalance>();
            var all = new[] { c.BalanceKES, c.BalanceUSD }.Concat(mine.Select(b => b.Balance)).ToList();
            var type = all.Any(v => v < 0) ? "Debit" : all.Any(v => v > 0) ? "Credit" : "Zero"; // Debit = owes the bureau
            return new ClientBalanceItemDto(c.Id, c.FullName, c.WhatsAppNumber, c.BalanceKES, c.BalanceUSD, type,
                mine.Select(b => new CurrencyAmountDto(b.Currency, CurrencyInfo.Code(b.Currency), b.Balance)).ToList());
        }).ToList();

        // Per-currency totals: KES/USD from columns, others from ClientCurrencyBalances.
        var balances = clients.SelectMany(c => new[] { (Currency.KES, c.BalanceKES), (Currency.USD, c.BalanceUSD) })
            .Concat(others.Select(b => (b.Currency, b.Balance)))
            .ToList();
        var byCurrency = balances.GroupBy(x => x.Item1).OrderBy(g => g.Key)
            .Select(g =>
            {
                var owedToClients = g.Where(x => x.Item2 > 0).Sum(x => x.Item2);            // credit balances
                var owedByClients = g.Where(x => x.Item2 < 0).Sum(x => Math.Abs(x.Item2));   // debit balances
                // TotalDebit = owed BY clients, TotalCredit = owed TO clients, NetFlow = net held for clients
                return new CurrencyFlowTotalsDto(g.Key, CurrencyInfo.Code(g.Key), owedByClients, owedToClients, owedToClients - owedByClients);
            })
            .Where(x => x.TotalDebit != 0 || x.TotalCredit != 0)
            .ToList();

        return new ApiResponse<ClientBalanceReportDto>(true, "Success", new ClientBalanceReportDto(
            items,
            clients.Where(c => c.BalanceKES < 0).Sum(c => Math.Abs(c.BalanceKES)),   // TotalDebitKES: owed by clients
            clients.Where(c => c.BalanceUSD < 0).Sum(c => Math.Abs(c.BalanceUSD)),
            clients.Where(c => c.BalanceKES > 0).Sum(c => c.BalanceKES),             // TotalCreditKES: owed to clients
            clients.Where(c => c.BalanceUSD > 0).Sum(c => c.BalanceUSD),
            byCurrency));
    }

    public async Task<ApiResponse<AccountSummaryReportDto>> GetAccountSummaryReportAsync(Guid companyId)
    {
        var baseCurrency = await _context.BaseCurrencyAsync(companyId);
        var cash = await _context.CashAccounts.Where(c => c.CompanyId == companyId && !c.IsDeleted).ToListAsync();
        var banks = await _context.BankAccounts.Where(b => b.CompanyId == companyId && !b.IsDeleted).ToListAsync();
        var mpesa = await _context.MpesaAgents.Where(m => m.CompanyId == companyId && !m.IsDeleted).ToListAsync();

        return new ApiResponse<AccountSummaryReportDto>(true, "Success", new AccountSummaryReportDto(
            // CashAccountResponseDto: Id, Currency, Balance, OpeningBalance, TotalDebit, TotalCredit, NetMovement, CreatedAt
            cash.Select(c => new CashAccountResponseDto(c.Id, c.Currency, c.Balance, c.OpeningBalance, 0, 0, 0, c.CreatedAt)).ToList(),
        
            // BankAccountResponseDto: Id, Code, BankName, AccountNumber, AccountName, BranchCode, Currency, Balance, OpeningBalance, TotalDebit, TotalCredit, NetMovement, IsActive, CreatedAt
            banks.Select(b => new BankAccountResponseDto(b.Id, b.Code, b.BankName, b.AccountNumber, b.AccountName, b.BranchCode, b.Currency, b.Balance, b.OpeningBalance, 0, 0, 0, b.IsActive, b.CreatedAt)).ToList(),
        
            // MpesaAgentResponseDto: Id, Code, AgentName, PhoneNumber, AgentNumber, StoreNumber, AgentType, Balance, OpeningBalance, TotalDebit, TotalCredit, NetMovement, IsActive, CreatedAt
            mpesa.Select(m => new MpesaAgentResponseDto(m.Id, m.Code, m.AgentName, m.PhoneNumber, m.AgentNumber, m.StoreNumber, m.AgentType, m.Balance, m.OpeningBalance, 0, 0, 0, m.IsActive, m.CreatedAt, m.Provider, MobileMoney.CurrencyOf(m, baseCurrency))).ToList(),
        
            cash.FirstOrDefault(c => c.Currency == Currency.KES)?.Balance ?? 0,
            cash.FirstOrDefault(c => c.Currency == Currency.USD)?.Balance ?? 0,
            banks.Where(b => b.Currency == Currency.KES).Sum(b => b.Balance),
            banks.Where(b => b.Currency == Currency.USD).Sum(b => b.Balance),
            CurrencyRollup.HomeWallets(mpesa, baseCurrency, opening: false),
            CurrencyRollup.CashBank(cash, banks, opening: false),
            CurrencyRollup.Wallets(mpesa, baseCurrency, opening: false)
        ));
    }

    public Task<ApiResponse<byte[]>> ExportToPdfAsync(Guid companyId, string reportType, ReportFilterDto filter)
    {
        return Task.FromResult(new ApiResponse<byte[]>(false, "PDF export not implemented", null));
    }

    public Task<ApiResponse<byte[]>> ExportToExcelAsync(Guid companyId, string reportType, ReportFilterDto filter)
    {
        return Task.FromResult(new ApiResponse<byte[]>(false, "Excel export not implemented", null));
    }
}
