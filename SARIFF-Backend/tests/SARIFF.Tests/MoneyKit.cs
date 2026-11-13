using System.Reflection;
using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using SARIFF.Infrastructure.Services;

namespace SARIFF.Tests;

/// <summary>Stand-in for a service whose every call fails (to prove a failing follow-up can't undo saved money).</summary>
public class Throwing<T> : DispatchProxy where T : class
{
    public static T Create() => DispatchProxy.Create<T, Throwing<T>>();
    protected override object? Invoke(MethodInfo? method, object?[]? args) =>
        throw new InvalidOperationException($"{typeof(T).Name}.{method!.Name} is down");
}

/// <summary>
/// A small bureau for money tests: tills, a bank, an M-Pesa wallet, two clients and an expense
/// category, all in a fresh in-memory database. Balances start at zero unless set.
/// </summary>
public sealed class Bureau
{
    public AppDbContext Db { get; }
    public Company Company { get; }
    public Guid Co => Company.Id;
    public Guid UserId { get; } = Guid.NewGuid();
    public CashAccount Cash { get; private set; } = null!;       // home currency
    public CashAccount CashUsd { get; private set; } = null!;
    public CashAccount CashEur { get; private set; } = null!;
    public BankAccount Bank { get; private set; } = null!;       // home currency
    public BankAccount BankUsd { get; private set; } = null!;
    public MpesaAgent Wallet { get; private set; } = null!;      // M-Pesa (KES) in Kenya, MTN (UGX) in Uganda
    public User Amina { get; private set; } = null!;
    public User Baraka { get; private set; } = null!;
    public ExpenseCategory Rent { get; private set; } = null!;
    public Currency Home => Company.BaseCurrency;

    private Bureau(AppDbContext db, Company company) { Db = db; Company = company; }

    /// <param name="db">A real (PostgreSQL) database for tests about simultaneous requests; in-memory when omitted.</param>
    public static async Task<Bureau> CreateAsync(Currency home = Currency.KES, AppDbContext? db = null)
    {
        db ??= TestDb.InMemory();
        var n = Random.Shared.Next(10_000_000, 99_999_999);   // codes and phones are unique in a shared database
        var co = new Company { Name = "Test Bureau", BaseCurrency = home, Code = $"TB-{n}", CodePrefix = "TB", WhatsAppNumber = $"+2547{n}", OwnerName = "Test Owner", IsActive = true };
        var b = new Bureau(db, co);
        b.Cash = new CashAccount { CompanyId = co.Id, Currency = home, Code = $"CASH-{home}", IsActive = true };
        b.CashUsd = new CashAccount { CompanyId = co.Id, Currency = Currency.USD, Code = "CASH-USD", IsActive = true };
        b.CashEur = new CashAccount { CompanyId = co.Id, Currency = Currency.EUR, Code = "CASH-EUR", IsActive = true };
        b.Bank = new BankAccount { CompanyId = co.Id, Currency = home, Code = "BA-1", BankName = "KCB", AccountNumber = "0011223344", AccountName = "Test Bureau" };
        b.BankUsd = new BankAccount { CompanyId = co.Id, Currency = Currency.USD, Code = "BA-2", BankName = "Stanbic USD", AccountNumber = "0099887766", AccountName = "Test Bureau" };
        b.Wallet = new MpesaAgent
        {
            CompanyId = co.Id, Code = "MP-1", AgentName = home == Currency.UGX ? "MTN Kampala" : "M-Pesa Moi Ave",
            PhoneNumber = "+254700000009", AgentNumber = "123456", AgentType = MpesaAgentType.Standard,
            Provider = home == Currency.UGX ? MobileMoneyProvider.MtnMoMo : MobileMoneyProvider.MPesa, Currency = home,
        };
        b.Amina = new User { CompanyId = co.Id, Role = UserRole.Client, ClientType = ClientType.Permanent, FullName = "Amina Wanjiru", Code = "CL-1", WhatsAppNumber = "+254700000001", IdPassport = "A1234567" };
        b.Baraka = new User { CompanyId = co.Id, Role = UserRole.Client, ClientType = ClientType.Permanent, FullName = "Baraka Otieno", Code = "CL-2", WhatsAppNumber = "+254700000002" };
        b.Rent = new ExpenseCategory { CompanyId = co.Id, Name = "Rent" };
        db.AddRange(co, b.Cash, b.CashUsd, b.CashEur, b.Bank, b.BankUsd, b.Wallet, b.Amina, b.Baraka, b.Rent);
        await db.SaveChangesAsync();
        return b;
    }

    public TransactionService Transactions(INotificationService? notify = null) => new(Db,
        notify ?? NoOp<INotificationService>.Create(),
        new SystemLogService(Db, NullLogger<SystemLogService>.Instance),
        new ClientAlertHelper(Db),
        NoOp<IBalanceAlertService>.Create());

    public ExchangeService Exchange() => new(Db, new SystemLogService(Db, NullLogger<SystemLogService>.Instance));

    /// <summary>A rate for one foreign currency, active now (base per 1 foreign).</summary>
    public async Task<ExchangeRate> RateAsync(Currency foreign, decimal buy, decimal sell)
    {
        var r = new ExchangeRate { CompanyId = Co, ForeignCurrency = foreign, BuyRate = buy, SellRate = sell, EffectiveFrom = DateTime.UtcNow.AddMinutes(-5), IsActive = true };
        Db.ExchangeRates.Add(r);
        await Db.SaveChangesAsync();
        return r;
    }

    /// <summary>Puts money straight into the bureau's float (no posting), to set up a trade.</summary>
    public async Task<ExchangeFloat> FloatAsync(decimal home = 0, decimal usd = 0, decimal usdCostPerUnit = 0)
    {
        var f = Db.ExchangeFloats.FirstOrDefault(x => x.CompanyId == Co);
        if (f == null) { f = new ExchangeFloat { CompanyId = Co }; Db.ExchangeFloats.Add(f); }
        f.KesBalance = home;
        f.UsdBalance = usd;
        f.UsdTotalCost = usd * usdCostPerUnit;
        f.UsdAverageCost = usdCostPerUnit;
        await Db.SaveChangesAsync();
        return f;
    }

    public static CreateTransactionDto Posting(TransactionType type, AccountType src, Guid srcId, AccountType dst, Guid dstId,
        decimal amount, Currency currency = Currency.KES, decimal? counterAmount = null, Currency? counterCurrency = null,
        string description = "test", decimal? rate = null, DateTime? date = null) =>
        new(type, src, srcId, dst, dstId, amount, currency, counterAmount, counterCurrency, description, null, rate, PaymentMethod.Cash, date);
}
