using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Services;
using Xunit;
using static SARIFF.Tests.Bureau;

namespace SARIFF.Tests;

public class ExpenseTests
{
    private static ExpenseService Svc(Bureau b) => new(b.Db, new SystemLogService(b.Db, NullLogger<SystemLogService>.Instance));

    private static CreateExpenseDto Pay(Bureau b, decimal amount, AccountType from, Guid account, Currency currency = Currency.KES,
        string description = "October rent", Guid? category = null, DateTime? date = null) =>
        new(category ?? b.Rent.Id, description, "Landlord Ltd", amount, currency, PaymentMethod.Cash, from, account, "INV-77",
            date ?? new DateTime(2026, 10, 5));

    [Fact]
    public async Task An_expense_paid_in_cash_lowers_the_till_and_writes_a_linked_ledger_line()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 50_000; await b.Db.SaveChangesAsync();

        var r = await Svc(b).CreateAsync(b.Co, b.UserId, Pay(b, 20_000, AccountType.Cash, b.Cash.Id));

        Assert.True(r.Success, r.Message);
        Assert.Equal(30_000m, b.Cash.Balance);
        Assert.Equal(("Rent", "Cash"), (r.Data!.CategoryName, r.Data.PaymentAccountName));
        var e = await b.Db.Expenses.SingleAsync();
        var t = await b.Db.Transactions.SingleAsync();
        Assert.Equal(t.Id, e.TransactionId);
        Assert.Equal(("EXP-" + e.Code, TransactionType.Credit, AccountType.Expense, b.Rent.Id), (t.Reference, t.TransactionType, t.DestAccountType, t.DestAccountId));
        Assert.Equal((50_000m, 30_000m), (t.SourceBalanceBefore, t.SourceBalanceAfter));
    }

    [Fact]
    public async Task Expenses_from_the_bank_and_mobile_money_check_the_account_and_its_currency()
    {
        var b = await CreateAsync();
        b.Bank.Balance = 1_000; b.Wallet.Balance = 500; await b.Db.SaveChangesAsync();
        var svc = Svc(b);

        Assert.True((await svc.CreateAsync(b.Co, b.UserId, Pay(b, 400, AccountType.Bank, b.Bank.Id))).Success);
        Assert.True((await svc.CreateAsync(b.Co, b.UserId, Pay(b, 200, AccountType.Mpesa, b.Wallet.Id))).Success);
        Assert.Equal((600m, 300m), (b.Bank.Balance, b.Wallet.Balance));

        Assert.Contains("Currency mismatch", (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 1, AccountType.Bank, b.Bank.Id, Currency.USD))).Message);
        Assert.Contains("Bank account not found", (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 1, AccountType.Bank, Guid.NewGuid()))).Message);
        Assert.Contains("Insufficient balance", (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 601, AccountType.Bank, b.Bank.Id))).Message);
        Assert.Contains("holds KES, not USD", (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 1, AccountType.Mpesa, b.Wallet.Id, Currency.USD))).Message);
        Assert.Contains("agent not found", (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 1, AccountType.Mpesa, Guid.NewGuid()))).Message);
        Assert.Contains("Insufficient balance", (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 301, AccountType.Mpesa, b.Wallet.Id))).Message);
        Assert.Equal(2, await b.Db.Expenses.CountAsync());
    }

    [Fact]
    public async Task Expenses_that_cannot_be_paid_or_described_are_refused()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 100; await b.Db.SaveChangesAsync();
        var svc = Svc(b);
        var otherBureausCategory = new ExpenseCategory { CompanyId = Guid.NewGuid(), Name = "Theirs" };
        b.Db.ExpenseCategories.Add(otherBureausCategory); await b.Db.SaveChangesAsync();

        Assert.Contains("Insufficient balance", (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 101, AccountType.Cash, b.Cash.Id))).Message);
        Assert.Contains("No cash account found for UGX", (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 1, AccountType.Cash, b.Cash.Id, Currency.UGX))).Message);
        Assert.Equal("Invalid category", (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 1, AccountType.Cash, b.Cash.Id, category: otherBureausCategory.Id))).Message);
        Assert.Equal("Invalid payment account type", (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 1, AccountType.Client, b.Amina.Id))).Message);
        Assert.Contains("Description is required", (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 1, AccountType.Cash, b.Cash.Id, description: " "))).Message);
        Assert.Contains("Expense amount", (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 0, AccountType.Cash, b.Cash.Id))).Message);
        Assert.Empty(b.Db.Expenses);
        Assert.Equal(100m, b.Cash.Balance);
    }

    [Fact]
    public async Task Deleting_an_expense_reverses_it_and_keeps_the_original_line_visible()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 1_000; b.Bank.Balance = 1_000; b.Wallet.Balance = 1_000; await b.Db.SaveChangesAsync();
        var svc = Svc(b);
        var cash = (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 100, AccountType.Cash, b.Cash.Id))).Data!;
        var bank = (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 200, AccountType.Bank, b.Bank.Id))).Data!;
        var wallet = (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 300, AccountType.Mpesa, b.Wallet.Id))).Data!;

        foreach (var id in new[] { cash.Id, bank.Id, wallet.Id })
            Assert.True((await svc.DeleteAsync(b.Co, id, b.UserId)).Success);

        Assert.Equal((1_000m, 1_000m, 1_000m), (b.Cash.Balance, b.Bank.Balance, b.Wallet.Balance));
        Assert.Equal(3, await b.Db.Transactions.CountAsync(t => t.Reference.StartsWith("REV-EXP-") && t.TransactionType == TransactionType.Debit));
        Assert.All(await b.Db.Transactions.Where(t => t.Reference.StartsWith("EXP-")).ToListAsync(), t =>
        {
            Assert.False(t.IsDeleted);
            Assert.StartsWith("[REVERSED]", t.Description);
        });
        Assert.Equal("Expense not found", (await svc.DeleteAsync(b.Co, cash.Id, b.UserId)).Message);
        Assert.False((await svc.GetByIdAsync(b.Co, cash.Id)).Success);
    }

    [Fact]
    public async Task Only_the_words_of_an_expense_can_be_edited_and_the_ledger_line_follows()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 1_000; await b.Db.SaveChangesAsync();
        var svc = Svc(b);
        var e = (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 100, AccountType.Cash, b.Cash.Id))).Data!;

        Assert.Contains("Amount cannot be changed", (await svc.UpdateAsync(b.Co, e.Id, new UpdateExpenseDto(null, null, 150, null))).Message);
        var u = await svc.UpdateAsync(b.Co, e.Id, new UpdateExpenseDto("November rent", "New Landlord", 100, "INV-78"));

        Assert.True(u.Success, u.Message);
        Assert.Equal(("November rent", "New Landlord", "INV-78"), (u.Data!.Description, u.Data.VendorPayee, u.Data.Reference));
        var t = await b.Db.Transactions.SingleAsync();
        Assert.Equal("Expense: Rent - November rent", t.Description);
        Assert.Contains("New Landlord", t.Notes);
        Assert.False((await svc.UpdateAsync(b.Co, Guid.NewGuid(), new UpdateExpenseDto("x", null, null, null))).Success);
    }

    [Fact]
    public async Task Lists_filter_by_day_and_currency_and_stats_add_up_per_currency()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 1_000; b.CashUsd.Balance = 100; await b.Db.SaveChangesAsync();
        var svc = Svc(b);
        var today = BureauClock.TodayLocal;
        await svc.CreateAsync(b.Co, b.UserId, Pay(b, 100, AccountType.Cash, b.Cash.Id, date: today));
        await svc.CreateAsync(b.Co, b.UserId, Pay(b, 40, AccountType.Cash, b.CashUsd.Id, Currency.USD, date: today));
        await svc.CreateAsync(b.Co, b.UserId, Pay(b, 60, AccountType.Cash, b.Cash.Id, date: new DateTime(2025, 1, 15)));

        var all = (await svc.GetAllAsync(b.Co, 1, 10)).Data!;
        Assert.Equal(3, all.TotalCount);
        Assert.Equal(new DateTime(2025, 1, 15), all.Items.Last().ExpenseDate);
        Assert.Single((await svc.GetAllAsync(b.Co, 1, 10, new ReportFilterDto(null, null, null, Currency.USD, null))).Data!.Items);
        Assert.Single((await svc.GetAllAsync(b.Co, 1, 10, new ReportFilterDto(new DateTime(2025, 1, 15), new DateTime(2025, 1, 15), null, null, null))).Data!.Items);
        Assert.Equal("Rent", (await svc.GetByIdAsync(b.Co, all.Items[0].Id)).Data!.CategoryName);

        var s = (await svc.GetStatsAsync(b.Co)).Data!;
        Assert.Equal((160m, 40m, 100m, 40m, 1), (s.TotalKES, s.TotalUSD, s.ThisMonthKES, s.ThisMonthUSD, s.ActiveCategories));
        Assert.Equal(2, s.ByCurrency!.Count);
    }

    [Fact]
    public async Task Categories_are_unique_named_and_kept_while_they_hold_expenses()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 1_000; await b.Db.SaveChangesAsync();
        var svc = Svc(b);

        var fuel = await svc.CreateCategoryAsync(b.Co, new CreateExpenseCategoryDto("Fuel", "Generator diesel"));
        Assert.True(fuel.Success, fuel.Message);
        Assert.Equal("Category already exists", (await svc.CreateCategoryAsync(b.Co, new CreateExpenseCategoryDto("Fuel", null))).Message);
        // Business names may hold digits and signs ("Fuel #2"); script is still refused (line audit, AC1).
        Assert.True((await svc.CreateCategoryAsync(b.Co, new CreateExpenseCategoryDto("Fuel #2", null))).Success);
        Assert.Contains("invalid content", (await svc.CreateCategoryAsync(b.Co, new CreateExpenseCategoryDto("<script>x</script>", null))).Message);
        Assert.Contains("invalid content", (await svc.CreateCategoryAsync(b.Co, new CreateExpenseCategoryDto("Water", "<script>x</script>"))).Message);

        await svc.CreateAsync(b.Co, b.UserId, Pay(b, 250, AccountType.Cash, b.Cash.Id));
        var listed = (await svc.GetCategoriesAsync(b.Co)).Data!;
        var rent = listed.Single(c => c.Name == "Rent");
        Assert.Equal((250m, 1), (rent.TotalKES, rent.TransactionCount));
        Assert.Equal(250m, rent.TotalsByCurrency!.Single().Amount);

        var renamed = await svc.UpdateCategoryAsync(b.Co, fuel.Data!.Id, new UpdateExpenseCategoryDto("Diesel", null, false));
        Assert.Equal(("Diesel", false), (renamed.Data!.Name, renamed.Data.IsActive));
        Assert.False((await svc.UpdateCategoryAsync(b.Co, Guid.NewGuid(), new UpdateExpenseCategoryDto("x", null, null))).Success);

        Assert.Contains("existing expenses", (await svc.DeleteCategoryAsync(b.Co, b.Rent.Id)).Message);
        Assert.True((await svc.DeleteCategoryAsync(b.Co, fuel.Data.Id)).Success);
        Assert.Equal("Category not found", (await svc.DeleteCategoryAsync(b.Co, fuel.Data.Id)).Message);
    }
}

public class ReconciliationTests
{
    private static ReconciliationService Svc(Bureau b) => new(b.Db);

    [Fact]
    public async Task A_count_that_matches_the_books_is_reconciled_at_once()
    {
        var b = await CreateAsync();
        b.Bank.Balance = 7_500; await b.Db.SaveChangesAsync();
        var r = await Svc(b).CreateAsync(b.Co, new CreateReconciliationDto(AccountType.Bank, b.Bank.Id, 7_500, "month end"));
        Assert.True(r.Success, r.Message);
        Assert.Equal((7_500m, 0m, ReconciliationStatus.Matched, "KCB", Currency.KES), (r.Data!.ExpectedBalance, r.Data.Variance, r.Data.Status, r.Data.AccountName, r.Data.Currency));
        Assert.NotNull(r.Data.ReconciledAt);
    }

    [Fact]
    public async Task A_shortfall_stays_pending_until_completed_as_unmatched()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 10_000; await b.Db.SaveChangesAsync();
        var svc = Svc(b);
        var r = (await svc.CreateAsync(b.Co, new CreateReconciliationDto(AccountType.Cash, b.Cash.Id, 9_950, null))).Data!;
        Assert.Equal((-50m, ReconciliationStatus.Pending), (r.Variance, r.Status));

        var done = await svc.CompleteAsync(b.Co, r.Id, b.UserId, new CompleteReconciliationDto(false, null));
        Assert.Equal(ReconciliationStatus.Unmatched, done.Data!.Status);
        Assert.False((await svc.CompleteAsync(b.Co, Guid.NewGuid(), b.UserId, new CompleteReconciliationDto(false, null))).Success);
        Assert.Equal(r.Id, (await svc.GetByIdAsync(b.Co, r.Id)).Data!.Id);
        Assert.False((await svc.GetByIdAsync(Guid.NewGuid(), r.Id)).Success);
        Assert.Equal(10_000m, (await svc.GetExpectedBalanceAsync(b.Co, AccountType.Cash, b.Cash.Id)).Data);
    }

    [Fact]
    public async Task A_till_cannot_be_counted_below_zero()
    {
        var b = await CreateAsync();
        var r = await Svc(b).CreateAsync(b.Co, new CreateReconciliationDto(AccountType.Cash, b.Cash.Id, -1, null));
        Assert.False(r.Success);
        Assert.Contains("can't be negative", r.Message);
    }

    [Fact]
    public async Task A_shilling_M_Pesa_wallet_in_a_Ugandan_bureau_is_reconciled_in_shillings()
    {
        var b = await CreateAsync(Currency.UGX);
        var mpesa = new MpesaAgent { CompanyId = b.Co, Code = "MP-9", AgentName = "M-Pesa Busia", PhoneNumber = "+254700000077", AgentNumber = "778899", Provider = MobileMoneyProvider.MPesa, Currency = Currency.KES, Balance = 3_000 };
        b.Db.MpesaAgents.Add(mpesa); await b.Db.SaveChangesAsync();
        var svc = Svc(b);

        var r = (await svc.CreateAsync(b.Co, new CreateReconciliationDto(AccountType.Mpesa, mpesa.Id, 3_000, null))).Data!;
        var listed = (await svc.GetAccountsWithStatsAsync(b.Co)).Data!.Single(a => a.Id == mpesa.Id);

        Assert.Equal(Currency.KES, r.Currency);              // not the bureau's UGX
        Assert.Equal(Currency.KES, listed.Currency);         // the same rule as the account list
        Assert.Equal("M-Pesa Busia", r.AccountName);
    }

    [Fact]
    public async Task Each_till_lists_how_many_of_its_lines_are_pending_matched_or_unmatched()
    {
        var b = await CreateAsync();
        var txns = b.Transactions();
        await txns.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 500));
        await txns.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Bank, b.Bank.Id, 300));
        var svc = Svc(b);
        var bankLine = await b.Db.Transactions.SingleAsync(t => t.DestAccountType == AccountType.Bank);
        await svc.ReconcileTransactionAsync(b.Co, bankLine.Id, b.UserId, new ReconcileTransactionDto(290, ReconciliationStatus.Unmatched, "bank shows 290"));

        var all = (await svc.GetAccountsWithStatsAsync(b.Co)).Data!;
        var cash = all.Single(a => a.Id == b.Cash.Id);
        var bank = all.Single(a => a.Id == b.Bank.Id);
        Assert.Equal((1, 0, 0, 500m), (cash.PendingCount, cash.MatchedCount, cash.UnmatchedCount, cash.Balance));
        Assert.Equal((0, 0, 1), (bank.PendingCount, bank.MatchedCount, bank.UnmatchedCount));
        Assert.Contains(all, a => a.AccountType == AccountType.Mpesa);
        Assert.Equal("KCB - 0011223344", bank.Name);
    }

    [Fact]
    public async Task Reconciling_one_line_records_what_the_bank_actually_showed()
    {
        var b = await CreateAsync();
        await b.Transactions().CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Bank, b.Bank.Id, 300));
        var line = await b.Db.Transactions.SingleAsync();
        var svc = Svc(b);

        Assert.Contains("Matched or Unmatched", (await svc.ReconcileTransactionAsync(b.Co, line.Id, b.UserId, new ReconcileTransactionDto(300, ReconciliationStatus.Pending, null))).Message);
        Assert.Contains("can't be negative", (await svc.ReconcileTransactionAsync(b.Co, line.Id, b.UserId, new ReconcileTransactionDto(-1, ReconciliationStatus.Matched, null))).Message);
        Assert.Equal("Transaction not found", (await svc.ReconcileTransactionAsync(b.Co, Guid.NewGuid(), b.UserId, new ReconcileTransactionDto(1, ReconciliationStatus.Matched, null))).Message);

        var r = await svc.ReconcileTransactionAsync(b.Co, line.Id, b.Amina.Id, new ReconcileTransactionDto(295, ReconciliationStatus.Unmatched, "fee 5"));
        Assert.True(r.Success, r.Message);
        Assert.Equal((295m, -5m, "Amina Wanjiru", "fee 5"), (r.Data!.ActualAmount!.Value, r.Data.Variance!.Value, r.Data.ReconciledByName, r.Data.ReconciliationNotes));

        // money paid INTO the bank counts as plus (it used to show as -300)
        var summary = (await svc.GetAccountBalanceSummaryAsync(b.Co, AccountType.Bank, b.Bank.Id)).Data!;
        Assert.Equal((300m, 295m, -5m, 1, 300m), (summary.ExpectedBalance, summary.ActualBalance, summary.Variance, summary.UnmatchedCount, summary.UnmatchedAmount));

        // a payment OUT of the bank, reconciled in full, takes it back down
        b.Bank.Balance = 300; await b.Db.SaveChangesAsync();
        var paid = (await b.Transactions().CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Bank, b.Bank.Id, AccountType.Cash, b.Cash.Id, 100))).Data!;
        await svc.ReconcileTransactionAsync(b.Co, paid.Id, b.UserId, new ReconcileTransactionDto(100, ReconciliationStatus.Matched, null));
        Assert.Equal(200m, (await svc.GetAccountBalanceSummaryAsync(b.Co, AccountType.Bank, b.Bank.Id)).Data!.ExpectedBalance);
    }

    [Fact]
    public async Task Bulk_reconciling_marks_every_line_as_seen_in_full()
    {
        var b = await CreateAsync();
        var txns = b.Transactions();
        for (var i = 1; i <= 3; i++)
            await txns.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100m * i));
        var ids = await b.Db.Transactions.Select(t => t.Id).ToListAsync();
        var svc = Svc(b);

        Assert.Contains("Matched or Unmatched", (await svc.BulkReconcileAsync(b.Co, b.UserId, new BulkReconcileDto(ids, ReconciliationStatus.Pending, null))).Message);
        Assert.Contains("No transactions specified", (await svc.BulkReconcileAsync(b.Co, b.UserId, new BulkReconcileDto(new List<Guid>(), ReconciliationStatus.Matched, null))).Message);
        Assert.Contains("No transactions found", (await svc.BulkReconcileAsync(b.Co, b.UserId, new BulkReconcileDto(new List<Guid> { Guid.NewGuid() }, ReconciliationStatus.Matched, null))).Message);

        var r = await svc.BulkReconcileAsync(b.Co, b.UserId, new BulkReconcileDto(ids.Take(2).ToList(), ReconciliationStatus.Matched, null));
        Assert.Equal(2, r.Data);
        var page = (await svc.GetAccountTransactionsAsync(b.Co, AccountType.Cash, b.Cash.Id, new ReconciliationFilterDto(ReconciliationStatus.Matched, null, null))).Data!;
        Assert.Equal(2, page.TotalCount);
        Assert.All(page.Items, i => Assert.Equal((i.Amount, 0m), (i.ActualAmount!.Value, i.Variance!.Value)));
        Assert.Equal(1, (await svc.GetAccountTransactionsAsync(b.Co, AccountType.Cash, b.Cash.Id, new ReconciliationFilterDto(ReconciliationStatus.Pending, null, null))).Data!.TotalCount);
        Assert.Equal(0, (await svc.GetAccountTransactionsAsync(b.Co, AccountType.Cash, b.Cash.Id, new ReconciliationFilterDto(null, new DateTime(2020, 1, 1), new DateTime(2020, 1, 2)))).Data!.TotalCount);
        Assert.Equal(3, (await svc.GetAccountTransactionsAsync(b.Co, AccountType.Cash, b.Cash.Id, null)).Data!.TotalCount);
    }

    [Fact]
    public async Task Reconciliations_list_newest_first_and_by_account_type()
    {
        var b = await CreateAsync();
        var svc = Svc(b);
        await svc.CreateAsync(b.Co, new CreateReconciliationDto(AccountType.Cash, b.Cash.Id, 0, null));
        await svc.CreateAsync(b.Co, new CreateReconciliationDto(AccountType.Bank, b.Bank.Id, 0, null));
        await svc.CreateAsync(b.Co, new CreateReconciliationDto(AccountType.Mpesa, b.Wallet.Id, 0, null));
        Assert.Equal(3, (await svc.GetAllAsync(b.Co)).Data!.Count);
        Assert.Equal("M-Pesa Moi Ave", (await svc.GetAllAsync(b.Co, AccountType.Mpesa)).Data!.Single().AccountName);
        Assert.Empty((await svc.GetAllAsync(Guid.NewGuid())).Data!);
    }
}

public class AccountServiceTests
{
    [Fact]
    public async Task A_bank_account_opens_with_its_opening_balance_and_a_unique_number()
    {
        var b = await CreateAsync();
        var svc = new BankAccountService(b.Db);
        var r = await svc.CreateAsync(b.Co, new CreateBankAccountDto("Equity Bank", "1234567890", "Test Bureau", "001", Currency.KES, 25_000));
        Assert.True(r.Success, r.Message);
        Assert.Equal((25_000m, 25_000m, 25_000m), (r.Data!.Balance, r.Data.OpeningBalance, r.Data.NetMovement));

        Assert.Equal("Account number already exists", (await svc.CreateAsync(b.Co, new CreateBankAccountDto("Equity Bank", "1234567890", "Test Bureau", null, Currency.KES, 0))).Message);
        Assert.Contains("isn't used by bureaus in Kenya", (await svc.CreateAsync(b.Co, new CreateBankAccountDto("Stanbic", "9988776655", "Test Bureau", null, Currency.UGX, 0))).Message);
        Assert.Contains("Account number", (await svc.CreateAsync(b.Co, new CreateBankAccountDto("Stanbic", "12", "Test Bureau", null, Currency.KES, 0))).Message);
        Assert.Contains("Opening balance", (await svc.CreateAsync(b.Co, new CreateBankAccountDto("Stanbic", "5566778899", "Test Bureau", null, Currency.KES, -1))).Message);
        Assert.Contains("Bank name", (await svc.CreateAsync(b.Co, new CreateBankAccountDto("B", "5566778899", "Test Bureau", null, Currency.KES, 0))).Message);
    }

    [Fact]
    public async Task A_bank_account_with_money_history_cannot_be_deleted_and_its_totals_follow_postings()
    {
        var b = await CreateAsync();
        var svc = new BankAccountService(b.Db);
        b.Bank.OpeningBalance = 1_000; b.Bank.Balance = 1_000; await b.Db.SaveChangesAsync();
        await b.Transactions().CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Bank, b.Bank.Id, 400));
        await b.Transactions().CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Bank, b.Bank.Id, AccountType.Cash, b.Cash.Id, 150));

        var one = (await svc.GetByIdAsync(b.Co, b.Bank.Id)).Data!;
        Assert.Equal((1_250m, 400m, 150m, 1_250m), (one.Balance, one.TotalDebit, one.TotalCredit, one.NetMovement));
        Assert.Contains("existing transactions", (await svc.DeleteAsync(b.Co, b.Bank.Id)).Message);

        var stats = (await svc.GetStatsAsync(b.Co)).Data!;
        Assert.Equal((2, 1_250m, 400m, 150m, 1_250m), (stats.TotalAccounts, stats.TotalBalanceKES, stats.TotalDebitKES, stats.TotalCreditKES, stats.NetMovementKES));
        Assert.Equal(2, stats.ByCurrency!.Count);

        var st = (await svc.GetStatementAsync(b.Co, b.Bank.Id, new StatementFilterDto(null, null, null, null))).Data!;
        Assert.Equal((1_000m, 1_250m, 2), (st.OpeningBalance, st.ClosingBalance, st.Transactions.Count));
        Assert.False((await svc.GetStatementAsync(b.Co, Guid.NewGuid(), new StatementFilterDto(null, null, null, null))).Success);

        Assert.True((await svc.DeleteAsync(b.Co, b.BankUsd.Id)).Success);       // never used
        Assert.Single((await svc.GetAllAsync(b.Co)).Data!);
        Assert.Equal("Bank account not found", (await svc.DeleteAsync(b.Co, b.BankUsd.Id)).Message);
    }

    [Fact]
    public async Task A_bank_accounts_names_and_status_can_change_but_must_stay_valid()
    {
        var b = await CreateAsync();
        var svc = new BankAccountService(b.Db);
        var r = await svc.UpdateAsync(b.Co, b.Bank.Id, new UpdateBankAccountDto("KCB Moi Avenue", "Sarif Ltd", "045", false));
        Assert.Equal(("KCB Moi Avenue", "Sarif Ltd", "045", false), (r.Data!.BankName, r.Data.AccountName, r.Data.BranchCode, r.Data.IsActive));
        Assert.Contains("Bank name", (await svc.UpdateAsync(b.Co, b.Bank.Id, new UpdateBankAccountDto("K", null, null, null))).Message);
        Assert.Contains("Account name", (await svc.UpdateAsync(b.Co, b.Bank.Id, new UpdateBankAccountDto(null, "1", null, null))).Message);
        Assert.False((await svc.UpdateAsync(b.Co, Guid.NewGuid(), new UpdateBankAccountDto(null, null, null, null))).Success);
        Assert.False((await svc.GetByIdAsync(Guid.NewGuid(), b.Bank.Id)).Success);
    }

    [Fact]
    public async Task One_cash_till_per_currency_and_only_currencies_the_country_uses()
    {
        var b = await CreateAsync(Currency.UGX);
        var svc = new CashAccountService(b.Db);
        var kes = await svc.CreateAsync(b.Co, new CreateCashAccountDto(Currency.KES, 50_000));   // Ugandan bureaus hold shillings from Kenya
        Assert.True(kes.Success, kes.Message);
        Assert.Contains("already exists", (await svc.CreateAsync(b.Co, new CreateCashAccountDto(Currency.KES))).Message);
        Assert.Contains("Opening balance", (await svc.CreateAsync(b.Co, new CreateCashAccountDto(Currency.KES, -5))).Message);

        var k = await CreateAsync(Currency.KES);
        Assert.Contains("isn't used by bureaus in Kenya", (await new CashAccountService(k.Db).CreateAsync(k.Co, new CreateCashAccountDto(Currency.UGX))).Message);

        Assert.Equal(50_000m, (await svc.GetByCurrencyAsync(b.Co, Currency.KES)).Data!.Balance);
        Assert.False((await new CashAccountService(k.Db).GetByCurrencyAsync(k.Co, Currency.UGX)).Success);
        Assert.Equal(4, (await svc.GetAllAsync(b.Co)).Data!.Count);
    }

    [Fact]
    public async Task Raising_the_opening_balance_raises_the_till_and_is_audited()
    {
        var b = await CreateAsync();
        var svc = new CashAccountService(b.Db);
        var r = await svc.UpdateAsync(b.Co, b.Cash.Id, new UpdateCashAccountDto(2_000));
        Assert.True(r.Success, r.Message);
        Assert.Equal((2_000m, 2_000m), (r.Data!.OpeningBalance, r.Data.Balance));
        Assert.Contains(b.Db.AuditLogs, a => a.EntityType == "CashAccount.OpeningBalance" && a.EntityId == b.Cash.Id);
        Assert.Contains("Opening balance", (await svc.UpdateAsync(b.Co, b.Cash.Id, new UpdateCashAccountDto(-1))).Message);
        Assert.False((await svc.UpdateAsync(b.Co, Guid.NewGuid(), new UpdateCashAccountDto(1))).Success);
        Assert.Equal(2_000m, (await svc.GetByIdAsync(b.Co, b.Cash.Id)).Data!.Balance);
        Assert.False((await svc.GetByIdAsync(b.Co, Guid.NewGuid())).Success);
    }

    [Fact]
    public async Task Cash_totals_statement_and_deletion_follow_that_currencys_postings()
    {
        var b = await CreateAsync();
        var svc = new CashAccountService(b.Db);
        await b.Transactions().CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 900));
        await b.Transactions().CreateAsync(b.Co, b.UserId, Posting(TransactionType.Debit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 300));

        var s = (await svc.GetStatsAsync(b.Co)).Data!;
        Assert.Equal((600m, 900m, 300m, 600m), (s.BalanceKES, s.TotalDebitKES, s.TotalCreditKES, s.NetMovementKES));
        Assert.Equal(3, s.ByCurrency!.Count);

        var st = (await svc.GetStatementAsync(b.Co, Currency.KES, new StatementFilterDto(null, null, null, null))).Data!;
        Assert.Equal((0m, 600m, 2), (st.OpeningBalance, st.ClosingBalance, st.Transactions.Count));
        Assert.False((await svc.GetStatementAsync(b.Co, Currency.UGX, new StatementFilterDto(null, null, null, null))).Success);

        Assert.Contains("existing transactions", (await svc.DeleteAsync(b.Co, b.Cash.Id)).Message);
        Assert.True((await svc.DeleteAsync(b.Co, b.CashEur.Id)).Success);
        Assert.Equal("Cash account not found", (await svc.DeleteAsync(b.Co, b.CashEur.Id)).Message);
    }

    [Fact]
    public async Task A_mobile_money_wallet_keeps_its_details_totals_and_history()
    {
        var b = await CreateAsync();
        var svc = new MpesaAgentService(b.Db);
        var made = await svc.CreateAsync(b.Co, new CreateMpesaAgentDto("M-Pesa Kisumu", "+254711000222", "445566", "S-12", MpesaAgentType.Super, 1_000));
        Assert.True(made.Success, made.Message);
        Assert.Equal("Agent number already exists", (await svc.CreateAsync(b.Co, new CreateMpesaAgentDto("M-Pesa Kisumu", "+254711000222", "445566", null, MpesaAgentType.Standard, 0))).Message);
        Assert.Contains("Phone number", (await svc.CreateAsync(b.Co, new CreateMpesaAgentDto("M-Pesa Nakuru", "0711", "778800", null, MpesaAgentType.Standard, 0))).Message);

        var id = made.Data!.Id;
        await b.Transactions().CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Mpesa, id, 500));
        var one = (await svc.GetByIdAsync(b.Co, id)).Data!;
        Assert.Equal((1_500m, 500m, 1_500m), (one.Balance, one.TotalDebit, one.NetMovement));

        var upd = await svc.UpdateAsync(b.Co, id, new UpdateMpesaAgentDto("M-Pesa Kisumu CBD", "S-13", MpesaAgentType.Standard, false));
        Assert.Equal(("M-Pesa Kisumu CBD", "S-13", false), (upd.Data!.AgentName, upd.Data.StoreNumber, upd.Data.IsActive));
        Assert.Contains("Agent name", (await svc.UpdateAsync(b.Co, id, new UpdateMpesaAgentDto("9", null, null, null))).Message);

        var stats = (await svc.GetStatsAsync(b.Co)).Data!;
        Assert.Equal(2, stats.TotalAgents);
        var st = (await svc.GetStatementAsync(b.Co, id, new StatementFilterDto(null, null, null, null))).Data!;
        Assert.Equal((1_000m, 1_500m), (st.OpeningBalance, st.ClosingBalance));

        Assert.Contains("existing transactions", (await svc.DeleteAsync(b.Co, id)).Message);
        Assert.True((await svc.DeleteAsync(b.Co, b.Wallet.Id)).Success);
        Assert.Single((await svc.GetAllAsync(b.Co)).Data!);
        Assert.False((await svc.GetByIdAsync(b.Co, b.Wallet.Id)).Success);
    }
}

public class RateServiceTests
{
    [Fact]
    public async Task The_rate_screen_sets_lists_and_converts_through_the_home_currency()
    {
        var b = await CreateAsync();
        var svc = new ExchangeRateService(b.Db);
        Assert.True((await svc.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(128.5m, 129.5m))).Success);
        Assert.True((await svc.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(129m, 130m))).Success);

        Assert.Equal(129m, (await svc.GetCurrentRateAsync(b.Co)).Data!.BuyRate);
        Assert.Equal(2, (await svc.GetHistoryAsync(b.Co)).Data!.Count);
        Assert.False((await svc.GetCurrentRateAsync(b.Co, Currency.EUR)).Success);

        var toUsd = (await svc.ConvertAsync(b.Co, new CurrencyConvertDto(13_000, Currency.KES, Currency.USD))).Data!;
        Assert.Equal((100m, 130m), (toUsd.ConvertedAmount, toUsd.Rate));               // bureau sells at 130
        var toKes = (await svc.ConvertAsync(b.Co, new CurrencyConvertDto(100, Currency.USD, Currency.KES))).Data!;
        Assert.Equal((12_900m, 129m), (toKes.ConvertedAmount, toKes.Rate));             // bureau buys at 129
        Assert.Equal(55m, (await svc.ConvertAsync(b.Co, new CurrencyConvertDto(55, Currency.USD, Currency.USD))).Data!.ConvertedAmount);
        Assert.Contains("must be KES", (await svc.ConvertAsync(b.Co, new CurrencyConvertDto(1, Currency.USD, Currency.EUR))).Message);
        Assert.Contains("No active EUR", (await svc.ConvertAsync(b.Co, new CurrencyConvertDto(1, Currency.KES, Currency.EUR))).Message);
    }

    [Fact]
    public async Task The_rate_screen_refuses_rates_that_make_no_sense()
    {
        var b = await CreateAsync();
        var svc = new ExchangeRateService(b.Db);
        Assert.Contains("greater than zero", (await svc.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(0, 1))).Message);
        Assert.Contains("less than sell", (await svc.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(2, 1))).Message);
        Assert.Contains("base currency", (await svc.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(1, 2, Currency.KES))).Message);
        Assert.Contains("isn't used", (await svc.SetRateAsync(b.Co, b.UserId, new SetExchangeRateDto(1, 2, Currency.UGX))).Message);

        await b.RateAsync(Currency.EUR, 140, 145);
        (await b.Db.ExchangeRates.SingleAsync()).BuyRate = 0; await b.Db.SaveChangesAsync();
        Assert.Contains("invalid", (await svc.ConvertAsync(b.Co, new CurrencyConvertDto(1, Currency.EUR, Currency.KES))).Message);
    }
}
