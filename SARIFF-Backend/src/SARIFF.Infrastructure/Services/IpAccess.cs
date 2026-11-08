using System.Net;
using Microsoft.EntityFrameworkCore;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Enforces the super admin's Security screen: blocked IPs, and the optional admin
/// IP allow-list. Both lists used to be stored and shown but never checked, so a
/// "blocked" IP kept full access.
///
/// The lists are cached for <see cref="CacheFor"/> and reloaded after any change made
/// on this instance (<see cref="Invalidate"/>); another instance picks a change up
/// within that time.
/// </summary>
public static class IpAccess
{
    public static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(30);

    private sealed record Snapshot(DateTime LoadedAt, List<(string Ip, DateTime? Until, string Reason)> Blocked, HashSet<string> AdminAllowed);

    private static Snapshot? _snapshot;
    private static readonly SemaphoreSlim _gate = new(1, 1);

    /// <summary>"::ffff:1.2.3.4" and "1.2.3.4" are the same client; compare one form.</summary>
    public static string Normalize(string? ip)
    {
        if (string.IsNullOrWhiteSpace(ip) || !IPAddress.TryParse(ip.Trim(), out var a)) return (ip ?? "").Trim();
        if (a.IsIPv4MappedToIPv6) a = a.MapToIPv4();
        return a.ToString();
    }

    public static bool IsValid(string? ip) => !string.IsNullOrWhiteSpace(ip) && IPAddress.TryParse(ip.Trim(), out _);

    public static void Invalidate() => _snapshot = null;

    private static async Task<Snapshot> LoadAsync(AppDbContext db, DateTime now)
    {
        var s = _snapshot;
        if (s != null && now - s.LoadedAt < CacheFor) return s;
        await _gate.WaitAsync();
        try
        {
            s = _snapshot;
            if (s != null && now - s.LoadedAt < CacheFor) return s;
            var blocked = (await db.BlockedIPs.AsNoTracking()
                    .Where(b => b.IsActive && !b.IsDeleted)
                    .Select(b => new { b.IpAddress, b.BlockedUntil, b.Reason })
                    .ToListAsync())
                .Select(b => (Normalize(b.IpAddress), b.BlockedUntil, b.Reason)).ToList();
            var allowed = (await db.AdminIpWhitelists.AsNoTracking()
                    .Where(w => w.IsActive && !w.IsDeleted)
                    .Select(w => w.IpAddress)
                    .ToListAsync())
                .Select(Normalize).ToHashSet();
            _snapshot = s = new Snapshot(now, blocked, allowed);
            return s;
        }
        finally { _gate.Release(); }
    }

    /// <summary>The block reason when this IP is blocked right now; null when it may pass.</summary>
    public static async Task<string?> BlockedReasonAsync(AppDbContext db, string? ip, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        var n = Normalize(ip);
        var s = await LoadAsync(db, now);
        var hit = s.Blocked.FirstOrDefault(b => b.Ip == n && (b.Until == null || b.Until > now));
        return hit.Ip == null ? null : (string.IsNullOrWhiteSpace(hit.Reason) ? "blocked" : hit.Reason);
    }

    /// <summary>May this IP use the super admin API? Always true while the allow-list is empty.</summary>
    public static async Task<bool> AdminAllowedAsync(AppDbContext db, string? ip, DateTime? utcNow = null)
    {
        var s = await LoadAsync(db, utcNow ?? DateTime.UtcNow);
        return s.AdminAllowed.Count == 0 || s.AdminAllowed.Contains(Normalize(ip));
    }

    /// <summary>Is the allow-list in force (any active entry)?</summary>
    public static async Task<bool> AllowListActiveAsync(AppDbContext db) =>
        (await LoadAsync(db, DateTime.UtcNow)).AdminAllowed.Count > 0;
}
