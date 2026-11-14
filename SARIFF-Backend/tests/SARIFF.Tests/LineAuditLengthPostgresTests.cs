using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.Core.DTOs;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Services;
using Xunit;
using static SARIFF.Tests.Bureau;

namespace SARIFF.Tests;

/// <summary>
/// Line-by-line audit, Data (column sizes against the services' limits): LEN1. Only PostgreSQL
/// enforces column sizes, so these run against a real database.
/// </summary>
public class LineAuditLengthPostgresTests : IClassFixture<PostgresDatabase>
{
    private readonly PostgresDatabase _pg;
    public LineAuditLengthPostgresTests(PostgresDatabase pg) => _pg = pg;

    private static readonly string Long = new('d', 500);   // the most a description may hold

    // LEN1
    [PostgresFact]
    public async Task A_posting_with_the_longest_allowed_description_can_be_reversed()
    {
        await using var db = _pg.NewContext();
        var b = await CreateAsync(db: db);
        b.Cash.Balance = 10_000; await db.SaveChangesAsync();
        var tx = b.Transactions();
        // Cash to bank: client postings are reversed from the client statement instead.
        var posted = await tx.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Cash, b.Cash.Id, AccountType.Bank, b.Bank.Id, 100, description: Long));
        Assert.True(posted.Success, posted.Message);

        // "REVERSAL: " + 500 characters = 510, in a 500-character column: the reversal failed,
        // every time, for any posting described in more than 490 characters.
        var reversed = await tx.DeleteAsync(b.Co, posted.Data!.Id, b.UserId, new DeleteTransactionDto("Wrong client"));
        Assert.True(reversed.Success, reversed.Message);
    }

    // LEN1
    [PostgresFact]
    public async Task An_expense_with_the_longest_allowed_description_can_be_recorded_and_deleted()
    {
        await using var db = _pg.NewContext();
        var b = await CreateAsync(db: db);
        b.Cash.Balance = 10_000; await db.SaveChangesAsync();
        var svc = new ExpenseService(db, new SystemLogService(db, NullLogger<SystemLogService>.Instance));

        // Its posting is described "Expense: Rent - " + the description: 516 characters.
        var made = await svc.CreateAsync(b.Co, b.UserId, new CreateExpenseDto(b.Rent.Id, Long, null, 100, Currency.KES,
            PaymentMethod.Cash, AccountType.Cash, b.Cash.Id, null, DateTime.UtcNow.Date));
        Assert.True(made.Success, made.Message);
        Assert.True((await svc.DeleteAsync(b.Co, made.Data!.Id, b.UserId)).Success);
    }

    // LEN1
    [PostgresFact]
    public async Task An_expense_category_name_longer_than_its_column_is_refused_not_a_server_error()
    {
        await using var db = _pg.NewContext();
        var b = await CreateAsync(db: db);
        var svc = new ExpenseService(db, new SystemLogService(db, NullLogger<SystemLogService>.Instance));

        // The check allowed 255 characters; the column holds 100. The save threw.
        var r = await svc.CreateCategoryAsync(b.Co, new CreateExpenseCategoryDto(new string('c', 150), null));
        Assert.False(r.Success);
    }
}
