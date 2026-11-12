using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>Per-currency roll-ups shared by reports and dashboards.</summary>
internal static class CurrencyRollup
{
    /// <summary>Cash + bank per currency (every currency held, KES/USD included).</summary>
    public static List<CurrencyCashBankDto> CashBank(
        IEnumerable<CashAccount> cash, IEnumerable<BankAccount> banks, bool opening)
    {
        var cashList = cash.ToList();
        var bankList = banks.ToList();
        return cashList.Select(c => c.Currency).Concat(bankList.Select(b => b.Currency))
            .Distinct().OrderBy(c => c)
            .Select(cur => new CurrencyCashBankDto(cur, CurrencyInfo.Code(cur),
                cashList.Where(c => c.Currency == cur).Sum(c => opening ? c.OpeningBalance : c.Balance),
                bankList.Where(b => b.Currency == cur).Sum(b => opening ? b.OpeningBalance : b.Balance)))
            .ToList();
    }

    /// <summary>Mobile money per wallet currency (M-Pesa KES and MTN UGX are never added together).</summary>
    public static List<CurrencyAmountDto> Wallets(IEnumerable<MpesaAgent> agents, Currency home, bool opening) =>
        agents.GroupBy(a => MobileMoney.CurrencyOf(a, home)).OrderBy(g => g.Key)
            .Select(g => new CurrencyAmountDto(g.Key, CurrencyInfo.Code(g.Key), g.Sum(a => opening ? a.OpeningBalance : a.Balance)))
            .ToList();

    /// <summary>The single "mobile money" figure older screens show: home-currency wallets only.</summary>
    public static decimal HomeWallets(IEnumerable<MpesaAgent> agents, Currency home, bool opening) =>
        agents.Where(a => MobileMoney.CurrencyOf(a, home) == home).Sum(a => opening ? a.OpeningBalance : a.Balance);
}
