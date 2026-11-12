
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
    // ==================== FINANCIAL ====================

    public async Task<ApiResponse<FinancialOverviewDto>> GetFinancialOverviewAsync()
    {
        try
        {
            var now = DateTime.UtcNow;
            var startOfMonth = BureauClock.MonthStartUtc(BureauClock.TodayLocal);

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
            if (companyId.HasValue) { var v = companyId.Value; query = query.Where(p => p.CompanyId == v); }
            var totalCount = await query.CountAsync();
            var payments = await query
                .OrderByDescending(p => p.CreatedAt)
                .ThenByDescending(p => p.Id)
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
                new PaymentHistoryDto(payment.Id, dto.CompanyId, company.Name, dto.Amount, billingCurrency,
                    dto.PaymentMethod, "Completed", dto.Reference, payment.PaidAt, payment.PeriodStart, payment.PeriodEnd));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error recording payment");
            return new ApiResponse<PaymentHistoryDto>(false, "Error recording payment", null!);
        }
    }
}
