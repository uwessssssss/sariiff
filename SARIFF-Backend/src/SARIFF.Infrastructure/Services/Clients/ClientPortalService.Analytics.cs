
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
    // ==================== ANALYTICS ====================

    public async Task<ApiResponse<ClientAnalyticsDto>> GetAnalyticsAsync(Guid companyId, Guid clientId, int months)
    {
        months = Math.Clamp(months, 1, 120); // up to ten years; huge values would overflow the date
        // Ensure UTC for PostgreSQL
        // "N months" = this month and the N-1 before it: exactly the months charted below.
        // (It used to reach one month further back, so the totals included a month the chart didn't show.)
        var startDate = BureauClock.MonthStartUtc(BureauClock.TodayLocal.AddMonths(-(months - 1)));
        
        var transactions = await GetClientTransactionsQuery(companyId, clientId)
            .Where(t => t.TransactionDate >= startDate)
            .ToListAsync();

        var client = await _context.Users.FindAsync(clientId);

        // Each month's CLOSING balance per currency, from the client's own running ledger. (Every
        // month showed today's balance, so "Balance Growth: 6-month trend" was a flat line.)
        var ledger = await LedgerAsync(companyId, clientId);
        var openings = new Dictionary<Currency, decimal>
        {
            [Currency.KES] = client?.OpeningBalanceKES ?? 0,
            [Currency.USD] = client?.OpeningBalanceUSD ?? 0
        };
        foreach (var o in await _context.ClientCurrencyBalances
                     .Where(b => b.ClientId == clientId && b.CompanyId == companyId && !b.IsDeleted)
                     .Select(b => new { b.Currency, b.OpeningBalance }).ToListAsync())
            openings[o.Currency] = o.OpeningBalance;
        var otherHeld = openings.Keys.Concat(ledger.Select(l => l.Currency))
            .Where(c => c != Currency.KES && c != Currency.USD).Distinct().OrderBy(c => (int)c).ToList();
        decimal ClosingAt(Currency cur, DateTime endExclusiveUtc) =>
            ledger.LastOrDefault(l => l.Currency == cur && l.Date < endExclusiveUtc)?.BalanceAfter
            ?? (openings.TryGetValue(cur, out var o) ? o : 0m);

        // Monthly data
        var monthlyData = new List<MonthlyDataDto>();
        for (int i = months - 1; i >= 0; i--)
        {
            var monthStart = BureauClock.TodayLocal.AddMonths(-i);
            var monthName = monthStart.ToString("MMM", CultureInfo.InvariantCulture);

            // Bucket by the bureau's month (a transaction at 01:00 on the 1st belongs to that month).
            var monthTxns = transactions.Where(t =>
                BureauClock.ToLocal(t.TransactionDate).Year == monthStart.Year &&
                BureauClock.ToLocal(t.TransactionDate).Month == monthStart.Month).ToList();

            var (inKES, outKES, inUSD, outUSD) = CalculateInOut(monthTxns, clientId);

            // Per-currency breakdown for currencies beyond KES/USD (UGX, EUR, ...), with each
            // held currency present (zero flows) so its closing balance is always there.
            var monthEnd = BureauClock.MonthStartUtc(monthStart.AddMonths(1));
            var otherMonthly = OtherCurrencyFlows(monthTxns, clientId);
            foreach (var cur in otherHeld.Where(c => otherMonthly.All(x => x.Currency != c)))
                otherMonthly.Add(new CurrencyFlowDto { Currency = cur, CurrencyCode = cur.ToString() });
            otherMonthly = otherMonthly.OrderBy(x => (int)x.Currency).ToList();
            foreach (var row in otherMonthly) row.Balance = ClosingAt(row.Currency, monthEnd);

            monthlyData.Add(new MonthlyDataDto
            {
                Month = monthName,
                IncomeKES = inKES,
                ExpensesKES = outKES,
                IncomeUSD = inUSD,
                ExpensesUSD = outUSD,
                BalanceKES = ClosingAt(Currency.KES, monthEnd),
                BalanceUSD = ClosingAt(Currency.USD, monthEnd),
                OtherCurrencies = otherMonthly
            });
        }

        // Category breakdown by TransactionType
        // Amounts and currencies on the client's own side of each posting.
        var legs = transactions.Select(t => MapToClientTransactionDto(t, clientId)).ToList();
        var categoryGroups = legs
            .GroupBy(t => t.Type)   // "Credit" = money in, "Debit" = money out, as the client sees it
            .Select(g => new CategoryBreakdownDto
            {
                Category = g.Key,
                Count = g.Count(),
                TotalKES = g.Where(t => t.Currency == Currency.KES).Sum(t => t.Amount),
                TotalUSD = g.Where(t => t.Currency == Currency.USD).Sum(t => t.Amount),
                Percentage = legs.Count > 0 ? (decimal)g.Count() / legs.Count * 100 : 0,
                OtherCurrencies = g.Where(t => t.Currency != Currency.KES && t.Currency != Currency.USD)
                    .GroupBy(t => t.Currency).OrderBy(x => x.Key)
                    .Select(x => new CurrencyFlowDto
                    {
                        Currency = x.Key,
                        CurrencyCode = x.Key.ToString(),
                        Income = x.Sum(t => t.Amount),
                        Expenses = 0
                    }).ToList()
            })
            .OrderByDescending(c => c.Count)
            .ToList();

        // Weekly activity (last 7 days)
        var weeklyActivity = new List<WeeklyActivityDto>();
        var dayNames = new[] { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };
        var todayLocal = BureauClock.TodayLocal;
        for (int i = 6; i >= 0; i--)
        {
            var date = todayLocal.AddDays(-i);
            weeklyActivity.Add(new WeeklyActivityDto
            {
                Day = dayNames[(int)date.DayOfWeek],
                Transactions = transactions.Count(t => BureauClock.ToLocal(t.TransactionDate).Date == date)
            });
        }

        // Totals
        var (totalInKES, totalOutKES, totalInUSD, totalOutUSD) = CalculateInOut(transactions, clientId);

        // Net income per currency beyond KES/USD (UGX, EUR, ...).
        var otherTotals = OtherCurrencyFlows(transactions, clientId);

        // Growth calculation
        var thisMonth = BureauClock.TodayLocal;
        var lastMonth = thisMonth.AddMonths(-1);

        var thisMonthTxns = transactions.Where(t => 
            BureauClock.ToLocal(t.TransactionDate).Year == thisMonth.Year && BureauClock.ToLocal(t.TransactionDate).Month == thisMonth.Month);
        var lastMonthTxns = transactions.Where(t => 
            BureauClock.ToLocal(t.TransactionDate).Year == lastMonth.Year && BureauClock.ToLocal(t.TransactionDate).Month == lastMonth.Month);

        // Amounts in different currencies can't be added together (UGX 1,000,000
        // would swamp USD 100), so growth compares the number of transactions.
        decimal thisMonthTotal = thisMonthTxns.Count();
        decimal lastMonthTotal = lastMonthTxns.Count();

        var growthPercentage = lastMonthTotal > 0
            ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
            : 0;

        var kesTxns = legs.Where(t => t.Currency == Currency.KES).ToList();
        var usdTxns = legs.Where(t => t.Currency == Currency.USD).ToList();

        return new ApiResponse<ClientAnalyticsDto>(true, "Success", new ClientAnalyticsDto
        {
            MonthlyData = monthlyData,
            CategoryBreakdown = categoryGroups,
            WeeklyActivity = weeklyActivity,
            Totals = new AnalyticsTotalsDto
            {
                TotalTransactions = transactions.Count,
                AvgTransactionKES = kesTxns.Any() ? kesTxns.Average(t => t.Amount) : 0,
                AvgTransactionUSD = usdTxns.Any() ? usdTxns.Average(t => t.Amount) : 0,
                NetIncomeKES = totalInKES - totalOutKES,
                NetIncomeUSD = totalInUSD - totalOutUSD,
                GrowthPercentage = growthPercentage,
                OtherCurrencies = otherTotals
            }
        });
    }


    // ==================== SECURITY ====================

    public async Task<ApiResponse<bool>> ChangePasswordAsync(Guid companyId, Guid clientId, ChangePasswordDto dto)
    {
        if (dto.NewPassword != dto.ConfirmPassword)
            return new ApiResponse<bool>(false, "New passwords do not match", false);

        var pwdCheck = ValidationHelper.ValidatePassword(dto.NewPassword);
        if (!pwdCheck.IsValid)
            return new ApiResponse<bool>(false, pwdCheck.Error!, false);

        var client = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == clientId && u.CompanyId == companyId && 
                                      u.Role == UserRole.Client && !u.IsDeleted);

        if (client == null)
            return new ApiResponse<bool>(false, "Client not found", false);

        if (client.ClientType != ClientType.Permanent)
            return new ApiResponse<bool>(false, "Only permanent clients can change password", false);

        if (string.IsNullOrEmpty(client.PasswordHash) ||
            !BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, client.PasswordHash))
        {
            return new ApiResponse<bool>(false, "Current password is incorrect", false);
        }

        client.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
        await _context.SaveChangesAsync();
        // Every session opened with the old password ends, this one included: the client signs
        // in again with the new password. (They used to live on, so changing a password
        // someone else knew did not sign that person out.)
        await Sessions.EndForUserAsync(_context, client.Id, UserRole.Client);

        // A new password ends trusted-device sign-in on the phone login (it may be why it changed).
        if (client.ClientIdentityId is { } identityId)
        {
            _context.ClientIdentityDevices.RemoveRange(await _context.ClientIdentityDevices.Where(d => d.ClientIdentityId == identityId).ToListAsync());
            await _context.SaveChangesAsync();
        }

        // Create alert
        var alert = new ClientAlert
        {
            ClientId = clientId,
            CompanyId = companyId,
            Type = "success",
            Title = "Password Changed",
            Message = "Your password has been successfully changed."
        };
        _context.Set<ClientAlert>().Add(alert);
        await _context.SaveChangesAsync();

        return new ApiResponse<bool>(true, "Password changed. Sign in again with your new password.", true);
    }
}
