using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Services;
using Xunit;
using static SARIFF.Tests.Bureau;

namespace SARIFF.Tests;

/// <summary>Line-by-line audit, Services/Transactions: one test per finding (see docs/line-audit-ledger.md).</summary>
public class LineAuditTransactionsTests
{
    // T1
    [Fact]
    public async Task A_posting_in_two_currencies_needs_the_amount_on_the_other_side()
    {
        var b = await CreateAsync();
        // USD 100 from Amina into the shilling till, with no shilling amount given.
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100, Currency.USD, counterCurrency: Currency.KES));

        Assert.False(r.Success, "USD 100 was booked as KES 100");
        Assert.Equal(0m, b.Cash.Balance);
        Assert.Equal(0m, b.Amina.BalanceUSD);
    }

    // T2
    [Fact]
    public async Task A_posting_in_one_currency_moves_the_same_amount_on_both_sides()
    {
        var b = await CreateAsync();
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100, Currency.KES, counterAmount: 90));

        Assert.False(r.Success, "KES 100 went onto the client and KES 90 into the till");
        Assert.Equal(0m, b.Cash.Balance);
        // the same amount spelled out twice is fine
        Assert.True((await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100, Currency.KES, counterAmount: 100, counterCurrency: Currency.KES))).Success);
        Assert.Equal(100m, b.Cash.Balance);
    }

    // T3
    [Theory]
    [InlineData(5, 3, 0)]   // unknown transaction type
    [InlineData(0, 9, 0)]   // unknown source account type
    [InlineData(0, 3, 9)]   // unknown destination account type
    public async Task Unknown_type_numbers_are_refused(int type, int source, int dest)
    {
        var b = await CreateAsync();
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting((TransactionType)type, (AccountType)source, b.Amina.Id, (AccountType)dest, b.Cash.Id, 100));

        Assert.False(r.Success);
        Assert.Empty(b.Db.Transactions);
    }

    // T4
    [Fact]
    public async Task A_transaction_cannot_be_dated_in_the_future_or_before_the_bureau_could_exist()
    {
        var b = await CreateAsync();
        Task<ApiResponse<TransactionResponseDto>> On(DateTime date) => b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100, date: date));

        Assert.False((await On(DateTime.UtcNow.AddDays(3))).Success, "dated three days from now");
        Assert.False((await On(new DateTime(1999, 12, 31, 0, 0, 0, DateTimeKind.Utc))).Success, "dated 1999");
        Assert.True((await On(DateTime.UtcNow.AddDays(-400))).Success);   // back-dating stays allowed
        Assert.True((await On(DateTime.UtcNow)).Success);
    }

    // T5
    [Fact]
    public async Task An_expense_leg_must_point_at_one_of_the_bureaus_own_categories()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 1_000; await b.Db.SaveChangesAsync();
        var other = await CreateAsync();   // another bureau's category

        var unknown = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Cash, b.Cash.Id, AccountType.Expense, Guid.NewGuid(), 100));
        b.Db.Add(new ExpenseCategory { Id = other.Rent.Id, CompanyId = other.Co, Name = "Theirs" }); await b.Db.SaveChangesAsync();
        var theirs = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Cash, b.Cash.Id, AccountType.Expense, other.Rent.Id, 100));

        Assert.False(unknown.Success, "cash left the till against a category that does not exist");
        Assert.False(theirs.Success, "cash left the till against another bureau's category");
        Assert.Equal(1_000m, b.Cash.Balance);
        Assert.True((await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Cash, b.Cash.Id, AccountType.Expense, b.Rent.Id, 100))).Success);
    }

    // S1
    [Fact]
    public async Task Todays_summary_counts_money_moved_into_the_exchange_float_as_out_of_the_till()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 1_000; await b.Db.SaveChangesAsync();
        var funded = await b.Exchange().FundFloatAsync(b.Co, b.UserId, new FundFloatDto(Currency.KES, 300, AccountType.Cash, b.Cash.Id, null, null));
        Assert.True(funded.Success, funded.Message);
        Assert.Equal(700m, b.Cash.Balance);

        var today = (await b.Transactions().GetTodaySummaryAsync(b.Co)).Data!;

        Assert.Equal(300m, today.TotalCreditKES);
        Assert.Equal(0m, today.TotalDebitKES);        // it was shown as 300 in AND 300 out
        Assert.Equal(-300m, today.NetFlowKES);
    }

    // Q1
    [Fact]
    public async Task The_currency_filter_finds_a_posting_by_either_of_its_currencies()
    {
        var b = await CreateAsync();
        Assert.True((await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100, Currency.USD,
                counterAmount: 13_000, counterCurrency: Currency.KES, rate: 130))).Success);

        var kes = (await b.Transactions().GetAllAsync(b.Co, 1, 10, new ReportFilterDto(null, null, null, Currency.KES, null))).Data!;
        var usd = (await b.Transactions().GetAllAsync(b.Co, 1, 10, new ReportFilterDto(null, null, null, Currency.USD, null))).Data!;
        var eur = (await b.Transactions().GetAllAsync(b.Co, 1, 10, new ReportFilterDto(null, null, null, Currency.EUR, null))).Data!;

        Assert.Single(usd.Items);
        Assert.Single(kes.Items);   // the till's shillings are on this posting too
        Assert.Empty(eur.Items);
    }

    // Q2
    [Fact]
    public async Task Editing_a_transaction_keeps_the_description_within_its_limit()
    {
        var b = await CreateAsync();
        var id = (await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100))).Data!.Id;

        Assert.False((await b.Transactions().UpdateAsync(b.Co, id, new UpdateTransactionDto(new string('x', 501), null))).Success);
        Assert.False((await b.Transactions().UpdateAsync(b.Co, id, new UpdateTransactionDto(null, new string('x', 2_001)))).Success);
        Assert.True((await b.Transactions().UpdateAsync(b.Co, id, new UpdateTransactionDto("Salary, March", "paid in two parts"))).Success);
    }

    // R1
    [Fact]
    public async Task A_count_can_only_be_recorded_for_one_of_the_bureaus_own_tills()
    {
        var b = await CreateAsync();
        var rec = new ReconciliationService(b.Db);

        Assert.False((await rec.CreateAsync(b.Co, new CreateReconciliationDto(AccountType.Bank, Guid.NewGuid(), 500, null))).Success);
        Assert.False((await rec.CreateAsync(b.Co, new CreateReconciliationDto(AccountType.Client, b.Amina.Id, 500, null))).Success);
        Assert.False((await rec.CreateAsync(Guid.NewGuid(), new CreateReconciliationDto(AccountType.Bank, b.Bank.Id, 500, null))).Success);
        Assert.True((await rec.CreateAsync(b.Co, new CreateReconciliationDto(AccountType.Bank, b.Bank.Id, 0, null))).Success);
        Assert.False((await rec.ReconcileTransactionAsync(b.Co, Guid.NewGuid(), b.UserId, new ReconcileTransactionDto(1, (ReconciliationStatus)9, null))).Success);
    }

    // R3
    [Fact]
    public async Task Reconciling_a_till_that_received_the_other_currency_uses_the_tills_own_amount()
    {
        var b = await CreateAsync();
        // Amina hands over USD 100; the shilling bank account takes KES 13,000.
        var id = (await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Bank, b.Bank.Id, 100, Currency.USD,
                counterAmount: 13_000, counterCurrency: Currency.KES, rate: 130))).Data!.Id;
        Assert.Equal(13_000m, b.Bank.Balance);
        var rec = new ReconciliationService(b.Db);

        var line = Assert.Single((await rec.GetAccountTransactionsAsync(b.Co, AccountType.Bank, b.Bank.Id, null)).Data!.Items);
        Assert.Equal(13_000m, line.Amount);          // it showed "USD 100" on a shilling account
        Assert.Equal(Currency.KES, line.Currency);

        Assert.True((await rec.BulkReconcileAsync(b.Co, b.UserId, new BulkReconcileDto(new List<Guid> { id }, ReconciliationStatus.Matched, null))).Success);
        var summary = (await rec.GetAccountBalanceSummaryAsync(b.Co, AccountType.Bank, b.Bank.Id)).Data!;
        Assert.Equal(13_000m, summary.ExpectedBalance);
        Assert.Equal(13_000m, summary.ActualBalance);
        Assert.Equal(0m, summary.Variance);
        Assert.Equal(13_000m, summary.MatchedAmount);

        // one short: KES 12,900 actually arrived
        Assert.True((await rec.ReconcileTransactionAsync(b.Co, id, b.UserId, new ReconcileTransactionDto(12_900, ReconciliationStatus.Unmatched, "100 short"))).Success);
        summary = (await rec.GetAccountBalanceSummaryAsync(b.Co, AccountType.Bank, b.Bank.Id)).Data!;
        Assert.Equal(-100m, summary.Variance);
    }

    // R4
    [Fact]
    public async Task A_reversed_posting_and_its_reversal_cancel_out_in_reconciliation()
    {
        var b = await CreateAsync();
        var id = (await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Bank, b.Bank.Id, 500))).Data!.Id;
        Assert.True((await b.Transactions().DeleteAsync(b.Co, id, b.UserId, new DeleteTransactionDto("entered twice"), b.Amina.Id)).Success);
        Assert.Equal(0m, b.Bank.Balance);

        var summary = (await new ReconciliationService(b.Db).GetAccountBalanceSummaryAsync(b.Co, AccountType.Bank, b.Bank.Id)).Data!;

        Assert.Equal(0, summary.PendingCount);        // the reversed posting sat in "pending" for ever
        Assert.Equal(0m, summary.ExpectedBalance);    // and the reversal alone made this −500
        Assert.Equal(0m, summary.Variance);
    }

    // I1
    [Fact]
    public async Task An_invoice_cannot_be_addressed_to_another_bureaus_client()
    {
        var b = await CreateAsync();
        var other = await CreateAsync();
        var dto = new CreateInvoiceDto(other.Amina.Id, "Amina Wanjiru", null, null, null, BureauClock.TodayLocal.AddDays(14), Currency.KES,
            new List<InvoiceItemDto> { new("Service", 1, 100) }, 0, 0, null, null);

        Assert.False((await new InvoiceService(b.Db).CreateAsync(b.Co, dto)).Success);
        Assert.True((await new InvoiceService(b.Db).CreateAsync(b.Co, dto with { ClientId = b.Amina.Id })).Success);
    }
}

/// <summary>Two requests at the same moment, against real PostgreSQL.</summary>
public class LineAuditTransactionsPostgresTests : IClassFixture<PostgresDatabase>
{
    private readonly PostgresDatabase _pg;
    public LineAuditTransactionsPostgresTests(PostgresDatabase pg) => _pg = pg;

    // T6
    [PostgresFact]
    public async Task Reversing_the_same_transaction_twice_at_once_reverses_it_once()
    {
        Guid co, user, amina, cash, txn;
        await using (var db = _pg.NewContext())
        {
            var b = await CreateAsync(db: db);
            txn = (await b.Transactions().CreateAsync(b.Co, b.UserId,
                Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 1_000))).Data!.Id;
            // more cash arrives, so a second (wrong) reversal would not be stopped by an empty till
            Assert.True((await b.Transactions().CreateAsync(b.Co, b.UserId,
                Posting(TransactionType.Credit, AccountType.Client, b.Baraka.Id, AccountType.Cash, b.Cash.Id, 5_000))).Success);
            (co, user, amina, cash) = (b.Co, b.UserId, b.Amina.Id, b.Cash.Id);
        }

        var results = await Task.WhenAll(Enumerable.Range(0, 6).Select(async _ =>
        {
            await using var own = _pg.NewContext();
            var svc = new TransactionService(own, NoOp<SARIFF.Core.Interfaces.INotificationService>.Create(),
                new SystemLogService(own, Microsoft.Extensions.Logging.Abstractions.NullLogger<SystemLogService>.Instance),
                new ClientAlertHelper(own), NoOp<IBalanceAlertService>.Create());
            return (await svc.DeleteAsync(co, txn, user, new DeleteTransactionDto("double click"), amina)).Success;
        }));

        await using var fresh = _pg.NewContext();
        Assert.Equal(1, results.Count(ok => ok));
        Assert.Equal(1, await fresh.Transactions.CountAsync(t => t.CompanyId == co && t.Reference.StartsWith("REV-")));
        Assert.Equal(5_000m, (await fresh.CashAccounts.FirstAsync(c => c.Id == cash)).Balance);   // 6,000 − 1,000, once
        Assert.Equal(0m, (await fresh.Users.FirstAsync(u => u.Id == amina)).BalanceKES);
    }
}
