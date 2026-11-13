using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.Core.DTOs;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Data;
using SARIFF.Infrastructure.Services;
using Xunit;
using static SARIFF.Tests.Bureau;

namespace SARIFF.Tests;

/// <summary>Makes the next SaveChanges fail once, the way a lost connection or a deadlock does.</summary>
internal sealed class FailNextSave : SaveChangesInterceptor
{
    public bool Armed;
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        if (Armed) { Armed = false; throw new InvalidOperationException("database went away"); }
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }
}

/// <summary>
/// Line-by-line audit (Services/Admin SystemLogService, used by every money service): FL1.
/// A failed save is rolled back and then logged through the SAME context, whose SaveChanges
/// wrote the half-done work again: the money moved although the user was told it failed.
/// </summary>
public class LineAuditFailurePathTests
{
    private static (Func<AppDbContext> Fresh, AppDbContext Db, FailNextSave Fail) World()
    {
        var name = Guid.NewGuid().ToString();
        var fail = new FailNextSave();
        var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>(TestDb.InMemoryOptions(name)).AddInterceptors(fail).Options);
        return (() => TestDb.InMemory(name), db, fail);
    }

    // FL1
    [Fact]
    public async Task A_failed_expense_leaves_no_expense_no_posting_and_the_till_untouched()
    {
        var (fresh, db, fail) = World();
        var b = await CreateAsync(db: db);
        b.Cash.Balance = 50_000; await db.SaveChangesAsync();
        var svc = new ExpenseService(db, new SystemLogService(db, NullLogger<SystemLogService>.Instance));

        fail.Armed = true;
        var r = await svc.CreateAsync(b.Co, b.UserId, new CreateExpenseDto(b.Rent.Id, "October rent", null, 20_000, Currency.KES,
            PaymentMethod.Cash, AccountType.Cash, b.Cash.Id, null, new DateTime(2026, 10, 5)));

        Assert.False(r.Success);
        await using var check = fresh();
        Assert.Empty(check.Expenses);
        Assert.Empty(check.Transactions);
        Assert.Equal(50_000m, (await check.CashAccounts.SingleAsync(c => c.Id == b.Cash.Id)).Balance);
    }

    // FL1
    [Fact]
    public async Task A_failed_posting_moves_no_money()
    {
        var (fresh, db, fail) = World();
        var b = await CreateAsync(db: db);
        b.Cash.Balance = 50_000; await db.SaveChangesAsync();

        fail.Armed = true;
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Cash, b.Cash.Id, AccountType.Client, b.Amina.Id, 1_000));

        Assert.False(r.Success);
        await using var check = fresh();
        Assert.Empty(check.Transactions);
        Assert.Equal(50_000m, (await check.CashAccounts.SingleAsync(c => c.Id == b.Cash.Id)).Balance);
        Assert.Equal(0m, (await check.Users.SingleAsync(u => u.Id == b.Amina.Id)).BalanceKES);
    }

    // FL1
    [Fact]
    public async Task A_failed_exchange_and_a_failed_float_funding_move_no_money()
    {
        var (fresh, db, fail) = World();
        var b = await CreateAsync(db: db);
        await b.RateAsync(Currency.USD, 128.5m, 129.5m);
        await b.FloatAsync(home: 1_000_000);
        b.Cash.Balance = 50_000; await db.SaveChangesAsync();
        var fx = b.Exchange();

        fail.Armed = true;
        Assert.False((await fx.CreateExchangeAsync(b.Co, b.UserId, new CreateExchangeDto(null, ExchangeType.Cash, ExchangeDirection.ForeignToKes, 100, null, null, "Walk In", null, Currency.USD))).Success);
        fail.Armed = true;
        Assert.False((await fx.FundFloatAsync(b.Co, b.UserId, new FundFloatDto(Currency.KES, 10_000, AccountType.Cash, b.Cash.Id, null, null))).Success);

        await using var check = fresh();
        Assert.Empty(check.ExchangeTransactions);
        Assert.Empty(check.FloatMovements);
        Assert.Equal(1_000_000m, (await check.ExchangeFloats.SingleAsync(f => f.CompanyId == b.Co)).KesBalance);
        Assert.Equal(50_000m, (await check.CashAccounts.SingleAsync(c => c.Id == b.Cash.Id)).Balance);
    }
}
