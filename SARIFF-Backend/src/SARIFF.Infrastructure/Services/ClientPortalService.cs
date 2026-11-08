
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using System.Globalization;
using System.Text;

namespace SARIFF.Infrastructure.Services;

public class ClientPortalService : IClientPortalService
{
    private readonly AppDbContext _context;

    public ClientPortalService(AppDbContext context)
    {
        _context = context;
    }

    #region Dashboard

    public async Task<ApiResponse<ClientDashboardDto>> GetDashboardAsync(Guid companyId, Guid clientId)
    {
        var client = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == clientId && u.CompanyId == companyId && 
                                      u.Role == UserRole.Client && !u.IsDeleted);

        if (client == null)
            return new ApiResponse<ClientDashboardDto>(false, "Client not found", null);

        // Get profile with totals
        var profile = await BuildProfileAsync(companyId, client);

        // Recent transactions (last 10)
        var recentTxns = await GetClientTransactionsQuery(companyId, clientId)
            .OrderByDescending(t => t.TransactionDate)
            .ThenByDescending(t => t.CreatedAt)
            .Take(10)
            .ToListAsync();

        var recentTransactions = recentTxns.Select(t => MapToClientTransactionDto(t, clientId)).ToList();

        // Recent alerts (last 5)
        var recentAlerts = await _context.Set<ClientAlert>()
            .Where(a => a.ClientId == clientId && a.CompanyId == companyId && !a.IsDeleted)
            .OrderByDescending(a => a.CreatedAt)
            .Take(5)
            .Select(a => new ClientAlertDto
            {
                Id = a.Id,
                Type = a.Type,
                Title = a.Title,
                Message = a.Message,
                IsRead = a.IsRead,
                CreatedAt = a.CreatedAt,
                RelatedTransactionId = a.RelatedTransactionId
            })
            .ToListAsync();

        // Quick stats for this month
        var startOfMonth = BureauClock.MonthStartUtc(BureauClock.TodayLocal); // the bureau's month
        var monthTxns = await GetClientTransactionsQuery(companyId, clientId)
            .Where(t => t.TransactionDate >= startOfMonth)
            .ToListAsync();

        var (inKES, outKES, inUSD, outUSD) = CalculateInOut(monthTxns, clientId);
        
        var unreadCount = await _context.Set<ClientAlert>()
            .CountAsync(a => a.ClientId == clientId && a.CompanyId == companyId && !a.IsDeleted && !a.IsRead);

        var quickStats = new QuickStatsDto
        {
            ThisMonthInKES = inKES,
            ThisMonthOutKES = outKES,
            ThisMonthInUSD = inUSD,
            ThisMonthOutUSD = outUSD,
            ThisMonthOtherCurrencies = monthTxns
                .Where(t => t.Currency != Currency.KES && t.Currency != Currency.USD)
                .GroupBy(t => t.Currency)
                .OrderBy(g => g.Key)
                .Select(g =>
                {
                    var (cin, cout, _, _) = CalculateInOutForCurrency(g.ToList(), clientId, g.Key);
                    return new CurrencyFlowDto { Currency = g.Key, CurrencyCode = g.Key.ToString(), Income = cin, Expenses = cout };
                })
                .ToList(),
            TransactionCount = await GetClientTransactionsQuery(companyId, clientId).CountAsync(),
            UnreadAlerts = unreadCount
        };

        return new ApiResponse<ClientDashboardDto>(true, "Success", new ClientDashboardDto
        {
            Profile = profile,
            RecentTransactions = recentTransactions,
            RecentAlerts = recentAlerts,
            QuickStats = quickStats
        });
    }

    #endregion

    #region Profile

    public async Task<ApiResponse<ClientProfileDto>> GetProfileAsync(Guid companyId, Guid clientId)
    {
        var client = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == clientId && u.CompanyId == companyId && 
                                      u.Role == UserRole.Client && !u.IsDeleted);

        if (client == null)
            return new ApiResponse<ClientProfileDto>(false, "Client not found", null);

        return new ApiResponse<ClientProfileDto>(true, "Success", await BuildProfileAsync(companyId, client));
    }

    public async Task<ApiResponse<ClientProfileDto>> UpdateProfileAsync(Guid companyId, Guid clientId, UpdateClientProfileDto dto)
    {
        var client = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == clientId && u.CompanyId == companyId && 
                                      u.Role == UserRole.Client && !u.IsDeleted);

        if (client == null)
            return new ApiResponse<ClientProfileDto>(false, "Client not found", null);

        if (!string.IsNullOrWhiteSpace(dto.Email))
        {
            var emailCheck = ValidationHelper.ValidateEmail(dto.Email);
            if (!emailCheck.IsValid)
                return new ApiResponse<ClientProfileDto>(false, emailCheck.Error!, null);
            client.Email = dto.Email;
        }

        if (!string.IsNullOrWhiteSpace(dto.WhatsAppNumber))
        {
            var phoneCheck = ValidationHelper.ValidatePhone(dto.WhatsAppNumber, "WhatsApp number");
            if (!phoneCheck.IsValid)
                return new ApiResponse<ClientProfileDto>(false, phoneCheck.Error!, null);

            // Check if another client has this number
            var exists = await _context.Users.AnyAsync(u => 
                u.Id != clientId && u.CompanyId == companyId && 
                u.WhatsAppNumber == dto.WhatsAppNumber && !u.IsDeleted);
            
            if (exists)
                return new ApiResponse<ClientProfileDto>(false, "WhatsApp number already in use", null);
            
            if (client.WhatsAppNumber != dto.WhatsAppNumber && client.ClientIdentityId != null)
            {
                // The phone login was proved on the OLD number. Keep it attached and whoever
                // gets that number next could open this account. Cut the link; the client
                // links again from the new number.
                client.ClientIdentityId = null;
                client.IdentityLinkedAt = null;
                foreach (var session in await _context.UserSessions
                             .Where(x => x.UserId == client.Id && x.ClientIdentityId != null && !x.IsRevoked).ToListAsync())
                    session.IsRevoked = true;
            }
            client.WhatsAppNumber = dto.WhatsAppNumber;
        }

        await _context.SaveChangesAsync();

        return new ApiResponse<ClientProfileDto>(true, "Profile updated", await BuildProfileAsync(companyId, client));
    }

    #endregion

    #region Transactions

    public async Task<ApiResponse<PagedResult<ClientTransactionDto>>> GetTransactionsAsync(
        Guid companyId, Guid clientId, int page, int pageSize, TransactionFilters filters)
    {
        // Dates picked in the app are bureau-local days; the end day is included in full.
        var (fromUtc, toExclusive) = BureauClock.Range(filters.StartDate, filters.EndDate);

        var query = GetClientTransactionsQuery(companyId, clientId);

        // Apply filters
        if (fromUtc.HasValue)
            query = query.Where(t => t.TransactionDate >= fromUtc.Value);

        if (toExclusive.HasValue)
            query = query.Where(t => t.TransactionDate < toExclusive.Value);

        if (filters.Currency.HasValue)
            query = query.Where(t => t.Currency == filters.Currency.Value);  // FIX #12: Only match primary currency

        if (filters.Type.HasValue)
            query = query.Where(t => t.TransactionType == filters.Type.Value);

        if (!string.IsNullOrWhiteSpace(filters.Search))
        {
            var search = filters.Search.ToLower();
            query = query.Where(t =>
                t.Description.ToLower().Contains(search) ||
                t.Reference.ToLower().Contains(search) ||
                t.Code.ToLower().Contains(search));
        }

        var totalCount = await query.CountAsync();

        // FIX: Compute running balances dynamically
        // Get all matching transactions up to end of current page (chronological order)
        var allUpToPage = await query
            .OrderBy(t => t.TransactionDate)
            .ThenBy(t => t.CreatedAt)
            .Take(page * pageSize)  // Only need up to end of current page
            .ToListAsync();

        var allMapped = allUpToPage.Select(t => MapToClientTransactionDto(t, clientId)).ToList();

        // Running balance PER CURRENCY. KES/USD openings live on the client;
        // UGX/EUR/... openings live in ClientCurrencyBalances. (Previously every
        // non-KES line was added to the USD balance.)
        var client = await _context.Users.FindAsync(clientId);
        var running = new Dictionary<Currency, decimal>
        {
            [Currency.KES] = client?.OpeningBalanceKES ?? 0,
            [Currency.USD] = client?.OpeningBalanceUSD ?? 0
        };
        var otherOpenings = await _context.ClientCurrencyBalances
            .Where(b => b.ClientId == clientId && b.CompanyId == companyId && !b.IsDeleted)
            .Select(b => new { b.Currency, b.OpeningBalance })
            .ToListAsync();
        foreach (var o in otherOpenings) running[o.Currency] = o.OpeningBalance;

        // If there are filters, account for transactions BEFORE the filtered period
        if (fromUtc.HasValue)
        {
            var prior = await GetClientTransactionsQuery(companyId, clientId)
                .Where(t => t.TransactionDate < fromUtc.Value)
                .ToListAsync();
            foreach (var t in prior)
            {
                var dto = MapToClientTransactionDto(t, clientId);
                running.TryGetValue(dto.Currency, out var bal);
                running[dto.Currency] = bal + (dto.Type == "Credit" ? dto.Amount : -dto.Amount);
            }
        }

        // Compute running balances through all items up to current page
        foreach (var item in allMapped)
        {
            running.TryGetValue(item.Currency, out var bal);
            item.BalanceBefore = bal;
            bal += item.Type == "Credit" ? item.Amount : -item.Amount;
            running[item.Currency] = bal;
            item.BalanceAfter = bal;
        }

        // Extract only current page items, reversed for newest-first display
        var skipCount = (page - 1) * pageSize;
        var pageItems = allMapped.Skip(skipCount).Take(pageSize).Reverse().ToList();

        return new ApiResponse<PagedResult<ClientTransactionDto>>(true, "Success",
            new PagedResult<ClientTransactionDto>(pageItems, totalCount, page, pageSize));
    }

    public async Task<ApiResponse<ClientTransactionDto>> GetTransactionByIdAsync(Guid companyId, Guid clientId, Guid transactionId)
    {
        var transaction = await GetClientTransactionsQuery(companyId, clientId)
            .FirstOrDefaultAsync(t => t.Id == transactionId);

        if (transaction == null)
            return new ApiResponse<ClientTransactionDto>(false, "Transaction not found", null);

        return new ApiResponse<ClientTransactionDto>(true, "Success", MapToClientTransactionDto(transaction, clientId));
    }

    public async Task<byte[]> GenerateTransactionReceiptAsync(Guid companyId, Guid clientId, Guid transactionId)
    {
        var transaction = await GetClientTransactionsQuery(companyId, clientId)
            .FirstOrDefaultAsync(t => t.Id == transactionId);

        if (transaction == null)
            throw new Exception("Transaction not found");

        var client = await _context.Users.FindAsync(clientId);
        var dto = MapToClientTransactionDto(transaction, clientId);

        var sb = new StringBuilder();
        sb.AppendLine("=====================================");
        sb.AppendLine("         TRANSACTION RECEIPT");
        sb.AppendLine("=====================================");
        sb.AppendLine();
        sb.AppendLine($"Receipt No: {transaction.Code}");
        sb.AppendLine($"Date: {BureauClock.ToLocal(transaction.TransactionDate):yyyy-MM-dd HH:mm}");
        sb.AppendLine();
        sb.AppendLine($"Client: {client?.FullName}");
        sb.AppendLine($"Client ID: {client?.Code}");
        sb.AppendLine();
        sb.AppendLine("-------------------------------------");
        sb.AppendLine($"Type: {dto.Type}");
        sb.AppendLine($"Description: {transaction.Description}");
        sb.AppendLine($"Reference: {transaction.Reference}");
        sb.AppendLine();
        sb.AppendLine($"Amount: {dto.Currency} {dto.Amount:N2}");
        sb.AppendLine($"Balance Before: {dto.Currency} {dto.BalanceBefore:N2}");
        sb.AppendLine($"Balance After: {dto.Currency} {dto.BalanceAfter:N2}");
        sb.AppendLine();
        if (dto.ExchangeRate.HasValue)
        {
            sb.AppendLine($"Exchange Rate: {dto.ExchangeRate:N4}");
            sb.AppendLine($"Counter Amount: {dto.CounterCurrency} {dto.CounterAmount:N2}");
            sb.AppendLine();
        }
        sb.AppendLine($"Status: {transaction.ReconciliationStatus}");
        sb.AppendLine();
        sb.AppendLine("-------------------------------------");
        sb.AppendLine($"Generated: {BureauClock.LocalNow:yyyy-MM-dd HH:mm} EAT");
        sb.AppendLine("=====================================");

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    #endregion

    #region Statement

    public async Task<ApiResponse<ClientStatementDto>> GetStatementAsync(
        Guid companyId, Guid clientId, DateTime startDate, DateTime endDate, Currency? currency)
    {
        // Bureau-local days as UTC bounds; the end day is included in full.
        var (fromUtcBound, toExclusiveBound) = BureauClock.Range(startDate, endDate);
        var periodStartLocal = startDate;   // shown on the statement as picked
        startDate = fromUtcBound!.Value;

        var client = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == clientId && u.CompanyId == companyId && 
                                      u.Role == UserRole.Client && !u.IsDeleted);

        if (client == null)
            return new ApiResponse<ClientStatementDto>(false, "Client not found", null);

        // One statement = one currency (home currency by default) — never a mix.
        var statementCurrency = currency ?? await _context.BaseCurrencyAsync(companyId);
        var endExclusive = toExclusiveBound!.Value;

        var query = GetClientTransactionsQuery(companyId, clientId)
            .Where(t => t.TransactionDate >= startDate && t.TransactionDate < endExclusive)
            .Where(t => t.Currency == statementCurrency);  // FIX #12: Only match primary currency

        // Sort chronologically (oldest first) for running balance computation
        var transactions = await query
            .OrderBy(t => t.TransactionDate)
            .ThenBy(t => t.CreatedAt)
            .ToListAsync();
        var items = transactions.Select(t => MapToClientTransactionDto(t, clientId)).ToList();

        // Opening balances for the statement currency. KES/USD live on the
        // client's columns; other currencies (UGX, EUR, ...) live in
        // ClientCurrencyBalances. Everything is tracked per-currency so any
        // currency produces a correct running balance and totals.
        decimal baseOpening;
        if (statementCurrency == Currency.KES)
            baseOpening = client.OpeningBalanceKES;
        else if (statementCurrency == Currency.USD)
            baseOpening = client.OpeningBalanceUSD;
        else
        {
            var ccb = await _context.ClientCurrencyBalances
                .FirstOrDefaultAsync(b => b.ClientId == clientId && b.CompanyId == companyId
                                          && b.Currency == statementCurrency && !b.IsDeleted);
            baseOpening = ccb?.OpeningBalance ?? 0m;
        }

        // Sum transactions BEFORE the start date to get the period opening balance
        // for the statement currency only.
        var priorTransactions = await GetClientTransactionsQuery(companyId, clientId)
            .Where(t => t.TransactionDate < startDate && t.Currency == statementCurrency)
            .ToListAsync();
        var priorItems = priorTransactions.Select(t => MapToClientTransactionDto(t, clientId)).ToList();
        var periodOpeningBalance = baseOpening;
        foreach (var item in priorItems)
            periodOpeningBalance += item.Type == "Credit" ? item.Amount : -item.Amount;

        // Running balance + totals for the statement currency.
        decimal totalCredits = 0, totalDebits = 0;
        var running = periodOpeningBalance;
        foreach (var item in items)
        {
            if (item.Currency != statementCurrency) continue;
            item.BalanceBefore = running;
            if (item.Type == "Credit")
            {
                running += item.Amount;
                totalCredits += item.Amount;
            }
            else
            {
                running -= item.Amount;
                totalDebits += item.Amount;
            }
            item.BalanceAfter = running;
        }

        var closingBalance = running;

        // Reverse to show newest first for display
        items.Reverse();

        return new ApiResponse<ClientStatementDto>(true, "Success", new ClientStatementDto
        {
            AccountName = client.FullName,
            AccountCode = client.Code,
            Currency = statementCurrency,
            PeriodStart = periodStartLocal, // the day as picked, not the UTC instant
            PeriodEnd = endDate,
            OpeningBalance = periodOpeningBalance,
            ClosingBalance = closingBalance,
            TotalCredits = totalCredits,
            TotalDebits = totalDebits,
            NetMovement = closingBalance - periodOpeningBalance,
            Transactions = items
        });
    }

    public async Task<byte[]> GenerateStatementPdfAsync(
        Guid companyId, Guid clientId, DateTime startDate, DateTime endDate, Currency? currency)
    {
        var result = await GetStatementAsync(companyId, clientId, startDate, endDate, currency);
        if (!result.Success || result.Data == null)
            throw new Exception(result.Message);

        var statement = result.Data;
        var sb = new StringBuilder();

        sb.AppendLine("=====================================");
        sb.AppendLine("         ACCOUNT STATEMENT");
        sb.AppendLine("=====================================");
        sb.AppendLine();
        sb.AppendLine($"Client: {statement.AccountName}");
        sb.AppendLine($"Client ID: {statement.AccountCode}");
        sb.AppendLine($"Currency: {statement.Currency}");
        sb.AppendLine($"Period: {statement.PeriodStart:yyyy-MM-dd} to {statement.PeriodEnd:yyyy-MM-dd}");
        sb.AppendLine();
        sb.AppendLine($"Opening Balance: {statement.Currency} {statement.OpeningBalance:N2}");
        sb.AppendLine();
        sb.AppendLine("TRANSACTIONS");
        sb.AppendLine("-------------------------------------");
        sb.AppendLine("Date       | Type   | Amount      | Balance     | Description");
        sb.AppendLine("-------------------------------------");

        foreach (var txn in statement.Transactions)
        {
            var typeStr = txn.Type == "Credit" ? "CR" : "DR";
            sb.AppendLine($"{BureauClock.ToLocal(txn.Date):dd/MM/yyyy} | {typeStr,-6} | {txn.Amount,11:N2} | {txn.BalanceAfter,11:N2} | {txn.Description}");
        }

        sb.AppendLine("-------------------------------------");
        sb.AppendLine();
        sb.AppendLine("SUMMARY");
        sb.AppendLine($"Total Credits: {statement.Currency} {statement.TotalCredits:N2}");
        sb.AppendLine($"Total Debits:  {statement.Currency} {statement.TotalDebits:N2}");
        sb.AppendLine($"Net Movement:  {statement.Currency} {statement.NetMovement:N2}");
        sb.AppendLine();
        sb.AppendLine($"Closing Balance: {statement.Currency} {statement.ClosingBalance:N2}");
        sb.AppendLine();
        sb.AppendLine($"Generated: {BureauClock.LocalNow:yyyy-MM-dd HH:mm} EAT");
        sb.AppendLine("=====================================");

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public async Task<byte[]> ExportTransactionsCsvAsync(
        Guid companyId, Guid clientId, DateTime? startDate, DateTime? endDate, Currency? currency)
    {
        var (fromUtc, toExclusive) = BureauClock.Range(startDate, endDate);

        var query = GetClientTransactionsQuery(companyId, clientId);

        if (fromUtc.HasValue)
            query = query.Where(t => t.TransactionDate >= fromUtc.Value);

        if (toExclusive.HasValue)
            query = query.Where(t => t.TransactionDate < toExclusive.Value);

        if (currency.HasValue)
            query = query.Where(t => t.Currency == currency.Value);  // FIX #12: Only match primary currency

        var transactions = await query
            .OrderByDescending(t => t.TransactionDate)
            .ToListAsync();

        var sb = new StringBuilder();
        sb.AppendLine("Code,Date,Time,Type,Description,Amount,Currency,Balance Before,Balance After,Reference,Status");

        foreach (var txn in transactions)
        {
            var dto = MapToClientTransactionDto(txn, clientId);
            sb.AppendLine(string.Join(",",
                CsvText.Cell(dto.Code), CsvText.Cell(BureauClock.ToLocal(dto.Date).ToString("yyyy-MM-dd")), CsvText.Cell(dto.Time), CsvText.Cell(dto.Type),
                CsvText.Cell(dto.Description), dto.Amount.ToString(System.Globalization.CultureInfo.InvariantCulture), dto.Currency,
                dto.BalanceBefore.ToString(System.Globalization.CultureInfo.InvariantCulture),
                dto.BalanceAfter.ToString(System.Globalization.CultureInfo.InvariantCulture),
                CsvText.Cell(dto.Reference), CsvText.Cell(dto.Status)));
        }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    #endregion

    #region Alerts

    public async Task<ApiResponse<PagedResult<ClientAlertDto>>> GetAlertsAsync(
        Guid companyId, Guid clientId, int page, int pageSize, bool unreadOnly)
    {
        var query = _context.Set<ClientAlert>()
            .Where(a => a.ClientId == clientId && a.CompanyId == companyId && !a.IsDeleted);

        if (unreadOnly)
            query = query.Where(a => !a.IsRead);

        var totalCount = await query.CountAsync();

        var alerts = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new ClientAlertDto
            {
                Id = a.Id,
                Type = a.Type,
                Title = a.Title,
                Message = a.Message,
                IsRead = a.IsRead,
                CreatedAt = a.CreatedAt,
                RelatedTransactionId = a.RelatedTransactionId
            })
            .ToListAsync();

        return new ApiResponse<PagedResult<ClientAlertDto>>(true, "Success",
            new PagedResult<ClientAlertDto>(alerts, totalCount, page, pageSize));
    }

    public async Task<ApiResponse<bool>> MarkAlertAsReadAsync(Guid companyId, Guid clientId, Guid alertId)
    {
        var alert = await _context.Set<ClientAlert>()
            .FirstOrDefaultAsync(a => a.Id == alertId && a.ClientId == clientId && 
                                      a.CompanyId == companyId && !a.IsDeleted);

        if (alert == null)
            return new ApiResponse<bool>(false, "Alert not found", false);

        alert.IsRead = true;
        alert.ReadAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return new ApiResponse<bool>(true, "Alert marked as read", true);
    }

    public async Task<ApiResponse<bool>> MarkAllAlertsAsReadAsync(Guid companyId, Guid clientId)
    {
        var alerts = await _context.Set<ClientAlert>()
            .Where(a => a.ClientId == clientId && a.CompanyId == companyId && !a.IsDeleted && !a.IsRead)
            .ToListAsync();

        foreach (var alert in alerts)
        {
            alert.IsRead = true;
            alert.ReadAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        return new ApiResponse<bool>(true, $"{alerts.Count} alerts marked as read", true);
    }

    public async Task<ApiResponse<int>> GetUnreadCountAsync(Guid companyId, Guid clientId)
    {
        var count = await _context.Set<ClientAlert>()
            .CountAsync(a => a.ClientId == clientId && a.CompanyId == companyId && !a.IsDeleted && !a.IsRead);

        return new ApiResponse<int>(true, "Success", count);
    }

    #endregion

    #region Analytics

    public async Task<ApiResponse<ClientAnalyticsDto>> GetAnalyticsAsync(Guid companyId, Guid clientId, int months)
    {
        // Ensure UTC for PostgreSQL
        var startDate = BureauClock.MonthStartUtc(BureauClock.TodayLocal.AddMonths(-months));
        
        var transactions = await GetClientTransactionsQuery(companyId, clientId)
            .Where(t => t.TransactionDate >= startDate)
            .ToListAsync();

        var client = await _context.Users.FindAsync(clientId);

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

            // Per-currency breakdown for currencies beyond KES/USD (UGX, EUR, ...).
            var otherMonthly = monthTxns
                .Where(t => t.Currency != Currency.KES && t.Currency != Currency.USD)
                .GroupBy(t => t.Currency)
                .Select(g =>
                {
                    var (cin, cout, _, _) = CalculateInOutForCurrency(g.ToList(), clientId, g.Key);
                    return new CurrencyFlowDto
                    {
                        Currency = g.Key,
                        CurrencyCode = g.Key.ToString(),
                        Income = cin,
                        Expenses = cout
                    };
                })
                .OrderBy(c => (int)c.Currency)
                .ToList();

            monthlyData.Add(new MonthlyDataDto
            {
                Month = monthName,
                IncomeKES = inKES,
                ExpensesKES = outKES,
                IncomeUSD = inUSD,
                ExpensesUSD = outUSD,
                BalanceKES = client?.BalanceKES ?? 0,
                BalanceUSD = client?.BalanceUSD ?? 0,
                OtherCurrencies = otherMonthly
            });
        }

        // Category breakdown by TransactionType
        var categoryGroups = transactions
            .GroupBy(t => t.TransactionType)
            .Select(g => new CategoryBreakdownDto
            {
                Category = g.Key.ToString(),
                Count = g.Count(),
                TotalKES = g.Where(t => t.Currency == Currency.KES).Sum(t => t.Amount),
                TotalUSD = g.Where(t => t.Currency == Currency.USD).Sum(t => t.Amount),
                Percentage = transactions.Count > 0 ? (decimal)g.Count() / transactions.Count * 100 : 0,
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
        var otherTotals = transactions
            .Where(t => t.Currency != Currency.KES && t.Currency != Currency.USD)
            .GroupBy(t => t.Currency)
            .Select(g =>
            {
                var (cin, cout, _, _) = CalculateInOutForCurrency(g.ToList(), clientId, g.Key);
                return new CurrencyFlowDto
                {
                    Currency = g.Key,
                    CurrencyCode = g.Key.ToString(),
                    Income = cin,
                    Expenses = cout
                };
            })
            .OrderBy(c => (int)c.Currency)
            .ToList();

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

        var kesTxns = transactions.Where(t => t.Currency == Currency.KES).ToList();
        var usdTxns = transactions.Where(t => t.Currency == Currency.USD).ToList();

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

    #endregion

    #region Security

    public async Task<ApiResponse<bool>> ChangePasswordAsync(Guid companyId, Guid clientId, ChangePasswordDto dto)
    {
        if (dto.NewPassword != dto.ConfirmPassword)
            return new ApiResponse<bool>(false, "New passwords do not match", false);

        if (dto.NewPassword.Length < 8)
            return new ApiResponse<bool>(false, "Password must be at least 8 characters", false);

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

        return new ApiResponse<bool>(true, "Password changed successfully", true);
    }

    #endregion

    #region Private Helpers

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
            OtherBalances = otherBalances
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

    #endregion
}