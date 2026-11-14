using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>Line-by-line audit, Services/Notifications: one test per finding (see docs/line-audit-ledger.md).</summary>
public class LineAuditNotificationsTests
{
    private static NotificationService Svc(SARIFF.Infrastructure.Data.AppDbContext db) =>
        new(db, new FakeConfig(), NullLogger<NotificationService>.Instance, NoOp<IPushNotificationService>.Create(), new CapturingSms());

    // NT1
    [Fact]
    public async Task The_notification_log_never_keeps_a_password_or_a_login_code()
    {
        var db = TestDb.InMemory();
        var svc = Svc(db);
        const string password = "Kibanda#2027";
        const string code = "493817";

        await svc.SendClientCredentialsAsync(Guid.NewGuid(), Guid.NewGuid(), "+254711000333", "Zawadi Njeri", "AF-CL-2026-0007", password, "Amana Forex", "https://app.sariff.com");
        await svc.SendOfficeUserCredentialsAsync(Guid.NewGuid(), "+254711000444", "Amana Forex", "AF-2026-0001", password, "https://app.sariff.com");
        await svc.SendOtpAsync("+254711000555", code);

        // Every SMS is copied into NotificationLogs. The copies held the new account's password
        // and the live sign-in code in plain text, for anyone who can read the database or a backup.
        var logs = await db.NotificationLogs.Select(l => l.MessageContent).ToListAsync();
        Assert.Equal(3, logs.Count);
        Assert.DoesNotContain(logs, m => m.Contains(password));
        Assert.DoesNotContain(logs, m => m.Contains(code));
    }
}
