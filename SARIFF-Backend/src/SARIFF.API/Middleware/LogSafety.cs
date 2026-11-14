using Serilog.Core;
using Serilog.Events;

namespace SARIFF.API.Middleware;

/// <summary>
/// Log forging guard: a value a user typed (a phone number, a code, a search) can't start a new
/// line in the log, so nobody can fake a log entry. Line breaks inside logged values are written
/// as \r and \n. Exceptions and their stack traces are not touched.
/// </summary>
public sealed class StripNewlinesEnricher : ILogEventEnricher
{
    public void Enrich(LogEvent logEvent, ILogEventPropertyFactory propertyFactory)
    {
        foreach (var p in logEvent.Properties.ToList())
        {
            if (p.Value is ScalarValue { Value: string s } && (s.Contains('\n') || s.Contains('\r')))
                logEvent.AddOrUpdateProperty(new LogEventProperty(p.Key, new ScalarValue(s.Replace("\r", "\\r").Replace("\n", "\\n"))));
        }
    }
}
