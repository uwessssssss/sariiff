using SARIFF.Core.DTOs;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Data;
using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

public class StatementTests
{
    private static DateTime D(int day, int hour = 10) => new(2026, 10, day, hour, 0, 0, DateTimeKind.Utc);

    private static IQueryable<SARIFF.Core.Entities.Transaction> Touching(AppDbContext db, AccountType type, Guid id) =>
        db.Transactions.Where(t => (t.SourceAccountType == type && t.SourceAccountId == id) ||
                                   (t.DestAccountType == type && t.DestAccountId == id));

    [Fact]
    public async Task Cash_statement_period_numbers_match_hand_calculation()
    {
        await using var db = TestDb.InMemory();
        var cash = Guid.NewGuid(); var client = Guid.NewGuid(); var bank = Guid.NewGuid();

        db.Transactions.AddRange(
            // before the period: +500, -200  -> opening 1,000 + 300 = 1,300
            TestDb.Txn(D(1), TransactionType.Debit, 500, Currency.KES, AccountType.Cash, cash, AccountType.Client, client),
            TestDb.Txn(D(2), TransactionType.Debit, 200, Currency.KES, AccountType.Client, client, AccountType.Cash, cash),
            // in the period: FX leg lands 12,950 KES in cash (viewer is destination, Credit -> cash debit)
            TestDb.Txn(D(3), TransactionType.Credit, 100, Currency.USD, AccountType.Bank, bank, AccountType.Cash, cash, 12_950, Currency.KES),
            // USD movement on the cash account: must not touch the KES statement
            TestDb.Txn(D(3, 11), TransactionType.Debit, 50, Currency.USD, AccountType.Cash, cash, AccountType.Client, client),
            // cash out 300, then its reversal (same legs, opposite type)
            TestDb.Txn(D(5), TransactionType.Credit, 300, Currency.KES, AccountType.Cash, cash, AccountType.Client, client),
            TestDb.Txn(D(6), TransactionType.Debit, 300, Currency.KES, AccountType.Cash, cash, AccountType.Client, client, reference: "REV-TXN-1"));
        await db.SaveChangesAsync();

        var helper = new StatementHelper(db);
        var st = await helper.BuildPeriodStatementAsync(
            Touching(db, AccountType.Cash, cash), AccountType.Cash, cash, "Cash KES", "CASH-KES", Currency.KES, 1_000m,
            new StatementFilterDto(new DateTime(2026, 10, 3), new DateTime(2026, 10, 6), null, null));

        Assert.Equal(1_300m, st.OpeningBalance);
        Assert.Equal(12_950m + 300m, st.TotalDebit);
        Assert.Equal(300m, st.TotalCredit);
        Assert.Equal(14_250m, st.ClosingBalance);
        Assert.Equal(st.ClosingBalance - st.OpeningBalance, st.NetMovement);
        Assert.Equal(3, st.Transactions.Count);              // the USD line is not on the KES statement
        Assert.All(st.Transactions, l => Assert.Equal(Currency.KES, l.Currency));
        Assert.Equal(D(6), st.Transactions[0].Date);        // newest first
    }

    [Fact]
    public async Task End_date_without_time_includes_that_whole_day()
    {
        await using var db = TestDb.InMemory();
        var bank = Guid.NewGuid(); var client = Guid.NewGuid();
        db.Transactions.Add(TestDb.Txn(D(10, 23), TransactionType.Debit, 75, Currency.KES, AccountType.Bank, bank, AccountType.Client, client));
        await db.SaveChangesAsync();

        var st = await new StatementHelper(db).BuildPeriodStatementAsync(
            Touching(db, AccountType.Bank, bank), AccountType.Bank, bank, "Bank", "BA", Currency.KES, 0m,
            new StatementFilterDto(new DateTime(2026, 10, 10), new DateTime(2026, 10, 10), null, null));

        Assert.Single(st.Transactions);
        Assert.Equal(75m, st.ClosingBalance);
    }

    [Fact]
    public async Task Client_is_a_liability_deposit_increases_the_balance()
    {
        await using var db = TestDb.InMemory();
        var cash = Guid.NewGuid(); var client = Guid.NewGuid();
        // cash receives 1,000 USD from the client: cash (source) Debit -> client (dest) Credit
        db.Transactions.Add(TestDb.Txn(D(4), TransactionType.Debit, 1_000, Currency.USD, AccountType.Cash, cash, AccountType.Client, client));
        // client withdraws 250 USD: cash (source) Credit -> client (dest) Debit
        db.Transactions.Add(TestDb.Txn(D(5), TransactionType.Credit, 250, Currency.USD, AccountType.Cash, cash, AccountType.Client, client));
        await db.SaveChangesAsync();

        var st = await new StatementHelper(db).BuildPeriodStatementAsync(
            Touching(db, AccountType.Client, client), AccountType.Client, client, "Client", "CL", Currency.USD, 0m,
            new StatementFilterDto(null, null, null, null));

        Assert.Equal(0m, st.OpeningBalance);
        Assert.Equal(1_000m, st.TotalCredit);
        Assert.Equal(250m, st.TotalDebit);
        Assert.Equal(750m, st.ClosingBalance);
    }

    /// <summary>
    /// Invariants on random ledgers: the opening of a period equals the closing of the
    /// day before it, and opening + debits - credits = closing (asset account).
    /// Guards the SQL opening-balance sum against the line-by-line running balance.
    /// </summary>
    [Theory]
    [InlineData(1)] [InlineData(2)] [InlineData(3)] [InlineData(4)] [InlineData(5)]
    public async Task Random_ledgers_split_anywhere_join_up_exactly(int seed)
    {
        var rnd = new Random(seed);
        await using var db = TestDb.InMemory();
        var bank = Guid.NewGuid();
        var others = Enumerable.Range(0, 4).Select(_ => Guid.NewGuid()).ToArray();
        var currencies = new[] { Currency.KES, Currency.USD };

        for (var i = 0; i < 150; i++)
        {
            var date = new DateTime(2026, 8, 1, 8, 0, 0, DateTimeKind.Utc).AddDays(rnd.Next(0, 60)).AddMinutes(rnd.Next(0, 600));
            var type = rnd.Next(2) == 0 ? TransactionType.Debit : TransactionType.Credit;
            var cur = currencies[rnd.Next(2)];
            var amount = rnd.Next(1, 100_000);
            var fx = rnd.Next(4) == 0;
            var other = others[rnd.Next(others.Length)];
            var t = rnd.Next(2) == 0
                ? TestDb.Txn(date, type, amount, cur, AccountType.Bank, bank, AccountType.Client, other,
                    fx ? rnd.Next(1, 100_000) : null, fx ? currencies[1 - Array.IndexOf(currencies, cur)] : null)
                : TestDb.Txn(date, type, amount, cur, AccountType.Client, other, AccountType.Bank, bank,
                    fx ? rnd.Next(1, 100_000) : null, fx ? currencies[1 - Array.IndexOf(currencies, cur)] : null);
            db.Transactions.Add(t);
        }
        await db.SaveChangesAsync();

        foreach (var cur in currencies)
        {
            var split = new DateTime(2026, 8, 1).AddDays(rnd.Next(1, 59));
            var helper = new StatementHelper(db);
            var before = await helper.BuildPeriodStatementAsync(Touching(db, AccountType.Bank, bank), AccountType.Bank, bank, "B", "B", cur, 5_000m,
                new StatementFilterDto(null, split.AddDays(-1), null, null));
            var after = await new StatementHelper(db).BuildPeriodStatementAsync(Touching(db, AccountType.Bank, bank), AccountType.Bank, bank, "B", "B", cur, 5_000m,
                new StatementFilterDto(split, null, null, null));
            var all = await new StatementHelper(db).BuildPeriodStatementAsync(Touching(db, AccountType.Bank, bank), AccountType.Bank, bank, "B", "B", cur, 5_000m,
                new StatementFilterDto(null, null, null, null));

            Assert.Equal(before.ClosingBalance, after.OpeningBalance);
            Assert.Equal(after.OpeningBalance + after.TotalDebit - after.TotalCredit, after.ClosingBalance);
            Assert.Equal(all.ClosingBalance, after.ClosingBalance);
            Assert.Equal(all.Transactions.Count, before.Transactions.Count + after.Transactions.Count);
        }
    }
}
