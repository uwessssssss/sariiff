using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Services;
using Xunit;
using static SARIFF.Tests.Bureau;

namespace SARIFF.Tests;

/// <summary>
/// What a signed-in client sees of their own account: the transaction list, the statement and
/// the analytics. Every number here is one the client can check against their balance, so each
/// test works the expected figure out by hand.
/// </summary>
public class ClientPortalTests
{
    private static ClientPortalService Portal(Bureau b) => new(b.Db);
    private static DateTime DaysAgo(int days) => DateTime.UtcNow.AddDays(-days);

    private static Task<ApiResponse<TransactionResponseDto>> Deposit(Bureau b, decimal amount, int daysAgo, string description = "deposit") =>
        b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, amount, description: description, date: DaysAgo(daysAgo)));

    /// <summary>The till takes KES 13,000 and Amina's account is credited USD 100: she is the
    /// second (counter) side of the posting, and her side is in dollars.</summary>
    private static async Task DollarsReceivedOnTheCounterSide(Bureau b)
    {
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Debit, AccountType.Cash, b.Cash.Id, AccountType.Client, b.Amina.Id, 13_000, Currency.KES,
                counterAmount: 100, counterCurrency: Currency.USD, rate: 130, date: DaysAgo(1)));
        Assert.True(r.Success, r.Message);
        Assert.Equal(100m, b.Amina.BalanceUSD);
        Assert.Equal(0m, b.Amina.BalanceKES);
    }

    // ---------- transaction list

    [Fact]
    public async Task The_first_page_of_transactions_is_the_newest()
    {
        var b = await CreateAsync();
        for (var i = 1; i <= 5; i++) Assert.True((await Deposit(b, 100m * i, daysAgo: 6 - i)).Success);   // 100 oldest … 500 newest

        var page1 = (await Portal(b).GetTransactionsAsync(b.Co, b.Amina.Id, 1, 2, new TransactionFilters())).Data!;
        var page3 = (await Portal(b).GetTransactionsAsync(b.Co, b.Amina.Id, 3, 2, new TransactionFilters())).Data!;

        Assert.Equal(5, page1.TotalCount);
        Assert.Equal(new[] { 500m, 400m }, page1.Items.Select(t => t.Amount).ToArray());
        Assert.Equal(new[] { 100m }, page3.Items.Select(t => t.Amount).ToArray());
        // the newest line ends on the client's balance: 100+200+300+400+500
        Assert.Equal(1_500m, page1.Items[0].BalanceAfter);
        Assert.Equal(1_000m, page1.Items[0].BalanceBefore);
        Assert.Equal(b.Amina.BalanceKES, page1.Items[0].BalanceAfter);
    }

    [Fact]
    public async Task A_search_keeps_each_lines_real_balance()
    {
        var b = await CreateAsync();
        Assert.True((await Deposit(b, 100, 3, "salary")).Success);
        Assert.True((await Deposit(b, 200, 2, "rent refund")).Success);
        Assert.True((await Deposit(b, 300, 1, "salary")).Success);

        var found = (await Portal(b).GetTransactionsAsync(b.Co, b.Amina.Id, 1, 10, new TransactionFilters { Search = "rent" })).Data!;

        var line = Assert.Single(found.Items);
        Assert.Equal(100m, line.BalanceBefore);   // the salary before it is still in the balance
        Assert.Equal(300m, line.BalanceAfter);
    }

    [Fact]
    public async Task The_type_filter_means_money_in_or_out_for_the_client()
    {
        var b = await CreateAsync();
        // Amina is the second side: the posting is a "Debit" of the till, which is money IN for her.
        Assert.True((await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Debit, AccountType.Cash, b.Cash.Id, AccountType.Client, b.Amina.Id, 700, date: DaysAgo(1)))).Success);
        Assert.Equal(700m, b.Amina.BalanceKES);

        var credits = (await Portal(b).GetTransactionsAsync(b.Co, b.Amina.Id, 1, 10, new TransactionFilters { Type = TransactionType.Credit })).Data!;
        var debits = (await Portal(b).GetTransactionsAsync(b.Co, b.Amina.Id, 1, 10, new TransactionFilters { Type = TransactionType.Debit })).Data!;

        Assert.Equal("Credit", Assert.Single(credits.Items).Type);
        Assert.Empty(debits.Items);
    }

    [Fact]
    public async Task The_currency_filter_follows_the_clients_own_side()
    {
        var b = await CreateAsync();
        await DollarsReceivedOnTheCounterSide(b);

        var usd = (await Portal(b).GetTransactionsAsync(b.Co, b.Amina.Id, 1, 10, new TransactionFilters { Currency = Currency.USD })).Data!;
        var kes = (await Portal(b).GetTransactionsAsync(b.Co, b.Amina.Id, 1, 10, new TransactionFilters { Currency = Currency.KES })).Data!;

        var line = Assert.Single(usd.Items);
        Assert.Equal(Currency.USD, line.Currency);
        Assert.Equal(100m, line.Amount);
        Assert.Equal(100m, line.BalanceAfter);
        Assert.Empty(kes.Items);   // she never held shillings
    }

    // ---------- statement

    [Fact]
    public async Task A_dollar_statement_includes_dollars_received_on_the_counter_side()
    {
        var b = await CreateAsync();
        await DollarsReceivedOnTheCounterSide(b);
        var from = BureauClock.TodayLocal.AddDays(-30); var to = BureauClock.TodayLocal;

        var usd = (await Portal(b).GetStatementAsync(b.Co, b.Amina.Id, from, to, Currency.USD)).Data!;
        var kes = (await Portal(b).GetStatementAsync(b.Co, b.Amina.Id, from, to, Currency.KES)).Data!;

        Assert.Single(usd.Transactions);
        Assert.Equal(100m, usd.TotalCredits);
        Assert.Equal(b.Amina.BalanceUSD, usd.ClosingBalance);   // statement closes on the balance
        Assert.Empty(kes.Transactions);                         // no dollar line on a shilling statement
        Assert.Equal(b.Amina.BalanceKES, kes.ClosingBalance);
    }

    [Fact]
    public async Task A_statement_opens_on_what_came_before_the_period_on_either_side()
    {
        var b = await CreateAsync();
        // 40 days ago: USD 100 lands on her counter side. 2 days ago: she deposits USD 25 directly.
        Assert.True((await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Debit, AccountType.Cash, b.Cash.Id, AccountType.Client, b.Amina.Id, 13_000, Currency.KES,
                counterAmount: 100, counterCurrency: Currency.USD, rate: 130, date: DaysAgo(40)))).Success);
        Assert.True((await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.CashUsd.Id, 25, Currency.USD, date: DaysAgo(2)))).Success);

        var st = (await Portal(b).GetStatementAsync(b.Co, b.Amina.Id, BureauClock.TodayLocal.AddDays(-10), BureauClock.TodayLocal, Currency.USD)).Data!;

        Assert.Equal(100m, st.OpeningBalance);
        Assert.Equal(125m, st.ClosingBalance);
        Assert.Equal(b.Amina.BalanceUSD, st.ClosingBalance);
    }

    [Fact]
    public async Task The_csv_export_filters_by_the_clients_own_currency()
    {
        var b = await CreateAsync();
        await DollarsReceivedOnTheCounterSide(b);

        var usd = System.Text.Encoding.UTF8.GetString(await Portal(b).ExportTransactionsCsvAsync(b.Co, b.Amina.Id, null, null, Currency.USD));
        var kes = System.Text.Encoding.UTF8.GetString(await Portal(b).ExportTransactionsCsvAsync(b.Co, b.Amina.Id, null, null, Currency.KES));

        Assert.Equal(2, usd.Split('\n', StringSplitOptions.RemoveEmptyEntries).Length);   // header + her dollar line
        Assert.Single(kes.Split('\n', StringSplitOptions.RemoveEmptyEntries));            // header only
    }

    // ---------- analytics

    [Fact]
    public async Task Analytics_totals_cover_exactly_the_months_shown()
    {
        var b = await CreateAsync();
        var lastMonth = BureauClock.MonthStartUtc(BureauClock.TodayLocal).AddDays(-10);   // safely inside last month
        Assert.True((await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 9_000, date: lastMonth))).Success);
        Assert.True((await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 400, date: DateTime.UtcNow))).Success);

        var one = (await Portal(b).GetAnalyticsAsync(b.Co, b.Amina.Id, 1)).Data!;   // this month only
        var two = (await Portal(b).GetAnalyticsAsync(b.Co, b.Amina.Id, 2)).Data!;   // this month and last

        Assert.Single(one.MonthlyData);
        Assert.Equal(one.MonthlyData.Sum(m => m.IncomeKES - m.ExpensesKES), one.Totals.NetIncomeKES);
        Assert.Equal(400m, one.Totals.NetIncomeKES);
        Assert.Equal(1, one.Totals.TotalTransactions);
        Assert.Equal(9_400m, two.Totals.NetIncomeKES);
        Assert.Equal(two.MonthlyData.Sum(m => m.IncomeKES - m.ExpensesKES), two.Totals.NetIncomeKES);
    }

    [Fact]
    public async Task Analytics_and_the_dashboard_count_other_currencies_received_on_the_counter_side()
    {
        var b = await CreateAsync(Currency.UGX);
        // Baraka pays KES 1,000 out of his account; Amina's account is credited UGX 28,000.
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Debit, AccountType.Client, b.Baraka.Id, AccountType.Client, b.Amina.Id, 1_000, Currency.KES,
                counterAmount: 28_000, counterCurrency: Currency.UGX, rate: 28, date: DateTime.UtcNow));
        Assert.True(r.Success, r.Message);

        var analytics = (await Portal(b).GetAnalyticsAsync(b.Co, b.Amina.Id, 1)).Data!;
        var dashboard = (await Portal(b).GetDashboardAsync(b.Co, b.Amina.Id)).Data!;

        var ugx = Assert.Single(analytics.Totals.OtherCurrencies);
        Assert.Equal(Currency.UGX, ugx.Currency);
        Assert.Equal(28_000m, ugx.Income);
        Assert.Equal(0m, analytics.Totals.NetIncomeKES);   // the shillings were Baraka's, not hers
        var month = Assert.Single(dashboard.QuickStats.ThisMonthOtherCurrencies);
        Assert.Equal(Currency.UGX, month.Currency);
        Assert.Equal(28_000m, month.Income);
    }

    // ---------- alerts and profile

    [Fact]
    public async Task Alerts_are_counted_read_and_never_shown_to_another_client()
    {
        var b = await CreateAsync();
        b.Db.Set<ClientAlert>().AddRange(
            new ClientAlert { CompanyId = b.Co, ClientId = b.Amina.Id, Type = "info", Title = "One", Message = "1" },
            new ClientAlert { CompanyId = b.Co, ClientId = b.Amina.Id, Type = "info", Title = "Two", Message = "2" },
            new ClientAlert { CompanyId = b.Co, ClientId = b.Baraka.Id, Type = "info", Title = "Not hers", Message = "3" });
        await b.Db.SaveChangesAsync();
        var portal = Portal(b);

        Assert.Equal(2, (await portal.GetUnreadCountAsync(b.Co, b.Amina.Id)).Data);
        var barakas = b.Db.Set<ClientAlert>().Single(a => a.ClientId == b.Baraka.Id);
        Assert.False((await portal.MarkAlertAsReadAsync(b.Co, b.Amina.Id, barakas.Id)).Success);   // not her alert
        Assert.False(barakas.IsRead);

        Assert.True((await portal.MarkAllAlertsAsReadAsync(b.Co, b.Amina.Id)).Success);
        Assert.Equal(0, (await portal.GetUnreadCountAsync(b.Co, b.Amina.Id)).Data);
        Assert.Equal(1, (await portal.GetUnreadCountAsync(b.Co, b.Baraka.Id)).Data);
        Assert.Empty((await portal.GetAlertsAsync(b.Co, b.Amina.Id, 1, 10, unreadOnly: true)).Data!.Items);
        Assert.Equal(2, (await portal.GetAlertsAsync(b.Co, b.Amina.Id, 1, 10, unreadOnly: false)).Data!.TotalCount);
    }

    [Fact]
    public async Task A_client_cannot_take_another_clients_number_and_another_bureau_sees_nothing()
    {
        var b = await CreateAsync();
        var portal = Portal(b);

        var taken = await portal.UpdateProfileAsync(b.Co, b.Amina.Id, new UpdateClientProfileDto { WhatsAppNumber = b.Baraka.WhatsAppNumber });
        Assert.False(taken.Success);
        Assert.Equal("+254700000001", b.Amina.WhatsAppNumber);

        var otherBureau = Guid.NewGuid();
        Assert.False((await portal.GetProfileAsync(otherBureau, b.Amina.Id)).Success);
        Assert.False((await portal.GetDashboardAsync(otherBureau, b.Amina.Id)).Success);
        Assert.False((await portal.GetStatementAsync(otherBureau, b.Amina.Id, BureauClock.TodayLocal.AddDays(-5), BureauClock.TodayLocal, null)).Success);
        Assert.Empty((await portal.GetTransactionsAsync(otherBureau, b.Amina.Id, 1, 10, new TransactionFilters())).Data!.Items);
    }
}
