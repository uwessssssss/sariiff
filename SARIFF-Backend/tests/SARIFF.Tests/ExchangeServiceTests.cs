using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Services;
using Xunit;
using static SARIFF.Tests.Bureau;

namespace SARIFF.Tests;

// Rates in these tests: USD buy 128.5 / sell 129.5, EUR buy 140 / sell 145 (KES per unit).

public class ExchangeRateTests
{
    [Fact]
    public async Task A_new_rate_replaces_the_old_one_for_that_currency_only()
    {
        var b = await CreateAsync();
        var fx = b.Exchange();
        var usd1 = await fx.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(128.5m, 129.5m, Currency.USD));
        var eur = await fx.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(140m, 145m, Currency.EUR));
        var usd2 = await fx.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(129m, 130m));   // no currency = USD

        Assert.True(usd1.Success && eur.Success && usd2.Success);
        var old = await b.Db.ExchangeRates.SingleAsync(r => r.Id == usd1.Data!.Id);
        Assert.False(old.IsActive);
        Assert.NotNull(old.EffectiveTo);
        Assert.Equal(129m, (await fx.GetCurrentRateAsync(b.Co, Currency.USD)).Data!.BuyRate);
        Assert.Equal(140m, (await fx.GetCurrentRateAsync(b.Co, Currency.EUR)).Data!.BuyRate);   // untouched
        Assert.Equal("EUR", eur.Data!.ForeignCurrencyCode);
    }

    [Fact]
    public async Task Rates_that_make_no_sense_are_refused()
    {
        var b = await CreateAsync();
        var fx = b.Exchange();
        Assert.Contains("less than sell", (await fx.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(130m, 130m))).Message);
        Assert.Contains("Buy rate must be greater than zero", (await fx.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(0m, 130m))).Message);
        Assert.Contains("Sell rate must be greater than zero", (await fx.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(1m, -1m))).Message);
        Assert.Contains("base currency", (await fx.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(1m, 2m, Currency.KES))).Message);
        Assert.Contains("isn't used by bureaus in Kenya", (await fx.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(0.03m, 0.04m, Currency.UGX))).Message);
        Assert.Empty(b.Db.ExchangeRates);
        Assert.False((await fx.GetCurrentRateAsync(b.Co, Currency.EUR)).Success);
    }

    [Fact]
    public async Task A_quote_uses_the_same_maths_as_a_trade()
    {
        var b = await CreateAsync();
        await b.RateAsync(Currency.USD, 128.5m, 129.5m);
        var fx = b.Exchange();

        var buy = (await fx.CalculateAsync(b.Co, new CalculateExchangeDto(100, ExchangeDirection.ForeignToKes))).Data!;
        Assert.Equal((12_850m, Currency.KES, 128.5m, 0m), (buy.OutputAmount, buy.OutputCurrency, buy.Rate, buy.EstimatedProfit));

        var sellNoStock = (await fx.CalculateAsync(b.Co, new CalculateExchangeDto(12_950, ExchangeDirection.KesToForeign))).Data!;
        Assert.Equal((100m, Currency.USD, 100m), (sellNoStock.OutputAmount, sellNoStock.OutputCurrency, sellNoStock.EstimatedProfit)); // costed at the buy rate

        await b.FloatAsync(usd: 500, usdCostPerUnit: 120m);
        var sellFromStock = (await fx.CalculateAsync(b.Co, new CalculateExchangeDto(12_950, ExchangeDirection.KesToForeign))).Data!;
        Assert.Equal(950m, sellFromStock.EstimatedProfit);   // 12,950 − 100 × 120 average cost
    }

    [Fact]
    public async Task A_quote_without_an_amount_currency_or_rate_is_refused()
    {
        var b = await CreateAsync();
        var fx = b.Exchange();
        Assert.Contains("greater than 0", (await fx.CalculateAsync(b.Co, new CalculateExchangeDto(0, ExchangeDirection.ForeignToKes))).Message);
        Assert.Contains("other than KES", (await fx.CalculateAsync(b.Co, new CalculateExchangeDto(10, ExchangeDirection.ForeignToKes, Currency.KES))).Message);
        Assert.Contains("No active EUR", (await fx.CalculateAsync(b.Co, new CalculateExchangeDto(10, ExchangeDirection.ForeignToKes, Currency.EUR))).Message);
    }

    [Fact]
    public async Task Rate_history_is_newest_first_and_any_day_count_is_safe()
    {
        var b = await CreateAsync();
        var fx = b.Exchange();
        await fx.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(128.5m, 129.5m));
        await fx.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(129m, 130m));
        var h = (await fx.GetRateHistoryAsync(b.Co, 30)).Data!;
        Assert.Equal(new[] { 129m, 128.5m }, h.Select(r => r.BuyRate));
        Assert.Equal(2, (await fx.GetRateHistoryAsync(b.Co, int.MaxValue)).Data!.Count);
        Assert.Equal(2, (await fx.GetRateHistoryAsync(b.Co, -7)).Data!.Count);
    }
}

public class ExchangeFloatTests
{
    private static FundFloatDto Fund(Currency c, decimal amount, AccountType type, Guid id, decimal? purchaseRate = null) => new(c, amount, type, id, purchaseRate, null);

    [Fact]
    public async Task Funding_shillings_moves_them_from_the_till_and_records_it_twice()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 50_000; await b.Db.SaveChangesAsync();

        var r = await b.Exchange().FundFloatAsync(b.Co, b.UserId, Fund(Currency.KES, 20_000, AccountType.Cash, b.Cash.Id));

        Assert.True(r.Success, r.Message);
        Assert.Equal(20_000m, r.Data!.KesBalance);
        Assert.Equal(30_000m, b.Cash.Balance);
        var move = await b.Db.FloatMovements.SingleAsync();
        Assert.Equal((FloatMovementType.Fund, 0m, 20_000m), (move.MovementType, move.BalanceBefore, move.BalanceAfter));
        var ledger = await b.Db.Transactions.SingleAsync();
        Assert.Equal(("FLOAT-TXN", 20_000m, 50_000m, 30_000m), (ledger.Reference, ledger.Amount, ledger.SourceBalanceBefore, ledger.SourceBalanceAfter));
    }

    [Fact]
    public async Task Dollars_from_a_dollar_account_are_costed_at_todays_buy_rate()
    {
        var b = await CreateAsync();
        await b.RateAsync(Currency.USD, 128.5m, 129.5m);
        b.BankUsd.Balance = 500; await b.Db.SaveChangesAsync();

        var r = await b.Exchange().FundFloatAsync(b.Co, b.UserId, Fund(Currency.USD, 100, AccountType.Bank, b.BankUsd.Id));

        Assert.True(r.Success, r.Message);
        Assert.Equal(400m, b.BankUsd.Balance);
        Assert.Equal(100m, r.Data!.UsdBalance);
        Assert.Equal(128.5m, r.Data.UsdAverageCost);
    }

    [Fact]
    public async Task Dollars_bought_with_shillings_cost_the_purchase_rate()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 20_000; await b.Db.SaveChangesAsync();

        var r = await b.Exchange().FundFloatAsync(b.Co, b.UserId, Fund(Currency.USD, 100, AccountType.Cash, b.Cash.Id, purchaseRate: 130m));

        Assert.True(r.Success, r.Message);
        Assert.Equal(7_000m, b.Cash.Balance);                 // 100 × 130 left the shilling till
        Assert.Equal(130m, r.Data!.UsdAverageCost);
        Assert.Equal(Currency.KES, (await b.Db.Transactions.SingleAsync()).Currency);
    }

    [Fact]
    public async Task Euros_live_in_their_own_float_row_with_their_cost()
    {
        var b = await CreateAsync();
        await b.RateAsync(Currency.EUR, 140m, 145m);
        b.CashEur.Balance = 1_000; await b.Db.SaveChangesAsync();

        var r = await b.Exchange().FundFloatAsync(b.Co, b.UserId, Fund(Currency.EUR, 300, AccountType.Cash, b.CashEur.Id));

        Assert.True(r.Success, r.Message);
        var eur = await b.Db.ExchangeFloatBalances.SingleAsync(x => x.Currency == Currency.EUR);
        Assert.Equal((300m, 42_000m, 140m), (eur.Balance, eur.TotalCost, eur.AverageCost));
        Assert.Contains(r.Data!.OtherBalances!, o => o.Currency == Currency.EUR && o.Balance == 300m);
        Assert.Equal(700m, b.CashEur.Balance);
    }

    [Fact]
    public async Task Funding_that_cannot_be_paid_is_refused_with_the_reason()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 100; await b.Db.SaveChangesAsync();
        var fx = b.Exchange();

        Assert.Contains("enter a purchase rate", (await fx.FundFloatAsync(b.Co, b.UserId, Fund(Currency.USD, 10, AccountType.Cash, b.Cash.Id))).Message);
        Assert.Contains("Insufficient balance", (await fx.FundFloatAsync(b.Co, b.UserId, Fund(Currency.KES, 200, AccountType.Cash, b.Cash.Id))).Message);
        Assert.Contains("only applies when funding a foreign", (await fx.FundFloatAsync(b.Co, b.UserId, Fund(Currency.KES, 10, AccountType.Cash, b.Cash.Id, 1m))).Message);
        Assert.Contains("Purchase rate", (await fx.FundFloatAsync(b.Co, b.UserId, Fund(Currency.USD, 10, AccountType.Cash, b.Cash.Id, 0m))).Message);
        Assert.Contains("Source account not found", (await fx.FundFloatAsync(b.Co, b.UserId, Fund(Currency.KES, 10, AccountType.Cash, Guid.NewGuid()))).Message);
        Assert.Contains("Fund amount", (await fx.FundFloatAsync(b.Co, b.UserId, Fund(Currency.KES, 0, AccountType.Cash, b.Cash.Id))).Message);
        Assert.Contains("isn't used by bureaus in Kenya", (await fx.FundFloatAsync(b.Co, b.UserId, Fund(Currency.UGX, 10, AccountType.Cash, b.Cash.Id))).Message);
        Assert.False((await fx.FundFloatAsync(b.Co, b.UserId, Fund((Currency)99, 10, AccountType.Cash, b.Cash.Id))).Success);   // not a currency at all
        Assert.Equal(100m, b.Cash.Balance);
        Assert.Empty(b.Db.FloatMovements);
    }

    [Fact]
    public async Task Withdrawing_returns_money_to_an_account_in_the_same_currency()
    {
        var b = await CreateAsync();
        await b.FloatAsync(home: 20_000, usd: 100, usdCostPerUnit: 128m);
        var fx = b.Exchange();

        var kes = await fx.WithdrawFloatAsync(b.Co, b.UserId, new WithdrawFloatDto(Currency.KES, 5_000, AccountType.Bank, b.Bank.Id, null));
        var usd = await fx.WithdrawFloatAsync(b.Co, b.UserId, new WithdrawFloatDto(Currency.USD, 40, AccountType.Cash, b.CashUsd.Id, null));

        Assert.True(kes.Success, kes.Message);
        Assert.True(usd.Success, usd.Message);
        Assert.Equal(5_000m, b.Bank.Balance);
        Assert.Equal(40m, b.CashUsd.Balance);
        Assert.Equal(15_000m, usd.Data!.KesBalance);
        Assert.Equal(60m, usd.Data.UsdBalance);
        Assert.Equal(128m, usd.Data.UsdAverageCost);           // cost leaves at average, average unchanged
        Assert.All(b.Db.FloatMovements, m => Assert.True(m.Amount < 0));
    }

    [Fact]
    public async Task Withdrawals_beyond_the_float_or_into_the_wrong_currency_are_refused()
    {
        var b = await CreateAsync();
        await b.FloatAsync(home: 1_000);
        var fx = b.Exchange();
        Assert.Contains("Insufficient float", (await fx.WithdrawFloatAsync(b.Co, b.UserId, new WithdrawFloatDto(Currency.KES, 1_000.01m, AccountType.Cash, b.Cash.Id, null))).Message);
        Assert.Contains("holds KES, not USD", (await fx.WithdrawFloatAsync(b.Co, b.UserId, new WithdrawFloatDto(Currency.USD, 1, AccountType.Cash, b.Cash.Id, null))).Message);
        Assert.Contains("Destination account not found", (await fx.WithdrawFloatAsync(b.Co, b.UserId, new WithdrawFloatDto(Currency.KES, 1, AccountType.Bank, Guid.NewGuid(), null))).Message);
        Assert.Contains("Withdrawal amount", (await fx.WithdrawFloatAsync(b.Co, b.UserId, new WithdrawFloatDto(Currency.KES, -1, AccountType.Cash, b.Cash.Id, null))).Message);
        Assert.Equal(0m, b.Cash.Balance);
    }

    [Fact]
    public async Task Only_earned_profit_can_be_settled_out_of_the_float()
    {
        var b = await CreateAsync();
        await b.RateAsync(Currency.USD, 128.5m, 129.5m);
        await b.FloatAsync(home: 1_000_000);
        var fx = b.Exchange();
        await fx.CreateExchangeAsync(b.Co, b.UserId, new CreateExchangeDto(null, ExchangeType.Cash, ExchangeDirection.ForeignToKes, 100, null, null, "Walk-in", null));
        await fx.CreateExchangeAsync(b.Co, b.UserId, new CreateExchangeDto(null, ExchangeType.Cash, ExchangeDirection.KesToForeign, 12_950, null, null, "Walk-in", null));

        var settle = await fx.SettleProfitAsync(b.Co, b.UserId, new SettleProfitDto(Currency.KES, 60, AccountType.Cash, b.Cash.Id, null));
        Assert.True(settle.Success, settle.Message);
        Assert.Equal(40m, settle.Data!.KesProfit);
        Assert.Equal(60m, b.Cash.Balance);

        Assert.Contains("Insufficient profit", (await fx.SettleProfitAsync(b.Co, b.UserId, new SettleProfitDto(Currency.KES, 50, AccountType.Cash, b.Cash.Id, null))).Message);
        Assert.Contains("held in KES", (await fx.SettleProfitAsync(b.Co, b.UserId, new SettleProfitDto(Currency.EUR, 1, AccountType.Cash, b.CashEur.Id, null))).Message);
        Assert.Contains("holds USD, not KES", (await fx.SettleProfitAsync(b.Co, b.UserId, new SettleProfitDto(Currency.KES, 1, AccountType.Cash, b.CashUsd.Id, null))).Message);
        Assert.Contains("Settlement amount", (await fx.SettleProfitAsync(b.Co, b.UserId, new SettleProfitDto(Currency.KES, 0, AccountType.Cash, b.Cash.Id, null))).Message);
        Assert.Contains(b.Db.FloatMovements, m => m.MovementType == FloatMovementType.ProfitSettlement && m.Amount == -60m);
    }

    [Fact]
    public async Task Float_history_lists_every_movement_and_honours_dates()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 1_000; await b.Db.SaveChangesAsync();
        var fx = b.Exchange();
        await fx.FundFloatAsync(b.Co, b.UserId, Fund(Currency.KES, 300, AccountType.Cash, b.Cash.Id));
        await fx.WithdrawFloatAsync(b.Co, b.UserId, new WithdrawFloatDto(Currency.KES, 100, AccountType.Cash, b.Cash.Id, null));

        var all = (await fx.GetFloatMovementsAsync(b.Co, null, null)).Data!;
        Assert.Equal(2, all.Count);
        Assert.Contains(all, m => m.Type == "Fund" && m.Amount == 300m && m.SourceOrDest == "Cash");
        Assert.Empty((await fx.GetFloatMovementsAsync(b.Co, new DateTime(2020, 1, 1), new DateTime(2020, 1, 31))).Data!);
        Assert.Equal(1_000m - 300m + 100m, b.Cash.Balance);
    }
}

public class ExchangeTradeTests
{
    private static CreateExchangeDto Trade(ExchangeType type, ExchangeDirection dir, decimal amount, Guid? client = null, Currency? foreign = null,
        string? name = null, decimal? custom = null, string? idNumber = null) =>
        new(client, type, dir, amount, custom, idNumber, name, null, foreign);

    private static async Task<Bureau> ReadyAsync(decimal floatKes = 1_000_000)
    {
        var b = await CreateAsync();
        await b.RateAsync(Currency.USD, 128.5m, 129.5m);
        await b.FloatAsync(home: floatKes);
        return b;
    }

    [Fact]
    public async Task A_client_account_exchange_moves_the_clients_own_balances_and_writes_two_statement_lines()
    {
        var b = await ReadyAsync();
        b.Amina.BalanceUSD = 200; await b.Db.SaveChangesAsync();

        var r = await b.Exchange().CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.FromAccount, ExchangeDirection.ForeignToKes, 100, b.Amina.Id));

        Assert.True(r.Success, r.Message);
        Assert.Equal(100m, b.Amina.BalanceUSD);
        Assert.Equal(12_850m, b.Amina.BalanceKES);
        Assert.Equal("Amina Wanjiru", r.Data!.ClientName);
        Assert.Equal("Permanent", r.Data.ClientType);
        var legs = await b.Db.Transactions.Where(t => t.Reference == "EXC-" + r.Data.Code).ToListAsync();
        Assert.Equal(2, legs.Count);
        var ex = await b.Db.ExchangeTransactions.SingleAsync();
        Assert.Equal("A1234567", ex.ClientIdNumber);                    // taken from the client's record
        Assert.NotNull(ex.ClientSourceTransactionId);
        Assert.NotNull(ex.ClientDestTransactionId);
        var f = await b.Db.ExchangeFloats.SingleAsync();
        Assert.Equal((100m, 128.5m, 1_000_000m - 12_850m), (f.UsdBalance, f.UsdAverageCost, f.KesBalance));
    }

    [Fact]
    public async Task Client_account_exchanges_need_a_known_client_with_enough_money()
    {
        var b = await ReadyAsync();
        var outsider = new User { CompanyId = Guid.NewGuid(), Role = UserRole.Client, FullName = "Other Bureau", Code = "CL-9", WhatsAppNumber = "+254700000099" };
        b.Db.Users.Add(outsider); await b.Db.SaveChangesAsync();
        var fx = b.Exchange();

        Assert.Contains("ClientId is required", (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.FromAccount, ExchangeDirection.ForeignToKes, 10))).Message);
        Assert.Equal("Client not found", (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.FromAccount, ExchangeDirection.ForeignToKes, 10, outsider.Id))).Message);
        Assert.Contains("Insufficient client USD balance", (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.FromAccount, ExchangeDirection.ForeignToKes, 10, b.Amina.Id))).Message);
        Assert.Equal("Client not found", (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 10, Guid.NewGuid()))).Message);
        Assert.Empty(b.Db.ExchangeTransactions);
    }

    [Fact]
    public async Task A_cash_trade_names_a_registered_client_and_checks_a_walk_in_name()
    {
        var b = await ReadyAsync();
        var fx = b.Exchange();
        var named = await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 10, b.Baraka.Id));
        var anon = await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 10));
        var bad = await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 10, name: "R2D2"));

        Assert.Equal("Baraka Otieno", named.Data!.ClientName);
        Assert.Equal(("Walk-in Client", "WalkIn"), (anon.Data!.ClientName, anon.Data.ClientType));
        Assert.Contains("invalid characters", bad.Message);
    }

    [Fact]
    public async Task Trades_without_a_usable_rate_or_currency_are_refused()
    {
        var b = await ReadyAsync();
        var fx = b.Exchange();
        Assert.Contains("No active EUR", (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 10, foreign: Currency.EUR))).Message);
        Assert.Contains("base currency", (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 10, foreign: Currency.KES))).Message);
        Assert.False((await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 10, foreign: (Currency)99))).Success);
        Assert.Contains("Invalid exchange direction", (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, (ExchangeDirection)7, 10))).Message);
        Assert.Contains("Exchange amount", (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 0))).Message);
        Assert.Contains("too small", (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.KesToForeign, 0.01m))).Message);

        var rate = await b.Db.ExchangeRates.SingleAsync();
        rate.BuyRate = 0; await b.Db.SaveChangesAsync();
        Assert.Contains("invalid", (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 10))).Message);
        Assert.Empty(b.Db.ExchangeTransactions);
    }

    [Fact]
    public async Task A_large_trade_is_flagged_for_compliance()
    {
        var b = await ReadyAsync();
        var fx = b.Exchange();
        var small = await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 100));
        var large = await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 4_000));   // 514,000 KES
        Assert.False(small.Data!.IsLargeTransaction);
        Assert.True(large.Data!.IsLargeTransaction);
    }

    [Fact]
    public async Task Euro_trades_use_the_euro_float_and_book_profit_against_euro_cost()
    {
        var b = await ReadyAsync();
        await b.RateAsync(Currency.EUR, 140m, 145m);
        var fx = b.Exchange();

        var buy = await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 100, foreign: Currency.EUR));
        var sell = await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.KesToForeign, 7_250, foreign: Currency.EUR));

        Assert.True(buy.Success, buy.Message);
        Assert.Equal(14_000m, buy.Data!.AmountReceived);
        Assert.Equal(50m, sell.Data!.AmountReceived);
        Assert.Equal(250m, sell.Data.Profit);                       // 7,250 − 50 × 140
        var eur = await b.Db.ExchangeFloatBalances.SingleAsync();
        Assert.Equal((50m, 140m), (eur.Balance, eur.AverageCost));
    }

    [Fact]
    public async Task Selling_more_than_the_stock_from_a_client_account_values_the_shortfall_at_the_buy_rate()
    {
        var b = await ReadyAsync();
        b.Amina.BalanceKES = 13_000; await b.Db.SaveChangesAsync();

        var r = await b.Exchange().CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.FromAccount, ExchangeDirection.KesToForeign, 12_950, b.Amina.Id));

        Assert.True(r.Success, r.Message);
        Assert.Equal(100m, r.Data!.Profit);                         // never "free" units
        Assert.Equal((50m, 100m), (b.Amina.BalanceKES, b.Amina.BalanceUSD));
    }

    [Fact]
    public async Task Voiding_a_client_account_exchange_restores_the_client_and_the_float()
    {
        var b = await ReadyAsync();
        b.Amina.BalanceUSD = 200; await b.Db.SaveChangesAsync();
        var fx = b.Exchange();
        var ex = (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.FromAccount, ExchangeDirection.ForeignToKes, 100, b.Amina.Id))).Data!;

        var v = await fx.VoidExchangeAsync(b.Co, b.UserId, ex.Id, "wrong client");

        Assert.True(v.Success, v.Message);
        Assert.Equal((200m, 0m), (b.Amina.BalanceUSD, b.Amina.BalanceKES));
        var f = await b.Db.ExchangeFloats.SingleAsync();
        Assert.Equal((0m, 1_000_000m), (f.UsdBalance, f.KesBalance));
        Assert.All(await b.Db.Transactions.Where(t => t.Reference == "EXC-" + ex.Code).ToListAsync(),
            t => { Assert.StartsWith("[VOIDED]", t.Description); Assert.NotNull(t.DeletedAt); });
        Assert.Equal(2, await b.Db.Transactions.CountAsync(t => t.Reference == "REV-EXC-" + ex.Code && t.ReconciliationStatus == ReconciliationStatus.Matched));
        Assert.Contains("Voided", (await fx.VoidExchangeAsync(b.Co, b.UserId, ex.Id, "again")).Message);
        Assert.Equal("Exchange transaction not found", (await fx.VoidExchangeAsync(b.Co, b.UserId, Guid.NewGuid(), "x")).Message);
    }

    [Fact]
    public async Task Voiding_a_euro_sale_puts_the_euros_back_at_cost()
    {
        var b = await ReadyAsync();
        await b.RateAsync(Currency.EUR, 140m, 145m);
        var fx = b.Exchange();
        await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 100, foreign: Currency.EUR));
        var sale = (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.KesToForeign, 7_250, foreign: Currency.EUR))).Data!;

        Assert.True((await fx.VoidExchangeAsync(b.Co, b.UserId, sale.Id, "till error")).Success);

        var eur = await b.Db.ExchangeFloatBalances.SingleAsync();
        Assert.Equal((100m, 140m), (eur.Balance, eur.AverageCost));
        Assert.Equal(0m, (await b.Db.ExchangeFloats.SingleAsync()).KesProfit);
    }

    [Fact]
    public async Task Lists_search_by_code_client_name_or_id_number_and_hide_voided_trades()
    {
        var b = await ReadyAsync();
        b.Amina.BalanceUSD = 50; await b.Db.SaveChangesAsync();
        var fx = b.Exchange();
        var walkIn = (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 10, name: "Juma", idNumber: "P99887766"))).Data!;
        var amina = (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.FromAccount, ExchangeDirection.ForeignToKes, 20, b.Amina.Id))).Data!;
        var voided = (await fx.CreateExchangeAsync(b.Co, b.UserId, Trade(ExchangeType.Cash, ExchangeDirection.ForeignToKes, 5))).Data!;
        await fx.VoidExchangeAsync(b.Co, b.UserId, voided.Id, "test");

        Assert.Equal(2, (await fx.GetExchangesAsync(b.Co, 1, 10, null, null, null, null)).Data!.TotalCount);
        Assert.Equal(walkIn.Id, (await fx.GetExchangesAsync(b.Co, 1, 10, walkIn.Code.ToLower(), null, null, null)).Data!.Items.Single().Id);
        Assert.Equal(amina.Id, (await fx.GetExchangesAsync(b.Co, 1, 10, "AMINA", null, null, null)).Data!.Items.Single().Id);
        Assert.Equal(walkIn.Id, (await fx.GetExchangesAsync(b.Co, 1, 10, "p9988", null, null, null)).Data!.Items.Single().Id);
        Assert.Equal(amina.Id, (await fx.GetExchangesAsync(b.Co, 1, 10, null, ExchangeType.FromAccount, null, null)).Data!.Items.Single().Id);
        Assert.Empty((await fx.GetExchangesAsync(b.Co, 1, 10, null, null, new DateTime(2020, 1, 1), new DateTime(2020, 1, 2))).Data!.Items);
        Assert.Single((await fx.GetExchangesAsync(b.Co, 2, 1, null, null, null, null)).Data!.Items);

        var one = await fx.GetExchangeByIdAsync(b.Co, amina.Id);
        Assert.Equal("Amina Wanjiru", one.Data!.ClientName);
        Assert.Equal("Juma", (await fx.GetExchangeByIdAsync(b.Co, walkIn.Id)).Data!.ClientName);
        Assert.False((await fx.GetExchangeByIdAsync(b.Co, Guid.NewGuid())).Success);
    }
}

public class ExchangeDayTests
{
    private static async Task<(Bureau B, ExchangeService Fx)> ReadyAsync()
    {
        var b = await CreateAsync();
        await b.RateAsync(Currency.USD, 128.5m, 129.5m);
        await b.RateAsync(Currency.EUR, 140m, 145m);
        await b.FloatAsync(home: 100_000, usd: 500, usdCostPerUnit: 128m);
        return (b, b.Exchange());
    }

    [Fact]
    public async Task The_opening_count_is_recorded_once_per_day_with_other_currencies()
    {
        var (b, fx) = await ReadyAsync();
        var open = await fx.RecordOpeningFloatAsync(b.Co, b.UserId, new OpeningFloatDto(99_500, 500, "morning",
            new List<CurrencyCountDto> { new(Currency.EUR, 300), new(Currency.USD, 1), new(Currency.EUR, 310) }));

        Assert.True(open.Success, open.Message);
        Assert.Equal((99_500m, 500m, false), (open.Data!.OpeningKes, open.Data.OpeningUsd, open.Data.IsClosed));
        var eur = Assert.Single(open.Data.OtherCurrencies!);            // USD has its own columns; the last EUR count wins
        Assert.Equal((Currency.EUR, 310m), (eur.Currency, eur.Opening));
        var f = await b.Db.ExchangeFloats.SingleAsync();
        Assert.Equal(99_500m, f.LastOpeningKes);

        var again = await fx.RecordOpeningFloatAsync(b.Co, b.UserId, new OpeningFloatDto(1, 1, null));
        Assert.False(again.Success);
        Assert.Contains("already recorded", again.Message);
        Assert.Equal(99_500m, again.Data!.OpeningKes);
    }

    [Fact]
    public async Task Todays_summary_is_built_live_until_the_day_is_opened()
    {
        var (b, fx) = await ReadyAsync();
        await fx.CreateExchangeAsync(b.Co, b.UserId, new CreateExchangeDto(null, ExchangeType.Cash, ExchangeDirection.ForeignToKes, 100, null, null, null, null));

        var live = (await fx.GetTodaySummaryAsync(b.Co)).Data!;
        Assert.False(live.IsClosed);
        Assert.Equal(1, live.ExchangeCount);
        Assert.Equal((100m, 12_850m), (live.UsdVolumeIn, live.KesVolumeOut));
        Assert.Equal(100_000m - 12_850m, live.ClosingKes);
        Assert.Null(live.KesVariance);

        await fx.RecordOpeningFloatAsync(b.Co, b.UserId, new OpeningFloatDto(100_000, 500, null));
        Assert.Equal(100_000m, (await fx.GetTodaySummaryAsync(b.Co)).Data!.OpeningKes);
    }

    [Fact]
    public async Task Closing_counts_the_day_and_shows_what_is_over_or_short()
    {
        var (b, fx) = await ReadyAsync();
        await fx.RecordOpeningFloatAsync(b.Co, b.UserId, new OpeningFloatDto(100_000, 500, null));
        await fx.CreateExchangeAsync(b.Co, b.UserId, new CreateExchangeDto(null, ExchangeType.Cash, ExchangeDirection.ForeignToKes, 100, null, null, null, null));
        await fx.CreateExchangeAsync(b.Co, b.UserId, new CreateExchangeDto(null, ExchangeType.Cash, ExchangeDirection.ForeignToKes, 20, null, null, null, null, Currency.EUR));

        // system: KES 100,000 − 12,850 − 2,800 = 84,350; USD 600; EUR 20
        var close = await fx.RecordClosingFloatAsync(b.Co, b.UserId, new ClosingFloatDto(84_300, 600, "evening",
            new List<CurrencyCountDto> { new(Currency.EUR, 21) }));

        Assert.True(close.Success, close.Message);
        var d = close.Data!;
        Assert.True(d.IsClosed);
        Assert.Equal(2, d.ExchangeCount);
        Assert.Equal((84_350m, 600m), (d.ClosingKes, d.ClosingUsd));
        Assert.Equal(-50m, d.KesVariance);                             // 50 short in shillings
        Assert.Equal(0m, d.UsdVariance);
        var eur = Assert.Single(d.OtherCurrencies!);
        Assert.Equal((20m, 20m), (eur.Closing, eur.VolumeIn));
        Assert.Equal(21m, eur.ActualCount);
        Assert.Equal(1m, eur.Variance);

        Assert.Contains("already closed", (await fx.RecordClosingFloatAsync(b.Co, b.UserId, new ClosingFloatDto(0, 0, null))).Message);
        var range = (await fx.GetDailySummariesAsync(b.Co, BureauClock.TodayLocal.AddDays(-1), BureauClock.TodayLocal.AddDays(1))).Data!;
        Assert.True(Assert.Single(range).IsClosed);
    }

    [Fact]
    public async Task Closing_without_an_opening_count_uses_the_balance_as_the_opening()
    {
        var (b, fx) = await ReadyAsync();
        var close = await fx.RecordClosingFloatAsync(b.Co, b.UserId, new ClosingFloatDto(100_000, 500, null));
        Assert.True(close.Success, close.Message);
        Assert.Equal((100_000m, 500m), (close.Data!.OpeningKes, close.Data.OpeningUsd));
        Assert.Equal(0m, close.Data.KesVariance);
    }
}

public class ExchangeReportTests
{
    private static async Task<(Bureau B, ExchangeService Fx)> RoundTripAsync()
    {
        var b = await CreateAsync();
        await b.RateAsync(Currency.USD, 128.5m, 129.5m);
        await b.FloatAsync(home: 1_000_000);
        b.Amina.BalanceUSD = 100; await b.Db.SaveChangesAsync();
        var fx = b.Exchange();
        await fx.CreateExchangeAsync(b.Co, b.UserId, new CreateExchangeDto(b.Amina.Id, ExchangeType.FromAccount, ExchangeDirection.ForeignToKes, 100, null, null, null, null));
        await fx.CreateExchangeAsync(b.Co, b.UserId, new CreateExchangeDto(null, ExchangeType.Cash, ExchangeDirection.KesToForeign, 12_950, null, null, null, null));
        return (b, fx);
    }

    [Fact]
    public async Task The_profit_report_adds_up_the_days_trades_and_the_spread()
    {
        var (b, fx) = await RoundTripAsync();
        var r = (await fx.GetProfitReportAsync(b.Co, BureauClock.TodayLocal.AddDays(-1), BureauClock.TodayLocal.AddDays(1))).Data!;
        Assert.Equal((100m, 2, 1m), (r.TotalKesProfit, r.TotalTransactions, r.AverageSpread));
        Assert.Equal(100m, r.TotalProfitInKes);
        Assert.Equal(2, Assert.Single(r.DailyBreakdown).Transactions);
        Assert.Equal(0, (await fx.GetProfitReportAsync(b.Co, new DateTime(2020, 1, 1), new DateTime(2020, 1, 2))).Data!.TotalTransactions);
    }

    [Fact]
    public async Task Large_trades_are_listed_biggest_first_with_who_traded()
    {
        var (b, fx) = await RoundTripAsync();
        var list = (await fx.GetLargeTransactionsAsync(b.Co, BureauClock.TodayLocal.AddDays(-1), BureauClock.TodayLocal.AddDays(1), 12_900m)).Data!;
        var only = Assert.Single(list);                               // 12,950 sale in; 12,850 purchase below the line
        Assert.Equal((12_950m, "Walk-in Client", "N/A"), (only.KesEquivalent, only.ClientName, only.ClientIdNumber));
        var both = (await fx.GetLargeTransactionsAsync(b.Co, BureauClock.TodayLocal.AddDays(-1), BureauClock.TodayLocal.AddDays(1), 10_000m)).Data!;
        Assert.Equal(new[] { 12_950m, 12_850m }, both.Select(x => x.KesEquivalent));
        Assert.Equal(("Amina Wanjiru", "A1234567", "+254700000001"), (both[1].ClientName, both[1].ClientIdNumber, both[1].ClientPhone));
    }

    [Fact]
    public async Task A_clients_exchange_history_totals_both_sides()
    {
        var (b, fx) = await RoundTripAsync();
        var h = (await fx.GetClientExchangeHistoryAsync(b.Co, b.Amina.Id)).Data!;
        Assert.Equal((1, 12_850m, 100m), (h.TotalExchanges, h.TotalKesExchanged, h.TotalUsdExchanged));
        Assert.False((await fx.GetClientExchangeHistoryAsync(b.Co, Guid.NewGuid())).Success);
        Assert.False((await fx.GetClientExchangeHistoryAsync(Guid.NewGuid(), b.Amina.Id)).Success);
    }

    [Fact]
    public async Task The_dollar_position_shows_unrealised_profit_at_the_sell_rate()
    {
        var b = await CreateAsync();
        await b.RateAsync(Currency.USD, 128.5m, 129.5m);
        await b.FloatAsync(usd: 100, usdCostPerUnit: 128.5m);
        var p = (await b.Exchange().GetUsdPositionAsync(b.Co)).Data!;
        Assert.Equal((100m, 12_950m, 100m, 0.78m), (p.UsdBalance, p.CurrentMarketValue, p.UnrealizedPnL, p.UnrealizedPnLPercent));
    }

    [Fact]
    public async Task Alerts_warn_about_low_negative_and_unsettled_money()
    {
        var b = await CreateAsync();
        var f = await b.FloatAsync(home: -10, usd: 0);
        f.KesProfit = 150_000;
        b.Db.ExchangeFloatBalances.Add(new ExchangeFloatBalance { CompanyId = b.Co, Currency = Currency.EUR, Balance = -5 });
        await b.Db.SaveChangesAsync();

        var alerts = (await b.Exchange().GetAlertsAsync(b.Co)).Data!;

        Assert.Equal(2, alerts.Count(a => a.AlertType == "LowBalance"));
        Assert.Contains(alerts, a => a.AlertType == "NegativeBalance" && a.Currency == Currency.KES);
        Assert.Contains(alerts, a => a.AlertType == "NegativeBalance" && a.Currency == Currency.EUR);
        Assert.Contains(alerts, a => a.AlertType == "HighUnsettledProfit");
    }

    [Fact]
    public async Task Thresholds_can_be_changed_but_not_made_negative()
    {
        var b = await CreateAsync();
        var fx = b.Exchange();
        Assert.False((await fx.UpdateAlertThresholdsAsync(b.Co, -1, 0, 0)).Success);
        Assert.True((await fx.UpdateAlertThresholdsAsync(b.Co, 10_000, 50, 250_000)).Success);
        var f = await b.Db.ExchangeFloats.SingleAsync();
        Assert.Equal((10_000m, 50m, 250_000m), (f.LowKesThreshold, f.LowUsdThreshold, f.LargeTransactionThreshold));
        Assert.Empty((await fx.GetAlertsAsync(b.Co)).Data!.Where(a => a.AlertType == "NegativeBalance"));
    }
}
