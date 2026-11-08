using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SARIFF.API;

/// <summary>
/// Every time the API stores is UTC (DateTime.UtcNow), but with Npgsql's legacy timestamp
/// mode a value read back from Postgres has Kind=Unspecified, so it went out as
/// "2026-11-06T20:07:05" with no "Z". Browsers and phones read that as LOCAL time, so in
/// Nairobi/Kampala (UTC+3) everything loaded from the database looked 3 hours old.
/// Writing with "Z" makes every screen convert to the viewer's own clock.
/// Reading is unchanged (services already normalise incoming dates).
/// </summary>
public sealed class UtcDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => reader.GetDateTime();

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        var utc = value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
        };
        writer.WriteStringValue(utc.ToString("yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'", CultureInfo.InvariantCulture));
    }
}
