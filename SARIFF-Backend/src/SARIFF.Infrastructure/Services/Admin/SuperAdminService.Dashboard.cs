
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

public partial class SuperAdminService
{
    // ==================== DASHBOARD ====================

    public async Task<ApiResponse<SuperAdminDashboardExtendedDto>> GetDashboardAsync()
    {
        try
        {
            var now = DateTime.UtcNow;
            var startOfMonth = BureauClock.MonthStartUtc(BureauClock.TodayLocal);
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
}
