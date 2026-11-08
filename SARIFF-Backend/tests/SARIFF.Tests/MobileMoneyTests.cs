using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>A wallet's currency follows its network, not the bureau.</summary>
public class MobileMoneyTests
{
    private static async Task<(SARIFF.Infrastructure.Data.AppDbContext Db, MpesaAgentService Svc, Guid Co)> BureauAsync(Currency home)
    {
        var db = TestDb.InMemory();
        var co = new Company { Name = "Test Bureau", Code = "TB-2026-0001", BaseCurrency = home, IsActive = true };
        db.Add(co);
        await db.SaveChangesAsync();
        return (db, new MpesaAgentService(db), co.Id);
    }

    private static CreateMpesaAgentDto Agent(MobileMoneyProvider p, string number, decimal opening = 0) =>
        new("Main agent", "+256700000001", number, null, MpesaAgentType.Standard, opening, p);

    [Fact]
    public async Task M_Pesa_in_a_Ugandan_bureau_holds_KES_and_MTN_holds_UGX()
    {
        var (_, svc, co) = await BureauAsync(Currency.UGX);
        var mpesa = await svc.CreateAsync(co, Agent(MobileMoneyProvider.MPesa, "111"));
        var mtn = await svc.CreateAsync(co, Agent(MobileMoneyProvider.MtnMoMo, "222"));
        var airtel = await svc.CreateAsync(co, Agent(MobileMoneyProvider.AirtelMoney, "333"));

        Assert.Equal(Currency.KES, mpesa.Data!.Currency);   // it used to say UGX
        Assert.Equal(Currency.UGX, mtn.Data!.Currency);
        Assert.Equal(Currency.UGX, airtel.Data!.Currency);  // Airtel follows the country
    }

    [Fact]
    public async Task A_Kenyan_bureau_cannot_open_a_UGX_MTN_wallet()
    {
        var (_, svc, co) = await BureauAsync(Currency.KES);
        var r = await svc.CreateAsync(co, Agent(MobileMoneyProvider.MtnMoMo, "444"));
        Assert.False(r.Success);
    }

    [Fact]
    public async Task Wallets_created_before_the_change_keep_the_home_currency()
    {
        var (db, svc, co) = await BureauAsync(Currency.UGX);
        db.MpesaAgents.Add(new MpesaAgent { CompanyId = co, Code = "MP-OLD", AgentName = "Old", PhoneNumber = "+256700000002",
            AgentNumber = "555", Provider = MobileMoneyProvider.MPesa, Balance = 1_000_000, OpeningBalance = 1_000_000, Currency = null });
        await db.SaveChangesAsync();

        var all = (await svc.GetAllAsync(co)).Data!;
        Assert.Equal(Currency.UGX, all.Single().Currency);   // no silent UGX→KES relabel of real money
    }

    [Fact]
    public async Task Totals_are_kept_per_currency_never_added_across()
    {
        var (_, svc, co) = await BureauAsync(Currency.UGX);
        await svc.CreateAsync(co, Agent(MobileMoneyProvider.MPesa, "666", opening: 50_000));      // KES
        await svc.CreateAsync(co, Agent(MobileMoneyProvider.MtnMoMo, "777", opening: 2_000_000)); // UGX

        var stats = (await svc.GetStatsAsync(co)).Data!;
        Assert.Equal(2_000_000m, stats.TotalBalance);                      // home (UGX) only
        Assert.Equal(50_000m, stats.ByCurrency!.Single(r => r.Currency == Currency.KES).Balance);
        Assert.Equal(2_000_000m, stats.ByCurrency!.Single(r => r.Currency == Currency.UGX).Balance);
    }

    [Fact]
    public async Task A_used_wallet_cannot_change_to_a_network_with_another_currency()
    {
        var (_, svc, co) = await BureauAsync(Currency.UGX);
        var mpesa = (await svc.CreateAsync(co, Agent(MobileMoneyProvider.MPesa, "888", opening: 10_000))).Data!;
        var r = await svc.UpdateAsync(co, mpesa.Id, new UpdateMpesaAgentDto(null, null, null, null, MobileMoneyProvider.MtnMoMo));
        Assert.False(r.Success);
    }

    [Fact]
    public async Task Startup_settles_old_wallets_without_relabelling_money()
    {
        var (db, _, co) = await BureauAsync(Currency.UGX);
        MpesaAgent Old(string n, MobileMoneyProvider p, decimal bal) => new()
        { CompanyId = co, Code = "MP-" + n, AgentName = n, PhoneNumber = "+256700000003", AgentNumber = n, Provider = p, Balance = bal, OpeningBalance = bal };
        var unusedMpesa = Old("u1", MobileMoneyProvider.MPesa, 0);
        var usedMpesa = Old("u2", MobileMoneyProvider.MPesa, 500_000);   // holds UGX amounts today
        var mtn = Old("u3", MobileMoneyProvider.MtnMoMo, 900_000);
        db.AddRange(unusedMpesa, usedMpesa, mtn);
        await db.SaveChangesAsync();

        await MobileMoney.BackfillAsync(db, NullLogger.Instance);

        Assert.Equal(Currency.KES, unusedMpesa.Currency);   // nothing to relabel: becomes a real M-Pesa (KES) wallet
        Assert.Null(usedMpesa.Currency);                    // has UGX money: left for a person to decide
        Assert.Equal(Currency.UGX, mtn.Currency);           // MTN in Uganda is UGX anyway
    }
}
