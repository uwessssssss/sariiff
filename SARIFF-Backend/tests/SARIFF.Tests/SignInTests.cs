using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>A bureau, one of its clients and a super admin, each with the password "Secret#2026".</summary>
internal sealed record SignInWorld(AppDbContext Db, AuthService Auth, CapturingSms Sms, Company Co, User Client, User Admin)
{
    public const string Password = "Secret#2026";
    public const string Ip = "1.2.3.4";

    public static AuthService AuthFor(AppDbContext db, CapturingSms sms) =>
        new(db, new FakeConfig(), NoOp<INotificationService>.Create(), sms, NullLogger<AuthService>.Instance);

    public static async Task<SignInWorld> MakeAsync(AppDbContext db)
    {
        // Unique per test: the PostgreSQL tests share one database, and codes are limited per phone.
        var n = Random.Shared.Next(10_000_000, 99_999_999);
        var prefix = "Q" + (char)('A' + n % 26) + (char)('A' + n / 26 % 26);
        var hash = BCrypt.Net.BCrypt.HashPassword(Password, 4);   // low cost: these are tests
        var co = new Company
        {
            Name = $"Amana Forex {n}", OwnerName = "Amina Hassan", Code = $"{prefix}-2026-{n % 10_000:0000}", CodePrefix = prefix,
            WhatsAppNumber = $"+2547{n}", PasswordHash = hash, IsActive = true, BaseCurrency = Currency.KES,
        };
        var client = new User
        {
            CompanyId = co.Id, Role = UserRole.Client, ClientType = ClientType.Permanent, IsActive = true, FullName = "Baraka Otieno",
            Code = $"{prefix}-CL-2026-{n % 10_000:0000}", WhatsAppNumber = $"+2541{n}", PasswordHash = hash,
        };
        var admin = new User
        {
            Role = UserRole.SuperAdmin, IsActive = true, FullName = "Sarif Admin",
            Code = $"SA-2026-{n}", WhatsAppNumber = $"+2540{n}", PasswordHash = hash,
        };
        db.AddRange(co, client, admin);
        await db.SaveChangesAsync();
        var sms = new CapturingSms();
        return new SignInWorld(db, AuthFor(db, sms), sms, co, client, admin);
    }

    public Task<ApiResponse<object>> SignInAsync(string code, string phone, string password, string? deviceId = null) =>
        Auth.UnifiedLoginAsync(new UnifiedLoginDto(code, phone, password, deviceId), Ip, "test");

    public async Task<TokenResponseDto> ClientSignInAsync()
    {
        var r = await SignInAsync(Client.Code, Client.WhatsAppNumber, Password);
        Assert.True(r.Success, r.Message);
        return Assert.IsType<TokenResponseDto>(r.Data);
    }

    /// <summary>The bureau signs in on a device it already trusts, so no SMS code is needed.</summary>
    public async Task<TokenResponseDto> OfficeSignInOnTrustedDeviceAsync()
    {
        const string device = "device-0123456789abcdef";
        if (!await Db.TrustedDevices.AnyAsync(d => d.UserId == Co.Id && d.DeviceId == device))
        {
            Db.TrustedDevices.Add(new TrustedDevice { UserId = Co.Id, DeviceId = device, Platform = "web", DeviceName = "Test", TrustedUntil = DateTime.UtcNow.AddDays(30) });
            await Db.SaveChangesAsync();
        }
        var r = await SignInAsync(Co.Code, Co.WhatsAppNumber, Password, device);
        Assert.True(r.Success, r.Message);
        return Assert.IsType<TokenResponseDto>(r.Data);
    }

    public async Task<bool> CanRefreshAsync(TokenResponseDto tokens) =>
        (await Auth.RefreshTokenAsync(new RefreshTokenDto(tokens.RefreshToken), Ip)).Success;
}

/// <summary>Passwords, locks and what must end a session.</summary>
public class SignInTests
{
    private const string NewPassword = "NewSecret#2027";

    private static ClientService Clients(SignInWorld w) =>
        new(w.Db, NoOp<INotificationService>.Create(), NoOp<ITransactionService>.Create(), w.Sms, new FakeConfig());
    private static CompanyService Companies(SignInWorld w) =>
        new(w.Db, NoOp<INotificationService>.Create(), w.Sms, new FakeConfig(), NullLogger<CompanyService>.Instance);
    private static SuperAdminService Admin(SignInWorld w) => new(w.Db, NullLogger<SuperAdminService>.Instance);

    [Fact]
    public async Task A_wrong_password_is_refused_and_five_lock_the_account()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        for (var i = 0; i < 5; i++)
            Assert.False((await w.SignInAsync(w.Client.Code, w.Client.WhatsAppNumber, "wrong-password")).Success);

        Assert.True(w.Client.LockedUntil > DateTime.UtcNow);
        // locked: even the right password is refused
        Assert.False((await w.SignInAsync(w.Client.Code, w.Client.WhatsAppNumber, SignInWorld.Password)).Success);
    }

    [Fact]
    public async Task After_a_lock_runs_out_one_typo_does_not_lock_the_account_again()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        // both were locked after 5 wrong passwords; the 30 minutes have passed
        w.Co.FailedLoginAttempts = 5; w.Co.LockedUntil = DateTime.UtcNow.AddMinutes(-1);
        w.Client.FailedLoginAttempts = 5; w.Client.LockedUntil = DateTime.UtcNow.AddMinutes(-1);
        await w.Db.SaveChangesAsync();

        Assert.False((await w.SignInAsync(w.Co.Code, w.Co.WhatsAppNumber, "one-typo")).Success);
        Assert.False((await w.SignInAsync(w.Client.Code, w.Client.WhatsAppNumber, "one-typo")).Success);

        Assert.False(w.Co.LockedUntil > DateTime.UtcNow, "the bureau was locked again by a single wrong password");
        Assert.False(w.Client.LockedUntil > DateTime.UtcNow, "the client was locked again by a single wrong password");
        Assert.Equal(1, w.Co.FailedLoginAttempts);
        Assert.Equal(1, w.Client.FailedLoginAttempts);
        // and the right password now works
        Assert.True((await w.SignInAsync(w.Client.Code, w.Client.WhatsAppNumber, SignInWorld.Password)).Success);
    }

    [Fact]
    public async Task When_the_bureau_resets_a_clients_password_the_clients_open_sessions_end()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var tokens = await w.ClientSignInAsync();

        var reset = await Clients(w).ResetPasswordAsync(w.Co.Id, w.Client.Id, new ResetClientPasswordDto(NewPassword));
        Assert.True(reset.Success, reset.Message);

        Assert.False(await w.CanRefreshAsync(tokens), "a session opened with the old password survived the reset");
        Assert.False((await w.SignInAsync(w.Client.Code, w.Client.WhatsAppNumber, SignInWorld.Password)).Success);
        Assert.True((await w.SignInAsync(w.Client.Code, w.Client.WhatsAppNumber, NewPassword)).Success);
    }

    [Fact]
    public async Task When_a_client_changes_their_password_every_open_session_ends()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var onPhone = await w.ClientSignInAsync();
        var onLaptop = await w.ClientSignInAsync();

        var changed = await new ClientPortalService(w.Db).ChangePasswordAsync(w.Co.Id, w.Client.Id,
            new ChangePasswordDto { CurrentPassword = SignInWorld.Password, NewPassword = NewPassword, ConfirmPassword = NewPassword });
        Assert.True(changed.Success, changed.Message);

        Assert.False(await w.CanRefreshAsync(onPhone), "a session opened with the old password survived the change");
        Assert.False(await w.CanRefreshAsync(onLaptop), "a session opened with the old password survived the change");
    }

    [Fact]
    public async Task Archiving_a_client_ends_their_open_sessions()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        await w.ClientSignInAsync();

        var archived = await Clients(w).ArchiveAsync(w.Co.Id, w.Client.Id);
        Assert.True(archived.Success, archived.Message);

        // The per-request check only asks "does this client have a live session?", so one
        // left open keeps the portal working until the access token runs out.
        Assert.DoesNotContain(w.Db.UserSessions, s => s.UserId == w.Client.Id && !s.IsRevoked);
    }

    [Fact]
    public async Task When_a_super_admin_resets_a_bureaus_password_its_sessions_and_trusted_devices_end()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var tokens = await w.OfficeSignInOnTrustedDeviceAsync();

        var reset = await Admin(w).ResetOfficeUserPasswordAsync(w.Co.Id, new AdminResetPasswordDto(NewPassword));
        Assert.True(reset.Success, reset.Message);

        Assert.False(await w.CanRefreshAsync(tokens), "a session opened with the old password survived the reset");
        Assert.Empty(w.Db.TrustedDevices.Where(d => d.UserId == w.Co.Id));
    }

    [Fact]
    public async Task The_other_bureau_password_reset_ends_sessions_too()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var tokens = await w.OfficeSignInOnTrustedDeviceAsync();

        var reset = await Companies(w).ResetPasswordAsync(w.Co.Id, new AdminResetPasswordDto(NewPassword));
        Assert.True(reset.Success, reset.Message);

        Assert.False(await w.CanRefreshAsync(tokens), "a session opened with the old password survived the reset");
        Assert.Empty(w.Db.TrustedDevices.Where(d => d.UserId == w.Co.Id));
    }

    [Theory]
    [InlineData("SA")]     // would be routed to the super admin sign-in
    [InlineData("CL")]     // would be routed to the client sign-in
    [InlineData("A-CL")]   // "A-CL-2026-0001" reads as a client code
    [InlineData("sa")]
    [InlineData("TOOLONG")]
    [InlineData("A B")]
    public async Task A_bureau_cannot_be_given_a_code_prefix_that_breaks_its_sign_in(string prefix)
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());

        var r = await Companies(w).CreateAsync(new CreateCompanyDto("Savanna Africa Forex", "Owner Name", "+254711000999", null, SignInWorld.Password, prefix));

        Assert.False(r.Success, $"created {r.Data?.Code}");
        Assert.DoesNotContain(w.Db.Companies, c => c.WhatsAppNumber == "+254711000999");
    }

    [Fact]
    public async Task Editing_a_subscription_without_a_status_keeps_the_status_it_had()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        w.Co.SubscriptionStatus = SubscriptionStatus.Cancelled;
        await w.Db.SaveChangesAsync();

        var r = await Admin(w).UpdateSubscriptionAsync(w.Co.Id, new UpdateSubscriptionDto(SubscriptionPlan.Starter, null, 2_500, null));

        Assert.True(r.Success, r.Message);
        Assert.Equal(2_500m, w.Co.MonthlyFee);
        Assert.Equal(SubscriptionStatus.Cancelled, w.Co.SubscriptionStatus);   // changing the fee must not switch a cancelled bureau back on
        Assert.False((await Admin(w).UpdateSubscriptionAsync(w.Co.Id, new UpdateSubscriptionDto((SubscriptionPlan)99, null, 0, null))).Success);
        Assert.False((await Admin(w).UpdateSubscriptionAsync(w.Co.Id, new UpdateSubscriptionDto(SubscriptionPlan.Starter, (SubscriptionStatus)99, 0, null))).Success);
    }

    [Fact]
    public async Task The_bureau_search_ignores_upper_and_lower_case()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());

        var found = (await Companies(w).GetAllAsync(1, 10, "amana forex")).Data!;

        Assert.Contains(found.Items, c => c.Id == w.Co.Id);
    }

    [Fact]
    public async Task A_suspended_or_lapsed_bureau_cannot_sign_in_or_refresh_and_neither_can_its_clients()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var office = await w.OfficeSignInOnTrustedDeviceAsync();
        var client = await w.ClientSignInAsync();

        w.Co.SubscriptionStatus = SubscriptionStatus.Expired;
        w.Co.SubscriptionExpiresAt = DateTime.UtcNow.AddDays(-8);   // past the 7 days' grace
        await w.Db.SaveChangesAsync();

        Assert.False(await w.CanRefreshAsync(office));
        Assert.False(await w.CanRefreshAsync(client));
        Assert.False((await w.SignInAsync(w.Co.Code, w.Co.WhatsAppNumber, SignInWorld.Password, "device-0123456789abcdef")).Success);
        Assert.False((await w.SignInAsync(w.Client.Code, w.Client.WhatsAppNumber, SignInWorld.Password)).Success);

        w.Co.SubscriptionExpiresAt = DateTime.UtcNow.AddDays(-3);   // inside the grace: still allowed
        await w.Db.SaveChangesAsync();
        Assert.True((await w.SignInAsync(w.Client.Code, w.Client.WhatsAppNumber, SignInWorld.Password)).Success);
    }

    [Fact]
    public async Task A_refresh_token_works_once()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var first = await w.ClientSignInAsync();

        var second = await w.Auth.RefreshTokenAsync(new RefreshTokenDto(first.RefreshToken), SignInWorld.Ip);

        Assert.True(second.Success, second.Message);
        Assert.NotEqual(first.RefreshToken, second.Data!.RefreshToken);
        Assert.False(await w.CanRefreshAsync(first), "the used refresh token worked a second time");
        Assert.True(await w.CanRefreshAsync(second.Data));
    }
}

/// <summary>SMS-code sign-in against real PostgreSQL (the attempt counters are database updates).</summary>
public class SignInPostgresTests : IClassFixture<PostgresDatabase>
{
    private readonly PostgresDatabase _pg;
    public SignInPostgresTests(PostgresDatabase pg) => _pg = pg;

    private static string WrongCode(string right) => right == "111111" ? "222222" : "111111";

    private static async Task<TokenResponseDto> OfficeSignInWithCodeAsync(SignInWorld w)
    {
        var step1 = await w.SignInAsync(w.Co.Code, w.Co.WhatsAppNumber, SignInWorld.Password);
        Assert.True(step1.Success, step1.Message);
        Assert.NotNull(w.Sms.LastCode);
        var step2 = await w.Auth.VerifyOtpAsync(new OtpVerifyWithCodeDto(w.Co.Code, w.Co.WhatsAppNumber, w.Sms.LastCode!), SignInWorld.Ip, "test");
        Assert.True(step2.Success, step2.Message);
        return step2.Data!;
    }

    [PostgresFact]
    public async Task A_bureau_signs_in_with_password_then_code_and_signing_out_ends_it()
    {
        await using var db = _pg.NewContext();
        var w = await SignInWorld.MakeAsync(db);

        var tokens = await OfficeSignInWithCodeAsync(w);
        Assert.Equal(UserRole.OfficeUser, tokens.Role);
        Assert.Equal(w.Co.Id, tokens.CompanyId);

        // the code is spent
        Assert.False((await w.Auth.VerifyOtpAsync(new OtpVerifyWithCodeDto(w.Co.Code, w.Co.WhatsAppNumber, w.Sms.LastCode!), SignInWorld.Ip, "test")).Success);

        Assert.True((await w.Auth.LogoutAsync(w.Co.Id, UserRole.OfficeUser)).Success);
        Assert.False(await w.CanRefreshAsync(tokens));
    }

    [PostgresFact]
    public async Task Five_wrong_codes_kill_the_code_even_for_the_right_digits()
    {
        await using var db = _pg.NewContext();
        var w = await SignInWorld.MakeAsync(db);
        Assert.True((await w.SignInAsync(w.Co.Code, w.Co.WhatsAppNumber, SignInWorld.Password)).Success);
        var right = w.Sms.LastCode!;

        for (var i = 0; i < 5; i++)
            Assert.False((await w.Auth.VerifyOtpAsync(new OtpVerifyWithCodeDto(w.Co.Code, w.Co.WhatsAppNumber, WrongCode(right)), SignInWorld.Ip, "test")).Success);

        Assert.False((await w.Auth.VerifyOtpAsync(new OtpVerifyWithCodeDto(w.Co.Code, w.Co.WhatsAppNumber, right), SignInWorld.Ip, "test")).Success);
    }

    [PostgresFact]
    public async Task A_code_without_the_password_step_opens_nothing()
    {
        await using var db = _pg.NewContext();
        var w = await SignInWorld.MakeAsync(db);

        var r = await w.Auth.VerifyOtpAsync(new OtpVerifyWithCodeDto(w.Co.Code, w.Co.WhatsAppNumber, "123456"), SignInWorld.Ip, "test");

        Assert.False(r.Success);
        Assert.Empty(db.UserSessions.Where(s => s.CompanyId == w.Co.Id));
    }

    [PostgresFact]
    public async Task A_super_admin_switched_off_between_password_and_code_is_refused()
    {
        await using var db = _pg.NewContext();
        var w = await SignInWorld.MakeAsync(db);
        Assert.True((await w.SignInAsync(w.Admin.Code, w.Admin.WhatsAppNumber, SignInWorld.Password)).Success);

        w.Admin.IsActive = false;
        await db.SaveChangesAsync();

        var r = await w.Auth.VerifyOtpAsync(new OtpVerifyWithCodeDto(w.Admin.Code, w.Admin.WhatsAppNumber, w.Sms.LastCode!), SignInWorld.Ip, "test");
        Assert.False(r.Success, "a deactivated super admin was signed in");
        Assert.Empty(db.UserSessions.Where(s => s.UserId == w.Admin.Id));
    }

    [PostgresFact]
    public async Task Twenty_wrong_phone_login_codes_at_once_still_count_as_twenty()
    {
        await using var db = _pg.NewContext();
        var w = await SignInWorld.MakeAsync(db);
        var phone = w.Client.WhatsAppNumber;
        Assert.True((await w.Auth.RequestCodeAsync(new IdentityRequestCodeDto(phone))).Success);
        var right = w.Sms.LastCode!;

        // Twenty guesses in parallel, each on its own connection, the way separate requests arrive.
        await Task.WhenAll(Enumerable.Range(0, 20).Select(async _ =>
        {
            await using var own = _pg.NewContext();
            await SignInWorld.AuthFor(own, new CapturingSms()).VerifyCodeAsync(new IdentityVerifyCodeDto(phone, WrongCode(right)), SignInWorld.Ip, "test");
        }));

        // Only 5 guesses are allowed per code: after twenty, the code must be dead.
        await using var fresh = _pg.NewContext();
        var r = await SignInWorld.AuthFor(fresh, new CapturingSms()).VerifyCodeAsync(new IdentityVerifyCodeDto(phone, right), SignInWorld.Ip, "test");
        Assert.False(r.Success, "the code still worked after 20 parallel wrong guesses (only 5 are allowed)");
    }

    [PostgresFact]
    public async Task Suspending_a_bureau_ends_every_session_of_the_bureau_and_its_clients()
    {
        await using var db = _pg.NewContext();
        var w = await SignInWorld.MakeAsync(db);
        var office = await OfficeSignInWithCodeAsync(w);
        var client = await w.ClientSignInAsync();

        var r = await new SuperAdminService(db, NullLogger<SuperAdminService>.Instance).SuspendCompanyAsync(w.Co.Id, new SuspendCompanyDto("Unpaid"));
        Assert.True(r.Success, r.Message);

        await using var fresh = _pg.NewContext();
        Assert.Empty(fresh.UserSessions.Where(s => s.CompanyId == w.Co.Id && !s.IsRevoked));
        var auth = SignInWorld.AuthFor(fresh, new CapturingSms());
        Assert.False((await auth.RefreshTokenAsync(new RefreshTokenDto(office.RefreshToken), SignInWorld.Ip)).Success);
        Assert.False((await auth.RefreshTokenAsync(new RefreshTokenDto(client.RefreshToken), SignInWorld.Ip)).Success);
    }
}
