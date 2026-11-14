
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
    // ==================== COMPANIES ====================

    public async Task<ApiResponse<PagedResult<CompanyStatsDto>>> GetAllCompaniesWithStatsAsync(
        int page, int pageSize, string? search = null, string? status = null, Currency? baseCurrency = null)
    {
        page = Math.Max(1, page);                 // page 0 was a negative OFFSET: a server error on PostgreSQL
        pageSize = Math.Clamp(pageSize, 1, 200);
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

            // Country (home currency) filter: applied here, before paging, so it covers every bureau.
            if (baseCurrency.HasValue)
            {
                var home = baseCurrency.Value;
                query = query.Where(c => c.BaseCurrency == home);
            }

            var totalCount = await query.CountAsync();
            var companies = await query
                .OrderByDescending(c => c.CreatedAt)
                .ThenByDescending(c => c.Id)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

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
        if (dto.BaseCurrency is not (Currency.KES or Currency.UGX))
            return new ApiResponse<CompanyDetailDto>(false, "The home currency must be KES (Kenya) or UGX (Uganda)", null!);

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
        if (!Enum.IsDefined(typeof(SubscriptionPlan), dto.Plan))
            return new ApiResponse<bool>(false, "Unknown subscription plan", false);
        if (dto.Status.HasValue && !Enum.IsDefined(typeof(SubscriptionStatus), dto.Status.Value))
            return new ApiResponse<bool>(false, "Unknown subscription status", false);
        try
        {
            var company = await _context.Companies.FindAsync(companyId);
            if (company == null)
                return new ApiResponse<bool>(false, "Company not found", false);

            company.SubscriptionPlan = dto.Plan;
            company.MonthlyFee = dto.MonthlyFee;
            // The admin screen sends a calendar day ("2026-12-31"): a subscription runs to the END
            // of that day in East Africa. Stored as midnight UTC it counted as expired from 03:00
            // that morning. A value with a time of day is kept as sent.
            if (dto.ExpiresAt is { } expires)
                company.SubscriptionExpiresAt = expires.TimeOfDay == TimeSpan.Zero
                    ? BureauClock.DayStartUtc(expires.Date.AddDays(1)).AddTicks(-1)
                    : expires;

            // No status given: keep the one it has. (It used to become Active, so editing the
            // fee of a cancelled or suspended bureau quietly switched its subscription back on.)
            company.SubscriptionStatus = dto.Status ?? company.SubscriptionStatus;
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
            // Sign the bureau out everywhere and forget its trusted devices: sessions opened
            // with the old password otherwise kept working.
            await Sessions.EndForOfficeAsync(_context, companyId);

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
}
