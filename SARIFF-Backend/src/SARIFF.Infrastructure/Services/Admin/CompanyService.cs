using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public class CompanyService : ICompanyService
{
    private readonly AppDbContext _context;
    private readonly INotificationService _notificationService;
    private readonly ISmsService _smsService;
    private readonly IConfiguration _config;
    private readonly ILogger<CompanyService> _logger;

    public CompanyService(AppDbContext context, INotificationService notificationService, ISmsService smsService, IConfiguration config, ILogger<CompanyService> logger)
    {
        _context = context;
        _notificationService = notificationService;
        _smsService = smsService;
        _config = config;
        _logger = logger;
    }

    public async Task<ApiResponse<CompanyResponseDto>> CreateAsync(CreateCompanyDto dto)
    {
        _logger.LogInformation("Creating company: {Name}", dto.Name);
        // Checked trimmed, so stored and compared trimmed ("+2547… " was a second bureau on one number).
        dto = dto with { Name = dto.Name?.Trim()!, OwnerName = dto.OwnerName?.Trim()!, WhatsAppNumber = dto.WhatsAppNumber?.Trim()!,
                         Email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim() };
        
        // Input validation. A bureau's name is a business name ("24/7 Forex & Exchange"): the
        // person-name rule refused "&", digits and "/". The owner is a person.
        var validationError = ValidationHelper.FirstError(
            ValidationHelper.ValidateLabel(dto.Name, "Company name", 255),
            ValidationHelper.ValidateName(dto.OwnerName, "Owner name"),
            ValidationHelper.ValidatePhone(dto.WhatsAppNumber, "WhatsApp number"),
            ValidationHelper.ValidateEmail(dto.Email),
            ValidationHelper.ValidatePassword(dto.Password)
        );
        if (validationError != null)
            return new ApiResponse<CompanyResponseDto>(false, validationError, null);

        var baseCurrency = dto.BaseCurrency ?? Currency.KES;
        // A bureau's home is Kenya (KES) or Uganda (UGX); USD/EUR are what it trades against.
        if (baseCurrency is not (Currency.KES or Currency.UGX))
            return new ApiResponse<CompanyResponseDto>(false, "The home currency must be KES (Kenya) or UGX (Uganda)", null);

        // A prefix typed in by hand must be 2–4 letters or digits and not one the sign-in
        // page reads as something else: "SA-…" is a super admin and "CL-…" / "…-CL-…" a
        // client, so a bureau given one of those could never sign in.
        if (!string.IsNullOrWhiteSpace(dto.CodePrefix))
        {
            var typed = dto.CodePrefix.Trim().ToUpperInvariant();
            if (!System.Text.RegularExpressions.Regex.IsMatch(typed, "^[A-Z0-9]{2,4}$") || typed is "SA" or "CL")
                return new ApiResponse<CompanyResponseDto>(false, "The code prefix must be 2 to 4 letters or digits, and can't be SA or CL (those are reserved).", null);
        }

        if (await _context.Companies.AnyAsync(c => c.WhatsAppNumber == dto.WhatsAppNumber))
            return new ApiResponse<CompanyResponseDto>(false, "WhatsApp number already registered", null);

        const int maxRetries = 3;
        for (int attempt = 0; attempt < maxRetries; attempt++)
        {
            // Generate or use provided code prefix (2-3 chars from company name)
            var codePrefix = !string.IsNullOrWhiteSpace(dto.CodePrefix) 
                ? dto.CodePrefix.Trim().ToUpper()
                : CodeGenerator.GenerateCodePrefix(dto.Name);
            
            // Ensure prefix is unique across companies
            if (await _context.Companies.AnyAsync(c => c.CodePrefix == codePrefix && !c.IsDeleted))
            {
                // Append a number to make it unique
                for (int i = 1; i <= 9; i++)
                {
                    var candidate = codePrefix.Length >= 3 ? codePrefix.Substring(0, 2) + i : codePrefix + i;
                    if (!await _context.Companies.AnyAsync(c => c.CodePrefix == candidate && !c.IsDeleted))
                    {
                        codePrefix = candidate;
                        break;
                    }
                }
            }

            var code = await CodeGenerator.GenerateCompanyCodeAsync(_context, codePrefix);
            _logger.LogInformation("Generated company code: {Code} (prefix: {Prefix})", code, codePrefix);

            var company = new Company
            {
                Code = code,
                CodePrefix = codePrefix,
                Name = dto.Name,
                OwnerName = dto.OwnerName,
                WhatsAppNumber = dto.WhatsAppNumber,
                Email = dto.Email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
                IsActive = true,
                BaseCurrency = baseCurrency
            };

            _context.Companies.Add(company);

            // Default cash accounts: the home currency plus USD (e.g. KES + USD
            // in Kenya, UGX + USD in Uganda). Other currencies are added later.
            var cashKes = new CashAccount { CompanyId = company.Id, Currency = baseCurrency, Code = $"CASH-{baseCurrency}" };
            var cashUsd = new CashAccount { CompanyId = company.Id, Currency = Currency.USD, Code = "CASH-USD" };
            _context.CashAccounts.Add(cashKes);
            if (baseCurrency != Currency.USD) _context.CashAccounts.Add(cashUsd);

            try
            {
                await _context.SaveChangesAsync();
                
                _logger.LogInformation("Company created: {Code} - {Name}", company.Code, company.Name);

                // One SMS with the login details. (The notification IS the SMS now; a second,
                // separate SMS with the same password went out as well.)
                var websiteUrl = _config["App:WebsiteUrl"] ?? "https://app.sariff.com";
                var smsSent = false;
                try
                {
                    smsSent = await _notificationService.SendOfficeUserCredentialsAsync(
                        company.Id, dto.WhatsAppNumber, dto.Name, company.Code, dto.Password, websiteUrl);
                }
                catch (Exception ex) { _logger.LogWarning(ex, "Credentials SMS failed for company {Code}", company.Code); }
                if (!smsSent) _logger.LogWarning("Credentials SMS not delivered for company {Code}", company.Code);

                return new ApiResponse<CompanyResponseDto>(true,
                    smsSent ? "Company created successfully" : "Company created, but the SMS with the login details could not be sent. Share the code and password with the bureau yourself.",
                    MapToResponse(company));
            }
            catch (DbUpdateException) when (attempt < maxRetries - 1)
            {
                _context.Entry(company).State = EntityState.Detached;
                _context.Entry(cashKes).State = EntityState.Detached;
                _context.Entry(cashUsd).State = EntityState.Detached;
                await Task.Delay(50 * (attempt + 1));
            }
        }
        return new ApiResponse<CompanyResponseDto>(false, "Failed to generate unique company code. Please try again.", null);
    }

    public async Task<ApiResponse<CompanyResponseDto>> GetByIdAsync(Guid id)
    {
        var company = await _context.Companies.FindAsync(id);
        if (company == null)
            return new ApiResponse<CompanyResponseDto>(false, "Company not found", null);

        return new ApiResponse<CompanyResponseDto>(true, "Success", MapToResponse(company));
    }

    public async Task<ApiResponse<PagedResult<CompanyResponseDto>>> GetAllAsync(int page, int pageSize, string? search = null)
    {
        page = Math.Max(1, page);                 // page 0 was a negative OFFSET: a server error on PostgreSQL
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = _context.Companies.AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            // Ignore case: "amana" finds "Amana Forex" (PostgreSQL's LIKE is case-sensitive).
            var term = search.Trim().ToLower();
            query = query.Where(c => c.Name.ToLower().Contains(term) ||
                                    c.OwnerName.ToLower().Contains(term) ||
                                    c.Code.ToLower().Contains(term) ||
                                    c.WhatsAppNumber.Contains(term));
        }

        var totalCount = await query.CountAsync();
        var companies = await query
            .OrderByDescending(c => c.CreatedAt)
            .ThenByDescending(c => c.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();  // FIX #22: Materialize first to avoid client-side evaluation
        
        var items = companies.Select(c => MapToResponse(c)).ToList();

        return new ApiResponse<PagedResult<CompanyResponseDto>>(true, "Success", 
            new PagedResult<CompanyResponseDto>(items, totalCount, page, pageSize));
    }

    public async Task<ApiResponse<CompanyResponseDto>> UpdateAsync(Guid id, UpdateCompanyDto dto)
    {
        var company = await _context.Companies.FindAsync(id);
        if (company == null)
            return new ApiResponse<CompanyResponseDto>(false, "Company not found", null);

        if (dto.Name != null)
        {
            var check = ValidationHelper.ValidateLabel(dto.Name, "Company name", 255);
            if (!check.IsValid) return new ApiResponse<CompanyResponseDto>(false, check.Error!, null);
            company.Name = dto.Name.Trim();
        }
        if (dto.OwnerName != null)
        {
            var check = ValidationHelper.ValidateName(dto.OwnerName, "Owner name");
            if (!check.IsValid) return new ApiResponse<CompanyResponseDto>(false, check.Error!, null);
            company.OwnerName = dto.OwnerName.Trim();
        }
        if (dto.Email != null)
        {
            var check = ValidationHelper.ValidateEmail(dto.Email);
            if (!check.IsValid) return new ApiResponse<CompanyResponseDto>(false, check.Error!, null);
            company.Email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim();
        }
        if (dto.LogoUrl != null)
        {
            // A small PNG/JPEG data: URL (the apps shrink logos to ~400 px) or an https link.
            // Anything else — a 5 MB photo, a script URL — is refused.
            var logo = dto.LogoUrl.Trim();
            var isImageData = logo.StartsWith("data:image/png;base64,") || logo.StartsWith("data:image/jpeg;base64,");
            if (logo.Length > 0 && !(isImageData || logo.StartsWith("https://")))
                return new ApiResponse<CompanyResponseDto>(false, "The logo must be a PNG or JPG image.", null);
            if (logo.Length > 700_000)
                return new ApiResponse<CompanyResponseDto>(false, "The logo is too large (512 KB at most).", null);
            company.LogoUrl = logo.Length == 0 ? null : logo;
        }
        // Shown on invoices and receipts: limited like every other text field (they had no limit).
        var textError = ValidationHelper.FirstError(
            ValidationHelper.ValidateText(dto.TaxId, "Tax ID", 50),
            ValidationHelper.ValidateText(dto.Website, "Website", 255),
            ValidationHelper.ValidateText(dto.Address, "Address", 500));
        if (textError != null) return new ApiResponse<CompanyResponseDto>(false, textError, null);
        if (dto.TaxId != null) company.TaxId = dto.TaxId.Trim();
        if (dto.Website != null) company.Website = dto.Website.Trim();
        if (dto.Address != null) company.Address = dto.Address.Trim();

        await _context.SaveChangesAsync();

        return new ApiResponse<CompanyResponseDto>(true, "Company updated successfully", MapToResponse(company));
    }

    public async Task<ApiResponse<bool>> ActivateAsync(Guid id)
    {
        var company = await _context.Companies.FindAsync(id);
        if (company == null)
            return new ApiResponse<bool>(false, "Company not found", false);

        company.IsActive = true;
        company.LockedUntil = null;
        company.FailedLoginAttempts = 0;
        await _context.SaveChangesAsync();

        return new ApiResponse<bool>(true, "Company activated", true);
    }

    public async Task<ApiResponse<bool>> DeactivateAsync(Guid id)
    {
        var company = await _context.Companies.FindAsync(id);
        if (company == null)
            return new ApiResponse<bool>(false, "Company not found", false);

        company.IsActive = false;
        await _context.SaveChangesAsync();
        // Takes effect on the next request, not when the 30-second access cache runs out.
        CompanyAccessCache.Invalidate(id);
        await Sessions.EndForOfficeAsync(_context, id);

        return new ApiResponse<bool>(true, "Company deactivated", true);
    }

    public async Task<ApiResponse<bool>> ResetPasswordAsync(Guid id, AdminResetPasswordDto dto)
    {
        var company = await _context.Companies.FindAsync(id);
        if (company == null)
            return new ApiResponse<bool>(false, "Company not found", false);

        var pwdCheck = ValidationHelper.ValidatePassword(dto.NewPassword);
        if (!pwdCheck.IsValid)
            return new ApiResponse<bool>(false, pwdCheck.Error!, false);

        company.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
        company.FailedLoginAttempts = 0;
        company.LockedUntil = null;
        await _context.SaveChangesAsync();
        // Same as the admin screen's reset: sign the bureau out and forget its trusted devices.
        await Sessions.EndForOfficeAsync(_context, id);

        return new ApiResponse<bool>(true, "Password reset successfully", true);
    }

    public async Task<ApiResponse<CompanySummaryDto>> GetSummaryAsync(Guid id)
    {
        var company = await _context.Companies.FindAsync(id);
        if (company == null)
            return new ApiResponse<CompanySummaryDto>(false, "Company not found", null);

        var totalClients = await _context.Users.CountAsync(u => u.CompanyId == id && u.Role == UserRole.Client);
        var totalTransactions = await _context.Transactions.CountAsync(t => t.CompanyId == id);
        var clientBalances = await _context.Users
            .Where(u => u.CompanyId == id && u.Role == UserRole.Client)
            .GroupBy(u => 1)
            .Select(g => new { TotalKES = g.Sum(u => u.BalanceKES), TotalUSD = g.Sum(u => u.BalanceUSD) })
            .FirstOrDefaultAsync();

        // Client balances beyond KES/USD (UGX, EUR, ...)
        var otherClientBalances = (await _context.ClientCurrencyBalances
                .Where(b => b.CompanyId == id && !b.IsDeleted)
                .GroupBy(b => b.Currency)
                .Select(g => new { Currency = g.Key, Total = g.Sum(b => b.Balance) })
                .ToListAsync())
            .Where(x => x.Total != 0)
            .OrderBy(x => x.Currency)
            .Select(x => new CurrencyAmountDto(x.Currency, CurrencyInfo.Code(x.Currency), x.Total))
            .ToList();

        return new ApiResponse<CompanySummaryDto>(true, "Success", new CompanySummaryDto(
            company.Id,
            company.Code,  // <-- THIS WAS MISSING!
            company.Name,
            company.OwnerName,
            totalClients,
            totalTransactions,
            clientBalances?.TotalKES ?? 0,
            clientBalances?.TotalUSD ?? 0,
            company.IsActive,
            otherClientBalances
        ));
    }

    public async Task<ApiResponse<List<CompanySummaryDto>>> GetAllSummariesAsync()
    {
        var companies = await _context.Companies.ToListAsync();
        var companyIds = companies.Select(c => c.Id).ToList();

        // PERF: Batch all counts in 2 queries instead of 3 per company
        var clientCounts = await _context.Users
            .Where(u => companyIds.Contains(u.CompanyId ?? Guid.Empty) && u.Role == UserRole.Client && !u.IsDeleted)
            .GroupBy(u => u.CompanyId)
            .Select(g => new { CompanyId = g.Key, Count = g.Count(), TotalKES = g.Sum(u => u.BalanceKES), TotalUSD = g.Sum(u => u.BalanceUSD) })
            .ToListAsync();

        var txnCounts = await _context.Transactions.AsNoTracking()
            .Where(t => companyIds.Contains(t.CompanyId) && !t.IsDeleted)
            .GroupBy(t => t.CompanyId)
            .Select(g => new { CompanyId = g.Key, Count = g.Count() })
            .ToListAsync();

        // Client balances beyond KES/USD (UGX, EUR, ...) per company
        var otherTotals = await _context.ClientCurrencyBalances
            .Where(b => companyIds.Contains(b.CompanyId) && !b.IsDeleted)
            .GroupBy(b => new { b.CompanyId, b.Currency })
            .Select(g => new { g.Key.CompanyId, g.Key.Currency, Total = g.Sum(b => b.Balance) })
            .ToListAsync();

        var summaries = companies.Select(company =>
        {
            var clients = clientCounts.FirstOrDefault(c => c.CompanyId == company.Id);
            var txns = txnCounts.FirstOrDefault(t => t.CompanyId == company.Id);

            return new CompanySummaryDto(
                company.Id, company.Code, company.Name, company.OwnerName,
                clients?.Count ?? 0, txns?.Count ?? 0,
                clients?.TotalKES ?? 0, clients?.TotalUSD ?? 0,
                company.IsActive,
                otherTotals.Where(o => o.CompanyId == company.Id && o.Total != 0)
                    .OrderBy(o => o.Currency)
                    .Select(o => new CurrencyAmountDto(o.Currency, CurrencyInfo.Code(o.Currency), o.Total))
                    .ToList());
        }).ToList();

        return new ApiResponse<List<CompanySummaryDto>>(true, "Success", summaries);
    }

    private static CompanyResponseDto MapToResponse(Company c) => new(
        c.Id,
        c.Code,  // <-- THIS WAS MISSING!
        c.Name,
        c.OwnerName,
        c.WhatsAppNumber,
        c.Email,
        c.LogoUrl,
        c.TaxId,
        c.Website,
        c.Address,
        c.IsActive,
        c.CreatedAt,
        c.LastLoginAt,
        c.BaseCurrency
    );
}