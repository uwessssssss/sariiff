namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Safe CSV text cells: always quoted, embedded quotes doubled, and a leading
/// = + - @ (or tab/CR) prefixed with ' so Excel shows it as text instead of
/// running it as a formula ("CSV injection"). Use for TEXT only — numbers stay raw.
/// </summary>
public static class CsvText
{
    public static string Cell(object? value)
    {
        var s = value?.ToString() ?? "";
        if (s.Length > 0 && "=+-@\t\r".IndexOf(s[0]) >= 0) s = "'" + s;
        return "\"" + s.Replace("\"", "\"\"") + "\"";
    }
}
