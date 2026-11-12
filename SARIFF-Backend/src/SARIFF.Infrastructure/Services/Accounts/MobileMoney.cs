using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Which currency a mobile money wallet holds. It follows the NETWORK, not the bureau:
/// an M-Pesa wallet is Kenyan shillings even when a Ugandan bureau keeps one for
/// cross-border clients; MTN MoMo here is MTN Uganda (UGX); Airtel Money runs in both
/// countries, so it follows the bureau's home currency.
/// </summary>
public static class MobileMoney
{
    public static Currency DefaultCurrency(MobileMoneyProvider provider, Currency home) => provider switch
    {
        MobileMoneyProvider.MPesa => Currency.KES,
        MobileMoneyProvider.MtnMoMo => Currency.UGX,
        _ => home,
    };

    /// <summary>
    /// The wallet's currency. Wallets created before this field existed have none stored:
    /// they always meant the home currency, and keep meaning it (no balance changes).
    /// </summary>
    public static Currency CurrencyOf(MpesaAgent agent, Currency home) => agent.Currency ?? home;

    public static string Name(MobileMoneyProvider p) => p switch
    {
        MobileMoneyProvider.MPesa => "M-Pesa",
        MobileMoneyProvider.MtnMoMo => "MTN MoMo",
        MobileMoneyProvider.AirtelMoney => "Airtel Money",
        _ => "Mobile money",
    };

    /// <summary>
    /// One-time settling of wallets made before wallets had a currency (Currency = NULL).
    /// Safe by construction — no money is ever relabelled:
    ///  - the network's currency IS the home currency (MTN in Uganda, M-Pesa in Kenya): record it;
    ///  - an UNUSED wallet (no balance, no transactions): give it its network's currency;
    ///  - a USED wallet whose network currency differs (an M-Pesa wallet in a Ugandan bureau
    ///    that already holds UGX amounts): leave it as is and log it — a person decides.
    /// Runs at startup; does nothing once every wallet has a currency.
    /// </summary>
    public static async Task BackfillAsync(AppDbContext db, ILogger logger)
    {
        var pending = await db.MpesaAgents.IgnoreQueryFilters().Where(a => a.Currency == null).ToListAsync();
        if (pending.Count == 0) return;

        var homes = await db.Companies.IgnoreQueryFilters()
            .Select(c => new { c.Id, c.BaseCurrency }).ToDictionaryAsync(c => c.Id, c => c.BaseCurrency);
        var ids = pending.Select(a => a.Id).ToList();
        var used = (await db.Transactions.IgnoreQueryFilters()
                .Where(t => (t.SourceAccountType == AccountType.Mpesa && ids.Contains(t.SourceAccountId)) ||
                            (t.DestAccountType == AccountType.Mpesa && ids.Contains(t.DestAccountId)))
                .Select(t => t.SourceAccountType == AccountType.Mpesa ? t.SourceAccountId : t.DestAccountId)
                .ToListAsync()).ToHashSet();

        int set = 0, kept = 0;
        foreach (var a in pending)
        {
            var home = homes.TryGetValue(a.CompanyId, out var h) ? h : Currency.KES;
            var network = DefaultCurrency(a.Provider, home);
            var hasMoney = a.Balance != 0 || a.OpeningBalance != 0 || used.Contains(a.Id);
            if (network == home) { a.Currency = home; set++; }
            else if (!hasMoney) { a.Currency = network; set++; }
            else
            {
                kept++;
                logger.LogWarning("Mobile money wallet {Code} ({Provider}) holds {Home} amounts but its network uses {Network}. " +
                    "Left as {Home}; move the money to a new {Network} wallet if that's what it really is.",
                    a.Code, Name(a.Provider), home, network, home, network);
            }
        }
        await db.SaveChangesAsync();
        logger.LogInformation("Mobile money currencies: {Set} wallets set, {Kept} left for review", set, kept);
    }
}
