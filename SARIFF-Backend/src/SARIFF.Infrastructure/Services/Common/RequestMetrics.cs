namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Live request numbers for the super-admin System screen: requests per minute,
/// average response time and server-error rate over the last few minutes, for
/// THIS API instance. One bucket per minute, ten buckets, guarded by one lock —
/// a few nanoseconds per request.
/// </summary>
public static class RequestMetrics
{
    private const int Buckets = 10;
    public const int WindowMinutes = 5;

    private sealed class Bucket { public long Minute = -1; public long Count; public long Errors; public long TotalMs; }

    private static readonly Bucket[] _buckets = Enumerable.Range(0, Buckets).Select(_ => new Bucket()).ToArray();
    private static readonly object _gate = new();

    private static long MinuteOf(DateTime utc) => utc.Ticks / TimeSpan.TicksPerMinute;

    /// <summary>Record one finished request. Only 5xx counts as an error (a 4xx is the caller's mistake, not ours).</summary>
    public static void Record(long elapsedMs, int statusCode, DateTime? utcNow = null)
    {
        var minute = MinuteOf(utcNow ?? DateTime.UtcNow);
        lock (_gate)
        {
            var b = _buckets[minute % Buckets];
            if (b.Minute != minute) { b.Minute = minute; b.Count = 0; b.Errors = 0; b.TotalMs = 0; }
            b.Count++;
            b.TotalMs += elapsedMs;
            if (statusCode >= 500) b.Errors++;
        }
    }

    /// <summary>Averages over the last <see cref="WindowMinutes"/> minutes (current minute included).</summary>
    public static (int RequestsPerMinute, int AvgResponseMs, decimal ErrorRatePercent, long Requests) Snapshot(DateTime? utcNow = null)
    {
        var now = MinuteOf(utcNow ?? DateTime.UtcNow);
        long count = 0, errors = 0, totalMs = 0;
        lock (_gate)
        {
            foreach (var b in _buckets)
            {
                if (b.Minute > now - WindowMinutes && b.Minute <= now)
                {
                    count += b.Count; errors += b.Errors; totalMs += b.TotalMs;
                }
            }
        }
        if (count == 0) return (0, 0, 0m, 0);
        return (
            (int)Math.Ceiling(count / (double)WindowMinutes),
            (int)(totalMs / count),
            Math.Round(errors * 100m / count, 2),
            count);
    }

    /// <summary>Tests only.</summary>
    internal static void Reset()
    {
        lock (_gate) foreach (var b in _buckets) { b.Minute = -1; b.Count = 0; b.Errors = 0; b.TotalMs = 0; }
    }
}
