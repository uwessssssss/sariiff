using System.Collections.Concurrent;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// "Is this person still signed in?" per request, cached for 30 seconds.
///
/// Before (found Nov 2026): logging out only revoked the refresh token, so the access token
/// kept working for up to 60 minutes after "Log out" — a stolen or shared-computer token
/// stayed usable. Now every request from a super admin, office user or client needs at
/// least one live session for that person. Logging in, refreshing and logging out reset
/// the entry at once, so a new sign-in is never refused and a sign-out takes effect on
/// the next request (on this server; other servers within 30 seconds).
/// </summary>
public static class SessionAliveCache
{
    private static readonly ConcurrentDictionary<(Guid, string), (bool Alive, DateTime At)> Entries = new();
    public static readonly TimeSpan Ttl = TimeSpan.FromSeconds(30);

    public static bool TryGet(Guid principal, string role, out bool alive)
    {
        if (Entries.TryGetValue((principal, role), out var e) && DateTime.UtcNow - e.At < Ttl)
        {
            alive = e.Alive;
            return true;
        }
        alive = false;
        return false;
    }

    public static void Set(Guid principal, string role, bool alive) => Entries[(principal, role)] = (alive, DateTime.UtcNow);

    public static void Invalidate(Guid principal, string role) => Entries.TryRemove((principal, role), out _);
}
