using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

public class SubscriptionTests
{
    private static Company Co(SubscriptionStatus status, DateTime? expires) =>
        new() { Name = "Test Bureau", SubscriptionStatus = status, SubscriptionExpiresAt = expires };

    [Fact]
    public void Active_and_in_date_is_allowed() =>
        Assert.Null(AuthService.SubscriptionBlock(Co(SubscriptionStatus.Active, DateTime.UtcNow.AddDays(10))));

    [Fact]
    public void Expired_within_seven_day_grace_is_still_allowed() =>
        Assert.Null(AuthService.SubscriptionBlock(Co(SubscriptionStatus.Active, DateTime.UtcNow.AddDays(-6))));

    [Fact]
    public void Expired_past_grace_is_blocked() =>
        Assert.Contains("expired", AuthService.SubscriptionBlock(Co(SubscriptionStatus.Active, DateTime.UtcNow.AddDays(-8)))!);

    [Fact]
    public void Suspended_is_blocked_even_when_in_date() =>
        Assert.Contains("suspended", AuthService.SubscriptionBlock(Co(SubscriptionStatus.Suspended, DateTime.UtcNow.AddDays(30)))!);

    [Fact]
    public void Cancelled_is_blocked() =>
        Assert.Contains("cancelled", AuthService.SubscriptionBlock(Co(SubscriptionStatus.Cancelled, null))!);

    [Fact]
    public void Expired_status_without_a_date_is_blocked() =>
        Assert.NotNull(AuthService.SubscriptionBlock(Co(SubscriptionStatus.Expired, null)));

    [Fact]
    public void Trial_without_a_date_is_allowed() =>
        Assert.Null(AuthService.SubscriptionBlock(Co(SubscriptionStatus.Trial, null)));
}

public class CsvTextTests
{
    [Theory]
    [InlineData("=HYPERLINK(\"x\")", "\"'=HYPERLINK(\"\"x\"\")\"")]
    [InlineData("+254700000000", "\"'+254700000000\"")]
    [InlineData("-5", "\"'-5\"")]
    [InlineData("@SUM(A1)", "\"'@SUM(A1)\"")]
    [InlineData("Rent, October", "\"Rent, October\"")]
    [InlineData("He said \"hi\"", "\"He said \"\"hi\"\"\"")]
    [InlineData("", "\"\"")]
    public void Cells_are_quoted_and_formulas_neutralised(string input, string expected) =>
        Assert.Equal(expected, CsvText.Cell(input));

    [Fact]
    public void Null_becomes_an_empty_quoted_cell() => Assert.Equal("\"\"", CsvText.Cell(null));
}

public class CodeGeneratorTests
{
    private static readonly int Year = BureauClock.TodayLocal.Year; // codes use the bureau's year

    [Fact]
    public async Task Exchange_codes_keep_counting_past_9999()
    {
        await using var db = TestDb.InMemory();
        var company = Guid.NewGuid();
        db.ExchangeTransactions.AddRange(
            new ExchangeTransaction { CompanyId = company, Code = $"EXC-{Year}-9999", TransactionDate = DateTime.UtcNow },
            new ExchangeTransaction { CompanyId = company, Code = $"EXC-{Year}-10000", TransactionDate = DateTime.UtcNow });
        await db.SaveChangesAsync();

        Assert.Equal($"EXC-{Year}-10001", await CodeGenerator.GenerateExchangeCodeAsync(db, company));
    }

    [Fact]
    public async Task Two_codes_in_one_request_before_saving_are_different()
    {
        await using var db = TestDb.InMemory();
        var company = Guid.NewGuid();
        var a = await CodeGenerator.GenerateTransactionCodeAsync(db, company);
        var b = await CodeGenerator.GenerateTransactionCodeAsync(db, company);
        Assert.NotEqual(a, b);
        Assert.Equal($"TXN-{Year}-000001", a);
        Assert.Equal($"TXN-{Year}-000002", b);
    }

    [Fact]
    public async Task Each_company_has_its_own_series()
    {
        await using var db = TestDb.InMemory();
        var first = await CodeGenerator.GenerateExpenseCodeAsync(db, Guid.NewGuid());
        var second = await CodeGenerator.GenerateExpenseCodeAsync(db, Guid.NewGuid());
        Assert.Equal(first, second); // both EXP-{year}-00001: numbering is per bureau
    }

    [Theory]
    [InlineData("Alpha Forex Bureau Ltd", "AFB")]
    [InlineData("Sariff Exchange", "SE")]
    [InlineData("Amana", "AMA")]
    [InlineData("Sunnah Alpha", "SAX")] // "SA" is reserved for super-admin codes
    public void Company_prefixes(string name, string expected) =>
        Assert.Equal(expected, CodeGenerator.GenerateCodePrefix(name));
}

public class CurrencyInfoTests
{
    [Theory]
    [InlineData(Currency.KES, 50_000, 50_000)]
    [InlineData(Currency.UGX, 50_000, 1_400_000)]
    [InlineData(Currency.UGX, 500_000, 14_000_000)]
    [InlineData(Currency.USD, 500_000, 3_846)]
    [InlineData(Currency.EUR, 500_000, 3_571)]
    [InlineData(Currency.KES, 12_345, 12_000)]
    public void Default_thresholds_scale_and_round_without_throwing(Currency c, int kes, int expected) =>
        Assert.Equal((decimal)expected, CurrencyInfo.FromKes(kes, c));

    [Fact]
    public void Every_currency_converts() =>
        Assert.All(CurrencyInfo.All, c => CurrencyInfo.FromKes(500_000m, c));
}

public class RequestMetricsTests
{
    [Fact]
    public void Counts_rate_response_time_and_only_5xx_as_errors()
    {
        RequestMetrics.Reset();
        var t = new DateTime(2026, 10, 30, 9, 0, 30, DateTimeKind.Utc);
        for (var i = 0; i < 8; i++) RequestMetrics.Record(100, 200, t);
        RequestMetrics.Record(300, 404, t);   // the caller's mistake, not an error
        RequestMetrics.Record(500, 500, t);   // a real server error

        var s = RequestMetrics.Snapshot(t);
        Assert.Equal(10, s.Requests);
        Assert.Equal(2, s.RequestsPerMinute);           // 10 over a 5-minute window, rounded up
        Assert.Equal((800 + 300 + 500) / 10, s.AvgResponseMs);
        Assert.Equal(10m, s.ErrorRatePercent);
    }

    [Fact]
    public void Old_minutes_drop_out_of_the_window()
    {
        RequestMetrics.Reset();
        var t = new DateTime(2026, 10, 30, 9, 0, 0, DateTimeKind.Utc);
        RequestMetrics.Record(50, 500, t);
        Assert.Equal(0, RequestMetrics.Snapshot(t.AddMinutes(6)).Requests);
        Assert.Equal(1, RequestMetrics.Snapshot(t.AddMinutes(4)).Requests);
    }
}

public class SystemLogResolveTests
{
    private static (SARIFF.Infrastructure.Data.AppDbContext Db, SystemLogService Svc) Make()
    {
        var db = TestDb.InMemory();
        return (db, new SystemLogService(db, Microsoft.Extensions.Logging.Abstractions.NullLogger<SystemLogService>.Instance));
    }

    private static SystemLog Log(string message, string level = "Error", string source = "API") =>
        new() { Level = level, Source = source, Message = message, CreatedAt = DateTime.UtcNow.AddMinutes(-5) };

    [Fact]
    public async Task Resolving_one_entry_clears_every_identical_one_and_nothing_else()
    {
        var (db, svc) = Make();
        var bug = Log("[GET] /api/exchange/float: Decimal can only round");
        db.SystemLogs.AddRange(bug, Log(bug.Message), Log(bug.Message),
            Log("Different error"),
            Log(bug.Message, level: "Warning"),          // same text, different level: separate issue
            Log(bug.Message, source: "Scheduler"));      // same text, different source: separate issue
        await db.SaveChangesAsync();

        var r = await svc.ResolveAsync(bug.Id, Guid.NewGuid());
        Assert.True(r.Success);
        Assert.Equal(3, r.Data);

        // Still open: "Different error" and the Scheduler entry (errors), plus the warning.
        Assert.Equal(2, await svc.GetErrorCountLast24HoursAsync());
        Assert.Equal(3, (await svc.GetLogsAsync(1, 20)).Data!.Items.Count);
    }

    [Fact]
    public async Task Resolved_entries_are_hidden_by_default_but_kept()
    {
        var (db, svc) = Make();
        var a = Log("A"); var b = Log("B");
        db.SystemLogs.AddRange(a, b);
        await db.SaveChangesAsync();
        await svc.ResolveAsync(a.Id, null, similar: false);

        var open = await svc.GetLogsAsync(1, 20);
        var all = await svc.GetLogsAsync(1, 20, includeResolved: true);
        Assert.Single(open.Data!.Items);
        Assert.Equal(2, all.Data!.Items.Count);
        Assert.NotNull(all.Data.Items.Single(i => i.Id == a.Id).ResolvedAt);
    }

    [Fact]
    public async Task Unknown_entry_is_reported_not_found()
    {
        var (_, svc) = Make();
        var r = await svc.ResolveAsync(Guid.NewGuid(), null);
        Assert.False(r.Success);
    }
}

public class IpAccessTests
{
    [Fact]
    public async Task Blocked_ip_is_refused_until_it_expires_or_is_unblocked()
    {
        await using var db = TestDb.InMemory();
        var t = new DateTime(2026, 11, 4, 9, 0, 0, DateTimeKind.Utc);
        var block = new BlockedIP { IpAddress = "102.68.79.12", Reason = "brute force", BlockedUntil = t.AddHours(1), IsActive = true };
        db.BlockedIPs.Add(block);
        await db.SaveChangesAsync();
        IpAccess.Invalidate();

        Assert.NotNull(await IpAccess.BlockedReasonAsync(db, "102.68.79.12", t));
        Assert.NotNull(await IpAccess.BlockedReasonAsync(db, "::ffff:102.68.79.12", t));   // same client over IPv6
        Assert.Null(await IpAccess.BlockedReasonAsync(db, "41.210.141.7", t));
        Assert.Null(await IpAccess.BlockedReasonAsync(db, "102.68.79.12", t.AddHours(2))); // expired

        block.IsActive = false;
        await db.SaveChangesAsync();
        IpAccess.Invalidate();
        Assert.Null(await IpAccess.BlockedReasonAsync(db, "102.68.79.12", t));
    }

    [Fact]
    public async Task Admin_allow_list_is_off_when_empty_and_strict_when_set()
    {
        await using var db = TestDb.InMemory();
        IpAccess.Invalidate();
        Assert.True(await IpAccess.AdminAllowedAsync(db, "1.2.3.4"));

        db.AdminIpWhitelists.Add(new AdminIpWhitelist { IpAddress = "196.201.214.1", IsActive = true });
        await db.SaveChangesAsync();
        IpAccess.Invalidate();
        Assert.True(await IpAccess.AdminAllowedAsync(db, "196.201.214.1"));
        Assert.False(await IpAccess.AdminAllowedAsync(db, "1.2.3.4"));
    }
}
