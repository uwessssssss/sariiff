namespace SARIFF.Core.Enums;

/// <summary>
/// Per-currency facts in one place, so no service has to hard-code
/// "KES or else USD". Adding a currency = add the enum value + a line here.
/// </summary>
public static class CurrencyInfo
{
    /// <summary>Every supported currency, in enum order (KES, USD, UGX, EUR).</summary>
    public static readonly IReadOnlyList<Currency> All = Enum.GetValues<Currency>();

    public static string Code(Currency c) => c.ToString();

    /// <summary>
    /// Rough size of 1 KES in currency c, for scaling DEFAULT thresholds only
    /// (never for money maths): a "large transaction" of KES 500,000 is about
    /// UGX 14,000,000. Bureaus can override every threshold in Settings.
    /// </summary>
    public static decimal ScaleFromKes(Currency c) => c switch
    {
        Currency.KES => 1m,
        Currency.UGX => 28m,
        Currency.USD => 1m / 130m,
        Currency.EUR => 1m / 140m,
        _ => 1m
    };

    /// <summary>A default threshold expressed in KES, rounded in currency c.</summary>
    /// USD/EUR to whole units; KES/UGX to the nearest thousand. (Math.Round on a
    /// decimal cannot take negative digits — "-3" threw on every call.)
    public static decimal FromKes(decimal kesAmount, Currency c)
    {
        var value = kesAmount * ScaleFromKes(c);
        return c == Currency.USD || c == Currency.EUR
            ? Math.Round(value, 0, MidpointRounding.AwayFromZero)
            : Math.Round(value / 1000m, 0, MidpointRounding.AwayFromZero) * 1000m;
    }

    /// <summary>
    /// Balance below which a client gets a "low balance" warning. Roughly the
    /// same value in each currency (≈ KES 10,000) — a flat "100" would mean
    /// UGX 100 (≈ KES 3.50) and never fire.
    /// </summary>
    public static decimal LowBalanceThreshold(Currency c) => c switch
    {
        Currency.KES => 10_000m,
        Currency.USD => 100m,
        Currency.UGX => 300_000m,
        Currency.EUR => 100m,
        _ => 0m
    };

    /// <summary>
    /// Currencies a bureau may open accounts, trade, set rates or invoice in,
    /// by country. Kenya (KES home): KES, USD, EUR — no UGX. Uganda (UGX home):
    /// UGX, USD, KES, EUR — Kenyan shillings cross the border daily.
    /// Home currency first. Mirrored in the web and mobile apps.
    /// </summary>
    public static IReadOnlyList<Currency> AllowedFor(Currency home) => home == Currency.UGX
        ? new[] { Currency.UGX, Currency.USD, Currency.KES, Currency.EUR }
        : new[] { home, Currency.USD, Currency.EUR }.Distinct().ToArray();

    public static bool IsAllowed(Currency home, Currency c) => AllowedFor(home).Contains(c);

    /// <summary>Plain-language refusal, e.g. "UGX isn't used by bureaus in Kenya. Use KES, USD or EUR."</summary>
    public static string NotAllowedMessage(Currency home, Currency c)
    {
        var country = home == Currency.UGX ? "Uganda" : "Kenya";
        var list = AllowedFor(home).Select(Code).ToList();
        var options = list.Count > 1 ? string.Join(", ", list.Take(list.Count - 1)) + " or " + list[^1] : list[0];
        return $"{Code(c)} isn't used by bureaus in {country}. Use {options}.";
    }
}
