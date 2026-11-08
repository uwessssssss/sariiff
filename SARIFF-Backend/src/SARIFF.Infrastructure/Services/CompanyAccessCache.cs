using System.Collections.Concurrent;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Per-request "may this bureau use Sarif right now?" answers, cached for 30
/// seconds so the check costs one query per bureau per half-minute, not one per
/// request. Suspending a bureau invalidates its entry immediately.
/// </summary>
public static class CompanyAccessCache
{
    private static readonly ConcurrentDictionary<Guid, (string? Block, DateTime At)> Entries = new();
    public static readonly TimeSpan Ttl = TimeSpan.FromSeconds(30);

    public static bool TryGet(Guid companyId, out string? block)
    {
        if (Entries.TryGetValue(companyId, out var e) && DateTime.UtcNow - e.At < Ttl)
        {
            block = e.Block;
            return true;
        }
        block = null;
        return false;
    }

    public static void Set(Guid companyId, string? block) => Entries[companyId] = (block, DateTime.UtcNow);

    public static void Invalidate(Guid companyId) => Entries.TryRemove(companyId, out _);
}
