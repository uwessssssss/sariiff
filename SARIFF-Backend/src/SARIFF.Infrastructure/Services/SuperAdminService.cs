
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using System.Diagnostics;
using System.Text;

namespace SARIFF.Infrastructure.Services;

public class SuperAdminService : ISuperAdminService
{
    private readonly AppDbContext _context;
    private readonly ILogger<SuperAdminService> _logger;
    private static readonly DateTime _startTime = DateTime.UtcNow;

    public SuperAdminService(AppDbContext context, ILogger<SuperAdminService> logger)
    {
        _context = context;
        _logger = logger;
    }

    // ==================== DASHBOARD ====================

    public async Task<ApiResponse<SuperAdminDashboardExtendedDto>> GetDashboardAsync()
    {
        try
        {
            var now = DateTime.UtcNow;
            var startOfMonth = BureauClock.MonthStartUtc(BureauClock.TodayLocal);
            var lastMonth = startOfMonth.AddMonths(-1);
            var today = BureauClock.TodayStartUtc; // the bureaus' day (EAT) as a UTC instant

            // PERF: Use DB-level aggregation instead of loading all entities into memory
            
            // Company stats — single query with conditional counts
            var companies = await _context.Companies.ToListAsync(); // Companies table is small (< 100 rows typically)
            var companyIds = companies.Select(c => c.Id).ToList();
            var totalCompanies = companies.Count;
            var activeCompanies = companies.Count(c => c.IsActive && c.SubscriptionStatus == SubscriptionStatus.Active);
            var trialCompanies = companies.Count(c => c.SubscriptionStatus == SubscriptionStatus.Trial);
            var expiredCompanies = companies.Count(c => c.SubscriptionStatus == SubscriptionStatus.Expired);
            var suspendedCompanies = companies.Count(c => c.SubscriptionStatus == SubscriptionStatus.Suspended || !c.IsActive);

            // User stats — COUNT in DB, not ToListAsync
            var totalUsers = await _context.Users.CountAsync();
            var totalClients = await _context.Users.CountAsync(u => u.Role == UserRole.Client);
            var activeUsersToday = await _context.LoginHistories
                .Where(l => l.LoginAt >= today && l.IsSuccessful)
                .Select(l => l.UserId ?? l.CompanyId)
                .Distinct()
                .CountAsync();

            // Transaction stats — COUNT and SUM in DB
            var totalTransactionsCount = await _context.Transactions.CountAsync();
            var monthlyTransactionsCount = await _context.Transactions.CountAsync(t => t.TransactionDate >= startOfMonth);
            var totalVolume = await _context.Transactions.SumAsync(t => t.Amount);
            var monthlyVolume = await _context.Transactions
                .Where(t => t.TransactionDate >= startOfMonth)
                .SumAsync(t => t.Amount);

            // Revenue (from subscription payments)
            var monthlyRevenue = companies.Where(c => c.IsActive).Sum(c => c.MonthlyFee);
            var totalRevenue = companies.Sum(c => c.TotalPaid);
            // Pending payments: monthly fees of active companies whose subscription has lapsed.
            var pendingPayments = companies
                .Where(c => c.IsActive && c.MonthlyFee > 0 &&
                            c.SubscriptionExpiresAt.HasValue &&
                            c.SubscriptionExpiresAt.Value < now)
                .Sum(c => c.MonthlyFee);

            // Revenue growth: this month's recorded payments vs last month's.
            var startOfLastMonthRev = startOfMonth.AddMonths(-1);
            var thisMonthPaidRev = await _context.Set<SubscriptionPayment>()
                .Where(p => !p.IsDeleted && p.Status == "Completed" && p.PaidAt >= startOfMonth)
                .SumAsync(p => (decimal?)p.Amount) ?? 0;
            var lastMonthPaidRev = await _context.Set<SubscriptionPayment>()
                .Where(p => !p.IsDeleted && p.Status == "Completed" &&
                            p.PaidAt >= startOfLastMonthRev && p.PaidAt < startOfMonth)
                .SumAsync(p => (decimal?)p.Amount) ?? 0;
            var revenueGrowthCalc = lastMonthPaidRev > 0
                ? (thisMonthPaidRev - lastMonthPaidRev) / lastMonthPaidRev * 100
                : (thisMonthPaidRev > 0 ? 100 : 0);

            // Growth calculations (simplified - compare to last month)
            var lastMonthCompanies = companies.Count(c => c.CreatedAt < startOfMonth);
            var companiesGrowth = lastMonthCompanies > 0 ? ((totalCompanies - lastMonthCompanies) / (decimal)lastMonthCompanies) * 100 : 0;

            // System health summary
            var errorsLast24h = await _context.SystemLogs.CountAsync(l => l.Level == "Error" && l.CreatedAt >= now.AddHours(-24) && l.ResolvedAt == null);
            var securityAlerts = await _context.Set<SecurityAlert>().CountAsync(a => !a.IsResolved && !a.IsDeleted);

            // "Top by volume": amounts in different currencies can't be ranked against each
            // other (UGX 1,000,000 is not more than USD 1,000), and there is no shared rate
            // across bureaus. Rank by number of transactions; each entry carries its volume
            // per currency for display. Volume = how many transactions, not a mixed sum.
            var topByVolume = await _context.Transactions.AsNoTracking()
                .Where(t => !t.IsDeleted)
                .GroupBy(t => t.CompanyId)
                .Select(g => new { CompanyId = g.Key, Volume = (decimal)g.Count() })
                .OrderByDescending(x => x.Volume)
                .Take(5)
                .ToListAsync();

            // Per company, per currency: volume is only ever compared within one currency.
            var volumeRows = await _context.Transactions.AsNoTracking()
                .GroupBy(t => new { t.CompanyId, t.Currency })
                .Select(g => new { g.Key.CompanyId, g.Key.Currency, Amount = g.Sum(t => t.Amount), Count = g.Count() })
                .ToListAsync();
            List<CurrencyAmountDto> volumesOf(Guid id) => volumeRows
                .Where(v => v.CompanyId == id).OrderBy(v => v.Currency)
                .Select(v => new CurrencyAmountDto(v.Currency, CurrencyInfo.Code(v.Currency), v.Amount)).ToList();
            int countOf(Guid id) => volumeRows.Where(v => v.CompanyId == id).Sum(v => v.Count);

            var topCompaniesByVolume = new List<CompanyRankDto>();
            var rank = 1;
            foreach (var item in topByVolume)
            {
                var company = companies.FirstOrDefault(c => c.Id == item.CompanyId);
                if (company != null)
                {
                    topCompaniesByVolume.Add(new CompanyRankDto(company.Id, company.Name, company.Code, item.Volume, rank++,
                        company.BaseCurrency, countOf(company.Id), volumesOf(company.Id)));
                }
            }

            // Top by transaction count — DB-level aggregation
            var topByCount = await _context.Transactions.AsNoTracking()
                .GroupBy(t => t.CompanyId)
                .Select(g => new { CompanyId = g.Key, Count = g.Count() })
                .OrderByDescending(x => x.Count)
                .Take(5)
                .ToListAsync();

            var topCompaniesByTransactions = new List<CompanyRankDto>();
            rank = 1;
            foreach (var item in topByCount)
            {
                var company = companies.FirstOrDefault(c => c.Id == item.CompanyId);
                if (company != null)
                {
                    topCompaniesByTransactions.Add(new CompanyRankDto(company.Id, company.Name, company.Code, item.Count, rank++,
                        company.BaseCurrency, item.Count, volumesOf(company.Id)));
                }
            }

            // Recent signups
            // Load users and transactions for per-company stats (MapToCompanyStats, companySummaries)
            var aggs = await LoadCompanyAggregatesAsync(companyIds, BureauClock.MonthStartUtc(BureauClock.TodayLocal));

            var recentSignups = companies
                .OrderByDescending(c => c.CreatedAt)
                .Take(5)
                .Select(c => MapToCompanyStats(c, aggs))
                .ToList();

            // Subscriptions needing attention: already EXPIRED companies first
            // (they owe money now), then those expiring within 30 days.
            var expiringSubscriptions = companies
                .Where(c => c.IsActive && c.SubscriptionExpiresAt.HasValue &&
                            c.SubscriptionExpiresAt <= now.AddDays(30))
                .OrderBy(c => c.SubscriptionExpiresAt)
                .Take(10)
                .Select(c => MapToCompanyStats(c, aggs))
                .ToList();

            // For backward compatibility - basic company summaries
            var companySummaries = companies.Select(c => new CompanySummaryDto(
                c.Id, c.Code, c.Name, c.OwnerName,
                aggs.TryGetValue(c.Id, out var sa) ? sa.Clients : 0,
                aggs.TryGetValue(c.Id, out var sb) ? sb.Txns : 0,
                0, 0, c.IsActive
            )).ToList();

            // Recent errors
            var recentErrors = await _context.SystemLogs.AsNoTracking()
                .Where(l => l.Level == "Error" && l.ResolvedAt == null)
                .OrderByDescending(l => l.CreatedAt)
                .Take(10)
                .Select(e => new SystemLogResponseDto(e.Id, e.Level, e.Source, e.Message, e.CompanyId, e.CreatedAt, e.ResolvedAt))
                .ToListAsync();

            var monthlyVolumeRows = await _context.Transactions.AsNoTracking()
                .Where(t => t.TransactionDate >= startOfMonth)
                .GroupBy(t => t.Currency)
                .Select(g => new { Currency = g.Key, Amount = g.Sum(t => t.Amount) })
                .ToListAsync();

            var dashboard = new SuperAdminDashboardExtendedDto(
                TotalCompanies: totalCompanies,
                ActiveCompanies: activeCompanies,
                TrialCompanies: trialCompanies,
                ExpiredCompanies: expiredCompanies,
                SuspendedCompanies: suspendedCompanies,
                CompaniesGrowth: companiesGrowth,
                TotalUsers: totalUsers,
                TotalClients: totalClients,
                ActiveUsersToday: activeUsersToday,
                UsersGrowth: 0,
                MonthlyRecurringRevenue: monthlyRevenue,
                TotalRevenue: totalRevenue,
                PendingPayments: pendingPayments,
                RevenueGrowth: revenueGrowthCalc,
                TotalTransactionsVolume: totalVolume,
                MonthlyTransactionsVolume: monthlyVolume,
                TotalTransactionsCount: totalTransactionsCount,
                MonthlyTransactionsCount: monthlyTransactionsCount,
                VolumeGrowth: 0,
                SystemStatus: errorsLast24h > 10 ? "Degraded" : "Healthy",
                ErrorsLast24h: errorsLast24h,
                SecurityAlertsActive: securityAlerts,
                TopCompaniesByVolume: topCompaniesByVolume,
                TopCompaniesByTransactions: topCompaniesByTransactions,
                RecentSignups: recentSignups,
                ExpiringSubscriptions: expiringSubscriptions,
                RecentErrors: recentErrors,
                Companies: companySummaries,
                TotalVolumeByCurrency: volumeRows.GroupBy(v => v.Currency).OrderBy(g => g.Key)
                    .Select(g => new CurrencyAmountDto(g.Key, CurrencyInfo.Code(g.Key), g.Sum(v => v.Amount))).ToList(),
                MonthlyVolumeByCurrency: monthlyVolumeRows
                    .OrderBy(x => x.Currency)
                    .Select(x => new CurrencyAmountDto(x.Currency, CurrencyInfo.Code(x.Currency), x.Amount))
                    .ToList(),
                CompaniesByBaseCurrency: companies.GroupBy(c => c.BaseCurrency).OrderBy(g => g.Key)
                    .Select(g => new CurrencyCountDto(g.Key, g.Count())).ToList()
            );

            return new ApiResponse<SuperAdminDashboardExtendedDto>(true, "Dashboard loaded", dashboard);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting SuperAdmin dashboard");
            return new ApiResponse<SuperAdminDashboardExtendedDto>(false, "Error loading dashboard", null!);
        }
    }

    /// <summary>Per-bureau counts and volumes, computed by the database.</summary>
    private sealed record CompanyAgg(
        int Users, int ActiveUsers, int Clients, int ActiveClients,
        int Txns, int TxnsMonth, decimal Volume, decimal VolumeMonth, DateTime? LastTxnAt,
        List<CurrencyAmountDto> VolumeByCurrency, List<CurrencyAmountDto> MonthlyVolumeByCurrency);

    /// <summary>
    /// Two GROUP BY queries for any number of bureaus — never loads transaction
    /// rows into memory (the old code pulled every transaction of every bureau).
    /// </summary>
    private async Task<Dictionary<Guid, CompanyAgg>> LoadCompanyAggregatesAsync(List<Guid> companyIds, DateTime startOfMonth)
    {
        var userRows = await _context.Users.AsNoTracking()
            .Where(u => u.CompanyId != null && companyIds.Contains(u.CompanyId.Value))
            .GroupBy(u => u.CompanyId!.Value)
            .Select(g => new
            {
                CompanyId = g.Key,
                Users = g.Count(),
                Active = g.Sum(u => u.IsActive ? 1 : 0),
                Clients = g.Sum(u => u.Role == UserRole.Client ? 1 : 0),
                ActiveClients = g.Sum(u => u.Role == UserRole.Client && u.IsActive ? 1 : 0),
            })
            .ToListAsync();

        var txnRows = await _context.Transactions.AsNoTracking()
            .Where(t => companyIds.Contains(t.CompanyId))
            .GroupBy(t => new { t.CompanyId, t.Currency })
            .Select(g => new
            {
                g.Key.CompanyId,
                g.Key.Currency,
                Count = g.Count(),
                CountMonth = g.Sum(t => t.TransactionDate >= startOfMonth ? 1 : 0),
                Amount = g.Sum(t => t.Amount),
                AmountMonth = g.Sum(t => t.TransactionDate >= startOfMonth ? t.Amount : 0m),
                Last = g.Max(t => (DateTime?)t.CreatedAt),
            })
            .ToListAsync();

        var result = new Dictionary<Guid, CompanyAgg>();
        foreach (var id in companyIds)
        {
            var u = userRows.FirstOrDefault(r => r.CompanyId == id);
            var t = txnRows.Where(r => r.CompanyId == id).OrderBy(r => r.Currency).ToList();
            result[id] = new CompanyAgg(
                u?.Users ?? 0, u?.Active ?? 0, u?.Clients ?? 0, u?.ActiveClients ?? 0,
                t.Sum(r => r.Count), t.Sum(r => r.CountMonth),
                t.Sum(r => r.Amount), t.Sum(r => r.AmountMonth),
                t.Count == 0 ? null : t.Max(r => r.Last),
                t.Select(r => new CurrencyAmountDto(r.Currency, CurrencyInfo.Code(r.Currency), r.Amount)).ToList(),
                t.Where(r => r.CountMonth > 0)
                 .Select(r => new CurrencyAmountDto(r.Currency, CurrencyInfo.Code(r.Currency), r.AmountMonth)).ToList());
        }
        return result;
    }

    private static CompanyStatsDto MapToCompanyStats(Company c, Dictionary<Guid, CompanyAgg> aggs)
    {
        var a = aggs.TryGetValue(c.Id, out var found) ? found
            : new CompanyAgg(0, 0, 0, 0, 0, 0, 0, 0, null, new(), new());
        return new CompanyStatsDto(
            c.Id, c.Code, c.Name, c.OwnerName, c.Email, c.WhatsAppNumber, c.IsActive, c.CreatedAt, c.LastLoginAt,
            c.SubscriptionPlan, c.SubscriptionStatus, c.SubscriptionStartDate, c.SubscriptionExpiresAt,
            c.MonthlyFee, c.TotalPaid, c.LastPaymentDate,
            a.Users, a.ActiveUsers, a.Clients, a.ActiveClients,
            a.Txns, a.TxnsMonth, a.Volume, a.VolumeMonth, a.LastTxnAt,
            0, // Error count - would need to query SystemLogs
            a.VolumeByCurrency, a.MonthlyVolumeByCurrency,
            c.BaseCurrency
        );
    }

    /// <summary>Transaction volume per currency — amounts in different currencies are never added together.</summary>
    private static List<CurrencyAmountDto> VolumeByCurrency(IEnumerable<Transaction> txns) =>
        txns.GroupBy(t => t.Currency).OrderBy(g => g.Key)
            .Select(g => new CurrencyAmountDto(g.Key, CurrencyInfo.Code(g.Key), g.Sum(t => t.Amount)))
            .ToList();

    // ==================== COMPANIES ====================

    public async Task<ApiResponse<PagedResult<CompanyStatsDto>>> GetAllCompaniesWithStatsAsync(
        int page, int pageSize, string? search = null, string? status = null)
    {
        try
        {
            var query = _context.Companies.AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                search = search.ToLower();
                query = query.Where(c =>
                    c.Name.ToLower().Contains(search) ||
                    c.Code.ToLower().Contains(search) ||
                    c.OwnerName.ToLower().Contains(search) ||
                    (c.Email != null && c.Email.ToLower().Contains(search)));
            }

            if (!string.IsNullOrWhiteSpace(status))
            {
                switch (status.ToLower())
                {
                    case "active":
                        query = query.Where(c => c.IsActive && c.SubscriptionStatus == SubscriptionStatus.Active);
                        break;
                    case "trial":
                        query = query.Where(c => c.SubscriptionStatus == SubscriptionStatus.Trial);
                        break;
                    case "expired":
                        query = query.Where(c => c.SubscriptionStatus == SubscriptionStatus.Expired);
                        break;
                    case "suspended":
                        query = query.Where(c => !c.IsActive || c.SubscriptionStatus == SubscriptionStatus.Suspended);
                        break;
                }
            }

            var totalCount = await query.CountAsync();
            var companies = await query
                .OrderByDescending(c => c.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var now = DateTime.UtcNow;
            var startOfMonth = BureauClock.MonthStartUtc(BureauClock.TodayLocal);
            var companyIds = companies.Select(c => c.Id).ToList();

            var aggs = await LoadCompanyAggregatesAsync(companyIds, startOfMonth);
            var companyStats = companies.Select(c => MapToCompanyStats(c, aggs)).ToList();

            var result = new PagedResult<CompanyStatsDto>(companyStats, totalCount, page, pageSize);
            return new ApiResponse<PagedResult<CompanyStatsDto>>(true, "Companies retrieved", result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting companies");
            return new ApiResponse<PagedResult<CompanyStatsDto>>(false, "Error retrieving companies", null!);
        }
    }

    /// <summary>
    /// Change a company's home currency. Allowed only while nothing has been
    /// recorded in the old base: every stored rate ("base per 1 foreign"),
    /// profit, float and mobile-money balance would otherwise be silently
    /// reinterpreted in the new currency.
    /// </summary>
    public async Task<ApiResponse<CompanyDetailDto>> SetBaseCurrencyAsync(Guid companyId, SetBaseCurrencyDto dto)
    {
        if (!Enum.IsDefined(typeof(Currency), dto.BaseCurrency))
            return new ApiResponse<CompanyDetailDto>(false, "Unsupported currency", null!);

        var company = await _context.Companies.FirstOrDefaultAsync(c => c.Id == companyId && !c.IsDeleted);
        if (company == null)
            return new ApiResponse<CompanyDetailDto>(false, "Company not found", null!);

        if (company.BaseCurrency != dto.BaseCurrency)
        {
            var blocker = await BaseCurrencyBlockerAsync(companyId);
            if (blocker != null)
                return new ApiResponse<CompanyDetailDto>(false,
                    $"Can't change the base currency: {blocker}. It can only be changed before the bureau starts trading.", null!);

            var old = company.BaseCurrency;
            company.BaseCurrency = dto.BaseCurrency;
            company.UpdatedAt = DateTime.UtcNow;

            // Rates were quoted as "old base per 1 foreign" — retire them so
            // nothing trades on a rate in the wrong unit. The bureau re-enters them.
            var activeRates = await _context.ExchangeRates
                .Where(r => r.CompanyId == companyId && r.IsActive).ToListAsync();
            foreach (var r in activeRates) { r.IsActive = false; r.EffectiveTo = DateTime.UtcNow; }

            // Make sure the bureau has a cash account in its home currency.
            if (!await _context.CashAccounts.AnyAsync(c => c.CompanyId == companyId && c.Currency == dto.BaseCurrency && !c.IsDeleted))
                _context.CashAccounts.Add(new CashAccount
                {
                    CompanyId = companyId,
                    Currency = dto.BaseCurrency,
                    Code = $"CASH-{dto.BaseCurrency}"
                });

            await _context.SaveChangesAsync();
            _logger.LogInformation("Base currency of {CompanyId} changed {Old} -> {New}; {Rates} active rates retired",
                companyId, old, dto.BaseCurrency, activeRates.Count);
        }

        return await GetCompanyDetailAsync(companyId);
    }

    /// <summary>Why the base currency can't change any more, or null if it still can.</summary>
    private async Task<string?> BaseCurrencyBlockerAsync(Guid companyId)
    {
        if (await _context.ExchangeTransactions.AnyAsync(e => e.CompanyId == companyId))
            return "the bureau already has exchange transactions";
        if (await _context.FloatMovements.AnyAsync(m => m.CompanyId == companyId))
            return "the exchange float already has movements";
        if (await _context.MpesaAgents.AnyAsync(m => m.CompanyId == companyId && (m.Balance != 0 || m.OpeningBalance != 0)))
            return "a mobile money agent already holds a balance";
        var agentIds = await _context.MpesaAgents.Where(m => m.CompanyId == companyId).Select(m => m.Id).ToListAsync();
        if (agentIds.Count > 0 && await _context.Transactions.AnyAsync(t => t.CompanyId == companyId &&
                ((t.SourceAccountType == AccountType.Mpesa && agentIds.Contains(t.SourceAccountId)) ||
                 (t.DestAccountType == AccountType.Mpesa && agentIds.Contains(t.DestAccountId)))))
            return "mobile money agents already have transactions";
        return null;
    }

    public async Task<ApiResponse<CompanyDetailDto>> GetCompanyDetailAsync(Guid companyId)
    {
        try
        {
            var company = await _context.Companies.FirstOrDefaultAsync(c => c.Id == companyId);
            if (company == null)
                return new ApiResponse<CompanyDetailDto>(false, "Company not found", null!);

            var now = DateTime.UtcNow;
            var startOfMonth = BureauClock.MonthStartUtc(BureauClock.TodayLocal);

            var users = await _context.Users.AsNoTracking().Where(u => u.CompanyId == companyId).ToListAsync();
            // Counts and volumes from the database, not every transaction row.
            var agg = (await LoadCompanyAggregatesAsync(new List<Guid> { companyId }, startOfMonth))[companyId];
            var bankAccounts = await _context.BankAccounts.Where(b => b.CompanyId == companyId).ToListAsync();
            var mpesaAgents = await _context.MpesaAgents.Where(m => m.CompanyId == companyId).ToListAsync();
            var cashAccounts = await _context.CashAccounts.Where(c => c.CompanyId == companyId).ToListAsync();

            var loginHistory = await _context.LoginHistories.AsNoTracking()
                .Where(l => l.CompanyId == companyId)
                .OrderByDescending(l => l.LoginAt)
                .Take(10)
                .Select(l => new AdminLoginHistoryDto(
                    l.Id, l.CompanyId, company.Name, l.UserId, null, l.UserRole,
                    l.IpAddress, l.Location, l.IsSuccessful, l.FailureReason, l.LoginAt
                ))
                .ToListAsync();

            var recentTxns = (await _context.Transactions.AsNoTracking()
                    .Where(t => t.CompanyId == companyId)
                    .OrderByDescending(t => t.TransactionDate)
                    .Take(5)
                    .ToListAsync())
                .Select(t => new RecentTransactionDto(
                    t.Id, t.Code, t.Description, t.Amount, t.Currency.ToString(), t.TransactionType.ToString(), t.TransactionDate
                ))
                .ToList();

            var unreconciledCount = await _context.Transactions
                .CountAsync(t => t.CompanyId == companyId && t.ReconciliationStatus == ReconciliationStatus.Pending);
            var errorCount = await _context.SystemLogs.CountAsync(l => l.CompanyId == companyId && l.Level == "Error" && l.CreatedAt >= startOfMonth);

            // Holdings in currencies beyond KES/USD (UGX, EUR, ...) — union the
            // currencies used across cash accounts, bank accounts, and client
            // balances, then total each source per currency.
            var clientCurrencyBalances = await _context.ClientCurrencyBalances
                .Where(b => b.CompanyId == companyId && !b.IsDeleted)
                .ToListAsync();

            var otherCurrencies = cashAccounts.Select(c => c.Currency)
                .Concat(bankAccounts.Select(b => b.Currency))
                .Concat(clientCurrencyBalances.Select(b => b.Currency))
                .Where(c => c != Currency.KES && c != Currency.USD)
                .Distinct()
                .OrderBy(c => (int)c)
                .ToList();

            var otherCurrencyHoldings = otherCurrencies.Select(cur => new CurrencyHoldingDto(
                cur,
                cur.ToString(),
                cashAccounts.Where(c => c.Currency == cur).Sum(c => c.Balance),
                bankAccounts.Where(b => b.Currency == cur).Sum(b => b.Balance),
                clientCurrencyBalances.Where(b => b.Currency == cur).Sum(b => b.Balance)
            )).ToList();

            var detail = new CompanyDetailDto(
                company.Id, company.Code, company.Name, company.OwnerName, company.Email, company.WhatsAppNumber,
                company.LogoUrl, company.TaxId, company.Website, company.Address,
                company.IsActive, company.CreatedAt, company.LastLoginAt,
                company.SubscriptionPlan, company.SubscriptionStatus, company.SubscriptionStartDate, company.SubscriptionExpiresAt,
                company.MonthlyFee, company.TotalPaid, company.LastPaymentDate,
                users.Count, users.Count(u => u.IsActive),
                users.Count(u => u.Role == UserRole.Client), users.Count(u => u.Role == UserRole.Client && u.IsActive),
                agg.Txns, agg.TxnsMonth,
                agg.Volume, agg.VolumeMonth,
                bankAccounts.Count, mpesaAgents.Count,
                cashAccounts.Where(c => c.Currency == Currency.KES).Sum(c => c.Balance),
                cashAccounts.Where(c => c.Currency == Currency.USD).Sum(c => c.Balance),
                bankAccounts.Where(b => b.Currency == Currency.KES).Sum(b => b.Balance),
                bankAccounts.Where(b => b.Currency == Currency.USD).Sum(b => b.Balance),
                CurrencyRollup.HomeWallets(mpesaAgents, company.BaseCurrency, opening: false), // home-currency wallets
                users.Where(u => u.Role == UserRole.Client).Sum(u => u.BalanceKES),
                users.Where(u => u.Role == UserRole.Client).Sum(u => u.BalanceUSD),
                otherCurrencyHoldings,
                recentTxns, loginHistory, unreconciledCount, errorCount,
                company.IsTransactionPinEnabled, !string.IsNullOrEmpty(company.TransactionPinHash),
                agg.VolumeByCurrency,
                agg.MonthlyVolumeByCurrency,
                company.BaseCurrency,
                await BaseCurrencyBlockerAsync(company.Id) == null,
                CurrencyRollup.Wallets(mpesaAgents, company.BaseCurrency, opening: false)
            );

            return new ApiResponse<CompanyDetailDto>(true, "Company details retrieved", detail);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting company details for {CompanyId}", companyId);
            return new ApiResponse<CompanyDetailDto>(false, "Error retrieving company details", null!);
        }
    }

    public async Task<ApiResponse<bool>> UpdateSubscriptionAsync(Guid companyId, UpdateSubscriptionDto dto)
    {
        if (dto.MonthlyFee < 0)
            return new ApiResponse<bool>(false, "Monthly fee can't be negative", false);
        try
        {
            var company = await _context.Companies.FindAsync(companyId);
            if (company == null)
                return new ApiResponse<bool>(false, "Company not found", false);

            company.SubscriptionPlan = dto.Plan;
            company.MonthlyFee = dto.MonthlyFee;
            if (dto.ExpiresAt.HasValue)
                company.SubscriptionExpiresAt = dto.ExpiresAt;

            company.SubscriptionStatus = dto.Status ?? SubscriptionStatus.Active;
            await _context.SaveChangesAsync();
            CompanyAccessCache.Invalidate(companyId);

            _logger.LogInformation("Subscription updated for company {CompanyId}: {Plan}", companyId, dto.Plan);
            return new ApiResponse<bool>(true, "Subscription updated", true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating subscription for {CompanyId}", companyId);
            return new ApiResponse<bool>(false, "Error updating subscription", false);
        }
    }

    public async Task<ApiResponse<bool>> SuspendCompanyAsync(Guid companyId, SuspendCompanyDto dto)
    {
        try
        {
            var company = await _context.Companies.FindAsync(companyId);
            if (company == null)
                return new ApiResponse<bool>(false, "Company not found", false);

            company.IsActive = false;
            company.SubscriptionStatus = SubscriptionStatus.Suspended;
            await _context.SaveChangesAsync();

            // Cut access now: revoke every open session of the bureau and its
            // clients (no more refreshes), and drop the per-request status cache
            // so live access tokens are refused within seconds, not 60 minutes.
            await _context.UserSessions
                .Where(s => s.CompanyId == companyId && !s.IsRevoked)
                .ExecuteUpdateAsync(u => u.SetProperty(x => x.IsRevoked, true));
            CompanyAccessCache.Invalidate(companyId);

            // Log audit
            _context.AuditLogs.Add(new AuditLog
            {
                CompanyId = companyId,
                Action = AuditAction.Update,
                EntityType = "Company",
                EntityId = companyId,
                NewValues = $"Suspended: {dto.Reason}"
            });
            await _context.SaveChangesAsync();

            _logger.LogWarning("Company {CompanyId} suspended: {Reason}", companyId, dto.Reason);
            return new ApiResponse<bool>(true, "Company suspended", true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error suspending company {CompanyId}", companyId);
            return new ApiResponse<bool>(false, "Error suspending company", false);
        }
    }

    public async Task<ApiResponse<bool>> ActivateCompanyAsync(Guid companyId)
    {
        try
        {
            var company = await _context.Companies.FindAsync(companyId);
            if (company == null)
                return new ApiResponse<bool>(false, "Company not found", false);

            company.IsActive = true;
            company.SubscriptionStatus = SubscriptionStatus.Active;
            company.FailedLoginAttempts = 0;
            company.LockedUntil = null;
            await _context.SaveChangesAsync();
            CompanyAccessCache.Invalidate(companyId);

            return new ApiResponse<bool>(true, "Company activated", true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error activating company {CompanyId}", companyId);
            return new ApiResponse<bool>(false, "Error activating company", false);
        }
    }

    /// <summary>
    /// Reset password for an Office User (Company)
    /// </summary>
    public async Task<ApiResponse<bool>> ResetOfficeUserPasswordAsync(Guid companyId, AdminResetPasswordDto dto)
    {
        try
        {
            var pwdCheck = ValidationHelper.ValidatePassword(dto.NewPassword);
            if (!pwdCheck.IsValid)
                return new ApiResponse<bool>(false, pwdCheck.Error!, false);

            var company = await _context.Companies.FindAsync(companyId);
            if (company == null)
                return new ApiResponse<bool>(false, "Company not found", false);

            company.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
            company.FailedLoginAttempts = 0;
            company.LockedUntil = null;
            await _context.SaveChangesAsync();

            // Log audit
            _context.AuditLogs.Add(new AuditLog
            {
                CompanyId = companyId,
                Action = AuditAction.Update,
                EntityType = "Company",
                EntityId = companyId,
                NewValues = "Password reset by SuperAdmin"
            });
            await _context.SaveChangesAsync();

            _logger.LogInformation("Password reset for company {CompanyId} by SuperAdmin", companyId);
            return new ApiResponse<bool>(true, "Password reset successfully", true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resetting password for company {CompanyId}", companyId);
            return new ApiResponse<bool>(false, "Error resetting password", false);
        }
    }

    // ==================== SYSTEM HEALTH ====================

    public async Task<ApiResponse<SystemHealthDto>> GetSystemHealthAsync()
    {
        try
        {
            var now = DateTime.UtcNow;
            var last24h = now.AddHours(-24);

            // Database health check
            var dbStopwatch = Stopwatch.StartNew();
            var canConnect = await _context.Database.CanConnectAsync();
            dbStopwatch.Stop();

            var dbStatus = canConnect ? "Healthy" : "Down";
            var dbLatency = (int)dbStopwatch.ElapsedMilliseconds;

            // Get log counts
            // Resolved entries are kept as evidence but no longer count against health.
            var errorsLast24h = await _context.SystemLogs.CountAsync(l => l.CreatedAt >= last24h && l.Level == "Error" && l.ResolvedAt == null);
            var warningsLast24h = await _context.SystemLogs.CountAsync(l => l.CreatedAt >= last24h && l.Level == "Warning" && l.ResolvedAt == null);
            var criticalLast24h = await _context.SystemLogs.CountAsync(l => l.CreatedAt >= last24h && l.Level == "Critical" && l.ResolvedAt == null);

            // Everything below is measured — no placeholder numbers.
            var (reqPerMin, avgMs, errorRate, _) = RequestMetrics.Snapshot();
            var dbConnections = 0;
            if (canConnect && _context.Database.IsNpgsql())
            {
                try
                {
                    dbConnections = await _context.Database
                        .SqlQueryRaw<int>("SELECT count(*)::int AS \"Value\" FROM pg_stat_activity WHERE datname = current_database()")
                        .SingleAsync();
                }
                catch (Exception ex) { _logger.LogWarning(ex, "Could not read pg_stat_activity"); }
            }
            var cpu = await CpuPercentAsync();
            var memory = MemoryPercent();
            var disk = DiskPercent();

            var apiStatus = errorRate > 5 ? "Degraded" : "Healthy";
            var reasons = new List<string>();
            if (!canConnect) reasons.Add("The database can't be reached");
            if (errorsLast24h > 10) reasons.Add($"{errorsLast24h} unresolved errors in the last 24 hours (see System Logs)");
            if (dbLatency > 1000) reasons.Add($"Database is slow ({dbLatency} ms)");
            if (errorRate > 5) reasons.Add($"{errorRate:0.#}% of requests are failing");
            if (memory > 90) reasons.Add($"Memory is {memory:0.#}% used");
            if (disk > 90) reasons.Add($"Disk is {disk:0.#}% full on the server (free space or a bigger disk)");

            var overallStatus = !canConnect ? "Down" : reasons.Count > 0 ? "Degraded" : "Healthy";

            var uptimeSeconds = (long)(now - _startTime).TotalSeconds;

            var health = new SystemHealthDto(
                overallStatus, apiStatus, avgMs, reqPerMin, errorRate,
                dbStatus, dbLatency, dbConnections, cpu, memory, disk, 0 /* no WebSockets: real-time hub removed */,
                uptimeSeconds, now,
                errorsLast24h, warningsLast24h, criticalLast24h, reasons
            );

            return new ApiResponse<SystemHealthDto>(true, "Health check complete", health);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting system health");
            return new ApiResponse<SystemHealthDto>(false, "Health check failed",
                new SystemHealthDto("Down", "Down", 0, 0, 100, "Down", 0, 0, 0, 0, 0, 0, 0, DateTime.UtcNow, 0, 0, 0));
        }
    }

    /// <summary>This process's CPU use over a 250 ms sample, as a share of all cores it can use.</summary>
    private static async Task<decimal> CpuPercentAsync()
    {
        try
        {
            using var process = Process.GetCurrentProcess();
            var before = process.TotalProcessorTime;
            var clock = Stopwatch.StartNew();
            await Task.Delay(250);
            process.Refresh();
            var usedMs = (process.TotalProcessorTime - before).TotalMilliseconds;
            var pct = usedMs / (clock.Elapsed.TotalMilliseconds * Environment.ProcessorCount) * 100;
            return Math.Round((decimal)Math.Clamp(pct, 0, 100), 1);
        }
        catch { return 0; }
    }

    /// <summary>Memory this process uses, as a share of what it may use (respects container limits).</summary>
    private static decimal MemoryPercent()
    {
        try
        {
            var available = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
            if (available <= 0) return 0;
            using var process = Process.GetCurrentProcess();
            return Math.Round(Math.Min(100m, process.WorkingSet64 * 100m / available), 1);
        }
        catch { return 0; }
    }

    /// <summary>Used space on the drive the API runs from.</summary>
    private static decimal DiskPercent()
    {
        try
        {
            var root = Path.GetPathRoot(AppContext.BaseDirectory);
            if (string.IsNullOrEmpty(root)) return 0;
            var drive = new DriveInfo(root);
            if (!drive.IsReady || drive.TotalSize <= 0) return 0;
            return Math.Round((drive.TotalSize - drive.AvailableFreeSpace) * 100m / drive.TotalSize, 1);
        }
        catch { return 0; }
    }

    // ==================== SECURITY ====================

    public async Task<ApiResponse<SecurityOverviewDto>> GetSecurityOverviewAsync()
    {
        try
        {
            var now = DateTime.UtcNow;
            var last24h = now.AddHours(-24);
            var last7d = now.AddDays(-7);

            var failedLogins24h = await _context.LoginHistories.CountAsync(l => l.LoginAt >= last24h && !l.IsSuccessful);
            var failedLogins7d = await _context.LoginHistories.CountAsync(l => l.LoginAt >= last7d && !l.IsSuccessful);

            var lockedCompanies = await _context.Companies.CountAsync(c => c.LockedUntil != null && c.LockedUntil > now);
            var lockedUsers = await _context.Users.CountAsync(u => u.LockedUntil != null && u.LockedUntil > now);

            var activeAlerts = await _context.Set<SecurityAlert>().CountAsync(a => !a.IsResolved && !a.IsDeleted);
            var blockedIPs = await _context.Set<BlockedIP>().CountAsync(b => b.IsActive && !b.IsDeleted);

            var recentAlerts = await _context.Set<SecurityAlert>()
                .Where(a => !a.IsDeleted)
                .OrderByDescending(a => a.CreatedAt)
                .Take(10)
                .Select(a => new SecurityAlertDto(
                    a.Id, a.AlertType, a.Severity, a.Message, a.CompanyId, null, a.IpAddress, a.IsResolved, a.CreatedAt, a.ResolvedAt
                ))
                .ToListAsync();

            var recentFailedLogins = await _context.LoginHistories.AsNoTracking()
                .Where(l => !l.IsSuccessful)
                .OrderByDescending(l => l.LoginAt)
                .Take(20)
                .Select(l => new AdminLoginHistoryDto(
                    l.Id, l.CompanyId, null, l.UserId, null, l.UserRole, l.IpAddress, l.Location, l.IsSuccessful, l.FailureReason, l.LoginAt
                ))
                .ToListAsync();

            var overview = new SecurityOverviewDto(
                failedLogins24h, failedLogins7d, lockedCompanies + lockedUsers, 0, blockedIPs, activeAlerts, recentAlerts, recentFailedLogins
            );

            return new ApiResponse<SecurityOverviewDto>(true, "Security overview retrieved", overview);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting security overview");
            return new ApiResponse<SecurityOverviewDto>(false, "Error retrieving security overview", null!);
        }
    }

    public async Task<ApiResponse<PagedResult<SecurityAlertDto>>> GetSecurityAlertsAsync(int page, int pageSize, bool? resolved = null)
    {
        try
        {
            var query = _context.Set<SecurityAlert>().Where(a => !a.IsDeleted);
            if (resolved.HasValue)
                query = query.Where(a => a.IsResolved == resolved.Value);

            var totalCount = await query.CountAsync();
            var alerts = await query
                .OrderByDescending(a => a.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(a => new SecurityAlertDto(
                    a.Id, a.AlertType, a.Severity, a.Message, a.CompanyId, null, a.IpAddress, a.IsResolved, a.CreatedAt, a.ResolvedAt
                ))
                .ToListAsync();

            return new ApiResponse<PagedResult<SecurityAlertDto>>(true, "Alerts retrieved",
                new PagedResult<SecurityAlertDto>(alerts, totalCount, page, pageSize));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting security alerts");
            return new ApiResponse<PagedResult<SecurityAlertDto>>(false, "Error retrieving alerts", null!);
        }
    }

    public async Task<ApiResponse<bool>> ResolveSecurityAlertAsync(Guid alertId, ResolveAlertDto dto)
    {
        try
        {
            var alert = await _context.Set<SecurityAlert>().FindAsync(alertId);
            if (alert == null)
                return new ApiResponse<bool>(false, "Alert not found", false);

            alert.IsResolved = true;
            alert.ResolvedAt = DateTime.UtcNow;
            alert.ResolutionNotes = dto.Notes;
            await _context.SaveChangesAsync();

            return new ApiResponse<bool>(true, "Alert resolved", true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resolving alert {AlertId}", alertId);
            return new ApiResponse<bool>(false, "Error resolving alert", false);
        }
    }

    public async Task<ApiResponse<bool>> BlockIPAsync(BlockIPDto dto)
    {
        try
        {
            var blockedIP = new BlockedIP
            {
                IpAddress = dto.IpAddress,
                Reason = dto.Reason,
                BlockedUntil = dto.BlockUntil,
                IsActive = true
            };

            _context.Set<BlockedIP>().Add(blockedIP);
            await _context.SaveChangesAsync();

            _logger.LogWarning("IP blocked: {IP} - {Reason}", dto.IpAddress, dto.Reason);
            return new ApiResponse<bool>(true, "IP blocked", true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error blocking IP {IP}", dto.IpAddress);
            return new ApiResponse<bool>(false, "Error blocking IP", false);
        }
    }

    public async Task<ApiResponse<bool>> UnblockIPAsync(Guid id)
    {
        try
        {
            var blockedIP = await _context.Set<BlockedIP>().FindAsync(id);
            if (blockedIP == null)
                return new ApiResponse<bool>(false, "Blocked IP not found", false);

            blockedIP.IsActive = false;
            await _context.SaveChangesAsync();

            return new ApiResponse<bool>(true, "IP unblocked", true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error unblocking IP {Id}", id);
            return new ApiResponse<bool>(false, "Error unblocking IP", false);
        }
    }

    public async Task<ApiResponse<List<IPWhitelistDto>>> GetIPWhitelistAsync()
    {
        try
        {
            var whitelist = await _context.AdminIpWhitelists
                .Where(w => !w.IsDeleted)
                .Select(w => new IPWhitelistDto(w.Id, w.IpAddress, w.Description, w.IsActive, w.CreatedAt))
                .ToListAsync();

            return new ApiResponse<List<IPWhitelistDto>>(true, "Whitelist retrieved", whitelist);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting IP whitelist");
            return new ApiResponse<List<IPWhitelistDto>>(false, "Error retrieving whitelist", null!);
        }
    }

    public async Task<ApiResponse<bool>> AddIPToWhitelistAsync(AddIPWhitelistDto dto, Guid addedByUserId)
    {
        try
        {
            var entry = new AdminIpWhitelist
            {
                IpAddress = dto.IpAddress,
                Description = dto.Description,
                IsActive = true,
                AddedByUserId = addedByUserId
            };

            _context.AdminIpWhitelists.Add(entry);
            await _context.SaveChangesAsync();

            return new ApiResponse<bool>(true, "IP added to whitelist", true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding IP to whitelist");
            return new ApiResponse<bool>(false, "Error adding IP", false);
        }
    }

    public async Task<ApiResponse<bool>> RemoveIPFromWhitelistAsync(Guid id)
    {
        try
        {
            var entry = await _context.AdminIpWhitelists.FindAsync(id);
            if (entry == null)
                return new ApiResponse<bool>(false, "IP not found", false);

            entry.IsDeleted = true;
            await _context.SaveChangesAsync();

            return new ApiResponse<bool>(true, "IP removed from whitelist", true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing IP from whitelist");
            return new ApiResponse<bool>(false, "Error removing IP", false);
        }
    }

    // ==================== FINANCIAL ====================

    public async Task<ApiResponse<FinancialOverviewDto>> GetFinancialOverviewAsync()
    {
        try
        {
            var now = DateTime.UtcNow;
            var startOfMonth = BureauClock.MonthStartUtc(BureauClock.TodayLocal);
            var startOfYear = BureauClock.DayStartUtc(new DateTime(BureauClock.TodayLocal.Year, 1, 1));

            var companies = await _context.Companies.ToListAsync(); // Small table

            // PERF: DB-level aggregation for transactions
            var totalVolume = await _context.Transactions.Where(t => !t.IsDeleted).SumAsync(t => t.Amount);
            var monthlyVolume = await _context.Transactions.Where(t => !t.IsDeleted && t.TransactionDate >= startOfMonth).SumAsync(t => t.Amount);
            var txnCount = await _context.Transactions.Where(t => !t.IsDeleted).CountAsync();
            var avgTransactionSize = txnCount > 0 ? totalVolume / txnCount : 0;

            var monthlyRevenue = companies.Where(c => c.IsActive).Sum(c => c.MonthlyFee);
            var yearlyRevenue = monthlyRevenue * now.Month;
            var totalRevenue = companies.Sum(c => c.TotalPaid);

            var revenueByPlan = Enum.GetValues<SubscriptionPlan>()
                .Select(plan => {
                    var planCompanies = companies.Where(c => c.SubscriptionPlan == plan).ToList();
                    return new RevenueByPlanDto(
                        plan.ToString(),
                        planCompanies.Sum(c => c.MonthlyFee),
                        planCompanies.Count,
                        companies.Any() ? (decimal)planCompanies.Count / companies.Count * 100 : 0
                    );
                })
                .Where(r => r.CompanyCount > 0)
                .ToList();

            // PERF: DB-level GroupBy for transaction type stats
            var txnByType = await _context.Transactions.AsNoTracking()
                .Where(t => !t.IsDeleted)
                .GroupBy(t => t.TransactionType)
                .Select(g => new TransactionTypeStatsDto(g.Key.ToString(), g.Count(), g.Sum(t => t.Amount)))
                .ToListAsync();

            // Pending payments: monthly fees of active companies whose
            // subscription has lapsed (they owe their renewal).
            var pendingPayments = companies
                .Where(c => c.IsActive && c.MonthlyFee > 0 &&
                            c.SubscriptionExpiresAt.HasValue &&
                            c.SubscriptionExpiresAt.Value < now)
                .Sum(c => c.MonthlyFee);

            // Revenue growth: this month's recorded payments vs last month's.
            var startOfLastMonth = startOfMonth.AddMonths(-1);
            var thisMonthPaid = await _context.Set<SubscriptionPayment>()
                .Where(p => !p.IsDeleted && p.Status == "Completed" && p.PaidAt >= startOfMonth)
                .SumAsync(p => (decimal?)p.Amount) ?? 0;
            var lastMonthPaid = await _context.Set<SubscriptionPayment>()
                .Where(p => !p.IsDeleted && p.Status == "Completed" &&
                            p.PaidAt >= startOfLastMonth && p.PaidAt < startOfMonth)
                .SumAsync(p => (decimal?)p.Amount) ?? 0;
            var revenueGrowth = lastMonthPaid > 0
                ? (thisMonthPaid - lastMonthPaid) / lastMonthPaid * 100
                : (thisMonthPaid > 0 ? 100 : 0);

            var volumeByCurrency = await _context.Transactions.AsNoTracking()
                .Where(t => !t.IsDeleted)
                .GroupBy(t => t.Currency)
                .Select(g => new { Currency = g.Key, Amount = g.Sum(t => t.Amount) })
                .ToListAsync();
            var monthlyByCurrency = await _context.Transactions.AsNoTracking()
                .Where(t => !t.IsDeleted && t.TransactionDate >= startOfMonth)
                .GroupBy(t => t.Currency)
                .Select(g => new { Currency = g.Key, Amount = g.Sum(t => t.Amount) })
                .ToListAsync();

            var overview = new FinancialOverviewDto(
                totalRevenue, monthlyRevenue, yearlyRevenue, pendingPayments, revenueGrowth,
                revenueByPlan, totalVolume, monthlyVolume, avgTransactionSize, txnByType,
                volumeByCurrency.OrderBy(v => v.Currency)
                    .Select(v => new CurrencyAmountDto(v.Currency, CurrencyInfo.Code(v.Currency), v.Amount)).ToList(),
                monthlyByCurrency.OrderBy(v => v.Currency)
                    .Select(v => new CurrencyAmountDto(v.Currency, CurrencyInfo.Code(v.Currency), v.Amount)).ToList()
            );

            return new ApiResponse<FinancialOverviewDto>(true, "Financial overview retrieved", overview);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting financial overview");
            return new ApiResponse<FinancialOverviewDto>(false, "Error retrieving financial overview", null!);
        }
    }

    public async Task<ApiResponse<PagedResult<PaymentHistoryDto>>> GetPaymentHistoryAsync(int page, int pageSize, Guid? companyId = null)
    {
        try
        {
            var query = _context.Set<SubscriptionPayment>().Where(p => !p.IsDeleted);
            if (companyId.HasValue)
                query = query.Where(p => p.CompanyId == companyId.Value);

            var totalCount = await query.CountAsync();
            var payments = await query
                .OrderByDescending(p => p.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var companyIds = payments.Select(p => p.CompanyId).Distinct().ToList();
            var companies = await _context.Companies.Where(c => companyIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name);

            var dtos = payments.Select(p => new PaymentHistoryDto(
                p.Id, p.CompanyId, companies.GetValueOrDefault(p.CompanyId, "Unknown"),
                p.Amount, p.Currency, p.PaymentMethod, p.Status, p.Reference, p.PaidAt, p.PeriodStart, p.PeriodEnd
            )).ToList();

            return new ApiResponse<PagedResult<PaymentHistoryDto>>(true, "Payment history retrieved",
                new PagedResult<PaymentHistoryDto>(dtos, totalCount, page, pageSize));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting payment history");
            return new ApiResponse<PagedResult<PaymentHistoryDto>>(false, "Error retrieving payment history", null!);
        }
    }

    public async Task<ApiResponse<PaymentHistoryDto>> RecordPaymentAsync(RecordPaymentDto dto)
    {
        if (dto.Amount <= 0)
            return new ApiResponse<PaymentHistoryDto>(false, "Payment amount must be more than zero", null!);
        // Sarif bills every bureau in KES, Ugandan ones too. Revenue totals add amounts up
        // as KES, so a UGX or USD amount here would silently corrupt them.
        var billingCurrency = string.IsNullOrWhiteSpace(dto.Currency) ? "KES" : dto.Currency.Trim().ToUpperInvariant();
        if (billingCurrency != "KES")
            return new ApiResponse<PaymentHistoryDto>(false, "Subscriptions are billed in KES. Enter the amount in KES.", null!);
        try
        {
            var company = await _context.Companies.FindAsync(dto.CompanyId);
            if (company == null)
                return new ApiResponse<PaymentHistoryDto>(false, "Company not found", null!);

            // Extend from the current expiry when it's still in the future,
            // so paying early never costs the company its remaining days.
            var extendFrom = company.SubscriptionExpiresAt.HasValue &&
                             company.SubscriptionExpiresAt.Value > DateTime.UtcNow
                ? company.SubscriptionExpiresAt.Value
                : DateTime.UtcNow;

            var payment = new SubscriptionPayment
            {
                CompanyId = dto.CompanyId,
                Amount = dto.Amount,
                Currency = billingCurrency,
                PaymentMethod = dto.PaymentMethod,
                Reference = dto.Reference,
                Status = "Completed",
                PaidAt = DateTime.UtcNow,
                PeriodStart = extendFrom,
                PeriodEnd = extendFrom.AddMonths(1),
                Notes = dto.Notes
            };

            _context.Set<SubscriptionPayment>().Add(payment);

            // Update company
            company.TotalPaid += dto.Amount;
            company.LastPaymentDate = DateTime.UtcNow;
            company.SubscriptionStatus = SubscriptionStatus.Active;
            company.SubscriptionExpiresAt = extendFrom.AddMonths(1);

            await _context.SaveChangesAsync();
            CompanyAccessCache.Invalidate(dto.CompanyId);

            return new ApiResponse<PaymentHistoryDto>(true, "Payment recorded",
                new PaymentHistoryDto(payment.Id, dto.CompanyId, company.Name, dto.Amount, dto.Currency,
                    dto.PaymentMethod, "Completed", dto.Reference, payment.PaidAt, payment.PeriodStart, payment.PeriodEnd));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error recording payment");
            return new ApiResponse<PaymentHistoryDto>(false, "Error recording payment", null!);
        }
    }

    // ==================== ANALYTICS ====================

    public async Task<ApiResponse<AnalyticsOverviewDto>> GetAnalyticsOverviewAsync(DateTime? startDate = null, DateTime? endDate = null)
    {
        try
        {
            var now = DateTime.UtcNow;
            var today = BureauClock.TodayStartUtc; // the bureaus' day (EAT) as a UTC instant
            var weekAgo = today.AddDays(-7);
            var monthAgo = today.AddDays(-30);

            var dailyActiveUsers = await _context.LoginHistories
                .Where(l => l.LoginAt >= today && l.IsSuccessful)
                .Select(l => l.UserId ?? l.CompanyId)
                .Distinct()
                .CountAsync();

            var weeklyActiveUsers = await _context.LoginHistories
                .Where(l => l.LoginAt >= weekAgo && l.IsSuccessful)
                .Select(l => l.UserId ?? l.CompanyId)
                .Distinct()
                .CountAsync();

            var monthlyActiveUsers = await _context.LoginHistories
                .Where(l => l.LoginAt >= monthAgo && l.IsSuccessful)
                .Select(l => l.UserId ?? l.CompanyId)
                .Distinct()
                .CountAsync();

            // Feature usage (placeholder - would need feature tracking)
            var featureUsage = new List<FeatureUsageDto>
            {
                new("Transactions", await _context.Transactions.CountAsync(), await _context.Transactions.Select(t => t.CompanyId).Distinct().CountAsync()),
                new("Invoices", await _context.Invoices.CountAsync(), await _context.Invoices.Select(i => i.CompanyId).Distinct().CountAsync()),
                new("Expenses", await _context.Expenses.CountAsync(), await _context.Expenses.Select(e => e.CompanyId).Distinct().CountAsync()),
                new("Reconciliation", await _context.Reconciliations.CountAsync(), await _context.Reconciliations.Select(r => r.CompanyId).Distinct().CountAsync())
            };

            var overview = new AnalyticsOverviewDto(
                dailyActiveUsers, weeklyActiveUsers, monthlyActiveUsers, 1800, // 30 min avg session
                featureUsage,
                new List<GrowthDataPointDto>(),
                new List<GrowthDataPointDto>(),
                new List<GrowthDataPointDto>()
            );

            return new ApiResponse<AnalyticsOverviewDto>(true, "Analytics retrieved", overview);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting analytics overview");
            return new ApiResponse<AnalyticsOverviewDto>(false, "Error retrieving analytics", null!);
        }
    }

    // ==================== AUDIT LOGS ====================

    public async Task<ApiResponse<PagedResult<AdminAuditLogDto>>> GetAuditLogsExtendedAsync(
        int page, int pageSize, AuditLogFilterDto? filter = null)
    {
        try
        {
            var query = _context.AuditLogs.AsQueryable();

            if (filter != null)
            {
                if (filter.CompanyId.HasValue)
                    query = query.Where(l => l.CompanyId == filter.CompanyId);
                if (filter.UserId.HasValue)
                    query = query.Where(l => l.UserId == filter.UserId);
                if (!string.IsNullOrWhiteSpace(filter.Action))
                    query = query.Where(l => l.Action.ToString() == filter.Action);
                if (!string.IsNullOrWhiteSpace(filter.EntityType))
                    query = query.Where(l => l.EntityType == filter.EntityType);
                var (fromUtc, toExclusive) = BureauClock.Range(filter.StartDate, filter.EndDate);
                if (fromUtc.HasValue)
                    query = query.Where(l => l.CreatedAt >= fromUtc.Value);
                if (toExclusive.HasValue)
                    query = query.Where(l => l.CreatedAt < toExclusive.Value);
            }

            var totalCount = await query.CountAsync();
            var logs = await query
                .OrderByDescending(l => l.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var companyIds = logs.Where(l => l.CompanyId.HasValue).Select(l => l.CompanyId!.Value).Distinct();
            var userIds = logs.Where(l => l.UserId.HasValue).Select(l => l.UserId!.Value).Distinct();

            var companies = await _context.Companies.Where(c => companyIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name);
            var users = await _context.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.FullName);

            var dtos = logs.Select(l => new AdminAuditLogDto(
                l.Id, l.CompanyId,
                l.CompanyId.HasValue && companies.ContainsKey(l.CompanyId.Value) ? companies[l.CompanyId.Value] : null,
                l.UserId,
                l.UserId.HasValue && users.ContainsKey(l.UserId.Value) ? users[l.UserId.Value] : null,
                l.Action, l.EntityType, l.EntityId, l.OldValues, l.NewValues, l.CreatedAt
            )).ToList();

            return new ApiResponse<PagedResult<AdminAuditLogDto>>(true, "Audit logs retrieved",
                new PagedResult<AdminAuditLogDto>(dtos, totalCount, page, pageSize));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting audit logs");
            return new ApiResponse<PagedResult<AdminAuditLogDto>>(false, "Error retrieving audit logs", null!);
        }
    }

    public async Task<ApiResponse<byte[]>> ExportAuditLogsAsync(AuditLogFilterDto? filter = null)
    {
        try
        {
            var response = await GetAuditLogsExtendedAsync(1, 10000, filter);
            if (!response.Success || response.Data == null)
                return new ApiResponse<byte[]>(false, "Error exporting logs", null!);

            var csv = new StringBuilder();
            csv.AppendLine("Timestamp (EAT),User,Company,Action,Entity,Details,IP Address");

            foreach (var log in response.Data.Items)
            {
                csv.AppendLine(string.Join(",",
                    CsvText.Cell(BureauClock.ToLocal(log.CreatedAt).ToString("yyyy-MM-dd HH:mm:ss")), CsvText.Cell(log.UserName ?? "System"),
                    CsvText.Cell(log.CompanyName ?? "Platform"), CsvText.Cell(log.Action), CsvText.Cell(log.EntityType),
                    CsvText.Cell(log.NewValues ?? ""), CsvText.Cell("")));
            }

            return new ApiResponse<byte[]>(true, "Export complete", Encoding.UTF8.GetBytes(csv.ToString()));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error exporting audit logs");
            return new ApiResponse<byte[]>(false, "Error exporting logs", null!);
        }
    }
}