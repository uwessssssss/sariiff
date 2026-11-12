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

    // Shift by the offset without ever leaving DateTime's range (year 1 … 9999). Omitted
    // [FromQuery] dates arrive as 0001-01-01; "minus 3 hours" of that used to throw
    // "un-representable DateTime" and turn whole statements and reports into a 400.
    private static readonly long MaxShiftable = DateTime.MaxValue.Ticks - TimeSpan.TicksPerDay * 2; // room for AddDays(1)
    private static DateTime Shift(DateTime t, long deltaTicks, DateTimeKind kind) =>
        new(Math.Clamp(t.Ticks + deltaTicks, 0, MaxShiftable), kind);

    /// <summary>A stored (UTC) time as the bureau's wall-clock time, for text: SMS, receipts, CSV.</summary>
    public static DateTime ToLocal(DateTime utc) => Shift(AsUtc(utc), Offset.Ticks, DateTimeKind.Unspecified);

    public static DateTime LocalNow => ToLocal(DateTime.UtcNow);

    /// <summary>Today's calendar date at the bureau.</summary>
    public static DateTime TodayLocal => LocalNow.Date;

    /// <summary>The UTC instant at which a local calendar day starts (00:00 EAT = 21:00 UTC the day before).</summary>
    public static DateTime DayStartUtc(DateTime localDate) =>
        Shift(localDate.Date, -Offset.Ticks, DateTimeKind.Utc);

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
        // An omitted date (0001-01-01) or the far end of the calendar means "no limit".
        if (from is { } x && (x.Year <= 1 || x.Year >= 9999)) from = null;
        if (to is { } y && (y.Year <= 1 || y.Year >= 9999)) to = null;
        DateTime? f = from is { } a ? (IsDateOnly(a) ? DayStartUtc(a) : AsUtc(a)) : null;
        DateTime? t = to is { } b ? (IsDateOnly(b) ? DayStartUtc(b).AddDays(1) : Shift(AsUtc(b), 1, DateTimeKind.Utc)) : null;
        return (f, t);
    }

    private static bool IsDateOnly(DateTime d) => d.TimeOfDay == TimeSpan.Zero;
}
