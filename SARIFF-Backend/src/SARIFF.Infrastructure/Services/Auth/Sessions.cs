using Microsoft.EntityFrameworkCore;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Ends open sessions when the reason they were opened no longer holds: a password was
/// changed or reset, a client was archived or deleted, a bureau was switched off.
///
/// Before Nov 2026 none of those ended anything. A session opened with the OLD password kept
/// refreshing itself for as long as it liked (so resetting a leaked password locked nobody
/// out), and an archived client's portal kept working until the access token ran out.
/// </summary>
public static class Sessions
{
    /// <summary>Every open session of one client or super admin (a Users row).</summary>
    public static async Task EndForUserAsync(AppDbContext db, Guid userId, UserRole role)
    {
        var open = await db.UserSessions.Where(s => s.UserId == userId && s.UserRole == role && !s.IsRevoked).ToListAsync();
        foreach (var s in open) s.IsRevoked = true;
        if (open.Count > 0) await db.SaveChangesAsync();
        SessionAliveCache.Invalidate(userId, role.ToString());   // refused on the next request, not in 30 seconds
    }

    /// <summary>Every open office session of a bureau, and the devices that skip the SMS code.
    /// Its clients' sessions are untouched.</summary>
    public static async Task EndForOfficeAsync(AppDbContext db, Guid companyId)
    {
        var open = await db.UserSessions
            .Where(s => s.CompanyId == companyId && s.UserRole == UserRole.OfficeUser && !s.IsRevoked).ToListAsync();
        foreach (var s in open) s.IsRevoked = true;
        var devices = await db.TrustedDevices.Where(d => d.UserId == companyId).ToListAsync();
        db.TrustedDevices.RemoveRange(devices);
        if (open.Count > 0 || devices.Count > 0) await db.SaveChangesAsync();
        SessionAliveCache.Invalidate(companyId, UserRole.OfficeUser.ToString());
    }
}
