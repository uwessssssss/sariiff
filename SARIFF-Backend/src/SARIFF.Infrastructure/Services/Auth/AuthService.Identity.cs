using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// One login, several bureaus. A client proves their phone once (SMS code), links
/// each bureau account they hold (that bureau's client code + password), then picks
/// a bureau and gets the SAME bureau-scoped client token as the classic login.
///
/// Rules (see the spec): money never crosses bureaus; no bureau learns about another;
/// a matching phone number alone never links anything (numbers get recycled).
/// </summary>
public partial class AuthService : IClientIdentityService
{
    public const string IdentityClaim = "identity_id";
    private const string IdentityOtpCode = "IDENTITY";      // OtpCodes.UserCode for phone-login codes
    private const int IdentityTokenMinutes = 15;            // the limited token only lists/links/picks
    private const int TrustedDeviceDays = 30;
    private const int IdentityMaxFailures = 5;
    private static readonly TimeSpan IdentityLockFor = TimeSpan.FromMinutes(15);

    /// <summary>"+254 712 345 678" → "+254712345678"; null when it isn't an international number.</summary>
    public static string? NormalizePhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return null;
        var p = new string(phone.Where(ch => char.IsDigit(ch) || ch == '+').ToArray());
        if (p.StartsWith("00")) p = "+" + p[2..];
        return System.Text.RegularExpressions.Regex.IsMatch(p, @"^\+\d{10,15}$") ? p : null;
    }

    private static string HashDevice(string deviceId)
    {
        using var sha = SHA256.Create();
        return Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes("device:" + deviceId)));
    }

    private Task<bool> AnyPortalClientWithPhoneAsync(string phone) =>
        _context.Users.AnyAsync(u => u.WhatsAppNumber == phone && u.Role == UserRole.Client
                                     && u.ClientType == ClientType.Permanent && !u.IsDeleted);

    // ==================== LOGIN ====================

    public async Task<ApiResponse<bool>> RequestCodeAsync(IdentityRequestCodeDto dto)
    {
        const string sameAnswer = "If this number can use Sarif, a code is on its way.";
        var phone = NormalizePhone(dto.Phone);
        if (phone == null)
            return new ApiResponse<bool>(false, "Enter your number in international form, e.g. +254712345678", false);

        var identity = await _context.ClientIdentities.FirstOrDefaultAsync(i => i.PhoneNumber == phone);
        if (identity?.LockedUntil > DateTime.UtcNow)
            return new ApiResponse<bool>(true, sameAnswer, true);

        // Only numbers that belong to a portal client get an SMS: random numbers cost
        // nothing and learn nothing (the answer is the same either way).
        if (identity == null && !await AnyPortalClientWithPhoneAsync(phone))
            return new ApiResponse<bool>(true, sameAnswer, true);

        var (code, error) = await GenerateAndSaveOtpAsync(phone, IdentityOtpCode, UserRole.ClientIdentity);
        if (error != null) return new ApiResponse<bool>(false, error, false);

        var sent = await _smsService.SendOtpAsync(phone, code!);
        if (!sent) _logger.LogWarning("Phone-login code not delivered to number ending {Last4}", phone[^4..]);
        return new ApiResponse<bool>(true, sameAnswer, true);
    }

    public async Task<ApiResponse<IdentityTokenDto>> VerifyCodeAsync(IdentityVerifyCodeDto dto, string ipAddress, string? userAgent)
    {
        var phone = NormalizePhone(dto.Phone);
        if (phone == null || string.IsNullOrWhiteSpace(dto.Code))
            return new ApiResponse<IdentityTokenDto>(false, "Enter your phone number and the code", null);

        var identity = await _context.ClientIdentities.FirstOrDefaultAsync(i => i.PhoneNumber == phone);
        if (identity?.LockedUntil > DateTime.UtcNow)
            return new ApiResponse<IdentityTokenDto>(false, "Too many wrong codes. Try again in 15 minutes.", null);

        var otp = await _context.OtpCodes
            .Where(o => o.PhoneNumber == phone && o.UserCode == IdentityOtpCode && !o.IsUsed && o.ExpiresAt > DateTime.UtcNow)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync();
        if (otp == null)
            return new ApiResponse<IdentityTokenDto>(false, "This code has expired or was replaced. Request a new code.", null);

        var withinLimit = await CountOtpAttemptAsync(otp);
        var matches = withinLimit && CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(otp.Code), Encoding.UTF8.GetBytes(HashOtp(phone, dto.Code.Trim())));

        if (!matches)
        {
            if (!withinLimit || otp.AttemptCount >= OtpMaxAttempts) otp.IsUsed = true;
            if (identity != null)
            {
                identity.FailedOtpAttempts++;
                if (identity.FailedOtpAttempts >= IdentityMaxFailures)
                {
                    identity.LockedUntil = DateTime.UtcNow + IdentityLockFor;
                    identity.FailedOtpAttempts = 0;
                }
            }
            await _context.SaveChangesAsync();
            await LogLoginAttempt(null, identity?.Id, UserRole.ClientIdentity, ipAddress, userAgent, false, "Wrong phone-login code");
            var left = OtpMaxAttempts - otp.AttemptCount;
            return new ApiResponse<IdentityTokenDto>(false,
                left > 0 ? $"Incorrect code. {left} tr{(left == 1 ? "y" : "ies")} left." : "Too many incorrect codes. Request a new code.", null);
        }

        otp.IsUsed = true;
        if (identity == null)
        {
            identity = new ClientIdentity { PhoneNumber = phone };
            _context.ClientIdentities.Add(identity);
        }
        identity.PhoneVerifiedAt ??= DateTime.UtcNow;
        identity.LastLoginAt = DateTime.UtcNow;
        identity.FailedOtpAttempts = 0;
        identity.LockedUntil = null;

        var trusted = false;
        if (!string.IsNullOrWhiteSpace(dto.DeviceId) && dto.DeviceId.Length >= 16)
        {
            var hash = HashDevice(dto.DeviceId);
            var device = await _context.ClientIdentityDevices.FirstOrDefaultAsync(d => d.ClientIdentityId == identity.Id && d.DeviceIdHash == hash);
            if (device == null)
                _context.ClientIdentityDevices.Add(device = new ClientIdentityDevice { ClientIdentityId = identity.Id, DeviceIdHash = hash });
            device.DeviceName = dto.DeviceName?.Trim() is { Length: > 0 } n ? n[..Math.Min(n.Length, 100)] : device.DeviceName;
            device.TrustedUntil = DateTime.UtcNow.AddDays(TrustedDeviceDays);
            device.LastUsedAt = DateTime.UtcNow;
            trusted = true;
        }

        await _context.SaveChangesAsync();
        await LogLoginAttempt(null, identity.Id, UserRole.ClientIdentity, ipAddress, userAgent, true, null);
        return new ApiResponse<IdentityTokenDto>(true, "Phone verified", await IdentityTokenAsync(identity, trusted));
    }

    /// <summary>
    /// Counts one guess against a code; false when the code has no guesses left. The count is
    /// one database statement, so guesses sent in parallel can't all read "0 so far" and slip
    /// past the limit (before Nov 2026 twenty parallel guesses counted as one or two).
    /// </summary>
    private async Task<bool> CountOtpAttemptAsync(OtpCode otp)
    {
        if (!_context.Database.IsRelational())   // the in-memory test database has no UPDATE ... WHERE
        {
            if (otp.AttemptCount >= OtpMaxAttempts) return false;
            otp.AttemptCount++;
            return true;
        }
        var counted = await _context.OtpCodes
            .Where(o => o.Id == otp.Id && !o.IsUsed && o.AttemptCount < OtpMaxAttempts)
            .ExecuteUpdateAsync(u => u.SetProperty(o => o.AttemptCount, o => o.AttemptCount + 1));
        await _context.Entry(otp).ReloadAsync();
        return counted > 0;
    }

    public async Task<ApiResponse<IdentityTokenDto>> DeviceLoginAsync(IdentityDeviceLoginDto dto, string ipAddress, string? userAgent)
    {
        const string ask = "Please verify your phone with a code.";
        var phone = NormalizePhone(dto.Phone);
        if (phone == null || string.IsNullOrWhiteSpace(dto.DeviceId))
            return new ApiResponse<IdentityTokenDto>(false, ask, null);

        var identity = await _context.ClientIdentities.FirstOrDefaultAsync(i => i.PhoneNumber == phone);
        if (identity == null || identity.LockedUntil > DateTime.UtcNow)
            return new ApiResponse<IdentityTokenDto>(false, ask, null);

        var hash = HashDevice(dto.DeviceId);
        var device = await _context.ClientIdentityDevices.FirstOrDefaultAsync(d =>
            d.ClientIdentityId == identity.Id && d.DeviceIdHash == hash && d.TrustedUntil > DateTime.UtcNow);
        if (device == null)
            return new ApiResponse<IdentityTokenDto>(false, ask, null);

        device.LastUsedAt = DateTime.UtcNow;
        identity.LastLoginAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        await LogLoginAttempt(null, identity.Id, UserRole.ClientIdentity, ipAddress, userAgent, true, "trusted device");
        return new ApiResponse<IdentityTokenDto>(true, "Signed in", await IdentityTokenAsync(identity, true));
    }

    private async Task<IdentityTokenDto> IdentityTokenAsync(ClientIdentity identity, bool trusted)
    {
        var token = GenerateJwtToken(null, null, UserRole.ClientIdentity, "Sarif client", identity.PhoneNumber,
            identity.Id, IdentityTokenMinutes);
        return new IdentityTokenDto(token, DateTime.UtcNow.AddMinutes(IdentityTokenMinutes), identity.PhoneNumber, trusted,
            await BureausOfAsync(identity.Id));
    }

    // ==================== BUREAUS ====================

    private Task<string?> IdentityPhoneAsync(Guid identityId) =>
        _context.ClientIdentities.Where(i => i.Id == identityId).Select(i => i.PhoneNumber).FirstOrDefaultAsync();

    private async Task<List<IdentityBureauDto>> BureausOfAsync(Guid identityId)
    {
        // Only accounts still on the phone that was verified: if a bureau account's number
        // changed, it drops out here even if the link wasn't cut (numbers get recycled).
        var phone = await IdentityPhoneAsync(identityId);
        if (phone == null) return new List<IdentityBureauDto>();
        var rows = await (from u in _context.Users.AsNoTracking()
                          join c in _context.Companies.AsNoTracking() on u.CompanyId equals c.Id
                          where u.ClientIdentityId == identityId && u.WhatsAppNumber == phone
                                && u.Role == UserRole.Client && !u.IsDeleted
                          orderby c.Name
                          select new { c.Id, c.Name, c.LogoUrl, u.Code, u.FullName, c.BaseCurrency })
                         .ToListAsync();
        return rows.Select(r => new IdentityBureauDto(r.Id, r.Name, r.LogoUrl, r.Code, r.FullName, r.BaseCurrency)).ToList();
    }

    public async Task<ApiResponse<List<IdentityBureauDto>>> GetBureausAsync(Guid identityId) =>
        new(true, "Bureaus", await BureausOfAsync(identityId));

    public async Task<ApiResponse<IdentityBureauDto>> LinkAsync(Guid identityId, IdentityLinkDto dto, string ipAddress, string? userAgent)
    {
        const string invalid = "That client code and password don't match a Sarif account on this phone number.";
        var identity = await _context.ClientIdentities.FirstOrDefaultAsync(i => i.Id == identityId);
        if (identity == null) return new ApiResponse<IdentityBureauDto>(false, "Please sign in again", null);
        if (string.IsNullOrWhiteSpace(dto.ClientCode) || string.IsNullOrEmpty(dto.Password))
            return new ApiResponse<IdentityBureauDto>(false, "Enter the client code and password from that bureau", null);

        // The bureau account must be on THIS phone. A matching phone alone never links:
        // the code + password prove the account, the SMS code already proved the phone.
        var client = await _context.Users.FirstOrDefaultAsync(u =>
            u.Code == dto.ClientCode.Trim().ToUpperInvariant() && u.WhatsAppNumber == identity.PhoneNumber &&
            u.Role == UserRole.Client && u.ClientType == ClientType.Permanent && !u.IsDeleted);
        if (client == null)
        {
            await LogLoginAttempt(null, identity.Id, UserRole.ClientIdentity, ipAddress, userAgent, false, "Link: no account");
            return new ApiResponse<IdentityBureauDto>(false, invalid, null);
        }
        if (client.LockedUntil > DateTime.UtcNow)
            return new ApiResponse<IdentityBureauDto>(false, "This account is locked after wrong passwords. Try again later.", null);
        if (string.IsNullOrEmpty(client.PasswordHash) || !BCrypt.Net.BCrypt.Verify(dto.Password, client.PasswordHash))
        {
            // A lock that has run out starts the count again (as on the password sign-in).
            if (client.LockedUntil.HasValue) { client.LockedUntil = null; client.FailedLoginAttempts = 0; }
            client.FailedLoginAttempts++;
            if (client.FailedLoginAttempts >= 5) client.LockedUntil = DateTime.UtcNow.AddMinutes(30);
            await _context.SaveChangesAsync();
            await LogLoginAttempt(client.CompanyId, client.Id, UserRole.Client, ipAddress, userAgent, false, "Link: wrong password");
            return new ApiResponse<IdentityBureauDto>(false, invalid, null);
        }

        if (client.ClientIdentityId == identity.Id)
            return new ApiResponse<IdentityBureauDto>(true, "Already linked", (await BureausOfAsync(identity.Id)).First(b => b.CompanyId == client.CompanyId));
        if (client.ClientIdentityId.HasValue)
            return new ApiResponse<IdentityBureauDto>(false, "This account is already linked to another phone login. Ask the bureau to unlink it first.", null);
        if (await _context.Users.AnyAsync(u => u.ClientIdentityId == identity.Id && u.CompanyId == client.CompanyId && !u.IsDeleted))
            return new ApiResponse<IdentityBureauDto>(false, "You already have an account at this bureau linked.", null);

        client.ClientIdentityId = identity.Id;
        client.IdentityLinkedAt = DateTime.UtcNow;
        client.FailedLoginAttempts = 0;
        client.LockedUntil = null;
        await _context.SaveChangesAsync();
        _logger.LogInformation("Client {Code} linked to a phone login", client.Code);

        var bureau = (await BureausOfAsync(identity.Id)).First(b => b.CompanyId == client.CompanyId);
        return new ApiResponse<IdentityBureauDto>(true, $"{bureau.CompanyName} linked", bureau);
    }

    public async Task<ApiResponse<TokenResponseDto>> SelectAsync(Guid identityId, Guid companyId, string ipAddress, string? userAgent)
    {
        // Re-checked on EVERY pick and switch: the bureau stays in control (suspend, delete,
        // unlink), and the account must still be on the phone that was verified.
        var phone = await IdentityPhoneAsync(identityId);
        var client = phone == null ? null : await _context.Users.FirstOrDefaultAsync(u =>
            u.ClientIdentityId == identityId && u.CompanyId == companyId && u.WhatsAppNumber == phone &&
            u.Role == UserRole.Client && u.ClientType == ClientType.Permanent && !u.IsDeleted);
        if (client == null)
            return new ApiResponse<TokenResponseDto>(false, "That bureau isn't linked to your phone login", null);
        if (!client.IsActive)
            return new ApiResponse<TokenResponseDto>(false, "Your account at this bureau is not active. Please contact the bureau.", null);

        var company = await _context.Companies.FirstOrDefaultAsync(c => c.Id == companyId);
        if (company == null || !company.IsActive || SubscriptionBlock(company) != null)
            return new ApiResponse<TokenResponseDto>(false, "Your bureau's account is not active. Please contact your bureau.", null);

        client.LastLoginAt = DateTime.UtcNow;
        var session = CreateSession(client.CompanyId, client.Id, UserRole.Client, ipAddress, userAgent, identityId);
        _context.UserSessions.Add(session);
        await _context.SaveChangesAsync();
        await LogLoginAttempt(client.CompanyId, client.Id, UserRole.Client, ipAddress, userAgent, true, "phone login");

        var token = GenerateJwtToken(client.CompanyId, client.Id, UserRole.Client, client.FullName, client.Code, identityId);
        return new ApiResponse<TokenResponseDto>(true, "Signed in", new TokenResponseDto(
            token, session.RefreshToken, session.ExpiresAt, UserRole.Client, client.FullName, client.Code, client.CompanyId, null));
    }

    public async Task<ApiResponse<bool>> UnlinkAsync(Guid identityId, Guid companyId)
    {
        var client = await _context.Users.FirstOrDefaultAsync(u => u.ClientIdentityId == identityId && u.CompanyId == companyId);
        if (client == null) return new ApiResponse<bool>(false, "That bureau isn't linked", false);
        await CutLinkAsync(client);
        return new ApiResponse<bool>(true, "Bureau removed from your phone login", true);
    }

    public async Task<ApiResponse<bool>> OfficeUnlinkAsync(Guid companyId, Guid clientId)
    {
        var client = await _context.Users.FirstOrDefaultAsync(u => u.Id == clientId && u.CompanyId == companyId && u.Role == UserRole.Client);
        if (client == null) return new ApiResponse<bool>(false, "Client not found", false);
        if (client.ClientIdentityId == null) return new ApiResponse<bool>(true, "Not linked", true);
        await CutLinkAsync(client);
        return new ApiResponse<bool>(true, "Phone login unlinked for this client", true);
    }

    /// <summary>Unlink one bureau account and end its phone-login sessions. Balances are untouched.</summary>
    private async Task CutLinkAsync(User client)
    {
        client.ClientIdentityId = null;
        client.IdentityLinkedAt = null;
        var sessions = await _context.UserSessions
            .Where(x => x.UserId == client.Id && x.ClientIdentityId != null && !x.IsRevoked).ToListAsync();
        foreach (var session in sessions) session.IsRevoked = true;
        await _context.SaveChangesAsync();
    }

    public async Task<ApiResponse<bool>> SignOutEverywhereAsync(Guid identityId)
    {
        _context.ClientIdentityDevices.RemoveRange(await _context.ClientIdentityDevices.Where(d => d.ClientIdentityId == identityId).ToListAsync());
        foreach (var session in await _context.UserSessions.Where(x => x.ClientIdentityId == identityId && !x.IsRevoked).ToListAsync())
            session.IsRevoked = true;
        await _context.SaveChangesAsync();
        return new ApiResponse<bool>(true, "Signed out on every device", true);
    }

    public async Task ForgetDevicesForClientAsync(Guid clientId)
    {
        var identityId = await _context.Users.Where(u => u.Id == clientId).Select(u => u.ClientIdentityId).FirstOrDefaultAsync();
        if (identityId == null) return;
        _context.ClientIdentityDevices.RemoveRange(await _context.ClientIdentityDevices.Where(d => d.ClientIdentityId == identityId).ToListAsync());
        await _context.SaveChangesAsync();
    }
}
