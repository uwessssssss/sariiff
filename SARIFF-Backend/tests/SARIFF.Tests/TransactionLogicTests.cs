using System.Reflection;
using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>Stand-in for a service the test doesn't care about: every call succeeds and does nothing.</summary>
public class NoOp<T> : DispatchProxy where T : class
{
    public static T Create() => DispatchProxy.Create<T, NoOp<T>>();

    protected override object? Invoke(MethodInfo? method, object?[]? args)
    {
        var rt = method!.ReturnType;
        if (rt == typeof(Task)) return Task.CompletedTask;
        if (rt.IsGenericType && rt.GetGenericTypeDefinition() == typeof(Task<>))
        {
            var inner = rt.GetGenericArguments()[0];
            var value = inner == typeof(bool) ? true : inner.IsValueType ? Activator.CreateInstance(inner) : null;
            return typeof(Task).GetMethod(nameof(Task.FromResult))!.MakeGenericMethod(inner).Invoke(null, new[] { value });
        }
        return rt.IsValueType ? Activator.CreateInstance(rt) : null;
    }
}

/// <summary>Double entry on cash, bank and client accounts: direction, currency and reversal guards.</summary>
public class TransactionLogicTests
{
    private sealed record World(AppDbContext Db, TransactionService Svc, Guid Co, CashAccount CashKes, BankAccount BankKes, User Client);

    private static async Task<World> MakeAsync()
    {
        var db = TestDb.InMemory();
        var co = new Company { Name = "Test Bureau", BaseCurrency = Currency.KES };
        var cash = new CashAccount { CompanyId = co.Id, Currency = Currency.KES, Code = "CASH-KES", IsActive = true };
        var bank = new BankAccount { CompanyId = co.Id, Currency = Currency.KES, Code = "BA-1", BankName = "KCB", AccountNumber = "001" };
        var client = new User { CompanyId = co.Id, Role = UserRole.Client, ClientType = ClientType.Permanent, FullName = "Amina", Code = "CL-1", WhatsAppNumber = "+254700000001" };
        db.AddRange(co, cash, bank, client);
        await db.SaveChangesAsync();
        var svc = new TransactionService(db,
            NoOp<INotificationService>.Create(),
            new SystemLogService(db, NullLogger<SystemLogService>.Instance),
            new ClientAlertHelper(db),
            NoOp<IBalanceAlertService>.Create());
        return new World(db, svc, co.Id, cash, bank, client);
    }

    private static CreateTransactionDto Txn(TransactionType type, AccountType srcType, Guid src, AccountType dstType, Guid dst,
        decimal amount, Currency currency = Currency.KES) =>
        new(type, srcType, src, dstType, dst, amount, currency, null, null, "test", null, null, PaymentMethod.Cash);

    [Fact]
    public async Task Client_deposit_raises_both_the_client_and_the_cash()
    {
        var w = await MakeAsync();
        // Client is the source; Credit = the bureau owes the client more. Cash (dest) gets the Debit.
        var r = await w.Svc.CreateAsync(w.Co, Guid.NewGuid(), Txn(TransactionType.Credit, AccountType.Client, w.Client.Id, AccountType.Cash, w.CashKes.Id, 1_000));
        Assert.True(r.Success, r.Message);
        Assert.Equal(1_000m, w.Client.BalanceKES);
        Assert.Equal(1_000m, w.CashKes.Balance);
    }

    [Fact]
    public async Task Usd_posted_to_a_shilling_cash_account_is_refused()
    {
        var w = await MakeAsync();
        var r = await w.Svc.CreateAsync(w.Co, Guid.NewGuid(), Txn(TransactionType.Debit, AccountType.Cash, w.CashKes.Id, AccountType.Client, w.Client.Id, 100, Currency.USD));
        Assert.False(r.Success);
        Assert.Contains("doesn't hold", r.Message);
        Assert.Equal(0m, w.CashKes.Balance);
    }

    [Fact]
    public async Task Cash_cannot_be_paid_out_beyond_what_is_in_the_drawer()
    {
        var w = await MakeAsync();
        var r = await w.Svc.CreateAsync(w.Co, Guid.NewGuid(), Txn(TransactionType.Credit, AccountType.Cash, w.CashKes.Id, AccountType.Client, w.Client.Id, 500));
        Assert.False(r.Success);
        Assert.Contains("Insufficient", r.Message);
    }

    [Fact]
    public async Task Reversal_that_would_take_cash_below_zero_is_refused()
    {
        var w = await MakeAsync();
        var deposit = await w.Svc.CreateAsync(w.Co, Guid.NewGuid(), Txn(TransactionType.Credit, AccountType.Client, w.Client.Id, AccountType.Cash, w.CashKes.Id, 1_000));
        // The cash has since gone to the bank.
        var banked = await w.Svc.CreateAsync(w.Co, Guid.NewGuid(), Txn(TransactionType.Credit, AccountType.Cash, w.CashKes.Id, AccountType.Bank, w.BankKes.Id, 1_000));
        Assert.True(banked.Success, banked.Message);

        var rev = await w.Svc.DeleteAsync(w.Co, deposit.Data!.Id, Guid.NewGuid(), new DeleteTransactionDto("keyed twice"), clientContext: w.Client.Id);
        Assert.False(rev.Success);
        Assert.Contains("below zero", rev.Message);
        Assert.Equal(0m, w.CashKes.Balance);
        Assert.Equal(1_000m, w.Client.BalanceKES);
    }

    [Fact]
    public async Task Reversal_puts_both_sides_back()
    {
        var w = await MakeAsync();
        var deposit = await w.Svc.CreateAsync(w.Co, Guid.NewGuid(), Txn(TransactionType.Credit, AccountType.Client, w.Client.Id, AccountType.Cash, w.CashKes.Id, 1_000));
        var rev = await w.Svc.DeleteAsync(w.Co, deposit.Data!.Id, Guid.NewGuid(), new DeleteTransactionDto("wrong client"), clientContext: w.Client.Id);
        Assert.True(rev.Success, rev.Message);
        Assert.Equal(0m, w.CashKes.Balance);
        Assert.Equal(0m, w.Client.BalanceKES);
    }

    [Fact]
    public async Task References_are_unique_within_a_day()
    {
        var w = await MakeAsync();
        var a = await w.Svc.CreateAsync(w.Co, Guid.NewGuid(), Txn(TransactionType.Credit, AccountType.Client, w.Client.Id, AccountType.Cash, w.CashKes.Id, 10));
        var b = await w.Svc.CreateAsync(w.Co, Guid.NewGuid(), Txn(TransactionType.Credit, AccountType.Client, w.Client.Id, AccountType.Cash, w.CashKes.Id, 10));
        Assert.NotEqual(a.Data!.Reference, b.Data!.Reference);
    }

    [Fact]
    public async Task Withdrawal_entered_from_the_cash_side_alerts_the_client_as_money_out()
    {
        var w = await MakeAsync();
        await w.Svc.CreateAsync(w.Co, Guid.NewGuid(), Txn(TransactionType.Credit, AccountType.Client, w.Client.Id, AccountType.Cash, w.CashKes.Id, 1_000));
        // Cash is the source and pays out (Credit); the client (dest) is debited.
        var r = await w.Svc.CreateAsync(w.Co, Guid.NewGuid(), Txn(TransactionType.Credit, AccountType.Cash, w.CashKes.Id, AccountType.Client, w.Client.Id, 400));
        Assert.True(r.Success, r.Message);
        Assert.Equal(600m, w.Client.BalanceKES);

        var alert = w.Db.ClientAlerts.Where(a => a.ClientId == w.Client.Id && a.RelatedTransactionId == r.Data!.Id).ToList();
        Assert.Contains(alert, a => a.Title == "Funds Sent");          // it said "Funds Received" before
        Assert.DoesNotContain(alert, a => a.Title == "Funds Received");
    }

    [Fact]
    public async Task Todays_money_in_and_out_counts_tills_only()
    {
        var w = await MakeAsync();
        await w.Svc.CreateAsync(w.Co, Guid.NewGuid(), Txn(TransactionType.Credit, AccountType.Client, w.Client.Id, AccountType.Cash, w.CashKes.Id, 1_000)); // in 1,000
        await w.Svc.CreateAsync(w.Co, Guid.NewGuid(), Txn(TransactionType.Credit, AccountType.Cash, w.CashKes.Id, AccountType.Client, w.Client.Id, 400));   // out 400
        await w.Svc.CreateAsync(w.Co, Guid.NewGuid(), Txn(TransactionType.Credit, AccountType.Cash, w.CashKes.Id, AccountType.Bank, w.BankKes.Id, 600));    // transfer

        var s = (await w.Svc.GetTodaySummaryAsync(w.Co)).Data!;
        Assert.Equal(1_000m + 600m, s.TotalDebitKES);   // in: deposit + bank receiving the transfer
        Assert.Equal(400m + 600m, s.TotalCreditKES);    // out: withdrawal + cash sending the transfer
        Assert.Equal(600m, s.NetFlowKES);               // the transfer nets to zero
    }

    [Fact]
    public async Task Lowering_the_opening_balance_below_what_was_spent_is_refused_and_changes_are_audited()
    {
        var w = await MakeAsync();
        var svc = new CashAccountService(w.Db);
        w.CashKes.OpeningBalance = 1_000; w.CashKes.Balance = 200; // 800 already paid out
        await w.Db.SaveChangesAsync();

        var tooLow = await svc.UpdateAsync(w.Co, w.CashKes.Id, new UpdateCashAccountDto(500m));
        Assert.False(tooLow.Success);
        Assert.Equal(200m, w.CashKes.Balance);

        var ok = await svc.UpdateAsync(w.Co, w.CashKes.Id, new UpdateCashAccountDto(1_100m));
        Assert.True(ok.Success, ok.Message);
        Assert.Equal(300m, w.CashKes.Balance);
        Assert.Single(w.Db.AuditLogs.Where(a => a.EntityType == "CashAccount.OpeningBalance" && a.EntityId == w.CashKes.Id));
    }

    [Fact]
    public async Task A_cash_account_cannot_open_with_a_negative_balance()
    {
        var w = await MakeAsync();
        var svc = new CashAccountService(w.Db);
        var r = await svc.CreateAsync(w.Co, new CreateCashAccountDto(Currency.USD, -500m));
        Assert.False(r.Success);
        Assert.DoesNotContain(w.Db.CashAccounts, c => c.Currency == Currency.USD);
    }
}
