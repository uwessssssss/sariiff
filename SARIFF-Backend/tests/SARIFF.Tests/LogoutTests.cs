using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>
/// Logging out ends only that person's sessions. Before (Nov 2026) an office logout matched
/// "CompanyId == bureau id" and so also revoked every client session of the bureau.
/// </summary>
public class LogoutTests
{
    private static UserSession Session(Guid? companyId, Guid? userId, UserRole role) => new()
    {
        CompanyId = companyId, UserId = userId, UserRole = role,
        RefreshTokenHash = Guid.NewGuid().ToString(), ExpiresAt = DateTime.UtcNow.AddDays(7), IpAddress = "127.0.0.1",
    };

    [Fact]
    public async Task Office_logout_keeps_the_bureaus_clients_signed_in()
    {
        var db = TestDb.InMemory();
        var bureau = Guid.NewGuid(); var client1 = Guid.NewGuid(); var client2 = Guid.NewGuid();
        db.UserSessions.AddRange(
            Session(bureau, bureau, UserRole.OfficeUser),
            Session(bureau, bureau, UserRole.OfficeUser),   // second office device
            Session(bureau, client1, UserRole.Client),
            Session(bureau, client2, UserRole.Client));
        await db.SaveChangesAsync();
        var auth = new AuthService(db, new FakeConfig(), NoOp<INotificationService>.Create(), new CapturingSms(), NullLogger<AuthService>.Instance);

        await auth.LogoutAsync(bureau, UserRole.OfficeUser);

        var live = await db.UserSessions.Where(s => !s.IsRevoked).ToListAsync();
        Assert.DoesNotContain(live, s => s.UserRole == UserRole.OfficeUser);
        Assert.Equal(2, live.Count(s => s.UserRole == UserRole.Client));
    }

    [Fact]
    public async Task Client_logout_ends_only_that_clients_sessions()
    {
        var db = TestDb.InMemory();
        var bureau = Guid.NewGuid(); var me = Guid.NewGuid(); var other = Guid.NewGuid();
        db.UserSessions.AddRange(
            Session(bureau, bureau, UserRole.OfficeUser),
            Session(bureau, me, UserRole.Client),
            Session(bureau, other, UserRole.Client));
        await db.SaveChangesAsync();
        var auth = new AuthService(db, new FakeConfig(), NoOp<INotificationService>.Create(), new CapturingSms(), NullLogger<AuthService>.Instance);

        await auth.LogoutAsync(me, UserRole.Client);

        var live = await db.UserSessions.Where(s => !s.IsRevoked).ToListAsync();
        Assert.DoesNotContain(live, s => s.UserId == me);
        Assert.Contains(live, s => s.UserId == other);
        Assert.Contains(live, s => s.UserRole == UserRole.OfficeUser);
    }

    [Fact]
    public void Signed_in_cache_is_reset_by_a_new_session()
    {
        var who = Guid.NewGuid();
        SessionAliveCache.Set(who, "Client", false);
        Assert.True(SessionAliveCache.TryGet(who, "Client", out var alive) && !alive);
        SessionAliveCache.Invalidate(who, "Client");
        Assert.False(SessionAliveCache.TryGet(who, "Client", out _));
    }
}
