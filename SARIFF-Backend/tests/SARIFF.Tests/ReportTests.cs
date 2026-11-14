using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Services;
using Xunit;
using static SARIFF.Tests.Bureau;

namespace SARIFF.Tests;

/// <summary>The daily report shows each day's own opening and closing balances.</summary>
public class ReportTests
{
    private static DateTime Day(int daysAgo) => BureauClock.TodayLocal.AddDays(-daysAgo);
    private static DateTime Noon(int daysAgo) => BureauClock.DayStartUtc(Day(daysAgo)).AddHours(12);

    [Fact]
    public async Task A_past_days_report_opens_and_closes_on_that_days_balances()
    {
        var b = await CreateAsync();
        var txns = b.Transactions();
        // 3 days ago: Amina deposits 1,000 cash.  2 days ago: 200 of it is banked.  Today: Baraka deposits 500.
        Assert.True((await txns.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 1_000, date: Noon(3)))).Success);
        Assert.True((await txns.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Cash, b.Cash.Id, AccountType.Bank, b.Bank.Id, 200, date: Noon(2)))).Success);
        Assert.True((await txns.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Baraka.Id, AccountType.Cash, b.Cash.Id, 500, date: DateTime.UtcNow))).Success);
        Assert.Equal(1_300m, b.Cash.Balance);
        Assert.Equal(200m, b.Bank.Balance);
        var reports = new ReportService(b.Db, txns);

        var d3 = (await reports.GetDailyReportAsync(b.Co, Day(3))).Data!;
        Assert.Equal(0m, d3.OpeningBalances.CashKES);
        Assert.Equal(1_000m, d3.ClosingBalances.CashKES);
        Assert.Equal(0m, d3.ClosingBalances.BankKES);
        Assert.Single(d3.Transactions);

        var d2 = (await reports.GetDailyReportAsync(b.Co, Day(2))).Data!;
        Assert.Equal(1_000m, d2.OpeningBalances.CashKES);
        Assert.Equal(800m, d2.ClosingBalances.CashKES);
        Assert.Equal(0m, d2.OpeningBalances.BankKES);
        Assert.Equal(200m, d2.ClosingBalances.BankKES);

        var d1 = (await reports.GetDailyReportAsync(b.Co, Day(1))).Data!;   // a quiet day: nothing moves
        Assert.Equal(800m, d1.OpeningBalances.CashKES);
        Assert.Equal(800m, d1.ClosingBalances.CashKES);
        Assert.Empty(d1.Transactions);

        var today = (await reports.GetDailyReportAsync(b.Co, Day(0))).Data!;
        Assert.Equal(800m, today.OpeningBalances.CashKES);
        Assert.Equal(b.Cash.Balance, today.ClosingBalances.CashKES);   // today closes on the live balance
        Assert.Equal(b.Bank.Balance, today.ClosingBalances.BankKES);

        // the report must not have changed the real accounts
        Assert.Equal(1_300m, b.Cash.Balance);
        Assert.Equal(0m, b.Cash.OpeningBalance);
    }

    [Fact]
    public async Task Each_days_closing_is_the_next_days_opening_in_every_currency()
    {
        var b = await CreateAsync();
        var txns = b.Transactions();
        Assert.True((await txns.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.CashUsd.Id, 300, Currency.USD, date: Noon(2)))).Success);
        // a dollar deposit paid out of the shilling wallet's side: USD 50 to Amina, KES 6,500 into the wallet
        Assert.True((await txns.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Mpesa, b.Wallet.Id, 50, Currency.USD,
            counterAmount: 6_500, counterCurrency: Currency.KES, rate: 130, date: Noon(1)))).Success);
        var reports = new ReportService(b.Db, txns);

        var d2 = (await reports.GetDailyReportAsync(b.Co, Day(2))).Data!;
        var d1 = (await reports.GetDailyReportAsync(b.Co, Day(1))).Data!;
        var d0 = (await reports.GetDailyReportAsync(b.Co, Day(0))).Data!;

        Assert.Equal(300m, d2.ClosingBalances.CashUSD);
        Assert.Equal(d2.ClosingBalances.CashUSD, d1.OpeningBalances.CashUSD);
        Assert.Equal(0m, d1.OpeningBalances.Mpesa);
        Assert.Equal(6_500m, d1.ClosingBalances.Mpesa);
        Assert.Equal(d1.ClosingBalances.Mpesa, d0.OpeningBalances.Mpesa);
        Assert.Equal(b.Wallet.Balance, d0.ClosingBalances.Mpesa);
    }
}
