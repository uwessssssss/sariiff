using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>The bureau's day is East Africa Time (UTC+3), not the UTC day.</summary>
public class BureauClockTests
{
    [Fact]
    public void A_local_day_starts_at_21_00_UTC_the_day_before()
    {
        var start = BureauClock.DayStartUtc(new DateTime(2026, 11, 7));
        Assert.Equal(new DateTime(2026, 11, 6, 21, 0, 0, DateTimeKind.Utc), start);
        Assert.Equal(DateTimeKind.Utc, start.Kind);
    }

    [Fact]
    public void A_date_range_covers_whole_local_days_including_the_end_day()
    {
        var (from, toEx) = BureauClock.Range(new DateTime(2026, 11, 1), new DateTime(2026, 11, 7));
        Assert.Equal(new DateTime(2026, 10, 31, 21, 0, 0, DateTimeKind.Utc), from);
        Assert.Equal(new DateTime(2026, 11, 7, 21, 0, 0, DateTimeKind.Utc), toEx);   // all of 7 Nov EAT

        // 01:30 EAT on 7 Nov is 22:30 UTC on 6 Nov: it belongs to 7 Nov.
        var lateNight = new DateTime(2026, 11, 6, 22, 30, 0, DateTimeKind.Utc);
        var (f7, t7) = BureauClock.Range(new DateTime(2026, 11, 7), new DateTime(2026, 11, 7));
        Assert.True(lateNight >= f7 && lateNight < t7);
    }

    [Fact]
    public void An_exact_time_is_kept_as_an_instant()
    {
        var at = new DateTime(2026, 11, 7, 10, 15, 0, DateTimeKind.Utc);
        var (from, toEx) = BureauClock.Range(at, at);
        Assert.Equal(at, from);
        Assert.Equal(at.AddTicks(1), toEx);
    }

    [Fact]
    public void Stored_times_print_as_bureau_time()
    {
        var stored = new DateTime(2026, 11, 6, 20, 7, 0, DateTimeKind.Unspecified); // as read from Postgres
        Assert.Equal(new DateTime(2026, 11, 6, 23, 7, 0), BureauClock.ToLocal(stored));
    }

    [Fact]
    public void A_month_starts_at_local_midnight_on_the_first()
    {
        Assert.Equal(new DateTime(2026, 10, 31, 21, 0, 0, DateTimeKind.Utc), BureauClock.MonthStartUtc(new DateTime(2026, 11, 18)));
    }
}
