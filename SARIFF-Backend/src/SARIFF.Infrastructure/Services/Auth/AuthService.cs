
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public partial class AuthService : IAuthService
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _config;
    private readonly INotificationService _notificationService;
    private readonly ISmsService _smsService;
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        AppDbContext context, 
        IConfiguration config, 
        INotificationService notificationService,
        ISmsService smsService,
        ILogger<AuthService> logger)
    {
        _context = context;
        _config = config;
        _notificationService = notificationService;
        _smsService = smsService;
        _logger = logger;
    }

    /// <summary>
    /// UNIFIED LOGIN - One endpoint for SuperAdmin, OfficeUser, and Client
    /// - SuperAdmin/OfficeUser: Returns OTP requirement
    /// - Client: Returns tokens directly (no OTP)
    /// </summary>
    public async Task<ApiResponse<object>> UnifiedLoginAsync(UnifiedLoginDto request, string ipAddress, string? userAgent)
    {
        // Input validation
        if (string.IsNullOrWhiteSpace(request.Code))
            return new ApiResponse<object>(false, "Code is required", null);

        var phoneCheck = ValidationHelper.ValidatePhone(request.PhoneNumber, "Phone number");
        if (!phoneCheck.IsValid)
            return new ApiResponse<object>(false, phoneCheck.Error!, null);

        if (string.IsNullOrEmpty(request.Password))
            return new ApiResponse<object>(false, "Password is required", null);

        _logger.LogInformation("========================================");
        _logger.LogInformation("UNIFIED LOGIN ATTEMPT");
        _logger.LogInformation("Code: {Code}", request.Code);
        _logger.LogInformation("========================================");

        // Determine user type by code format
        // SA-2026-001         → SuperAdmin
        // FB-CL-2026-0001     → Client (contains -CL-)
        // FB-2026-0001        → OfficeUser (company prefix)
        // Legacy: CO-2026-0001 → OfficeUser, CL-2026-0001 → Client
        var code = request.Code.Trim().ToUpperInvariant();   // checked non-blank above
        // Look the account up with what was ROUTED on: codes are stored upper-case, and the
        // mobile app sends the code as typed ("Qab-cl-…" from a phone keyboard was refused).
        request = request with { Code = code, PhoneNumber = request.PhoneNumber.Trim() };
        var codePrefix = code.Split('-')[0];   // Split always returns at least one part
        
        _logger.LogInformation("Code prefix: {Prefix}", codePrefix);

        if (codePrefix == "SA")
            return await LoginSuperAdminAsync(request, ipAddress, userAgent);
        
        if (code.Contains("-CL-") || codePrefix == "CL")
            return await LoginClientAsync(request, ipAddress, userAgent);
        
        // Everything else is an OfficeUser (CO- or company prefix like FB-, AFB-, etc.)
        return await LoginOfficeUserAsync(request, ipAddress, userAgent);
    }

    private async Task<ApiResponse<object>> LoginSuperAdminAsync(UnifiedLoginDto request, string ipAddress, string? userAgent)
    {
        _logger.LogInformation("Processing as SUPER ADMIN login");

        var superAdmin = await _context.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Code == request.Code && 
                                      u.WhatsAppNumber == request.PhoneNumber && 
                                      u.Role == UserRole.SuperAdmin &&
                                      !u.IsDeleted);

        if (superAdmin == null)
        {
            _logger.LogWarning("SuperAdmin not found: Code={Code}, Phone={Phone}", request.Code, request.PhoneNumber);
            await LogLoginAttempt(null, null, UserRole.SuperAdmin, ipAddress, userAgent, false, "User not found");
            return new ApiResponse<object>(false, "Invalid credentials", null);
        }

        _logger.LogInformation("Found SuperAdmin: {Name}", superAdmin.FullName);

        // Validate account status
        var validationResult = ValidateAccountStatus(superAdmin.IsActive, superAdmin.LockedUntil, superAdmin.PasswordHash, request.Code);
        if (validationResult != null) return validationResult;

        // Verify password
        if (!BCrypt.Net.BCrypt.Verify(request.Password, superAdmin.PasswordHash))
        {
            // A lock that has run out starts the count again. (It used to stay at 5, so the
            // first typo after waiting out a lock locked the account for another 30 minutes.)
            if (superAdmin.LockedUntil.HasValue) { superAdmin.LockedUntil = null; superAdmin.FailedLoginAttempts = 0; }
            superAdmin.FailedLoginAttempts++;
            if (superAdmin.FailedLoginAttempts >= 5)
                superAdmin.LockedUntil = DateTime.UtcNow.AddMinutes(30);
            await _context.SaveChangesAsync();
            
            _logger.LogWarning("Invalid password for SuperAdmin {Code}", request.Code);
            await LogLoginAttempt(null, superAdmin.Id, UserRole.SuperAdmin, ipAddress, userAgent, false, "Invalid password");
            return new ApiResponse<object>(false, "Invalid credentials", null);
        }

        // === DEVICE TRUST CHECK — Skip OTP on trusted devices ===
        if (!string.IsNullOrEmpty(request.DeviceId))
        {
            var trustedDevice = await _context.TrustedDevices
                .FirstOrDefaultAsync(d => d.UserId == superAdmin.Id 
                    && d.DeviceId == request.DeviceId 
                    && !d.IsDeleted
                    && d.TrustedUntil > DateTime.UtcNow);

            if (trustedDevice != null)
            {
                trustedDevice.LastUsedAt = DateTime.UtcNow;
                superAdmin.LastLoginAt = DateTime.UtcNow;
                superAdmin.FailedLoginAttempts = 0;
                superAdmin.LockedUntil = null;

                var session = CreateSession(null, superAdmin.Id, UserRole.SuperAdmin, ipAddress, userAgent);
                _context.UserSessions.Add(session);
                await _context.SaveChangesAsync();

                await LogLoginAttempt(null, superAdmin.Id, UserRole.SuperAdmin, ipAddress, userAgent, true, "Trusted device");
                _logger.LogInformation("Trusted device login for SuperAdmin {Code}", request.Code);

                var token = GenerateJwtToken(null, superAdmin.Id, UserRole.SuperAdmin, superAdmin.FullName, superAdmin.Code);
                return new ApiResponse<object>(true, "Login successful", new TokenResponseDto(
                    token, session.RefreshToken, session.ExpiresAt,
                    UserRole.SuperAdmin, superAdmin.FullName, superAdmin.Code, null, superAdmin.FullName
                ));
            }
        }

        // Generate OTP and send via SMS
        var (otp, otpError) = await GenerateAndSaveOtpAsync(request.PhoneNumber, request.Code, UserRole.SuperAdmin, reuseRecent: true);
        if (otpError != null)
            return new ApiResponse<object>(false, otpError, null);
        if (otp == null) // a code was sent less than a minute ago and is still valid
            return new ApiResponse<object>(true, "We sent you a code less than a minute ago. Enter that code.", new { requiresOtp = true, role = "SuperAdmin" });
        
        // Send OTP via Africa's Talking SMS
        var smsSent = await _smsService.SendOtpAsync(request.PhoneNumber, otp!);
        _logger.LogInformation("OTP {Status} via SMS for SuperAdmin: {Code}", smsSent ? "sent" : "FAILED", request.Code);
        _logger.LogDebug("OTP generated for {Phone}", request.PhoneNumber);

        return new ApiResponse<object>(true, smsSent ? "OTP sent to your phone via SMS" : "We couldn't send the SMS just now. Tap Resend in a minute, or contact your administrator if it keeps failing.", new
        {
            requiresOtp = true,
            role = "SuperAdmin",
            // devOtp removed for security
        });
    }

    private async Task<ApiResponse<object>> LoginOfficeUserAsync(UnifiedLoginDto request, string ipAddress, string? userAgent)
    {
        _logger.LogInformation("Processing as OFFICE USER login");

        var company = await _context.Companies
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.Code == request.Code && 
                                      c.WhatsAppNumber == request.PhoneNumber && 
                                      !c.IsDeleted);

        if (company == null)
        {
            _logger.LogWarning("Company not found: Code={Code}, Phone={Phone}", request.Code, request.PhoneNumber);
            await LogLoginAttempt(null, null, UserRole.OfficeUser, ipAddress, userAgent, false, "Company not found");
            return new ApiResponse<object>(false, "Invalid credentials", null);
        }

        _logger.LogInformation("Found Company: {Name}, Owner: {Owner}", company.Name, company.OwnerName);

        // Validate account status
        var validationResult = ValidateAccountStatus(company.IsActive, company.LockedUntil, company.PasswordHash, request.Code);
        if (validationResult != null) return validationResult;

        // Verify password
        if (!BCrypt.Net.BCrypt.Verify(request.Password, company.PasswordHash))
        {
            // A lock that has run out starts the count again. (It used to stay at 5, so the
            // first typo after waiting out a lock locked the account for another 30 minutes.)
            if (company.LockedUntil.HasValue) { company.LockedUntil = null; company.FailedLoginAttempts = 0; }
            company.FailedLoginAttempts++;
            if (company.FailedLoginAttempts >= 5)
                company.LockedUntil = DateTime.UtcNow.AddMinutes(30);
            await _context.SaveChangesAsync();
            
            _logger.LogWarning("Invalid password for Company {Code}", request.Code);
            await LogLoginAttempt(company.Id, null, UserRole.OfficeUser, ipAddress, userAgent, false, "Invalid password");
            return new ApiResponse<object>(false, "Invalid credentials", null);
        }

        // Subscription (checked only after the password, so it reveals nothing to a guesser)
        var subscriptionBlock = SubscriptionBlock(company);
        if (subscriptionBlock != null)
        {
            await LogLoginAttempt(company.Id, null, UserRole.OfficeUser, ipAddress, userAgent, false, "Subscription");
            return new ApiResponse<object>(false, subscriptionBlock, null);
        }

        // === DEVICE TRUST CHECK — Skip OTP on trusted devices ===
        if (!string.IsNullOrEmpty(request.DeviceId))
        {
            var trustedDevice = await _context.TrustedDevices
                .FirstOrDefaultAsync(d => d.UserId == company.Id 
                    && d.DeviceId == request.DeviceId 
                    && !d.IsDeleted
                    && d.TrustedUntil > DateTime.UtcNow);

            if (trustedDevice != null)
            {
                trustedDevice.LastUsedAt = DateTime.UtcNow;
                company.LastLoginAt = DateTime.UtcNow;
                company.FailedLoginAttempts = 0;
                company.LockedUntil = null;

                var session = CreateSession(company.Id, company.Id, UserRole.OfficeUser, ipAddress, userAgent);
                _context.UserSessions.Add(session);
                await _context.SaveChangesAsync();

                await LogLoginAttempt(company.Id, company.Id, UserRole.OfficeUser, ipAddress, userAgent, true, "Trusted device");
                _logger.LogInformation("Trusted device login for OfficeUser {Code}", request.Code);

                var token = GenerateJwtToken(company.Id, company.Id, UserRole.OfficeUser, company.Name, company.Code);
                return new ApiResponse<object>(true, "Login successful", new TokenResponseDto(
                    token, session.RefreshToken, session.ExpiresAt,
                    UserRole.OfficeUser, company.Name, company.Code, company.Id, company.OwnerName
                ));
            }
        }

        // Generate OTP and send via SMS
        var (otp, otpError) = await GenerateAndSaveOtpAsync(request.PhoneNumber, request.Code, UserRole.OfficeUser, reuseRecent: true);
        if (otpError != null)
            return new ApiResponse<object>(false, otpError, null);
        if (otp == null) // a code was sent less than a minute ago and is still valid
            return new ApiResponse<object>(true, "We sent you a code less than a minute ago. Enter that code.", new { requiresOtp = true, role = "OfficeUser" });
        
        // Send OTP via Africa's Talking SMS
        var smsSent = await _smsService.SendOtpAsync(request.PhoneNumber, otp!);
        _logger.LogInformation("OTP {Status} via SMS for OfficeUser: {Code}", smsSent ? "sent" : "FAILED", request.Code);
        _logger.LogDebug("OTP generated for {Phone}", request.PhoneNumber);

        return new ApiResponse<object>(true, smsSent ? "OTP sent to your phone via SMS" : "We couldn't send the SMS just now. Tap Resend in a minute, or contact your administrator if it keeps failing.", new
        {
            requiresOtp = true,
            role = "OfficeUser",
            // devOtp removed for security
        });
    }

    private async Task<ApiResponse<object>> LoginClientAsync(UnifiedLoginDto request, string ipAddress, string? userAgent)
    {
        _logger.LogInformation("Processing as CLIENT login (NO OTP)");

        var client = await _context.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Code == request.Code && 
                                      u.WhatsAppNumber == request.PhoneNumber && 
                                      u.Role == UserRole.Client &&
                                      u.ClientType == ClientType.Permanent &&
                                      !u.IsDeleted);

        if (client == null)
        {
            _logger.LogWarning("Client not found: Code={Code}, Phone={Phone}", request.Code, request.PhoneNumber);
            await LogLoginAttempt(null, null, UserRole.Client, ipAddress, userAgent, false, "Client not found");
            return new ApiResponse<object>(false, "Invalid credentials", null);
        }

        _logger.LogInformation("Found Client: {Name}", client.FullName);

        // Validate account status
        var validationResult = ValidateAccountStatus(client.IsActive, client.LockedUntil, client.PasswordHash, request.Code);
        if (validationResult != null) return validationResult;

        // Verify password
        if (!BCrypt.Net.BCrypt.Verify(request.Password, client.PasswordHash))
        {
            // A lock that has run out starts the count again. (It used to stay at 5, so the
            // first typo after waiting out a lock locked the account for another 30 minutes.)
            if (client.LockedUntil.HasValue) { client.LockedUntil = null; client.FailedLoginAttempts = 0; }
            client.FailedLoginAttempts++;
            if (client.FailedLoginAttempts >= 5)
                client.LockedUntil = DateTime.UtcNow.AddMinutes(30);
            await _context.SaveChangesAsync();
            
            _logger.LogWarning("Invalid password for Client {Code}", request.Code);
            await LogLoginAttempt(client.CompanyId, client.Id, UserRole.Client, ipAddress, userAgent, false, "Invalid password");
            return new ApiResponse<object>(false, "Invalid credentials", null);
        }

        // A client of a suspended / lapsed bureau can't sign in either.
        var clientCompany = await _context.Companies.FirstOrDefaultAsync(c => c.Id == client.CompanyId);
        if (clientCompany == null || !clientCompany.IsActive || SubscriptionBlock(clientCompany) != null)
            return new ApiResponse<object>(false, "Your bureau's account is not active. Please contact your bureau.", null);

        // CLIENT: No OTP - Issue tokens directly
        client.FailedLoginAttempts = 0;
        client.LockedUntil = null;
        client.LastLoginAt = DateTime.UtcNow;

        var session = CreateSession(client.CompanyId, client.Id, UserRole.Client, ipAddress, userAgent);
        _context.UserSessions.Add(session);
        await _context.SaveChangesAsync();

        await LogLoginAttempt(client.CompanyId, client.Id, UserRole.Client, ipAddress, userAgent, true, null);

        var token = GenerateJwtToken(client.CompanyId, client.Id, UserRole.Client, client.FullName, client.Code);

        _logger.LogInformation("========================================");
        _logger.LogInformation("CLIENT LOGIN SUCCESSFUL (NO OTP)");
        _logger.LogInformation("Client: {Name} ({Code})", client.FullName, client.Code);
        _logger.LogInformation("========================================");

        // CLIENT: OwnerName is null (not applicable)
        return new ApiResponse<object>(true, "Login successful", new TokenResponseDto(
            token,
            session.RefreshToken,
            session.ExpiresAt,
            UserRole.Client,
            client.FullName,
            client.Code,
            client.CompanyId,
            null  // OwnerName - not applicable for clients
        ));
    }

    /// <summary>
    /// Null when the bureau may use Sarif; otherwise the reason it can't.
    /// Suspended/cancelled: blocked. Trial or expired: 7 days' grace after the
    /// expiry date, then blocked. Applied wherever a token is issued.
    /// </summary>
    public static string? SubscriptionBlock(Company company)
    {
        if (company.SubscriptionStatus == SubscriptionStatus.Suspended)
            return "This bureau's Sarif subscription is suspended. Contact Sarif support.";
        if (company.SubscriptionStatus == SubscriptionStatus.Cancelled)
            return "This bureau's Sarif subscription was cancelled. Contact Sarif support.";
        var graceEnds = company.SubscriptionExpiresAt?.AddDays(SubscriptionGraceDays);
        var expiredPastGrace = graceEnds.HasValue && graceEnds.Value < DateTime.UtcNow;
        if (expiredPastGrace || (company.SubscriptionStatus == SubscriptionStatus.Expired && !company.SubscriptionExpiresAt.HasValue))
            return "This bureau's Sarif subscription has expired. Renew it to sign in again.";
        return null;
    }
    private const int SubscriptionGraceDays = 7;

    private ApiResponse<object>? ValidateAccountStatus(bool isActive, DateTime? lockedUntil, string? passwordHash, string code)
    {
        if (!isActive)
        {
            _logger.LogWarning("Account {Code} is inactive", code);
            return new ApiResponse<object>(false, "Account is inactive", null);
        }

        if (lockedUntil.HasValue && lockedUntil > DateTime.UtcNow)
        {
            _logger.LogWarning("Account {Code} is locked until {Until}", code, lockedUntil);
            return new ApiResponse<object>(false, $"Account is locked. Try again after {BureauClock.ToLocal(lockedUntil.Value):HH:mm}", null);
        }

        if (string.IsNullOrEmpty(passwordHash))
        {
            _logger.LogError("Account {Code} has no password configured", code);
            return new ApiResponse<object>(false, "Account not configured. Contact support.", null);
        }

        return null;
    }

    /// <summary>
    /// Verify OTP - Step 2 for SuperAdmin/OfficeUser
    /// </summary>
    public async Task<ApiResponse<TokenResponseDto>> VerifyOtpAsync(OtpVerifyWithCodeDto request, string ipAddress, string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(request.Code))
            return new ApiResponse<TokenResponseDto>(false, "User code is required", null);

        request = request with { Code = request.Code.Trim().ToUpperInvariant(), PhoneNumber = request.PhoneNumber?.Trim()!, Otp = request.Otp?.Trim()! };
        if (string.IsNullOrWhiteSpace(request.Otp) || request.Otp.Length != 6)
            return new ApiResponse<TokenResponseDto>(false, "OTP must be 6 digits", null);

        var phoneCheck = ValidationHelper.ValidatePhone(request.PhoneNumber, "Phone number");
        if (!phoneCheck.IsValid)
            return new ApiResponse<TokenResponseDto>(false, phoneCheck.Error!, null);

        _logger.LogInformation("OTP verification attempt for user: {Code}", request.Code);

        // Latest live code for this user — looked up WITHOUT the submitted
        // digits, so wrong guesses can be counted against it.
        var otp = await _context.OtpCodes
            .Where(o => o.PhoneNumber == request.PhoneNumber &&
                       o.UserCode == request.Code &&
                       !o.IsUsed &&
                       o.ExpiresAt > DateTime.UtcNow)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync();

        if (otp == null)
        {
            _logger.LogWarning("No active OTP for {Code}", request.Code);
            return new ApiResponse<TokenResponseDto>(false, "This code has expired or was replaced. Request a new code.", null);
        }

        // Count this attempt atomically in the database, so parallel requests
        // can't sneak past the limit with a stale count.
        var counted = await _context.OtpCodes
            .Where(o => o.Id == otp.Id && !o.IsUsed && o.AttemptCount < OtpMaxAttempts)
            .ExecuteUpdateAsync(u => u.SetProperty(o => o.AttemptCount, o => o.AttemptCount + 1));

        if (counted == 0)
        {
            _logger.LogWarning("OTP attempt limit reached for {Code}", request.Code);
            return new ApiResponse<TokenResponseDto>(false, "Too many incorrect codes. Request a new code.", null);
        }

        var attemptsUsed = otp.AttemptCount + 1;
        // Codes are stored hashed (phone-salted SHA-256); compare hashes in constant time.
        var matches = CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(otp.Code), Encoding.UTF8.GetBytes(HashOtp(otp.PhoneNumber, request.Otp)));

        if (!matches)
        {
            var remaining = OtpMaxAttempts - attemptsUsed;
            if (remaining <= 0)
            {
                await _context.OtpCodes.Where(o => o.Id == otp.Id)
                    .ExecuteUpdateAsync(u => u.SetProperty(o => o.IsUsed, true));
                _logger.LogWarning("OTP locked after {Max} wrong attempts for {Code}", OtpMaxAttempts, request.Code);
                return new ApiResponse<TokenResponseDto>(false, "Too many incorrect codes. Request a new code.", null);
            }
            _logger.LogWarning("Wrong OTP for {Code} ({Remaining} attempts left)", request.Code, remaining);
            return new ApiResponse<TokenResponseDto>(false,
                $"Incorrect code. {remaining} {(remaining == 1 ? "attempt" : "attempts")} left.", null);
        }

        // Consume the code atomically — a second parallel request with the
        // same correct code gets refused instead of a second session.
        var consumed = await _context.OtpCodes
            .Where(o => o.Id == otp.Id && !o.IsUsed)
            .ExecuteUpdateAsync(u => u.SetProperty(o => o.IsUsed, true));
        if (consumed == 0)
            return new ApiResponse<TokenResponseDto>(false, "This code has already been used. Request a new code.", null);

        otp.IsUsed = true;

        string name, code;
        string? ownerName = null;  // NEW: For personalized greeting
        Guid? companyId = null;
        Guid? userId = null;

        if (otp.Role == UserRole.SuperAdmin)
        {
            // Still active: an admin switched off after the password step must not get in on the code.
            var superAdmin = await _context.Users.FirstOrDefaultAsync(u => u.Code == request.Code && u.Role == UserRole.SuperAdmin && u.IsActive);
            if (superAdmin == null)
                return new ApiResponse<TokenResponseDto>(false, "User not found", null);

            userId = superAdmin.Id;
            name = superAdmin.FullName;
            code = superAdmin.Code;
            ownerName = superAdmin.FullName;  // SuperAdmin: Use their own name
            superAdmin.LastLoginAt = DateTime.UtcNow;
            superAdmin.FailedLoginAttempts = 0;
            superAdmin.LockedUntil = null;
        }
        else // OfficeUser
        {
            var company = await _context.Companies.FirstOrDefaultAsync(c => c.Code == request.Code);
            if (company == null)
                return new ApiResponse<TokenResponseDto>(false, "Company not found", null);
            if (!company.IsActive)
                return new ApiResponse<TokenResponseDto>(false, "Company no longer active", null);
            var otpBlock = SubscriptionBlock(company);
            if (otpBlock != null)
                return new ApiResponse<TokenResponseDto>(false, otpBlock, null);

            companyId = company.Id;
            userId = company.Id; // OfficeUser: UserId = CompanyId (no separate user row)
            name = company.Name;
            code = company.Code;
            ownerName = company.OwnerName;  // OFFICE USER: Use company owner name!
            company.LastLoginAt = DateTime.UtcNow;
            company.FailedLoginAttempts = 0;
            company.LockedUntil = null;
        }

        var session = CreateSession(companyId, userId, otp.Role, ipAddress, userAgent);
        _context.UserSessions.Add(session);
        await _context.SaveChangesAsync();

        await LogLoginAttempt(companyId, userId, otp.Role, ipAddress, userAgent, true, null);

        // === SAVE TRUSTED DEVICE — Skip OTP next time from this device ===
        if (!string.IsNullOrEmpty(request.DeviceId) && userId is { } trustedUserId)
        {
            var existingTrust = await _context.TrustedDevices
                .FirstOrDefaultAsync(d => d.UserId == trustedUserId && d.DeviceId == request.DeviceId);
            
            if (existingTrust != null)
            {
                existingTrust.LastUsedAt = DateTime.UtcNow;
                existingTrust.TrustedUntil = DateTime.UtcNow.AddDays(90);
                existingTrust.DeviceName = request.DeviceName ?? existingTrust.DeviceName;
            }
            else
            {
                _context.TrustedDevices.Add(new TrustedDevice
                {
                    UserId = userId.Value,
                    DeviceId = request.DeviceId,
                    Platform = request.DeviceName?.Contains("android", StringComparison.OrdinalIgnoreCase) == true ? "android"
                             : request.DeviceName?.Contains("ios", StringComparison.OrdinalIgnoreCase) == true ? "ios" : "web",
                    DeviceName = request.DeviceName ?? "Unknown device",
                    TrustedUntil = DateTime.UtcNow.AddDays(90),
                });
            }
            await _context.SaveChangesAsync();
            _logger.LogInformation("Device trusted for {Name}: {DeviceId}", name, request.DeviceId);
        }

        var token = GenerateJwtToken(companyId, userId, otp.Role, name, code);

        _logger.LogInformation("========================================");
        _logger.LogInformation("LOGIN COMPLETE - TOKEN ISSUED");
        _logger.LogInformation("User: {Name} ({Code}), Role: {Role}, Owner: {Owner}", name, code, otp.Role, ownerName);
        _logger.LogInformation("========================================");

        return new ApiResponse<TokenResponseDto>(true, "Login successful", new TokenResponseDto(
            token, 
            session.RefreshToken, 
            session.ExpiresAt, 
            otp.Role, 
            name, 
            code, 
            companyId,
            ownerName  // NEW: Include owner name for greeting
        ));
    }

    public async Task<ApiResponse<TokenResponseDto>> RefreshTokenAsync(RefreshTokenDto request, string ipAddress)
    {
        var tokenHash = HashToken(request.RefreshToken);
        var session = await _context.UserSessions.FirstOrDefaultAsync(s =>
            s.RefreshTokenHash == tokenHash && !s.IsRevoked && s.ExpiresAt > DateTime.UtcNow);

        if (session == null)
            return new ApiResponse<TokenResponseDto>(false, "Invalid or expired refresh token", null);

        string name, code;
        string? ownerName = null;  // NEW
        Guid? companyId = session.CompanyId;

        if (session.UserRole == UserRole.SuperAdmin && session.UserId.HasValue)
        {
            var user = await _context.Users.IgnoreQueryFilters()
                .FirstOrDefaultAsync(u => u.Id == session.UserId && !u.IsDeleted && u.IsActive);
            if (user == null)
                return new ApiResponse<TokenResponseDto>(false, "Account no longer active", null);
            name = user.FullName;
            code = user.Code;
            ownerName = user.FullName;
        }
        else if (session.UserRole == UserRole.OfficeUser && session.CompanyId.HasValue)
        {
            var company = await _context.Companies.IgnoreQueryFilters()
                .FirstOrDefaultAsync(c => c.Id == session.CompanyId && !c.IsDeleted && c.IsActive);
            if (company == null)
                return new ApiResponse<TokenResponseDto>(false, "Company no longer active", null);
            if (SubscriptionBlock(company) is string refreshBlock)
                return new ApiResponse<TokenResponseDto>(false, refreshBlock, null);
            name = company.Name;
            code = company.Code;
            ownerName = company.OwnerName;
        }
        else // Client
        {
            var client = await _context.Users.IgnoreQueryFilters()
                .FirstOrDefaultAsync(u => u.Id == session.UserId && !u.IsDeleted && u.IsActive);
            if (client == null)
                return new ApiResponse<TokenResponseDto>(false, "Account no longer active", null);
            var clientCompany = await _context.Companies.IgnoreQueryFilters()
                .FirstOrDefaultAsync(c => c.Id == client.CompanyId && !c.IsDeleted && c.IsActive);
            if (clientCompany == null || SubscriptionBlock(clientCompany) != null)
                return new ApiResponse<TokenResponseDto>(false, "Your bureau's account is not active", null);
            name = client.FullName;
            code = client.Code;
            companyId = client.CompanyId;
            ownerName = null;
        }

        // Single use, taken in one statement: the same token sent twice at once used to give
        // two sessions (both requests read "not revoked yet").
        if (_context.Database.IsRelational())
        {
            var taken = await _context.UserSessions.Where(s => s.Id == session.Id && !s.IsRevoked)
                .ExecuteUpdateAsync(u => u.SetProperty(s => s.IsRevoked, true));
            if (taken == 0)
                return new ApiResponse<TokenResponseDto>(false, "Invalid or expired refresh token", null);
        }
        session.IsRevoked = true;
        var newSession = CreateSession(session.CompanyId, session.UserId, session.UserRole, ipAddress, session.UserAgent,
            session.ClientIdentityId);
        _context.UserSessions.Add(newSession);
        await _context.SaveChangesAsync();

        var token = GenerateJwtToken(session.CompanyId, session.UserId, session.UserRole, name, code, session.ClientIdentityId);
        
        return new ApiResponse<TokenResponseDto>(true, "Token refreshed", new TokenResponseDto(
            token, 
            newSession.RefreshToken, 
            newSession.ExpiresAt, 
            session.UserRole, 
            name, 
            code, 
            companyId,
            ownerName  // NEW: Include owner name
        ));
    }

    public async Task<ApiResponse<bool>> LogoutAsync(Guid userId, UserRole? role = null, string? refreshToken = null)
    {
        // Only THIS person's sessions. It used to match "UserId == id OR CompanyId == id":
        // an office user's id is the bureau's id, and every client session carries its
        // bureau's id — so one office logout signed out all of that bureau's clients.
        var q = _context.UserSessions.Where(s => !s.IsRevoked);
        q = role switch
        {
            UserRole.OfficeUser => q.Where(s => s.UserRole == UserRole.OfficeUser && s.CompanyId == userId),
            UserRole r => q.Where(s => s.UserRole == r && s.UserId == userId),
            null => q.Where(s => s.UserId == userId && s.UserRole != UserRole.OfficeUser
                              || s.UserRole == UserRole.OfficeUser && s.CompanyId == userId),
        };
        // With the device's refresh token, only THAT device signs out. The apps sign out by
        // themselves after a few idle minutes; ending every session of the bureau meant an idle
        // counter tablet logged the back office out mid-work. (Without a token: every session,
        // as before, for callers that don't send one.)
        if (!string.IsNullOrWhiteSpace(refreshToken))
        {
            var hash = HashToken(refreshToken);
            q = q.Where(s => s.RefreshTokenHash == hash);
        }
        var sessions = await q.ToListAsync();
        
        foreach (var session in sessions)
        {
            session.IsRevoked = true;
        }
        
        if (sessions.Any())
            await _context.SaveChangesAsync();
        foreach (var r in sessions.Select(x => x.UserRole).Distinct())
            SessionAliveCache.Invalidate(userId, r.ToString());
        if (role.HasValue) SessionAliveCache.Invalidate(userId, role.Value.ToString());

        return new ApiResponse<bool>(true, "Logged out successfully", true);
    }

    // ==================== HELPERS ====================

    // OTP rules. The web and mobile login screens describe these to users,
    // so keep their copy in sync if you change them.
    private const int OtpLifetimeMinutes = 5;
    private const int OtpMaxAttempts = 5;           // wrong guesses per code
    private const int OtpResendCooldownSeconds = 60; // between codes to one phone
    private const int OtpMaxPerHour = 10;            // codes per phone per hour

    /// <summary>
    /// Creates a new OTP for this phone, replacing any unused one. Refuses
    /// (returns an error message) if the phone asked for a code too recently
    /// or too often — this caps SMS spend and brute-force attempts.
    /// The caller is responsible for sending the SMS (exactly once).
    /// </summary>
    /// <remarks>
    /// With <paramref name="reuseRecent"/> (password sign-in), a second sign-in inside the
    /// cooldown returns (null, null) while the code sent moments ago is still valid: the
    /// caller then shows the code screen again without sending another SMS. Before, someone
    /// who went back and pressed "Sign in" again was stuck on "Please wait 55 seconds" with
    /// no way to type the code already on their phone.
    /// </remarks>
    private async Task<(string? Code, string? Error)> GenerateAndSaveOtpAsync(string phoneNumber, string userCode, UserRole role, bool reuseRecent = false)
    {
        var now = DateTime.UtcNow;
        var recent = await _context.OtpCodes
            .Where(o => o.PhoneNumber == phoneNumber && o.CreatedAt > now.AddHours(-1))
            .Select(o => o.CreatedAt)
            .ToListAsync();

        if (recent.Count > 0)
        {
            var waitSeconds = (int)Math.Ceiling(OtpResendCooldownSeconds - (now - recent.Max()).TotalSeconds);
            if (waitSeconds > 0)
            {
                if (reuseRecent && await _context.OtpCodes.AnyAsync(o =>
                        o.PhoneNumber == phoneNumber && o.UserCode == userCode && !o.IsUsed && o.ExpiresAt > now))
                    return (null, null);
                return (null, $"Please wait {waitSeconds} seconds before requesting a new code.");
            }

            if (recent.Count >= OtpMaxPerHour)
            {
                var waitMinutes = (int)Math.Ceiling((recent.Min().AddHours(1) - now).TotalMinutes);
                _logger.LogWarning("OTP hourly limit reached for {Code}", userCode);
                return (null, $"Too many codes requested. Try again in {Math.Max(waitMinutes, 1)} minutes.");
            }
        }

        var oldOtps = await _context.OtpCodes.Where(o => o.PhoneNumber == phoneNumber && o.UserCode == userCode && !o.IsUsed).ToListAsync();
        foreach (var o in oldOtps) o.IsUsed = true;

        // Cryptographically secure, full 100000–999999 range
        var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
        _context.OtpCodes.Add(new OtpCode
        {
            PhoneNumber = phoneNumber,
            UserCode = userCode,
            Code = HashOtp(phoneNumber, code), // never stored in plain text
            Role = role,
            ExpiresAt = now.AddMinutes(OtpLifetimeMinutes)
        });
        await _context.SaveChangesAsync();

        // NOTE: no SMS sent here. Previously this also called
        // _notificationService.SendOtpAsync, so every login sent two SMS.
        return (code, null);
    }

    private string GenerateJwtToken(Guid? companyId, Guid? userId, UserRole role, string name, string code,
        Guid? identityId = null, int? lifetimeMinutes = null)
    {
        // var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:SecretKey"]!));
        var jwtKey = Environment.GetEnvironmentVariable("JWT_SECRET_KEY") ?? _config["Jwt:SecretKey"]!;
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var claims = new List<Claim>
        {
            new(ClaimTypes.Role, role.ToString()),
            new(ClaimTypes.Name, name),
            new("role_enum", ((int)role).ToString()),
            new("code", code)
        };
        if (companyId.HasValue) claims.Add(new Claim("company_id", companyId.Value.ToString()));
        if (userId.HasValue) claims.Add(new Claim(ClaimTypes.NameIdentifier, userId.Value.ToString()));
        if (identityId.HasValue) claims.Add(new Claim(IdentityClaim, identityId.Value.ToString()));

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(lifetimeMinutes ?? int.Parse(_config["Jwt:ExpiryMinutes"] ?? "60")),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256)
        );
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private UserSession CreateSession(Guid? companyId, Guid? userId, UserRole role, string ipAddress, string? userAgent,
        Guid? identityId = null)
    {
        var refreshToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        // A new session: the "still signed in?" answer for this person changes now.
        var principal = role == UserRole.OfficeUser ? companyId : userId;
        if (principal.HasValue) SessionAliveCache.Invalidate(principal.Value, role.ToString());
        return new UserSession
        {
            CompanyId = companyId,
            UserId = userId,
            UserRole = role,
            RefreshToken = refreshToken,
            RefreshTokenHash = HashToken(refreshToken),
            ExpiresAt = DateTime.UtcNow.AddDays(7),
            IpAddress = ipAddress,
            UserAgent = userAgent,
            ClientIdentityId = identityId
        };
    }

    private string HashOtp(string phoneNumber, string code) => HashToken($"otp:{phoneNumber}:{code}");

    private string HashToken(string token)
    {
        using var sha = SHA256.Create();
        return Convert.ToBase64String(sha.ComputeHash(Encoding.UTF8.GetBytes(token)));
    }

    private async Task LogLoginAttempt(Guid? companyId, Guid? userId, UserRole role, string ipAddress, string? userAgent, bool success, string? failureReason)
    {
        _context.LoginHistories.Add(new LoginHistory
        {
            CompanyId = companyId,
            UserId = userId,
            UserRole = role,
            IpAddress = ipAddress,
            UserAgent = userAgent,
            IsSuccessful = success,
            FailureReason = failureReason,
            LoginAt = DateTime.UtcNow
        });
        await _context.SaveChangesAsync();
    }
}