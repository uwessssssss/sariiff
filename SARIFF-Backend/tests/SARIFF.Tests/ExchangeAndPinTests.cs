using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Data;
using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>
/// Exchange profit uses average cost and is booked only when the bureau sells.
/// Rates: buy 128.5, sell 129.5 KES per USD.
/// </summary>
public class ExchangeProfitTests
{
    private static async Task<(AppDbContext Db, ExchangeService Svc, Guid Company)> MakeAsync()
    {
        var db = TestDb.InMemory();
        var company = new Company { Name = "Test Bureau", BaseCurrency = Currency.KES };
        db.Companies.Add(company);
        db.ExchangeRates.Add(new ExchangeRate
        {
            CompanyId = company.Id, ForeignCurrency = Currency.USD,
            BuyRate = 128.5m, SellRate = 129.5m, EffectiveFrom = DateTime.UtcNow.AddHours(-1), IsActive = true,
        });
        db.ExchangeFloats.Add(new ExchangeFloat { CompanyId = company.Id, KesBalance = 1_000_000m });
        await db.SaveChangesAsync();
        var svc = new ExchangeService(db, new SystemLogService(db, NullLogger<SystemLogService>.Instance));
        return (db, svc, company.Id);
    }

    private static CreateExchangeDto Buy(decimal usd, decimal? custom = null) =>
        new(null, ExchangeType.Cash, ExchangeDirection.ForeignToKes, usd, custom, null, "Walk-in", null, Currency.USD);

    private static CreateExchangeDto Sell(decimal kes, decimal? custom = null) =>
        new(null, ExchangeType.Cash, ExchangeDirection.KesToForeign, kes, custom, null, "Walk-in", null, Currency.USD);

    [Fact]
    public async Task Buy_then_sell_books_the_spread_once()
    {
        var (db, svc, co) = await MakeAsync();

        var buy = await svc.CreateExchangeAsync(co, Guid.NewGuid(), Buy(100));
        Assert.True(buy.Success, buy.Message);
        Assert.Equal(0m, buy.Data!.Profit);                       // buying books nothing yet
        var f = db.ExchangeFloats.Single();
        Assert.Equal(100m, f.UsdBalance);
        Assert.Equal(128.5m, f.UsdAverageCost);
        Assert.Equal(1_000_000m - 12_850m, f.KesBalance);

        var sell = await svc.CreateExchangeAsync(co, Guid.NewGuid(), Sell(12_950));
        Assert.True(sell.Success, sell.Message);
        Assert.Equal(100m, sell.Data!.AmountReceived);            // 12,950 / 129.5
        Assert.Equal(100m, sell.Data.Profit);                     // 12,950 − 12,850 cost
        Assert.Equal(100m, f.KesProfit);                          // not 200
        Assert.Equal(0m, f.UsdBalance);
        Assert.Equal(0m, f.UsdTotalCost);
    }

    [Fact]
    public async Task Custom_rate_is_used_within_ten_percent_and_rejected_outside()
    {
        var (_, svc, co) = await MakeAsync();

        var typo = await svc.CreateExchangeAsync(co, Guid.NewGuid(), Buy(100, custom: 1285m));
        Assert.False(typo.Success);
        Assert.Contains("10%", typo.Message);

        var ok = await svc.CreateExchangeAsync(co, Guid.NewGuid(), Buy(100, custom: 127m));
        Assert.True(ok.Success, ok.Message);
        Assert.Equal(127m, ok.Data!.ExchangeRate);
        Assert.Equal(12_700m, ok.Data.AmountReceived);
    }

    [Fact]
    public async Task Voiding_a_sale_puts_the_units_back_at_cost_and_removes_the_profit()
    {
        var (db, svc, co) = await MakeAsync();
        await svc.CreateExchangeAsync(co, Guid.NewGuid(), Buy(100));
        var sell = await svc.CreateExchangeAsync(co, Guid.NewGuid(), Sell(12_950));

        var v = await svc.VoidExchangeAsync(co, Guid.NewGuid(), sell.Data!.Id, "keyed twice");
        Assert.True(v.Success, v.Message);

        var f = db.ExchangeFloats.Single();
        Assert.Equal(100m, f.UsdBalance);
        Assert.Equal(128.5m, f.UsdAverageCost);
        Assert.Equal(0m, f.KesProfit);
        Assert.Equal(1_000_000m - 12_850m, f.KesBalance);

        // A void is an ordinary action: it must not count as a system error.
        Assert.DoesNotContain(db.SystemLogs, l => l.Level == "Error");
    }

    private sealed class RecordingAlerts : IBalanceAlertService
    {
        public readonly List<(Guid Client, decimal Kes, decimal Usd)> Checks = new();
        public Task<ApiResponse<List<BalanceAlertRuleDto>>> GetRulesAsync(Guid companyId, Guid? clientId = null) => throw new NotImplementedException();
        public Task<ApiResponse<BalanceAlertRuleDto>> CreateRuleAsync(Guid companyId, Guid userId, CreateBalanceAlertDto dto) => throw new NotImplementedException();
        public Task<ApiResponse<bool>> ToggleRuleAsync(Guid companyId, Guid ruleId) => throw new NotImplementedException();
        public Task<ApiResponse<bool>> DeleteRuleAsync(Guid companyId, Guid ruleId) => throw new NotImplementedException();
        public Task CheckAndNotifyAsync(Guid companyId, Guid clientId, string clientName, decimal balanceKES, decimal balanceUSD)
        {
            Checks.Add((clientId, balanceKES, balanceUSD));
            return Task.CompletedTask;
        }
    }

    [Fact]
    public async Task Account_exchange_runs_the_balance_alert_rules_with_the_new_balances()
    {
        var (db, _, co) = await MakeAsync();
        var client = new User { CompanyId = co, Role = UserRole.Client, ClientType = ClientType.Permanent, FullName = "Amina", Code = "CL-1", BalanceKES = 20_000m };
        db.Users.Add(client);
        await db.SaveChangesAsync();
        var alerts = new RecordingAlerts();
        var svc = new ExchangeService(db, new SystemLogService(db, NullLogger<SystemLogService>.Instance), alerts);

        // Client spends KES 12,950 of their balance on USD 100 (sell 129.5).
        var r = await svc.CreateExchangeAsync(co, Guid.NewGuid(),
            new CreateExchangeDto(client.Id, ExchangeType.FromAccount, ExchangeDirection.KesToForeign, 12_950m, null, null, null, null, Currency.USD));
        Assert.True(r.Success, r.Message);

        var check = Assert.Single(alerts.Checks);
        Assert.Equal(client.Id, check.Client);
        Assert.Equal(7_050m, check.Kes);
        Assert.Equal(100m, check.Usd);
    }

    [Fact]
    public async Task Legacy_buy_profit_is_reported_on_a_dry_run_and_removed_on_apply()
    {
        var (db, svc, co) = await MakeAsync();
        var f = db.ExchangeFloats.Single();
        // Two rows written by the old code: a buy that booked spread × qty, and its sale.
        db.ExchangeTransactions.AddRange(
            new ExchangeTransaction { CompanyId = co, Code = "EXC-OLD-1", Direction = ExchangeDirection.ForeignToKes, Status = "Completed",
                Profit = 100m, ProfitCurrency = Currency.KES, TransactionDate = DateTime.UtcNow.AddDays(-30) },
            new ExchangeTransaction { CompanyId = co, Code = "EXC-OLD-2", Direction = ExchangeDirection.KesToForeign, Status = "Completed",
                Profit = 100m, ProfitCurrency = Currency.KES, TransactionDate = DateTime.UtcNow.AddDays(-29) },
            new ExchangeTransaction { CompanyId = co, Code = "EXC-OLD-3", Direction = ExchangeDirection.ForeignToKes, Status = "Voided",
                Profit = 50m, ProfitCurrency = Currency.KES, TransactionDate = DateTime.UtcNow.AddDays(-28) });
        f.KesProfit = 200m;
        await db.SaveChangesAsync();

        var dry = await svc.CorrectLegacyBuyProfitAsync(null, apply: false);
        var line = Assert.Single(dry.Data!);
        Assert.Equal(1, line.BuyExchangesCorrected);        // the voided one is left alone
        Assert.Equal(100m, line.ProfitRemoved);
        Assert.Equal(200m, f.KesProfit);                    // nothing written yet

        await svc.CorrectLegacyBuyProfitAsync(null, apply: true);
        Assert.Equal(100m, f.KesProfit);                    // only the sale's profit remains
        Assert.Equal(0m, db.ExchangeTransactions.Single(e => e.Code == "EXC-OLD-1").Profit);
        Assert.Equal(100m, db.ExchangeTransactions.Single(e => e.Code == "EXC-OLD-2").Profit);
        Assert.Empty((await svc.CorrectLegacyBuyProfitAsync(null, apply: false)).Data!); // idempotent
    }

    [Fact]
    public async Task Cash_sale_beyond_the_float_is_refused()
    {
        var (_, svc, co) = await MakeAsync();
        var r = await svc.CreateExchangeAsync(co, Guid.NewGuid(), Sell(12_950)); // no USD held yet
        Assert.False(r.Success);
        Assert.Contains("Insufficient", r.Message);
    }
}

public class PinGateTests
{
    private static async Task<(AppDbContext Db, Company Co)> MakeAsync()
    {
        var db = TestDb.InMemory();
        var co = new Company { Name = "Test Bureau", IsTransactionPinEnabled = true, TransactionPinHash = "x" };
        db.Companies.Add(co);
        await db.SaveChangesAsync();
        return (db, co);
    }

    [Fact]
    public async Task A_grant_lasts_a_few_minutes_and_is_per_user()
    {
        var (db, co) = await MakeAsync();
        var alice = Guid.NewGuid(); var bob = Guid.NewGuid();
        var t = new DateTime(2026, 10, 30, 9, 0, 0, DateTimeKind.Utc);

        await PinGate.GrantAsync(db, co, alice, t);
        Assert.True(await PinGate.HasGrantAsync(db, co.Id, alice, t.AddMinutes(2)));
        Assert.False(await PinGate.HasGrantAsync(db, co.Id, bob, t));
        Assert.False(await PinGate.HasGrantAsync(db, co.Id, alice, t.AddMinutes(4)));
        Assert.False(await PinGate.ClaimAsync(db, co.Id, alice, t.AddMinutes(4)));   // expired: no action allowed
    }

    [Fact]
    public async Task One_pin_entry_allows_exactly_one_action()
    {
        var (db, co) = await MakeAsync();
        var u = Guid.NewGuid();
        await PinGate.GrantAsync(db, co, u);
        Assert.True(await PinGate.ClaimAsync(db, co.Id, u));
        Assert.False(await PinGate.ClaimAsync(db, co.Id, u));
    }

    [Fact]
    public async Task A_failed_action_gives_the_approval_back()
    {
        var (db, co) = await MakeAsync();
        var u = Guid.NewGuid();
        await PinGate.GrantAsync(db, co, u);
        Assert.True(await PinGate.ClaimAsync(db, co.Id, u));
        await PinGate.RestoreAsync(db, co.Id, u);
        Assert.True(await PinGate.ClaimAsync(db, co.Id, u));
    }

    [Fact]
    public async Task Five_wrong_pins_lock_the_bureau_until_the_window_passes_and_a_right_one_resets()
    {
        var (db, co) = await MakeAsync();
        var t = new DateTime(2026, 10, 30, 9, 0, 0, DateTimeKind.Utc);
        for (var i = 0; i < 4; i++) PinGate.RecordFailure(co, t);
        Assert.Null(PinGate.LockedMinutes(co, t));
        PinGate.RecordFailure(co, t);
        Assert.Equal(15, PinGate.LockedMinutes(co, t));
        Assert.Null(PinGate.LockedMinutes(co, t.AddMinutes(16)));

        await PinGate.GrantAsync(db, co, Guid.NewGuid(), t.AddMinutes(16));
        Assert.Equal(0, co.PinFailedAttempts);
    }
}
