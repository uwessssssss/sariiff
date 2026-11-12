using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public class DashboardService : IDashboardService
{
    private readonly AppDbContext _context;
    private readonly ITransactionService _transactionService;
    private readonly IExchangeRateService _exchangeRateService;

    public DashboardService(AppDbContext context, ITransactionService transactionService, IExchangeRateService exchangeRateService)
    {
        _context = context;
        _transactionService = transactionService;
        _exchangeRateService = exchangeRateService;
    }

    /// <summary>
    /// Returns the currencies this company actually uses, derived from real
    /// activity across cash accounts, bank accounts, transactions (both legs),
    /// and client balances (KES/USD columns + the ClientCurrencyBalances table).
    /// A currency appears only once it's genuinely in use — so a Kenyan bureau
    /// that has never touched UGX will never see a UGX column.
    /// </summary>
    public async Task<ApiResponse<CompanyCurrenciesDto>> GetCompanyCurrenciesAsync(Guid companyId)
    {
        var used = new HashSet<Currency>();

        // Cash & bank accounts
        used.UnionWith(await _context.CashAccounts
            .Where(c => c.CompanyId == companyId && !c.IsDeleted)
            .Select(c => c.Currency).Distinct().ToListAsync());
        used.UnionWith(await _context.BankAccounts
            .Where(b => b.CompanyId == companyId && !b.IsDeleted)
            .Select(b => b.Currency).Distinct().ToListAsync());

        // Transactions — both the primary currency and the counter currency
        used.UnionWith(await _context.Transactions.AsNoTracking()
            .Where(t => t.CompanyId == companyId && !t.IsDeleted)
            .Select(t => t.Currency).Distinct().ToListAsync());
        used.UnionWith(await _context.Transactions.AsNoTracking()
            .Where(t => t.CompanyId == companyId && !t.IsDeleted && t.CounterCurrency != null)
            .Select(t => t.CounterCurrency!.Value).Distinct().ToListAsync());

        // Client balances beyond KES/USD (UGX, EUR, ...)
        used.UnionWith(await _context.ClientCurrencyBalances
            .Where(b => b.CompanyId == companyId && !b.IsDeleted)
            .Select(b => b.Currency).Distinct().ToListAsync());

        // Mobile money wallets in their own currency (an M-Pesa KES wallet in Uganda)
        used.UnionWith(await _context.MpesaAgents
            .Where(m => m.CompanyId == companyId && !m.IsDeleted && m.Currency != null)
            .Select(m => m.Currency!.Value).Distinct().ToListAsync());

        // KES/USD client columns: count them only if any client holds a non-zero
        // balance in them (so a UGX/USD-only bureau doesn't get a phantom KES).
        if (await _context.Users.AnyAsync(u => u.CompanyId == companyId && !u.IsDeleted &&
                u.Role == UserRole.Client && u.BalanceKES != 0))
            used.Add(Currency.KES);
        if (await _context.Users.AnyAsync(u => u.CompanyId == companyId && !u.IsDeleted &&
                u.Role == UserRole.Client && u.BalanceUSD != 0))
            used.Add(Currency.USD);

        // The home currency is always "in use": rates and profit are in it.
        var brandNew = used.Count == 0;
        var baseCurrency = await _context.BaseCurrencyAsync(companyId);
        used.Add(baseCurrency);

        // A brand-new company with zero activity also gets USD (universal in the target markets).
        if (brandNew)
            used.Add(Currency.USD);

        // Ugandan bureaus deal in Kenyan shillings every day — always show KES.
        if (baseCurrency == Currency.UGX)
            used.Add(Currency.KES);

        // A currency the country doesn't use (UGX at a Kenyan bureau) stays visible
        // ONLY while money still sits in it, so nothing silently drops out of the
        // totals. Once it's cleared to zero it disappears.
        foreach (var c in used.Where(c => !CurrencyInfo.IsAllowed(baseCurrency, c)).ToList())
        {
            var held =
                await _context.CashAccounts.AnyAsync(a => a.CompanyId == companyId && !a.IsDeleted && a.Currency == c && a.Balance != 0) ||
                await _context.BankAccounts.AnyAsync(a => a.CompanyId == companyId && !a.IsDeleted && a.Currency == c && a.Balance != 0) ||
                await _context.ClientCurrencyBalances.AnyAsync(b => b.CompanyId == companyId && !b.IsDeleted && b.Currency == c && b.Balance != 0) ||
                await _context.ExchangeFloatBalances.AnyAsync(b => b.CompanyId == companyId && b.Currency == c && b.Balance != 0) ||
                (c == Currency.KES && await _context.Users.AnyAsync(u => u.CompanyId == companyId && !u.IsDeleted && u.Role == UserRole.Client && u.BalanceKES != 0)) ||
                (c == Currency.USD && await _context.Users.AnyAsync(u => u.CompanyId == companyId && !u.IsDeleted && u.Role == UserRole.Client && u.BalanceUSD != 0));
            if (!held) used.Remove(c);
        }

        // Home currency first, then the rest in enum order.
        var currencies = used
            .OrderBy(c => c == baseCurrency ? -1 : (int)c)
            .Select(c => new CurrencyOptionDto(c, c.ToString(), (int)c))
            .ToList();

        // What pickers may offer for new accounts, trades, rates and invoices.
        var allowed = CurrencyInfo.AllowedFor(baseCurrency)
            .Select(c => new CurrencyOptionDto(c, c.ToString(), (int)c))
            .ToList();

        return new ApiResponse<CompanyCurrenciesDto>(true, "Success",
            new CompanyCurrenciesDto(currencies, baseCurrency, baseCurrency.ToString(), allowed));
    }

    public async Task<ApiResponse<DashboardStatsDto>> GetOfficeUserDashboardAsync(Guid companyId)
    {
        // (Soft-deleted rows are also filtered globally; explicit here for clarity.)
        var cash = await _context.CashAccounts.Where(c => c.CompanyId == companyId && !c.IsDeleted).ToListAsync();
        var banks = await _context.BankAccounts.Where(b => b.CompanyId == companyId && !b.IsDeleted).ToListAsync();
        var mpesa = await _context.MpesaAgents.Where(m => m.CompanyId == companyId && !m.IsDeleted).ToListAsync();
        var homeCur = await _context.BaseCurrencyAsync(companyId);

        var todaySummary = await _transactionService.GetTodaySummaryAsync(companyId);
        var recentTxns = await _transactionService.GetRecentAsync(companyId, 10);
        var currentRate = await _exchangeRateService.GetCurrentRateAsync(companyId);

        return new ApiResponse<DashboardStatsDto>(true, "Success", new DashboardStatsDto(
            cash.FirstOrDefault(c => c.Currency == Currency.KES)?.Balance ?? 0,
            cash.FirstOrDefault(c => c.Currency == Currency.USD)?.Balance ?? 0,
            CurrencyRollup.HomeWallets(mpesa, homeCur, opening: false),
            banks.Where(b => b.Currency == Currency.KES).Sum(b => b.Balance),
            banks.Where(b => b.Currency == Currency.USD).Sum(b => b.Balance),
            todaySummary.Data!,
            currentRate.Data,
            recentTxns.Data ?? new List<TransactionResponseDto>(),
            CurrencyRollup.CashBank(cash, banks, opening: false),
            CurrencyRollup.Wallets(mpesa, homeCur, opening: false)));
    }

    public async Task<ApiResponse<SuperAdminDashboardDto>> GetSuperAdminDashboardAsync()
    {
        var companies = await _context.Companies.ToListAsync();
        var today = BureauClock.TodayStartUtc;
        var todayTxns = await _context.Transactions.CountAsync(t => t.TransactionDate >= today && t.TransactionDate < today.AddDays(1));
        var recentErrors = await _context.SystemLogs.AsNoTracking().Where(l => l.Level == "Error" && l.ResolvedAt == null).OrderByDescending(l => l.CreatedAt).Take(10).ToListAsync();

        // PERF: aggregate counts in two grouped queries instead of 2 per company (was N+1)
        var clientCounts = await _context.Users
            .Where(u => u.Role == UserRole.Client && u.CompanyId != null)
            .GroupBy(u => u.CompanyId!.Value)
            .Select(g => new { CompanyId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.CompanyId, x => x.Count);

        var txnCounts = await _context.Transactions
            .GroupBy(t => t.CompanyId)
            .Select(g => new { CompanyId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.CompanyId, x => x.Count);

        var summaries = new List<CompanySummaryDto>();
        foreach (var c in companies)
        {
            var clientCount = clientCounts.TryGetValue(c.Id, out var cc) ? cc : 0;
            var txnCount = txnCounts.TryGetValue(c.Id, out var tc) ? tc : 0;
            summaries.Add(new CompanySummaryDto(c.Id, c.Code, c.Name, c.OwnerName, clientCount, txnCount, 0, 0, c.IsActive));
        }

        return new ApiResponse<SuperAdminDashboardDto>(true, "Success", new SuperAdminDashboardDto(
            companies.Count,
            companies.Count(c => c.IsActive),
            companies.Count(c => !c.IsActive),
            todayTxns,
            recentErrors.Select(e => new SystemLogResponseDto(e.Id, e.Level, e.Source, e.Message, e.CompanyId, e.CreatedAt, e.ResolvedAt)).ToList(),
            summaries));
    }
}
