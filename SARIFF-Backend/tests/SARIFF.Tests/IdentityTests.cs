using System.IdentityModel.Tokens.Jwt;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Primitives;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>Only the four Jwt keys AuthService reads.</summary>
internal sealed class FakeConfig : IConfiguration
{
    private readonly Dictionary<string, string?> _v = new()
    {
        ["Jwt:SecretKey"] = "test-key-test-key-test-key-test-key-0123456789",
        ["Jwt:Issuer"] = "SARIFF", ["Jwt:Audience"] = "SARIFF-Users", ["Jwt:ExpiryMinutes"] = "60",
    };
    public string? this[string key] { get => _v.GetValueOrDefault(key); set => _v[key] = value; }
    public IEnumerable<IConfigurationSection> GetChildren() => Enumerable.Empty<IConfigurationSection>();
    public IChangeToken GetReloadToken() => throw new NotSupportedException();
    public IConfigurationSection GetSection(string key) => throw new NotSupportedException();
}

/// <summary>Captures the last code "sent", so the test can type it in.</summary>
internal sealed class CapturingSms : ISmsService
{
    public string? LastCode;
    public int Sent;
    public Task<bool> SendOtpAsync(string phoneNumber, string otp) { LastCode = otp; Sent++; return Task.FromResult(true); }
    public Task<bool> SendSmsAsync(string phoneNumber, string message) => Task.FromResult(true);
}

/// <summary>One login, several bureaus: the rules from the spec.</summary>
public class IdentityTests
{
    private const string Phone = "+254712000111";

    private sealed record World(AppDbContext Db, AuthService Auth, CapturingSms Sms, Company A, Company B, User AtA, User AtB);

    private static async Task<World> MakeAsync()
    {
        var db = TestDb.InMemory();
        var a = new Company { Name = "Amana Forex", Code = "AFB-2026-0001", BaseCurrency = Currency.KES, IsActive = true };
        var b = new Company { Name = "Kampala Road Bureau", Code = "KRB-2026-0001", BaseCurrency = Currency.UGX, IsActive = true };
        User Client(Company c, string code) => new()
        {
            CompanyId = c.Id, Role = UserRole.Client, ClientType = ClientType.Permanent, IsActive = true,
            FullName = "Amina Hassan", Code = code, WhatsAppNumber = Phone, PasswordHash = BCrypt.Net.BCrypt.HashPassword("Secret#2026"),
        };
        var atA = Client(a, "AFB-CL-2026-0001");
        var atB = Client(b, "KRB-CL-2026-0001");
        db.AddRange(a, b, atA, atB);
        await db.SaveChangesAsync();
        var sms = new CapturingSms();
        var auth = new AuthService(db, new FakeConfig(), NoOp<INotificationService>.Create(), sms, NullLogger<AuthService>.Instance);
        return new World(db, auth, sms, a, b, atA, atB);
    }

    private static async Task<IdentityTokenDto> LoginAsync(World w, string? deviceId = null)
    {
        Assert.True((await w.Auth.RequestCodeAsync(new IdentityRequestCodeDto(Phone))).Success);
        var r = await w.Auth.VerifyCodeAsync(new IdentityVerifyCodeDto(Phone, w.Sms.LastCode!, deviceId, "Test phone"), "1.2.3.4", null);
        Assert.True(r.Success, r.Message);
        return r.Data!;
    }

    private static Guid IdentityIdOf(string jwt) =>
        Guid.Parse(new JwtSecurityTokenHandler().ReadJwtToken(jwt).Claims.First(c => c.Type == AuthService.IdentityClaim).Value);

    [Fact]
    public async Task Unknown_numbers_get_the_same_answer_and_no_sms()
    {
        var w = await MakeAsync();
        var r = await w.Auth.RequestCodeAsync(new IdentityRequestCodeDto("+254799999999"));
        Assert.True(r.Success);
        Assert.Equal(0, w.Sms.Sent);
    }

    [Fact]
    public async Task Phone_login_alone_shows_no_bureaus_until_each_is_linked_with_its_password()
    {
        var w = await MakeAsync();
        var token = await LoginAsync(w);
        Assert.Empty(token.Bureaus);                                    // same phone, but nothing linked yet
        var id = IdentityIdOf(token.AccessToken);

        Assert.False((await w.Auth.LinkAsync(id, new IdentityLinkDto("AFB-CL-2026-0001", "wrong-pass"), "1.2.3.4", null)).Success);
        Assert.True((await w.Auth.LinkAsync(id, new IdentityLinkDto("AFB-CL-2026-0001", "Secret#2026"), "1.2.3.4", null)).Success);
        Assert.True((await w.Auth.LinkAsync(id, new IdentityLinkDto("KRB-CL-2026-0001", "Secret#2026"), "1.2.3.4", null)).Success);

        var bureaus = (await w.Auth.GetBureausAsync(id)).Data!;
        Assert.Equal(2, bureaus.Count);
    }

    [Fact]
    public async Task An_account_on_another_phone_cannot_be_linked_even_with_its_password()
    {
        var w = await MakeAsync();
        w.AtB.WhatsAppNumber = "+256700000222";
        await w.Db.SaveChangesAsync();
        var id = IdentityIdOf((await LoginAsync(w)).AccessToken);
        var r = await w.Auth.LinkAsync(id, new IdentityLinkDto("KRB-CL-2026-0001", "Secret#2026"), "1.2.3.4", null);
        Assert.False(r.Success);
        Assert.Null(w.AtB.ClientIdentityId);
    }

    [Fact]
    public async Task Picking_a_bureau_gives_that_bureaus_client_token_and_rechecks_status_every_time()
    {
        var w = await MakeAsync();
        var id = IdentityIdOf((await LoginAsync(w)).AccessToken);
        await w.Auth.LinkAsync(id, new IdentityLinkDto("AFB-CL-2026-0001", "Secret#2026"), "1.2.3.4", null);

        var picked = await w.Auth.SelectAsync(id, w.A.Id, "1.2.3.4", null);
        Assert.True(picked.Success, picked.Message);
        Assert.Equal(w.A.Id, picked.Data!.CompanyId);
        Assert.Equal(UserRole.Client, picked.Data.Role);
        Assert.Equal(id, IdentityIdOf(picked.Data.AccessToken));          // so "Switch bureau" works

        Assert.False((await w.Auth.SelectAsync(id, w.B.Id, "1.2.3.4", null)).Success);   // B not linked

        w.A.SubscriptionStatus = SubscriptionStatus.Suspended;            // Sarif suspends the bureau
        await w.Db.SaveChangesAsync();
        Assert.False((await w.Auth.SelectAsync(id, w.A.Id, "1.2.3.4", null)).Success);

        w.A.SubscriptionStatus = SubscriptionStatus.Active;
        w.AtA.IsActive = false;                                           // bureau deactivates the client
        await w.Db.SaveChangesAsync();
        Assert.False((await w.Auth.SelectAsync(id, w.A.Id, "1.2.3.4", null)).Success);
    }

    [Fact]
    public async Task An_account_whose_number_changed_drops_out_of_the_phone_login()
    {
        var w = await MakeAsync();
        var id = IdentityIdOf((await LoginAsync(w)).AccessToken);
        await w.Auth.LinkAsync(id, new IdentityLinkDto("AFB-CL-2026-0001", "Secret#2026"), "1.2.3.4", null);

        w.AtA.WhatsAppNumber = "+254799000999";        // the client moved to a new number
        await w.Db.SaveChangesAsync();

        // Whoever holds the OLD number must not reach this account any more.
        Assert.Empty((await w.Auth.GetBureausAsync(id)).Data!);
        Assert.False((await w.Auth.SelectAsync(id, w.A.Id, "1.2.3.4", null)).Success);
    }

    [Fact]
    public async Task Office_unlink_removes_the_bureau_and_leaves_money_alone()
    {
        var w = await MakeAsync();
        w.AtA.BalanceKES = 5_000m;
        var id = IdentityIdOf((await LoginAsync(w)).AccessToken);
        await w.Auth.LinkAsync(id, new IdentityLinkDto("AFB-CL-2026-0001", "Secret#2026"), "1.2.3.4", null);

        Assert.True((await w.Auth.OfficeUnlinkAsync(w.A.Id, w.AtA.Id)).Success);
        Assert.Empty((await w.Auth.GetBureausAsync(id)).Data!);
        Assert.Equal(5_000m, w.AtA.BalanceKES);
        Assert.False((await w.Auth.OfficeUnlinkAsync(w.B.Id, w.AtA.Id)).Success);   // another bureau can't touch it
    }

    [Fact]
    public async Task A_trusted_device_skips_the_code_until_signed_out_everywhere()
    {
        var w = await MakeAsync();
        const string device = "device-secret-0123456789abcdef";
        var id = IdentityIdOf((await LoginAsync(w, device)).AccessToken);

        Assert.True((await w.Auth.DeviceLoginAsync(new IdentityDeviceLoginDto(Phone, device), "1.2.3.4", null)).Success);
        Assert.False((await w.Auth.DeviceLoginAsync(new IdentityDeviceLoginDto(Phone, "some-other-device-000000"), "1.2.3.4", null)).Success);

        await w.Auth.SignOutEverywhereAsync(id);
        Assert.False((await w.Auth.DeviceLoginAsync(new IdentityDeviceLoginDto(Phone, device), "1.2.3.4", null)).Success);
    }

    [Fact]
    public async Task Wrong_codes_lock_the_phone_login()
    {
        var w = await MakeAsync();
        await LoginAsync(w);                                               // creates the identity
        w.Db.OtpCodes.Add(new OtpCode { PhoneNumber = Phone, UserCode = "IDENTITY", Code = "not-a-real-hash",
            ExpiresAt = DateTime.UtcNow.AddMinutes(5), CreatedAt = DateTime.UtcNow });   // a fresh code (skips the 60 s resend wait)
        await w.Db.SaveChangesAsync();
        for (var i = 0; i < 5; i++)
            Assert.False((await w.Auth.VerifyCodeAsync(new IdentityVerifyCodeDto(Phone, "000000"), "1.2.3.4", null)).Success);

        Assert.NotNull(w.Db.ClientIdentities.Single().LockedUntil);
        // Locked: even a request for a new code sends nothing.
        var before = w.Sms.Sent;
        await w.Auth.RequestCodeAsync(new IdentityRequestCodeDto(Phone));
        Assert.Equal(before, w.Sms.Sent);
    }
}
