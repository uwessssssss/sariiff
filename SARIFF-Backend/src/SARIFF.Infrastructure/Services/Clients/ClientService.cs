      

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;


public class ClientService : IClientService
{
    private readonly AppDbContext _context;
    private readonly StatementHelper _statementHelper;
    private readonly INotificationService _notificationService;
    private readonly ITransactionService _transactionService;
    private readonly ISmsService _smsService;
    private readonly IConfiguration _config;

    public ClientService(AppDbContext context, INotificationService notificationService, ITransactionService transactionService, ISmsService smsService, IConfiguration config)
    {
        _context = context;
        _statementHelper = new StatementHelper(context);
        _notificationService = notificationService;
        _transactionService = transactionService;
        _smsService = smsService;
        _config = config;
    }

    public async Task<ApiResponse<ClientResponseDto>> CreateAsync(Guid companyId, CreateClientDto dto)
    {
        // Checked trimmed, so stored and compared trimmed: "+2547… " was a second client with the same number.
        dto = dto with { WhatsAppNumber = dto.WhatsAppNumber?.Trim()!, Email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim() };
        // Input validation
        var validationError = ValidationHelper.FirstError(
            ValidationHelper.ValidateName(dto.FullName, "Full name"),
            ValidationHelper.ValidatePhone(dto.WhatsAppNumber, "WhatsApp number"),
            ValidationHelper.ValidateEmail(dto.Email),
            ValidationHelper.ValidateText(dto.IdPassport, "ID/Passport", 50),
            ValidationHelper.ValidateAmount(dto.OpeningBalanceKES, "Opening balance KES", allowZero: true),
            ValidationHelper.ValidateAmount(dto.OpeningBalanceUSD, "Opening balance USD", allowZero: true),
            ValidationHelper.ValidateAmount(dto.OpeningBalanceHome, "Opening balance", allowZero: true)
        );
        if (validationError != null)
            return new ApiResponse<ClientResponseDto>(false, validationError, null);

        if (!Enum.IsDefined(dto.ClientType))
            return new ApiResponse<ClientResponseDto>(false, "Client type must be Permanent or Temporary", null);

        if (dto.ClientType == ClientType.Permanent)
        {
            var pwdCheck = ValidationHelper.ValidatePassword(dto.Password);
            if (!pwdCheck.IsValid)
                return new ApiResponse<ClientResponseDto>(false, pwdCheck.Error!, null);
        }

        if (await _context.Users.AnyAsync(u => u.CompanyId == companyId && u.WhatsAppNumber == dto.WhatsAppNumber && !u.IsDeleted))
            return new ApiResponse<ClientResponseDto>(false, "Client with this WhatsApp number already exists", null);

        // Retry loop handles race condition: if two requests generate the same code,
        // the unique constraint on {CompanyId, Code} rejects the second one, and we retry.
        const int maxRetries = 3;
        
        // Get company prefix for client codes (e.g., "FB" → "FB-CL-2026-0001")
        var company = await _context.Companies.FindAsync(companyId);
        var companyPrefix = company?.CodePrefix;
        
        bool? smsSent = null;
        for (int attempt = 0; attempt < maxRetries; attempt++)
        {
            var code = await CodeGenerator.GenerateClientCodeAsync(_context, companyId, companyPrefix);

            var client = new User
            {
                CompanyId = companyId,
                Code = code,
                FullName = dto.FullName.Trim(),
                WhatsAppNumber = dto.WhatsAppNumber,
                Email = dto.Email,
                IdPassport = string.IsNullOrWhiteSpace(dto.IdPassport) ? null : dto.IdPassport.Trim(),
                Role = UserRole.Client,
                ClientType = dto.ClientType,
                PasswordHash = dto.ClientType == ClientType.Permanent ? BCrypt.Net.BCrypt.HashPassword(dto.Password) : null,
                BalanceKES = dto.OpeningBalanceKES,
                BalanceUSD = dto.OpeningBalanceUSD,
                OpeningBalanceKES = dto.OpeningBalanceKES,
                OpeningBalanceUSD = dto.OpeningBalanceUSD,
                IsActive = true
            };

            // Home currency beyond KES/USD (UGX for a Ugandan bureau) lives in its own
            // balance row, the same place transactions in that currency post to.
            ClientCurrencyBalance? homeOpening = null;
            if (company != null && company.BaseCurrency != Currency.KES && company.BaseCurrency != Currency.USD
                && dto.OpeningBalanceHome != 0)
            {
                homeOpening = new ClientCurrencyBalance
                {
                    CompanyId = companyId,
                    ClientId = client.Id,
                    Currency = company.BaseCurrency,
                    Balance = dto.OpeningBalanceHome,
                    OpeningBalance = dto.OpeningBalanceHome,
                };
            }

            try
            {
                _context.Users.Add(client);
                if (homeOpening != null) _context.ClientCurrencyBalances.Add(homeOpening);
                await _context.SaveChangesAsync();

                // Send credentials via WhatsApp for permanent clients
                if (client.ClientType == ClientType.Permanent && !string.IsNullOrEmpty(dto.Password))
                {
                    // One SMS with the login details (the notification IS the SMS; a second one
                    // with the same password used to follow it).
                    var companyName = company?.Name ?? "Sarif";
                    var websiteUrl = _config["App:WebsiteUrl"] ?? "https://app.sariff.com";
                    try
                    {
                        smsSent = await _notificationService.SendClientCredentialsAsync(
                            companyId, client.Id, client.WhatsAppNumber, client.FullName,
                            code, dto.Password, companyName, websiteUrl);
                    }
                    catch { smsSent = false; /* logged by the notification service; creation still succeeds */ }
                }

                return new ApiResponse<ClientResponseDto>(true,
                    smsSent == false ? "Client created, but the SMS with their login details could not be sent. Share the code and password with them yourself." : "Client created successfully",
                    await MapToResponseAsync(companyId, client));
            }
            catch (DbUpdateException) when (attempt < maxRetries - 1)
            {
                // Duplicate code — detach the failed entity and retry with a new code
                _context.Entry(client).State = EntityState.Detached;
                if (homeOpening != null) _context.Entry(homeOpening).State = EntityState.Detached;
                await Task.Delay(50 * (attempt + 1)); // Small backoff
            }
        }

        return new ApiResponse<ClientResponseDto>(false, "Failed to generate unique client code. Please try again.", null);
    }

    public async Task<ApiResponse<ClientResponseDto>> GetByIdAsync(Guid companyId, Guid id)
    {
        var client = await _context.Users.FirstOrDefaultAsync(u => 
            u.Id == id && u.CompanyId == companyId && u.Role == UserRole.Client && !u.IsDeleted);
        
        if (client == null)
            return new ApiResponse<ClientResponseDto>(false, "Client not found", null);

        return new ApiResponse<ClientResponseDto>(true, "Success", await MapToResponseAsync(companyId, client));
    }

    public async Task<ApiResponse<PagedResult<ClientResponseDto>>> GetAllAsync(Guid companyId, int page, int pageSize, string? search = null, string? filter = null)
    {
        // Page 0 was a negative OFFSET (PostgreSQL refuses it); pageSize had no cap.
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 500);   // the mobile transaction form asks for 500
        var query = _context.Users.Where(u => u.CompanyId == companyId && u.Role == UserRole.Client && !u.IsDeleted);

        if (!string.IsNullOrWhiteSpace(search))
        {
            search = search.Trim();
            var searchLower = search.ToLower();
            query = query.Where(u => 
                u.FullName.ToLower().Contains(searchLower) || 
                u.WhatsAppNumber.Contains(search) || 
                u.Code.ToLower().Contains(searchLower));
        }

        if (!string.IsNullOrWhiteSpace(filter))
        {
            query = filter.ToLower() switch
            {
                // Any currency counts — a client owing only UGX is still "debit".
                "debit" => query.Where(u => u.BalanceKES > 0 || u.BalanceUSD > 0 ||
                    _context.ClientCurrencyBalances.Any(b => b.ClientId == u.Id && !b.IsDeleted && b.Balance > 0)),
                "credit" => query.Where(u => u.BalanceKES < 0 || u.BalanceUSD < 0 ||
                    _context.ClientCurrencyBalances.Any(b => b.ClientId == u.Id && !b.IsDeleted && b.Balance < 0)),
                "permanent" => query.Where(u => u.ClientType == ClientType.Permanent),
                "temporary" => query.Where(u => u.ClientType == ClientType.Temporary),
                "inactive" => query.Where(u => !u.IsActive),
                _ => query
            };
        }

        var totalCount = await query.CountAsync();
        var clients = await query
            .OrderByDescending(u => u.CreatedAt)
            .ThenByDescending(u => u.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        // Debit/credit per client per currency, computed by the database for the
        // whole page in two GROUP BY queries (no transaction rows loaded).
        var clientIds = clients.Select(c => c.Id).ToList();
        var totalsByClient = await _statementHelper.TotalsByAccountAsync(companyId, AccountType.Client, clientIds);

        // Batch-load non-KES/USD balances (UGX, EUR, ...) for all listed clients
        // in one query, then group by client to avoid N+1.
        var otherBalancesRaw = await _context.ClientCurrencyBalances
            .Where(b => b.CompanyId == companyId && clientIds.Contains(b.ClientId) && !b.IsDeleted)
            .ToListAsync();
        var otherBalancesByClient = otherBalancesRaw
            .GroupBy(b => b.ClientId)
            .ToDictionary(
                g => g.Key,
                g => g.OrderBy(b => b.Currency).Select(b => new CurrencyBalanceDto
                {
                    Currency = b.Currency,
                    CurrencyCode = b.Currency.ToString(),
                    Balance = b.Balance,
                    OpeningBalance = b.OpeningBalance,
                    TotalIn = b.TotalIn,
                    TotalOut = b.TotalOut
                }).ToList());

        var items = clients.Select(client =>
        {
            var perCur = totalsByClient.TryGetValue(client.Id, out var pc) ? pc : new();
            perCur.TryGetValue(Currency.KES, out var kesT);
            perCur.TryGetValue(Currency.USD, out var usdT);
            var (debitKES, creditKES, debitUSD, creditUSD) = (kesT.Debit, kesT.Credit, usdT.Debit, usdT.Credit);

            otherBalancesByClient.TryGetValue(client.Id, out var others);

            return new ClientResponseDto(
                client.Id, client.Code, client.FullName, client.WhatsAppNumber,
                client.Email, client.IdPassport, client.ClientType ?? ClientType.Temporary,
                client.BalanceKES, client.BalanceUSD, client.OpeningBalanceKES, client.OpeningBalanceUSD,
                debitKES, creditKES, creditKES - debitKES,
                debitUSD, creditUSD, creditUSD - debitUSD,
                client.IsActive, client.CreatedAt,
                others, client.ClientIdentityId != null);
        }).ToList();

        return new ApiResponse<PagedResult<ClientResponseDto>>(true, "Success",
            new PagedResult<ClientResponseDto>(items, totalCount, page, pageSize));
    }

    public async Task<ApiResponse<ClientResponseDto>> UpdateAsync(Guid companyId, Guid id, UpdateClientDto dto)
    {
        var client = await _context.Users.FirstOrDefaultAsync(u => 
            u.Id == id && u.CompanyId == companyId && u.Role == UserRole.Client && !u.IsDeleted);
        
        if (client == null)
            return new ApiResponse<ClientResponseDto>(false, "Client not found", null);

        // Validate provided fields
        if (dto.FullName != null)
        {
            var nameCheck = ValidationHelper.ValidateName(dto.FullName, "Full name");
            if (!nameCheck.IsValid)
                return new ApiResponse<ClientResponseDto>(false, nameCheck.Error!, null);
            client.FullName = dto.FullName.Trim();
        }
        if (dto.Email != null)
        {
            var emailCheck = ValidationHelper.ValidateEmail(dto.Email);
            if (!emailCheck.IsValid)
                return new ApiResponse<ClientResponseDto>(false, emailCheck.Error!, null);
            client.Email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim();
        }
        if (dto.IdPassport != null)
        {
            var idCheck = ValidationHelper.ValidateText(dto.IdPassport, "ID/Passport", 50);
            if (!idCheck.IsValid)
                return new ApiResponse<ClientResponseDto>(false, idCheck.Error!, null);
            client.IdPassport = string.IsNullOrWhiteSpace(dto.IdPassport) ? null : dto.IdPassport.Trim();
        }
        // Both edit forms send the number; it was never read, and the edit still said "updated".
        var cutPhoneLogin = false;
        if (!string.IsNullOrWhiteSpace(dto.WhatsAppNumber) && dto.WhatsAppNumber.Trim() != client.WhatsAppNumber)
        {
            var phone = dto.WhatsAppNumber.Trim();
            var phoneCheck = ValidationHelper.ValidatePhone(phone, "WhatsApp number");
            if (!phoneCheck.IsValid)
                return new ApiResponse<ClientResponseDto>(false, phoneCheck.Error!, null);
            if (await _context.Users.AnyAsync(u => u.Id != client.Id && u.CompanyId == companyId && u.WhatsAppNumber == phone && !u.IsDeleted))
                return new ApiResponse<ClientResponseDto>(false, "Client with this WhatsApp number already exists", null);
            // The phone login was proved on the old number: whoever gets that number next
            // must not open this account. The client links again from the new number.
            if (client.ClientIdentityId != null)
            {
                client.ClientIdentityId = null;
                client.IdentityLinkedAt = null;
                cutPhoneLogin = true;
            }
            client.WhatsAppNumber = phone;
        }
        var deactivated = dto.IsActive == false && client.IsActive;
        if (dto.IsActive.HasValue) client.IsActive = dto.IsActive.Value;
        client.UpdatedAt = DateTime.UtcNow;

        if (cutPhoneLogin)
            foreach (var session in await _context.UserSessions
                         .Where(x => x.UserId == client.Id && x.ClientIdentityId != null && !x.IsRevoked).ToListAsync())
                session.IsRevoked = true;
        await _context.SaveChangesAsync();
        // Same as Archive: a deactivated client is signed out now, not when the token runs out.
        if (deactivated)
            await Sessions.EndForUserAsync(_context, client.Id, UserRole.Client);

        return new ApiResponse<ClientResponseDto>(true, "Client updated successfully", await MapToResponseAsync(companyId, client));
    }

    public async Task<ApiResponse<bool>> ConvertToPermamentAsync(Guid companyId, Guid id, ConvertClientDto dto)
    {
        var client = await _context.Users.FirstOrDefaultAsync(u => 
            u.Id == id && u.CompanyId == companyId && u.Role == UserRole.Client && !u.IsDeleted);
        
        if (client == null)
            return new ApiResponse<bool>(false, "Client not found", false);

        if (client.ClientType == ClientType.Permanent)
            return new ApiResponse<bool>(false, "Client is already permanent", false);

        var pwdCheck = ValidationHelper.ValidatePassword(dto.Password);
        if (!pwdCheck.IsValid)
            return new ApiResponse<bool>(false, pwdCheck.Error!, false);

        client.ClientType = ClientType.Permanent;
        client.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password);
        client.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        // One SMS with the login details (it used to be sent twice: notification + SMS).
        var company = await _context.Companies.FindAsync(companyId);
        var companyName = company?.Name ?? "Sarif";
        var websiteUrl = _config["App:WebsiteUrl"] ?? "https://app.sariff.com";
        bool sent;
        try
        {
            sent = await _notificationService.SendClientCredentialsAsync(
                companyId, client.Id, client.WhatsAppNumber, client.FullName,
                client.Code, dto.Password, companyName, websiteUrl);
        }
        catch { sent = false; /* logged by the notification service */ }

        return new ApiResponse<bool>(true, sent ? "Client converted to permanent" : "Client converted to permanent, but the SMS with their login details could not be sent. Share the code and password with them yourself.", true);
    }

    public async Task<ApiResponse<bool>> ResetPasswordAsync(Guid companyId, Guid id, ResetClientPasswordDto dto)
    {
        var client = await _context.Users.FirstOrDefaultAsync(u => 
            u.Id == id && u.CompanyId == companyId && u.Role == UserRole.Client && !u.IsDeleted);
        
        if (client == null)
            return new ApiResponse<bool>(false, "Client not found", false);

        if (client.ClientType != ClientType.Permanent)
            return new ApiResponse<bool>(false, "Cannot reset password for temporary client", false);

        var pwdCheck = ValidationHelper.ValidatePassword(dto.NewPassword);
        if (!pwdCheck.IsValid)
            return new ApiResponse<bool>(false, pwdCheck.Error!, false);

        client.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
        client.FailedLoginAttempts = 0;
        client.LockedUntil = null;
        client.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        // Whoever was signed in with the old password is signed out (it may be why it was reset).
        await Sessions.EndForUserAsync(_context, client.Id, UserRole.Client);

        // A new password ends trusted-device sign-in on the phone login (it may be why it changed).
        if (client.ClientIdentityId is { } identityId)
        {
            _context.ClientIdentityDevices.RemoveRange(await _context.ClientIdentityDevices.Where(d => d.ClientIdentityId == identityId).ToListAsync());
            await _context.SaveChangesAsync();
        }

        // Auto-send new password via SMS
        bool sent;
        try
        {
            var smsMsg = $"Sarif: Your password has been reset. Code: {client.Code}, New Password: {dto.NewPassword}. Please change your password after login.";
            sent = await _smsService.SendSmsAsync(client.WhatsAppNumber, smsMsg);
        }
        catch { sent = false; /* SmsService logs the cause */ }

        return new ApiResponse<bool>(true, sent ? "Password reset successfully" : "Password reset, but the SMS with the new password could not be sent. Share it with the client yourself.", true);
    }

    /// <summary>
    /// FIX: Delete client with proper validation
    /// - Checks for outstanding balance
    /// - Checks for recent transactions
    /// - Checks for exchange history
    /// </summary>
    public async Task<ApiResponse<bool>> DeleteAsync(Guid companyId, Guid id)
    {
        var client = await _context.Users.FirstOrDefaultAsync(u => 
            u.Id == id && u.CompanyId == companyId && u.Role == UserRole.Client && !u.IsDeleted);
        
        if (client == null)
            return new ApiResponse<bool>(false, "Client not found", false);

        // Outstanding balance in ANY currency blocks deletion (UGX/EUR included).
        var balanceDetails = await OutstandingBalancesAsync(companyId, client);
        if (balanceDetails.Count > 0)
        {
            return new ApiResponse<bool>(false, 
                $"Cannot delete client with outstanding balance: {string.Join(", ", balanceDetails)}. " +
                "Please settle all balances first, or use Archive instead.", false);
        }

        // FIX: Check for transactions in the last 30 days
        var hasRecentTransactions = await _context.Transactions
            .AnyAsync(t => t.CompanyId == companyId && !t.IsDeleted &&
                ((t.SourceAccountType == AccountType.Client && t.SourceAccountId == id) ||
                 (t.DestAccountType == AccountType.Client && t.DestAccountId == id)) &&
                t.TransactionDate >= DateTime.UtcNow.AddDays(-30));

        if (hasRecentTransactions)
        {
            return new ApiResponse<bool>(false, 
                "Cannot delete client with transactions in the last 30 days. " +
                "Please wait or use Archive instead.", false);
        }

        // FIX: Check for exchange history (needed for audit)
        var hasExchangeHistory = await _context.ExchangeTransactions
            .AnyAsync(e => e.CompanyId == companyId && e.ClientId == id && !e.IsDeleted);

        if (hasExchangeHistory)
        {
            return new ApiResponse<bool>(false, 
                "Cannot delete client with exchange history. " +
                "This data is required for audit and compliance purposes. Use Archive instead.", false);
        }

        // Safe to delete
        client.IsDeleted = true;
        client.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        await Sessions.EndForUserAsync(_context, client.Id, UserRole.Client);

        return new ApiResponse<bool>(true, "Client deleted successfully", true);
    }

    /// <summary>
    /// NEW: Archive client instead of delete
    /// Keeps all data but marks client as inactive
    /// </summary>
    public async Task<ApiResponse<bool>> ArchiveAsync(Guid companyId, Guid id)
    {
        var client = await _context.Users.FirstOrDefaultAsync(u => 
            u.Id == id && u.CompanyId == companyId && u.Role == UserRole.Client && !u.IsDeleted);
        
        if (client == null)
            return new ApiResponse<bool>(false, "Client not found", false);

        client.IsActive = false;
        client.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        // Signed out now: an open portal session otherwise kept working until its token ran out.
        await Sessions.EndForUserAsync(_context, client.Id, UserRole.Client);

        var message = "Client archived successfully.";
        var outstanding = await OutstandingBalancesAsync(companyId, client);
        if (outstanding.Count > 0)
        {
            message += $" Note: Client still has outstanding balance ({string.Join(", ", outstanding)}).";
        }

        return new ApiResponse<bool>(true, message, true);
    }

    /// <summary>
    /// NEW: Reactivate archived client
    /// </summary>
    public async Task<ApiResponse<bool>> ReactivateAsync(Guid companyId, Guid id)
    {
        var client = await _context.Users.FirstOrDefaultAsync(u => 
            u.Id == id && u.CompanyId == companyId && u.Role == UserRole.Client && !u.IsDeleted);
        
        if (client == null)
            return new ApiResponse<bool>(false, "Client not found", false);

        if (client.IsActive)
            return new ApiResponse<bool>(false, "Client is already active", false);

        client.IsActive = true;
        client.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return new ApiResponse<bool>(true, "Client reactivated successfully", true);
    }

    public async Task<ApiResponse<ClientStatsDto>> GetStatsAsync(Guid companyId)
    {
        // PERF: Use DB-level aggregation for client stats
        var clientQuery = _context.Users.Where(u => u.CompanyId == companyId && u.Role == UserRole.Client && !u.IsDeleted);
        
        var totalClients = await clientQuery.CountAsync();
        var permanentClients = await clientQuery.CountAsync(c => c.ClientType == ClientType.Permanent);
        var temporaryClients = await clientQuery.CountAsync(c => c.ClientType == ClientType.Temporary);
        var ccbs = _context.ClientCurrencyBalances.Where(b => b.CompanyId == companyId && !b.IsDeleted);
        var clientsWithDebit = await clientQuery.CountAsync(c => c.BalanceKES > 0 || c.BalanceUSD > 0 ||
            ccbs.Any(b => b.ClientId == c.Id && b.Balance > 0));
        var clientsWithCredit = await clientQuery.CountAsync(c => c.BalanceKES < 0 || c.BalanceUSD < 0 ||
            ccbs.Any(b => b.ClientId == c.Id && b.Balance < 0));
        var totalBalanceKES = await clientQuery.SumAsync(c => c.BalanceKES);
        var totalBalanceUSD = await clientQuery.SumAsync(c => c.BalanceUSD);

        // PERF: Aggregate debit/credit from source-side transactions (DB-level)
        var sourceAgg = await _context.Transactions.AsNoTracking()
            .Where(t => t.CompanyId == companyId && !t.IsDeleted && t.SourceAccountType == AccountType.Client)
            .GroupBy(t => new { t.Currency, t.TransactionType })
            .Select(g => new { g.Key.Currency, g.Key.TransactionType, Total = g.Sum(t => t.Amount) })
            .ToListAsync();

        // Dest-side: use CounterAmount/CounterCurrency where available
        var destAgg = await _context.Transactions.AsNoTracking()
            .Where(t => t.CompanyId == companyId && !t.IsDeleted && t.DestAccountType == AccountType.Client)
            .GroupBy(t => new { Currency = t.CounterCurrency ?? t.Currency, t.TransactionType })
            .Select(g => new { g.Key.Currency, g.Key.TransactionType, Total = g.Sum(t => t.CounterAmount ?? t.Amount) })
            .ToListAsync();

        decimal totalDebitKES = 0, totalCreditKES = 0, totalDebitUSD = 0, totalCreditUSD = 0;
        var debitBy = new Dictionary<Currency, decimal>();
        var creditBy = new Dictionary<Currency, decimal>();
        void Add(Dictionary<Currency, decimal> d, Currency c, decimal v) => d[c] = (d.TryGetValue(c, out var x) ? x : 0) + v;

        // Source: Debit type = debit for client
        foreach (var s in sourceAgg)
        {
            var isDebit = s.TransactionType == TransactionType.Debit;
            Add(isDebit ? debitBy : creditBy, s.Currency, s.Total);
            if (s.Currency == Currency.KES) { if (isDebit) totalDebitKES += s.Total; else totalCreditKES += s.Total; }
            else if (s.Currency == Currency.USD) { if (isDebit) totalDebitUSD += s.Total; else totalCreditUSD += s.Total; }
            // Other currencies (UGX, EUR, ...) are excluded from the KES/USD stats.
        }
        // Dest: Credit type = debit for client (reverse)
        foreach (var d in destAgg)
        {
            var isDebit = d.TransactionType == TransactionType.Credit;
            Add(isDebit ? debitBy : creditBy, d.Currency, d.Total);
            if (d.Currency == Currency.KES) { if (isDebit) totalDebitKES += d.Total; else totalCreditKES += d.Total; }
            else if (d.Currency == Currency.USD) { if (isDebit) totalDebitUSD += d.Total; else totalCreditUSD += d.Total; }
            // Other currencies (UGX, EUR, ...) are excluded from the KES/USD stats.
        }

        // Per-currency totals (KES, USD, UGX, EUR, ...)
        var otherRows = await ccbs.Join(clientQuery, b => b.ClientId, u => u.Id, (b, u) => b).ToListAsync();
        var balanceRows = new List<(Currency Cur, decimal Bal)>();
        var kesUsd = await clientQuery.Select(c => new { c.BalanceKES, c.BalanceUSD }).ToListAsync();
        balanceRows.AddRange(kesUsd.Select(c => (Currency.KES, c.BalanceKES)));
        balanceRows.AddRange(kesUsd.Select(c => (Currency.USD, c.BalanceUSD)));
        balanceRows.AddRange(otherRows.Select(b => (b.Currency, b.Balance)));
        var byCurrency = balanceRows.Select(r => r.Cur).Concat(debitBy.Keys).Concat(creditBy.Keys)
            .Distinct().OrderBy(c => c)
            .Select(cur =>
            {
                var rows = balanceRows.Where(r => r.Cur == cur).ToList();
                return new CurrencyClientTotalsDto(cur, CurrencyInfo.Code(cur),
                    rows.Sum(r => r.Bal),
                    debitBy.TryGetValue(cur, out var dv) ? dv : 0,
                    creditBy.TryGetValue(cur, out var cv) ? cv : 0,
                    rows.Count(r => r.Bal > 0),
                    rows.Count(r => r.Bal < 0));
            })
            .Where(x => x.TotalBalance != 0 || x.TotalDebit != 0 || x.TotalCredit != 0)
            .ToList();

        var stats = new ClientStatsDto(
            TotalClients: totalClients,
            PermanentClients: permanentClients,
            TemporaryClients: temporaryClients,
            ClientsWithDebit: clientsWithDebit,
            ClientsWithCredit: clientsWithCredit,
            TotalBalanceKES: totalBalanceKES,
            TotalBalanceUSD: totalBalanceUSD,
            TotalDebitKES: totalDebitKES,
            TotalCreditKES: totalCreditKES,
            TotalDebitUSD: totalDebitUSD,
            TotalCreditUSD: totalCreditUSD,
            ByCurrency: byCurrency
        );

        return new ApiResponse<ClientStatsDto>(true, "Success", stats);
    }

    public async Task<ApiResponse<StatementDto>> GetStatementAsync(Guid companyId, Guid id, StatementFilterDto filter)
    {
        var client = await _context.Users.FirstOrDefaultAsync(u =>
            u.Id == id && u.CompanyId == companyId && u.Role == UserRole.Client && !u.IsDeleted);

        if (client == null)
            return new ApiResponse<StatementDto>(false, "Client not found", null);

        // One statement = one currency. Default to the bureau's home currency
        // (UGX in Uganda), never a hard-coded KES.
        var currency = filter.Currency ?? await _context.BaseCurrencyAsync(companyId);

        // Opening balance in that currency: KES/USD live on the client's own columns,
        // every other currency in ClientCurrencyBalances.
        decimal accountOpening;
        if (currency == Currency.KES) accountOpening = client.OpeningBalanceKES;
        else if (currency == Currency.USD) accountOpening = client.OpeningBalanceUSD;
        else
        {
            var ccb = await _context.ClientCurrencyBalances
                .FirstOrDefaultAsync(b => b.ClientId == id && b.CompanyId == companyId && b.Currency == currency && !b.IsDeleted);
            accountOpening = ccb?.OpeningBalance ?? 0m;
        }

        var history = _context.Transactions.Where(t => t.CompanyId == companyId && !t.IsDeleted &&
            ((t.SourceAccountType == AccountType.Client && t.SourceAccountId == id) ||
             (t.DestAccountType == AccountType.Client && t.DestAccountId == id)));

        var statement = await _statementHelper.BuildPeriodStatementAsync(
            history, AccountType.Client, id, client.FullName, client.Code, currency, accountOpening, filter);
        return new ApiResponse<StatementDto>(true, "Success", statement);
    }

    /// <summary>
    /// Reverse a transaction from the client statement context.
    /// Delegates to TransactionService.DeleteAsync with clientContext set,
    /// which skips the "client only from client statement" guard but validates
    /// the transaction belongs to this client.
    /// </summary>
    public async Task<ApiResponse<bool>> ReverseTransactionAsync(Guid companyId, Guid clientId, Guid transactionId, Guid userId, string? reason)
    {
        // Validate client exists
        var client = await _context.Users.FirstOrDefaultAsync(u =>
            u.Id == clientId && u.CompanyId == companyId && u.Role == Core.Enums.UserRole.Client && !u.IsDeleted);

        if (client == null)
            return new ApiResponse<bool>(false, "Client not found", false);

        // Delegate to TransactionService with clientContext — this tells DeleteAsync
        // "I'm calling from the client statement, allow client transactions but validate ownership"
        return await _transactionService.DeleteAsync(
            companyId, transactionId, userId,
            new DeleteTransactionDto(reason ?? "Reversed from the client statement"),
            clientContext: clientId);
    }

    /// <summary>
    /// PERF: Lightweight client list for dropdowns — no balance/transaction calculations.
    /// Returns only id, code, name, phone, isActive. Single DB query, no N+1.
    /// </summary>
    public async Task<ApiResponse<List<ClientLookupDto>>> GetLookupAsync(Guid companyId, string? search = null)
    {
        var query = _context.Users
            .Where(u => u.CompanyId == companyId && u.Role == UserRole.Client && !u.IsDeleted && u.IsActive);

        if (!string.IsNullOrWhiteSpace(search))
        {
            search = search.Trim();
            var s = search.ToLower();
            query = query.Where(u => 
                u.FullName.ToLower().Contains(s) || 
                u.WhatsAppNumber.Contains(search) || 
                u.Code.ToLower().Contains(s));
        }

        var clients = await query
            .OrderBy(u => u.FullName)
            .Take(200) // Cap at 200 for dropdown performance
            .Select(u => new ClientLookupDto(u.Id, u.Code, u.FullName, u.WhatsAppNumber, u.IdPassport, u.IsActive))
            .ToListAsync();

        return new ApiResponse<List<ClientLookupDto>>(true, "Success", clients);
    }

    /// <summary>Non-zero balances in every currency, formatted "UGX 2,000,000.00".</summary>
    private async Task<List<string>> OutstandingBalancesAsync(Guid companyId, User client)
    {
        var list = new List<string>();
        if (client.BalanceKES != 0) list.Add($"KES {client.BalanceKES:N2}");
        if (client.BalanceUSD != 0) list.Add($"USD {client.BalanceUSD:N2}");
        var others = await _context.ClientCurrencyBalances
            .Where(b => b.CompanyId == companyId && b.ClientId == client.Id && !b.IsDeleted && b.Balance != 0)
            .OrderBy(b => b.Currency)
            .ToListAsync();
        list.AddRange(others.Select(b => $"{b.Currency} {b.Balance:N2}"));
        return list;
    }

    private async Task<ClientResponseDto> MapToResponseAsync(Guid companyId, User client)
    {
        var perCurrency = (await _statementHelper.TotalsByAccountAsync(companyId, AccountType.Client, new[] { client.Id }))
            .TryGetValue(client.Id, out var pc) ? pc : new();
        perCurrency.TryGetValue(Currency.KES, out var kesT);
        perCurrency.TryGetValue(Currency.USD, out var usdT);
        var (debitKES, creditKES, debitUSD, creditUSD) = (kesT.Debit, kesT.Credit, usdT.Debit, usdT.Credit);

        var otherBalances = await _context.ClientCurrencyBalances
            .Where(b => b.CompanyId == companyId && b.ClientId == client.Id && !b.IsDeleted)
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

        return new ClientResponseDto(
            client.Id,
            client.Code,
            client.FullName,
            client.WhatsAppNumber,
            client.Email,
            client.IdPassport,
            client.ClientType ?? ClientType.Temporary,
            client.BalanceKES,
            client.BalanceUSD,
            client.OpeningBalanceKES,
            client.OpeningBalanceUSD,
            debitKES,
            creditKES,
            creditKES - debitKES,
            debitUSD,
            creditUSD,
            creditUSD - debitUSD,
            client.IsActive,
            client.CreatedAt,
            otherBalances,
            client.ClientIdentityId != null
        );
    }
}