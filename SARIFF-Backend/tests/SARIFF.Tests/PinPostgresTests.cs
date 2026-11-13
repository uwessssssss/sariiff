using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SARIFF.API.Controllers;
using SARIFF.Core.DTOs;
using SARIFF.Infrastructure.Data;
using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>The transaction PIN's lock-out, with requests arriving at the same moment (real PostgreSQL).</summary>
public class PinPostgresTests : IClassFixture<PostgresDatabase>
{
    private readonly PostgresDatabase _pg;
    public PinPostgresTests(PostgresDatabase pg) => _pg = pg;

    private static async Task<bool> VerifyAsync(AppDbContext db, Guid companyId, Guid userId, string pin)
    {
        var http = new DefaultHttpContext();
        http.Items["CompanyId"] = companyId; http.Items["UserId"] = userId; http.Items["UserRole"] = "OfficeUser";
        var controller = new TransactionPinController(db) { ControllerContext = new ControllerContext { HttpContext = http } };
        var result = await controller.VerifyPin(new VerifyTransactionPinDto(pin));
        return ((ApiResponse<bool>)((OkObjectResult)result).Value!).Success;
    }

    [PostgresFact]
    public async Task Thirty_wrong_pins_at_once_lock_the_pin_like_thirty_in_a_row()
    {
        Guid co;
        await using (var db = _pg.NewContext())
        {
            var w = await SignInWorld.MakeAsync(db);
            w.Co.TransactionPinHash = BCrypt.Net.BCrypt.HashPassword("4821", 4);
            w.Co.IsTransactionPinEnabled = true;
            await db.SaveChangesAsync();
            co = w.Co.Id;
        }

        // A 4-digit PIN has 10,000 values; the lock (5 wrong tries, then 15 minutes) is all
        // that stops someone at the till from trying them all. Thirty guesses sent together:
        await Task.WhenAll(Enumerable.Range(0, 30).Select(async i =>
        {
            await using var own = _pg.NewContext();
            try { await VerifyAsync(own, co, co, (1000 + i).ToString()); } catch { /* a collision is still a refused guess */ }
        }));

        await using var fresh = _pg.NewContext();
        var company = await fresh.Companies.FindAsync(co);
        Assert.NotNull(PinGate.LockedMinutes(company!));
        Assert.False(await VerifyAsync(fresh, co, co, "4821"), "the right PIN was accepted straight after 30 parallel wrong ones");
    }

    [PostgresFact]
    public async Task The_right_pin_clears_earlier_mistakes_and_a_lock_runs_out()
    {
        await using var db = _pg.NewContext();
        var w = await SignInWorld.MakeAsync(db);
        w.Co.TransactionPinHash = BCrypt.Net.BCrypt.HashPassword("4821", 4);
        w.Co.IsTransactionPinEnabled = true;
        await db.SaveChangesAsync();

        for (var i = 0; i < 4; i++) Assert.False(await VerifyAsync(db, w.Co.Id, w.Co.Id, "0000"));
        Assert.True(await VerifyAsync(db, w.Co.Id, w.Co.Id, "4821"));   // the 5th try, correct
        Assert.Equal(0, w.Co.PinFailedAttempts);
        Assert.True(await PinGate.HasGrantAsync(db, w.Co.Id, w.Co.Id));

        for (var i = 0; i < 5; i++) Assert.False(await VerifyAsync(db, w.Co.Id, w.Co.Id, "0000"));
        Assert.False(await VerifyAsync(db, w.Co.Id, w.Co.Id, "4821"));  // locked

        // sixteen minutes later the lock has run out
        w.Co.PinFailuresSince = DateTime.UtcNow.AddMinutes(-16);
        await db.SaveChangesAsync();
        Assert.True(await VerifyAsync(db, w.Co.Id, w.Co.Id, "4821"));
    }
}
