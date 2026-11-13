using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using Xunit;

namespace SARIFF.Tests;

/// <summary>Line-by-line audit, Services/Auth: one test per finding (see docs/line-audit-ledger.md).</summary>
public class LineAuditAuthTests
{
    // AU1
    [Fact]
    public async Task A_code_typed_in_lower_case_or_with_spaces_still_signs_in()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        // The sign-in page upper-cases the code; the mobile app only trims it, and phone
        // keyboards capitalise the first letter ("Qab-cl-…"). The server routed on the
        // upper-cased code but looked the account up with the code exactly as typed.
        var client = await w.SignInAsync("  " + w.Client.Code.ToLowerInvariant() + " ", w.Client.WhatsAppNumber, SignInWorld.Password);
        Assert.True(client.Success, client.Message);

        var admin = await w.SignInAsync(w.Admin.Code.ToLowerInvariant(), w.Admin.WhatsAppNumber, SignInWorld.Password);
        Assert.True(admin.Success, admin.Message);

        var office = await w.SignInAsync(w.Co.Code.ToLowerInvariant(), " " + w.Co.WhatsAppNumber, SignInWorld.Password);
        Assert.True(office.Success, office.Message);
    }

    // AU3
    [Fact]
    public async Task Linking_after_a_lock_has_run_out_starts_the_count_again()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var identity = new ClientIdentity { PhoneNumber = w.Client.WhatsAppNumber, PhoneVerifiedAt = DateTime.UtcNow };
        w.Db.Add(identity);
        w.Client.FailedLoginAttempts = 5;
        w.Client.LockedUntil = DateTime.UtcNow.AddMinutes(-1);   // the 30-minute lock is over
        await w.Db.SaveChangesAsync();

        Assert.False((await w.Auth.LinkAsync(identity.Id, new IdentityLinkDto(w.Client.Code, "one-typo"), SignInWorld.Ip, null)).Success);

        // The password sign-in was fixed for this on 13 Nov; linking kept the old count, so
        // the first typo after waiting out a lock locked the account for another 30 minutes.
        Assert.False(w.Client.LockedUntil > DateTime.UtcNow, "one typo after the lock ran out locked the account again");
        Assert.Equal(1, w.Client.FailedLoginAttempts);
    }
}

public class LineAuditAuthPostgresTests : IClassFixture<PostgresDatabase>
{
    private readonly PostgresDatabase _pg;
    public LineAuditAuthPostgresTests(PostgresDatabase pg) => _pg = pg;

    // AU1 (the code step)
    [PostgresFact]
    public async Task A_bureau_code_typed_in_lower_case_gets_through_the_sms_code_step()
    {
        await using var db = _pg.NewContext();
        var w = await SignInWorld.MakeAsync(db);
        var typed = w.Co.Code.ToLowerInvariant();

        var step1 = await w.SignInAsync(typed, w.Co.WhatsAppNumber, SignInWorld.Password);
        Assert.True(step1.Success, step1.Message);
        var step2 = await w.Auth.VerifyOtpAsync(new OtpVerifyWithCodeDto(typed, w.Co.WhatsAppNumber, w.Sms.LastCode!), SignInWorld.Ip, "test");
        Assert.True(step2.Success, step2.Message);
    }

    // AU2
    [PostgresFact]
    public async Task One_refresh_token_sent_twice_at_the_same_moment_opens_one_session_not_two()
    {
        await using var db = _pg.NewContext();
        var w = await SignInWorld.MakeAsync(db);
        var tokens = await w.ClientSignInAsync();

        // A refresh token is single-use: it is swapped for a new one. Both requests read
        // "not revoked yet", both revoked it and both got a fresh session.
        var results = await Task.WhenAll(Enumerable.Range(0, 6).Select(async _ =>
        {
            await using var ctx = _pg.NewContext();
            return await SignInWorld.AuthFor(ctx, new CapturingSms()).RefreshTokenAsync(new RefreshTokenDto(tokens.RefreshToken), SignInWorld.Ip);
        }));

        Assert.Equal(1, results.Count(r => r.Success));
    }
}
