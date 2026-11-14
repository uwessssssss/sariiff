using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Services;
using Xunit;
using static SARIFF.Tests.Bureau;

namespace SARIFF.Tests;

/// <summary>Line-by-line audit, Services/Exchange: one test per finding (see docs/line-audit-ledger.md).</summary>
public class LineAuditExchangeTests
{
    private static CreateExchangeDto Trade(ExchangeDirection dir, decimal amount, ExchangeType type = ExchangeType.Cash,
        string? name = "Walk In Customer", string? notes = null) => new(null, type, dir, amount, null, null, name, notes, Currency.USD);
    private static FundFloatDto Fund(Currency c, decimal amount, AccountType type, Guid id, decimal? purchaseRate = null, string? notes = null) =>
        new(c, amount, type, id, purchaseRate, notes);

    /// <summary>A Kenyan bureau quoting USD at 128.5 / 129.5 with KES 1,000,000 in the float.</summary>
    private static async Task<(Bureau B, ExchangeService Fx)> ReadyAsync(decimal floatKes = 1_000_000)
    {
        var b = await CreateAsync();
        await b.RateAsync(Currency.USD, 128.5m, 129.5m);
        await b.FloatAsync(home: floatKes);
        return (b, b.Exchange());
    }

    // X1
    [Fact]
    public async Task An_unknown_exchange_type_number_is_refused()
    {
        var (b, fx) = await ReadyAsync(floatKes: 1_000);
        // USD 100 bought = KES 12,850 out of a float holding KES 1,000. A cash exchange checks
        // the float; type 7 is neither cash nor account, and skipped the check.
        var r = await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeDirection.ForeignToKes, 100, (ExchangeType)7));

        Assert.False(r.Success, "an exchange of an unknown type went through with no float check");
        Assert.Equal(1_000m, (await b.Db.ExchangeFloats.SingleAsync(f => f.CompanyId == b.Co)).KesBalance);
        Assert.Empty(b.Db.ExchangeTransactions);
    }

    // X2
    [Fact]
    public async Task Searching_exchanges_finds_a_walk_in_customer_by_name()
    {
        var (b, fx) = await ReadyAsync();
        Assert.True((await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeDirection.ForeignToKes, 10, name: "Zawadi Njeri"))).Success);
        Assert.True((await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeDirection.ForeignToKes, 20, name: "Otieno Okello"))).Success);

        var found = (await fx.GetExchangesAsync(b.Co, 1, 10, "zawadi", null, null, null)).Data!;

        Assert.Equal(10m, Assert.Single(found.Items).AmountGiven);
    }

    // X3
    [Fact]
    public async Task A_cash_exchange_cannot_be_voided_once_the_float_no_longer_holds_what_must_be_given_back()
    {
        var (b, fx) = await ReadyAsync();
        var bought = (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeDirection.ForeignToKes, 100))).Data!;   // float: USD 100
        Assert.True((await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeDirection.KesToForeign, 12_950))).Success);   // sold again: USD 0
        var f = await b.Db.ExchangeFloats.SingleAsync(x => x.CompanyId == b.Co);
        Assert.Equal(0m, f.UsdBalance);

        // Voiding the purchase means handing the customer's USD 100 back. The float has none.
        var r = await fx.VoidExchangeAsync(b.Co, b.UserId, bought.Id, "customer changed their mind");

        Assert.False(r.Success, "the void went through and left the dollar float at -100");
        Assert.Equal(0m, f.UsdBalance);
        Assert.Equal("Completed", (await b.Db.ExchangeTransactions.SingleAsync(e => e.Id == bought.Id)).Status);
    }

    // X4, X6
    [Fact]
    public async Task The_older_rate_endpoints_name_the_currency_and_keep_the_same_limits()
    {
        var b = await CreateAsync();
        var legacy = new ExchangeRateService(b.Db);

        var eur = await legacy.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(140m, 145m, Currency.EUR));
        Assert.True(eur.Success, eur.Message);
        Assert.Equal(Currency.EUR, eur.Data!.ForeignCurrency);                                   // was reported as USD
        Assert.Equal("EUR", (await legacy.GetCurrentRateAsync(b.Co, Currency.EUR)).Data!.ForeignCurrencyCode);
        Assert.All((await legacy.GetHistoryAsync(b.Co)).Data!, r => Assert.Equal(Currency.EUR, r.ForeignCurrency));

        // the main endpoint refuses a rate above 999,999.999999; this one took anything
        Assert.False((await legacy.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(1_000_000_000m, 2_000_000_000m))).Success);
    }

    // X5
    [Fact]
    public async Task With_two_active_rates_left_by_a_double_submit_everything_uses_the_newest_and_the_next_rate_clears_both()
    {
        var b = await CreateAsync();
        // Two "active" USD rates, as two simultaneous Set Rate requests leave behind.
        b.Db.ExchangeRates.AddRange(
            new ExchangeRate { CompanyId = b.Co, ForeignCurrency = Currency.USD, BuyRate = 100m, SellRate = 101m, EffectiveFrom = DateTime.UtcNow.AddDays(-2), IsActive = true },
            new ExchangeRate { CompanyId = b.Co, ForeignCurrency = Currency.USD, BuyRate = 128m, SellRate = 129m, EffectiveFrom = DateTime.UtcNow.AddDays(-1), IsActive = true });
        await b.Db.SaveChangesAsync();
        var fx = b.Exchange();

        // Trades are priced at the newest; the rate shown on screen must be the same one.
        Assert.Equal(128m, (await fx.GetCurrentRateAsync(b.Co, Currency.USD)).Data!.BuyRate);
        Assert.Equal(128m, (await new ExchangeRateService(b.Db).GetCurrentRateAsync(b.Co, Currency.USD)).Data!.BuyRate);

        Assert.True((await fx.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(129m, 130m))).Success);
        Assert.Equal(129m, Assert.Single(b.Db.ExchangeRates.Where(r => r.CompanyId == b.Co && r.IsActive)).BuyRate);
    }

    // X7
    [Fact]
    public async Task Buying_float_at_a_rate_takes_a_whole_number_of_cents_from_the_till()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 1_000; await b.Db.SaveChangesAsync();

        // USD 1 at 129.535 = KES 129.535, which is KES 129.54
        var r = await b.Exchange().FundFloatAsync(b.Co, b.UserId, Fund(Currency.USD, 1, AccountType.Cash, b.Cash.Id, purchaseRate: 129.535m));

        Assert.True(r.Success, r.Message);
        Assert.Equal(870.46m, b.Cash.Balance);
        Assert.Equal(129.54m, b.Db.Transactions.Single(t => t.Reference == "FLOAT-TXN").Amount);
    }

    // X8
    [Fact]
    public async Task Foreign_float_cannot_be_funded_with_nothing_to_value_it_at()
    {
        var b = await CreateAsync();
        b.CashUsd.Balance = 500; await b.Db.SaveChangesAsync();
        var fx = b.Exchange();

        // No USD rate set and no purchase rate: the dollars would enter the float at a cost of
        // zero, and the whole sale price would later be booked as profit that can be paid out.
        var r = await fx.FundFloatAsync(b.Co, b.UserId, Fund(Currency.USD, 100, AccountType.Cash, b.CashUsd.Id));
        Assert.False(r.Success, "USD 100 entered the float at a cost of zero");
        Assert.Equal(500m, b.CashUsd.Balance);

        await b.RateAsync(Currency.USD, 128.5m, 129.5m);
        Assert.True((await fx.FundFloatAsync(b.Co, b.UserId, Fund(Currency.USD, 100, AccountType.Cash, b.CashUsd.Id))).Success);
        Assert.Equal(128.5m, (await b.Db.ExchangeFloats.SingleAsync(f => f.CompanyId == b.Co)).UsdAverageCost);
    }

    // X9
    [Fact]
    public async Task Todays_summary_stays_live_after_the_opening_count_is_recorded()
    {
        var (b, fx) = await ReadyAsync();
        Assert.True((await fx.RecordOpeningFloatAsync(b.Co, b.UserId, new OpeningFloatDto(1_000_000, 0, "counted"))).Success);
        Assert.True((await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeDirection.ForeignToKes, 100))).Success);

        var day = (await fx.GetTodaySummaryAsync(b.Co)).Data!;

        Assert.False(day.IsClosed);
        Assert.Equal(1, day.ExchangeCount);                 // it showed 0 all day once the opening was recorded
        Assert.Equal(100m, day.UsdVolumeIn);
        Assert.Equal(12_850m, day.KesVolumeOut);
        Assert.Equal(1_000_000m, day.OpeningKes);           // the recorded count
        Assert.Equal(1_000_000m - 12_850m, day.ClosingKes); // the float now
        Assert.Equal(100m, day.ClosingUsd);
    }

    // X10
    [Fact]
    public async Task With_no_opening_count_the_day_opens_on_the_float_as_it_stood_at_the_start_of_the_day()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 1_000; await b.Db.SaveChangesAsync();
        var fx = b.Exchange();
        // The float was empty this morning; KES 1,000 was put in today.
        Assert.True((await fx.FundFloatAsync(b.Co, b.UserId, Fund(Currency.KES, 1_000, AccountType.Cash, b.Cash.Id))).Success);
        // An opening count from an earlier day must not be shown as today's.
        var f = await b.Db.ExchangeFloats.SingleAsync(x => x.CompanyId == b.Co);
        f.LastOpeningDate = BureauClock.TodayLocal.AddDays(-3); f.LastOpeningKes = 111; f.LastOpeningUsd = 7;
        await b.Db.SaveChangesAsync();

        var live = (await fx.GetTodaySummaryAsync(b.Co)).Data!;
        Assert.Equal(0m, live.OpeningKes);       // was 111 (an old count), or 1,000 (the balance now)
        Assert.Equal(0m, live.OpeningUsd);
        Assert.Equal(1_000m, live.ClosingKes);

        var closed = await fx.RecordClosingFloatAsync(b.Co, b.UserId, new ClosingFloatDto(1_000, 0, null));
        Assert.True(closed.Success, closed.Message);
        Assert.Equal(0m, closed.Data!.OpeningKes);
        Assert.Equal(1_000m, closed.Data.ClosingKes);
        Assert.Equal(0m, closed.Data.KesVariance);
    }

    // X11
    [Fact]
    public async Task A_physical_count_cannot_be_negative_in_any_currency()
    {
        var (b, fx) = await ReadyAsync();
        var minusEuros = new List<CurrencyCountDto> { new(Currency.EUR, -5) };

        Assert.False((await fx.RecordOpeningFloatAsync(b.Co, b.UserId, new OpeningFloatDto(0, 0, null, minusEuros))).Success);
        Assert.False((await fx.RecordOpeningFloatAsync(b.Co, b.UserId, new OpeningFloatDto(-1, 0, null))).Success);
        Assert.Empty(b.Db.DailyExchangeSummaries);
        Assert.False((await fx.RecordClosingFloatAsync(b.Co, b.UserId, new ClosingFloatDto(0, 0, null, minusEuros))).Success);
        Assert.False((await fx.RecordClosingFloatAsync(b.Co, b.UserId, new ClosingFloatDto(0, -1, null))).Success);
        Assert.Empty(b.Db.DailyExchangeSummaries);
    }

    // X12
    [Fact]
    public async Task The_profit_report_puts_a_trade_on_the_bureaus_calendar_day()
    {
        var (b, fx) = await ReadyAsync();
        var trade = (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeDirection.ForeignToKes, 100))).Data!;
        // Half past midnight, bureau time: still "yesterday" on a UTC clock.
        var row = await b.Db.ExchangeTransactions.SingleAsync(e => e.Id == trade.Id);
        row.TransactionDate = BureauClock.TodayStartUtc.AddMinutes(30);
        await b.Db.SaveChangesAsync();

        var report = (await fx.GetProfitReportAsync(b.Co, BureauClock.TodayLocal, BureauClock.TodayLocal)).Data!;

        Assert.Equal(BureauClock.TodayLocal, Assert.Single(report.DailyBreakdown).Date);
    }

    // X13
    [Fact]
    public async Task Notes_and_reasons_have_a_length_limit()
    {
        var (b, fx) = await ReadyAsync();
        b.Cash.Balance = 10_000; await b.Db.SaveChangesAsync();
        var essay = new string('x', 5_001);

        Assert.False((await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeDirection.ForeignToKes, 10, notes: essay))).Success);
        Assert.False((await fx.FundFloatAsync(b.Co, b.UserId, Fund(Currency.KES, 100, AccountType.Cash, b.Cash.Id, notes: essay))).Success);
        Assert.False((await fx.WithdrawFloatAsync(b.Co, b.UserId, new WithdrawFloatDto(Currency.KES, 100, AccountType.Cash, b.Cash.Id, essay))).Success);
        Assert.False((await fx.RecordOpeningFloatAsync(b.Co, b.UserId, new OpeningFloatDto(0, 0, essay))).Success);

        var ok = (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeDirection.ForeignToKes, 10))).Data!;
        Assert.False((await fx.VoidExchangeAsync(b.Co, b.UserId, ok.Id, essay)).Success);
        Assert.False((await fx.VoidExchangeAsync(b.Co, b.UserId, ok.Id, "   ")).Success);   // a reason is required
        Assert.Equal(10_000m, b.Cash.Balance);
    }

    // X14
    [Fact]
    public async Task A_walk_in_with_a_blank_name_is_recorded_as_a_walk_in()
    {
        var (b, fx) = await ReadyAsync();

        var r = await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeDirection.ForeignToKes, 10, name: ""));

        Assert.True(r.Success, r.Message);
        Assert.Equal("Walk-in Client", r.Data!.ClientName);
    }

    // X15
    [Fact]
    public async Task The_converter_refuses_an_amount_that_is_not_positive()
    {
        var b = await CreateAsync();
        await b.RateAsync(Currency.USD, 128.5m, 129.5m);
        var legacy = new ExchangeRateService(b.Db);

        Assert.False((await legacy.ConvertAsync(b.Co, new CurrencyConvertDto(-100, Currency.USD, Currency.KES))).Success);
        Assert.False((await legacy.ConvertAsync(b.Co, new CurrencyConvertDto(0, Currency.KES, Currency.USD))).Success);
        Assert.Equal(12_850m, (await legacy.ConvertAsync(b.Co, new CurrencyConvertDto(100, Currency.USD, Currency.KES))).Data!.ConvertedAmount);
    }
}
