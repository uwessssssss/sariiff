namespace SARIFF.Infrastructure.Services;

/// <summary>
/// The bureau's clock. Everything is STORED in UTC, but a bureau's day, month and year
/// are local: Kenya and Uganda are both East Africa Time (UTC+3, no daylight saving).
/// Before this, "today" was the UTC day, so from 00:00 to 03:00 in Nairobi/Kampala the
/// daily summary, "today" totals and date filters all landed on yesterday.
///
/// Override with BUREAU_TIMEZONE (an IANA id, e.g. "Africa/Kigali") if a bureau outside
/// EAT is ever added.
/// </summary>
public static class BureauClock
{
    public static readonly TimeSpan Offset = ResolveOffset();

    private static TimeSpan ResolveOffset()
    {
        var id = Environment.GetEnvironmentVariable("BUREAU_TIMEZONE");
        if (string.IsNullOrWhiteSpace(id)) id = "Africa/Nairobi";
        try { return TimeZoneInfo.FindSystemTimeZoneById(id).BaseUtcOffset; }
        catch { return TimeSpan.FromHours(3); } // container without tz data: EAT
    }

    private static DateTime AsUtc(DateTime t) => t.Kind switch
    {
        DateTimeKind.Utc => t,
        DateTimeKind.Local => t.ToUniversalTime(),
        _ => DateTime.SpecifyKind(t, DateTimeKind.Utc), // stored values are UTC
    };

    /// <summary>A stored (UTC) time as the bureau's wall-clock time, for text: SMS, receipts, CSV.</summary>
    public static DateTime ToLocal(DateTime utc) => DateTime.SpecifyKind(AsUtc(utc) + Offset, DateTimeKind.Unspecified);

    public static DateTime LocalNow => ToLocal(DateTime.UtcNow);

    /// <summary>Today's calendar date at the bureau.</summary>
    public static DateTime TodayLocal => LocalNow.Date;

    /// <summary>The UTC instant at which a local calendar day starts (00:00 EAT = 21:00 UTC the day before).</summary>
    public static DateTime DayStartUtc(DateTime localDate) =>
        DateTime.SpecifyKind(localDate.Date - Offset, DateTimeKind.Utc);

    public static DateTime TodayStartUtc => DayStartUtc(TodayLocal);

    /// <summary>The UTC instant at which this local month starts.</summary>
    public static DateTime MonthStartUtc(DateTime localDate) =>
        DayStartUtc(new DateTime(localDate.Year, localDate.Month, 1));

    /// <summary>
    /// A date-range filter from the apps as UTC bounds: [from, toExclusive).
    /// A plain date ("2026-11-06", no time) is a local calendar day and the end day is
    /// INCLUDED in full. A value with a time of day is an exact instant and kept as is.
    /// </summary>
    public static (DateTime? From, DateTime? ToExclusive) Range(DateTime? from, DateTime? to)
    {
        DateTime? f = from is { } a ? (IsDateOnly(a) ? DayStartUtc(a) : AsUtc(a)) : null;
        DateTime? t = to is { } b ? (IsDateOnly(b) ? DayStartUtc(b).AddDays(1) : AsUtc(b).AddTicks(1)) : null;
        return (f, t);
    }

    private static bool IsDateOnly(DateTime d) => d.TimeOfDay == TimeSpan.Zero;
}
