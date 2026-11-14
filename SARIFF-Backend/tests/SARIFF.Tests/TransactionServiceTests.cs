using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using Xunit;
using static SARIFF.Tests.Bureau;

namespace SARIFF.Tests;

/// <summary>
/// Posting money: double entry on every account type, the guards that refuse bad postings,
/// reversals, edits, lists and today's totals. Clients are liabilities (a deposit raises the
/// balance the bureau owes them); cash, bank and mobile money are assets.
/// </summary>
public class TransactionPostingTests
{
    [Fact]
    public async Task A_withdrawal_lowers_the_client_and_pays_out_cash_with_before_and_after_recorded()
    {
        var b = await CreateAsync();
        var svc = b.Transactions();
        Assert.True((await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 5_000))).Success);

        var r = await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Debit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 2_000));

        Assert.True(r.Success, r.Message);
        Assert.Equal(3_000m, b.Amina.BalanceKES);
        Assert.Equal(3_000m, b.Cash.Balance);
        Assert.Equal(5_000m, r.Data!.SourceBalanceBefore);
        Assert.Equal(3_000m, r.Data.SourceBalanceAfter);
        Assert.Equal(5_000m, r.Data.DestBalanceBefore);
        Assert.Equal(3_000m, r.Data.DestBalanceAfter);
        Assert.Equal("Amina Wanjiru", r.Data.SourceAccountName);
        Assert.Equal("Cash", r.Data.DestAccountName);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-5")]
    [InlineData("1.005")]
    [InlineData("1000000000")]
    public async Task Bad_amounts_are_refused_and_nothing_moves(string amount)
    {
        var b = await CreateAsync();
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, decimal.Parse(amount, System.Globalization.CultureInfo.InvariantCulture)));
        Assert.False(r.Success);
        Assert.Equal(0m, b.Cash.Balance);
        Assert.Empty(b.Db.Transactions);
    }

    [Fact]
    public async Task A_bad_counter_amount_rate_or_description_is_refused()
    {
        var b = await CreateAsync();
        var svc = b.Transactions();
        var badCounter = await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100, Currency.USD, counterAmount: -1, counterCurrency: Currency.KES));
        var badRate = await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100, rate: 0));
        var script = await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100, description: "<script>alert(1)</script>"));
        var same = await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Cash, b.Cash.Id, AccountType.Cash, b.Cash.Id, 100));

        Assert.Contains("Counter amount", badCounter.Message);
        Assert.Contains("Exchange rate", badRate.Message);
        Assert.Contains("invalid content", script.Message);
        Assert.Contains("cannot be the same", same.Message);
        Assert.Empty(b.Db.Transactions);
    }

    [Fact]
    public async Task An_account_of_another_bureau_is_treated_as_not_found()
    {
        var b = await CreateAsync();
        var r = await b.Transactions().CreateAsync(Guid.NewGuid(), b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100));
        Assert.False(r.Success);
        Assert.Contains("not found", r.Message);
        Assert.Equal(0m, b.Amina.BalanceKES);
    }

    [Fact]
    public async Task A_bank_to_till_transfer_keeps_the_total()
    {
        var b = await CreateAsync();
        b.Bank.Balance = 50_000; await b.Db.SaveChangesAsync();

        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Bank, b.Bank.Id, AccountType.Cash, b.Cash.Id, 20_000));

        Assert.True(r.Success, r.Message);
        Assert.Equal(30_000m, b.Bank.Balance);
        Assert.Equal(20_000m, b.Cash.Balance);
        Assert.Equal("KCB", r.Data!.SourceAccountName);
        Assert.Equal(ReconciliationStatus.Pending, r.Data.ReconciliationStatus);
    }

    [Fact]
    public async Task A_bank_cannot_pay_more_than_it_holds()
    {
        var b = await CreateAsync();
        b.Bank.Balance = 1_000; await b.Db.SaveChangesAsync();
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Bank, b.Bank.Id, AccountType.Cash, b.Cash.Id, 1_000.01m));
        Assert.False(r.Success);
        Assert.Contains("Insufficient", r.Message);
        Assert.Equal(1_000m, b.Bank.Balance);
    }

    [Fact]
    public async Task A_destination_till_cannot_go_below_zero_either()
    {
        var b = await CreateAsync();
        // dest gets the opposite type: Debit on the client source = Credit (money out) on the till
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Debit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 10));
        Assert.False(r.Success);
        Assert.Contains("Insufficient Cash", r.Message);
    }

    [Fact]
    public async Task An_M_Pesa_wallet_takes_shillings_and_refuses_dollars()
    {
        var b = await CreateAsync();
        var ok = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Mpesa, b.Wallet.Id, 700));
        var usd = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Mpesa, b.Wallet.Id, 5, Currency.USD));

        Assert.True(ok.Success, ok.Message);
        Assert.Equal(700m, b.Wallet.Balance);
        Assert.Equal("M-Pesa Moi Ave", ok.Data!.DestAccountName);
        Assert.False(usd.Success);
        Assert.Contains("doesn't hold USD", usd.Message);
    }

    [Fact]
    public async Task A_wallet_saved_without_a_currency_holds_the_home_currency()
    {
        var b = await CreateAsync();
        b.Wallet.Currency = null; await b.Db.SaveChangesAsync();
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Mpesa, b.Wallet.Id, 250));
        Assert.True(r.Success, r.Message);
        Assert.Equal(250m, b.Wallet.Balance);
    }

    [Fact]
    public async Task Shillings_in_a_Ugandan_bureau_and_shillings_out_keep_a_per_currency_row()
    {
        var b = await CreateAsync(Currency.UGX);
        var svc = b.Transactions();
        Assert.True((await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 600_000, Currency.UGX))).Success);
        Assert.True((await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Debit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 150_000, Currency.UGX))).Success);

        var row = await b.Db.ClientCurrencyBalances.SingleAsync(x => x.ClientId == b.Amina.Id && x.Currency == Currency.UGX);
        Assert.Equal(450_000m, row.Balance);
        Assert.Equal(600_000m, row.TotalIn);
        Assert.Equal(150_000m, row.TotalOut);
        Assert.Equal(0m, b.Amina.BalanceKES);            // UGX never lands in the KES column
        Assert.Equal(450_000m, b.Cash.Balance);
    }

    [Fact]
    public async Task A_Kenyan_bureau_cannot_start_UGX_but_can_settle_UGX_it_already_holds()
    {
        var b = await CreateAsync(Currency.KES);
        var ugxTill = new CashAccount { CompanyId = b.Co, Currency = Currency.UGX, Code = "CASH-UGX" };
        b.Db.CashAccounts.Add(ugxTill);
        await b.Db.SaveChangesAsync();
        var svc = b.Transactions();

        var fresh = await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, ugxTill.Id, 1_000, Currency.UGX));
        Assert.False(fresh.Success);
        Assert.Contains("isn't used by bureaus in Kenya", fresh.Message);

        // money from before the rule: a client's UGX balance and the till holding it
        ugxTill.Balance = 1_000;
        b.Db.ClientCurrencyBalances.Add(new ClientCurrencyBalance { CompanyId = b.Co, ClientId = b.Amina.Id, Currency = Currency.UGX, Balance = 1_000 });
        await b.Db.SaveChangesAsync();
        var settle = await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Debit, AccountType.Client, b.Amina.Id, AccountType.Cash, ugxTill.Id, 400, Currency.UGX));
        Assert.True(settle.Success, settle.Message);
        Assert.Equal(600m, ugxTill.Balance);
    }

    [Fact]
    public async Task A_dollar_deposit_paid_in_shillings_moves_each_side_in_its_own_currency()
    {
        var b = await CreateAsync();
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100, Currency.USD,
                counterAmount: 13_000, counterCurrency: Currency.KES, rate: 130));

        Assert.True(r.Success, r.Message);
        Assert.Equal(100m, b.Amina.BalanceUSD);
        Assert.Equal(0m, b.Amina.BalanceKES);
        Assert.Equal(13_000m, b.Cash.Balance);
        Assert.Equal(13_000m, r.Data!.CounterAmount);
        Assert.Equal(Currency.KES, r.Data.CounterCurrency);
        Assert.Equal(130m, r.Data.ExchangeRate);
    }

    [Fact]
    public async Task Same_currency_counter_amount_is_not_stored_as_forex()
    {
        var b = await CreateAsync();
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 500, Currency.KES, counterAmount: 500, counterCurrency: Currency.KES));
        Assert.True(r.Success, r.Message);
        Assert.Null(r.Data!.CounterAmount);
        Assert.Null(r.Data.CounterCurrency);
    }

    [Fact]
    public async Task A_client_to_client_transfer_needs_no_reconciliation()
    {
        var b = await CreateAsync();
        var svc = b.Transactions();
        await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 1_000));
        // Amina pays Baraka: Amina (source) Debit, Baraka (dest) Credit
        var r = await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Debit, AccountType.Client, b.Amina.Id, AccountType.Client, b.Baraka.Id, 400));
        Assert.True(r.Success, r.Message);
        Assert.Equal(600m, b.Amina.BalanceKES);
        Assert.Equal(400m, b.Baraka.BalanceKES);
        Assert.Equal(ReconciliationStatus.Matched, r.Data!.ReconciliationStatus);
    }

    [Fact]
    public async Task An_expense_paid_from_the_till_lowers_the_till_and_names_the_category()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 9_000; await b.Db.SaveChangesAsync();
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Cash, b.Cash.Id, AccountType.Expense, b.Rent.Id, 4_000));
        Assert.True(r.Success, r.Message);
        Assert.Equal(5_000m, b.Cash.Balance);
        Assert.Equal("Rent", r.Data!.DestAccountName);
    }

    [Fact]
    public async Task A_back_dated_posting_keeps_its_date()
    {
        var b = await CreateAsync();
        var when = new DateTime(2026, 10, 1, 7, 30, 0, DateTimeKind.Utc);
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100, date: when));
        Assert.Equal(when, r.Data!.TransactionDate);
    }

    [Fact]
    public async Task A_client_falling_below_the_threshold_gets_a_low_balance_alert()
    {
        var b = await CreateAsync();
        var svc = b.Transactions();
        await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 15_000));
        Assert.DoesNotContain(b.Db.ClientAlerts, a => a.Title == "Low Balance Alert");

        await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Debit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 6_000));

        Assert.Contains(b.Db.ClientAlerts, a => a.ClientId == b.Amina.Id && a.Title == "Low Balance Alert" && a.Message.Contains("9,000.00"));
    }

    [Fact]
    public async Task A_failing_SMS_after_the_posting_does_not_undo_or_fail_it()
    {
        var b = await CreateAsync();
        var r = await b.Transactions(Throwing<INotificationService>.Create()).CreateAsync(b.Co, b.UserId,
            Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 2_500));
        Assert.True(r.Success, r.Message);
        Assert.Equal(2_500m, b.Amina.BalanceKES);
        Assert.Single(b.Db.Transactions);
        Assert.Contains(b.Db.SystemLogs, l => l.Message.Contains("follow-up"));
    }
}

public class TransactionReversalTests
{
    private static DeleteTransactionDto Why => new("entered twice");

    private static async Task<(Bureau B, TransactionResponseDto Deposit)> DepositAsync(decimal amount = 3_000)
    {
        var b = await CreateAsync();
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, amount));
        Assert.True(r.Success, r.Message);
        return (b, r.Data!);
    }

    [Fact]
    public async Task Reversing_from_the_client_statement_puts_both_sides_back_and_keeps_the_original_visible()
    {
        var (b, dep) = await DepositAsync();
        var r = await b.Transactions().DeleteAsync(b.Co, dep.Id, b.UserId, Why, clientContext: b.Amina.Id);

        Assert.True(r.Success, r.Message);
        Assert.Equal(0m, b.Amina.BalanceKES);
        Assert.Equal(0m, b.Cash.Balance);
        var original = await b.Db.Transactions.SingleAsync(t => t.Id == dep.Id);
        Assert.False(original.IsDeleted);                       // still on the statement
        Assert.NotNull(original.DeletedAt);
        Assert.StartsWith("[REVERSED]", original.Description);
        Assert.Equal("entered twice", original.DeleteReason);
        var reversal = await b.Db.Transactions.SingleAsync(t => t.Reference.StartsWith("REV-"));
        Assert.Equal(TransactionType.Debit, reversal.TransactionType);
        Assert.Equal(ReconciliationStatus.Matched, reversal.ReconciliationStatus);
        Assert.Contains(b.Db.ClientAlerts, a => a.Title == "Transaction Reversed");

        var shown = (await b.Transactions().GetByIdAsync(b.Co, dep.Id)).Data!;
        Assert.True(shown.IsReversed);
        Assert.True((await b.Transactions().GetByIdAsync(b.Co, reversal.Id)).Data!.IsReversal);
    }

    [Fact]
    public async Task A_transaction_is_reversed_once_and_a_reversal_is_never_reversed()
    {
        var (b, dep) = await DepositAsync();
        var svc = b.Transactions();
        await svc.DeleteAsync(b.Co, dep.Id, b.UserId, Why, b.Amina.Id);
        var again = await svc.DeleteAsync(b.Co, dep.Id, b.UserId, Why, b.Amina.Id);
        var reversal = await b.Db.Transactions.SingleAsync(t => t.Reference.StartsWith("REV-"));
        var ofReversal = await svc.DeleteAsync(b.Co, reversal.Id, b.UserId, Why, b.Amina.Id);

        Assert.Contains("already been reversed", again.Message);
        Assert.Contains("Cannot reverse a reversal", ofReversal.Message);
        Assert.Equal(0m, b.Amina.BalanceKES);
    }

    [Fact]
    public async Task Client_money_is_only_reversed_from_that_clients_statement()
    {
        var (b, dep) = await DepositAsync();
        var general = await b.Transactions().DeleteAsync(b.Co, dep.Id, b.UserId, Why);
        var wrongClient = await b.Transactions().DeleteAsync(b.Co, dep.Id, b.UserId, Why, b.Baraka.Id);
        Assert.Contains("only be deleted from the client statement", general.Message);
        Assert.Contains("does not belong to this client", wrongClient.Message);
        Assert.Equal(3_000m, b.Amina.BalanceKES);
    }

    [Theory]
    [InlineData("EXC-EX-1", "Void Exchange")]
    [InlineData("EXP-1", "Delete the expense")]
    [InlineData("FLOAT-TXN", "Exchange module")]
    public async Task Postings_owned_by_another_module_are_refused(string reference, string expected)
    {
        var b = await CreateAsync();
        var t = TestDb.Txn(DateTime.UtcNow, TransactionType.Debit, 100, Currency.KES, AccountType.Cash, b.Cash.Id, AccountType.Bank, b.Bank.Id, reference: reference, companyId: b.Co);
        b.Db.Transactions.Add(t); await b.Db.SaveChangesAsync();
        var r = await b.Transactions().DeleteAsync(b.Co, t.Id, b.UserId, Why);
        Assert.False(r.Success);
        Assert.Contains(expected, r.Message);
    }

    [Fact]
    public async Task An_unknown_or_other_bureaus_transaction_is_not_found()
    {
        var (b, dep) = await DepositAsync();
        Assert.Equal("Transaction not found", (await b.Transactions().DeleteAsync(b.Co, Guid.NewGuid(), b.UserId, Why)).Message);
        Assert.Equal("Transaction not found", (await b.Transactions().DeleteAsync(Guid.NewGuid(), dep.Id, b.UserId, Why, b.Amina.Id)).Message);
    }

    [Fact]
    public async Task A_transfer_between_tills_reverses_without_a_client()
    {
        var b = await CreateAsync();
        b.Bank.Balance = 5_000; await b.Db.SaveChangesAsync();
        var t = (await b.Transactions().CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Bank, b.Bank.Id, AccountType.Cash, b.Cash.Id, 2_000))).Data!;
        var r = await b.Transactions().DeleteAsync(b.Co, t.Id, b.UserId, Why);
        Assert.True(r.Success, r.Message);
        Assert.Equal(5_000m, b.Bank.Balance);
        Assert.Equal(0m, b.Cash.Balance);
    }

    [Fact]
    public async Task A_forex_posting_reverses_each_side_in_its_own_currency()
    {
        var b = await CreateAsync();
        var t = (await b.Transactions().CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id,
            100, Currency.USD, counterAmount: 13_000, counterCurrency: Currency.KES))).Data!;
        var r = await b.Transactions().DeleteAsync(b.Co, t.Id, b.UserId, Why, b.Amina.Id);
        Assert.True(r.Success, r.Message);
        Assert.Equal(0m, b.Amina.BalanceUSD);
        Assert.Equal(0m, b.Cash.Balance);
    }

    [Fact]
    public async Task A_reversal_that_would_overdraw_the_destination_till_is_refused()
    {
        var b = await CreateAsync();
        b.Bank.Balance = 5_000; await b.Db.SaveChangesAsync();
        var svc = b.Transactions();
        var t = (await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Bank, b.Bank.Id, AccountType.Cash, b.Cash.Id, 2_000))).Data!;
        // the 2,000 has since left the till
        await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Cash, b.Cash.Id, AccountType.Expense, b.Rent.Id, 1_500));
        var r = await svc.DeleteAsync(b.Co, t.Id, b.UserId, Why);
        Assert.False(r.Success);
        Assert.Contains("would go below zero", r.Message);
        Assert.Equal(500m, b.Cash.Balance);
    }
}

public class TransactionQueryTests
{
    private static async Task<(Bureau B, List<TransactionResponseDto> Made)> ThreeAsync()
    {
        var b = await CreateAsync();
        var svc = b.Transactions();
        var made = new List<TransactionResponseDto>
        {
            (await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100, date: new DateTime(2026, 10, 1, 9, 0, 0, DateTimeKind.Utc)))).Data!,
            (await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Bank, b.BankUsd.Id, 50, Currency.USD, date: new DateTime(2026, 10, 2, 9, 0, 0, DateTimeKind.Utc)))).Data!,
            (await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Debit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 40, date: new DateTime(2026, 10, 3, 9, 0, 0, DateTimeKind.Utc)))).Data!,
        };
        Assert.All(made, m => Assert.NotNull(m));
        return (b, made);
    }

    [Fact]
    public async Task Lists_page_newest_first_and_filter_by_type_currency_and_bureau_days()
    {
        var (b, made) = await ThreeAsync();
        var svc = b.Transactions();

        var page1 = (await svc.GetAllAsync(b.Co, 1, 2)).Data!;
        Assert.Equal(3, page1.TotalCount);
        Assert.Equal(new[] { made[2].Id, made[1].Id }, page1.Items.Select(i => i.Id));
        Assert.Equal(made[0].Id, (await svc.GetAllAsync(b.Co, 2, 2)).Data!.Items.Single().Id);

        Assert.Equal(made[1].Id, (await svc.GetAllAsync(b.Co, 1, 10, new ReportFilterDto(null, null, null, Currency.USD, null))).Data!.Items.Single().Id);
        Assert.Equal(made[2].Id, (await svc.GetAllAsync(b.Co, 1, 10, new ReportFilterDto(null, null, TransactionType.Debit, null, null))).Data!.Items.Single().Id);
        var oct2 = (await svc.GetAllAsync(b.Co, 1, 10, new ReportFilterDto(new DateTime(2026, 10, 2), new DateTime(2026, 10, 2), null, null, null))).Data!;
        Assert.Equal(made[1].Id, oct2.Items.Single().Id);
        Assert.Equal(0, (await svc.GetAllAsync(Guid.NewGuid(), 1, 10)).Data!.TotalCount);
    }

    [Fact]
    public async Task One_transaction_and_the_most_recent_ones_carry_account_names()
    {
        var (b, made) = await ThreeAsync();
        var svc = b.Transactions();
        var one = await svc.GetByIdAsync(b.Co, made[1].Id);
        Assert.True(one.Success);
        Assert.Equal("Stanbic USD", one.Data!.DestAccountName);
        Assert.False((await svc.GetByIdAsync(b.Co, Guid.NewGuid())).Success);
        Assert.False((await svc.GetByIdAsync(Guid.NewGuid(), made[1].Id)).Success);

        var recent = (await svc.GetRecentAsync(b.Co, 2)).Data!;
        Assert.Equal(new[] { made[2].Id, made[1].Id }, recent.Select(r => r.Id));
        Assert.All(recent, r => Assert.Equal("Amina Wanjiru", r.SourceAccountName));
    }

    [Fact]
    public async Task Names_for_a_whole_page_cover_every_account_type()
    {
        var b = await CreateAsync();
        var rows = new List<Transaction>
        {
            TestDb.Txn(DateTime.UtcNow, TransactionType.Debit, 1, Currency.KES, AccountType.Bank, b.Bank.Id, AccountType.Mpesa, b.Wallet.Id, companyId: b.Co),
            TestDb.Txn(DateTime.UtcNow, TransactionType.Debit, 1, Currency.KES, AccountType.Client, b.Baraka.Id, AccountType.Expense, b.Rent.Id, companyId: b.Co),
            TestDb.Txn(DateTime.UtcNow, TransactionType.Debit, 1, Currency.KES, AccountType.Cash, b.Cash.Id, AccountType.Mpesa, Guid.NewGuid(), companyId: b.Co),
        };
        var dtos = await b.Transactions().ToResponsesAsync(rows);
        Assert.Equal(("KCB", "M-Pesa Moi Ave"), (dtos[0].SourceAccountName, dtos[0].DestAccountName));
        Assert.Equal(("Baraka Otieno", "Rent"), (dtos[1].SourceAccountName, dtos[1].DestAccountName));
        Assert.Equal(("Cash", "M-Pesa"), (dtos[2].SourceAccountName, dtos[2].DestAccountName));   // unknown wallet → generic name
    }

    [Fact]
    public async Task Only_the_description_and_notes_can_be_edited()
    {
        var (b, made) = await ThreeAsync();
        var svc = b.Transactions();
        var r = await svc.UpdateAsync(b.Co, made[0].Id, new UpdateTransactionDto("Deposit at counter 2", "receipt 445"));
        Assert.True(r.Success, r.Message);
        Assert.Equal("Deposit at counter 2", r.Data!.Description);
        Assert.Equal("receipt 445", r.Data.Notes);
        Assert.Equal(100m, r.Data.Amount);

        var kept = await svc.UpdateAsync(b.Co, made[0].Id, new UpdateTransactionDto(null, null));
        Assert.Equal("Deposit at counter 2", kept.Data!.Description);
        Assert.False((await svc.UpdateAsync(b.Co, Guid.NewGuid(), new UpdateTransactionDto("x", null))).Success);
    }

    [Theory]
    [InlineData("REV-TXN-1", "reversal")]
    [InlineData("EXC-EX-1", "exchange")]
    [InlineData("EXP-1", "expense")]
    [InlineData("FLOAT-TXN", "float")]
    public async Task Entries_owned_by_another_module_cannot_be_edited(string reference, string expected)
    {
        var b = await CreateAsync();
        var t = TestDb.Txn(DateTime.UtcNow, TransactionType.Debit, 100, Currency.KES, AccountType.Cash, b.Cash.Id, AccountType.Bank, b.Bank.Id, reference: reference, companyId: b.Co);
        b.Db.Transactions.Add(t); await b.Db.SaveChangesAsync();
        var r = await b.Transactions().UpdateAsync(b.Co, t.Id, new UpdateTransactionDto("changed", null));
        Assert.False(r.Success);
        Assert.Contains(expected, r.Message);
    }

    [Fact]
    public async Task A_reversed_transaction_cannot_be_edited()
    {
        var b = await CreateAsync();
        var svc = b.Transactions();
        var dep = (await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100))).Data!;
        await svc.DeleteAsync(b.Co, dep.Id, b.UserId, new DeleteTransactionDto("mistake"), b.Amina.Id);
        Assert.Contains("reversed", (await svc.UpdateAsync(b.Co, dep.Id, new UpdateTransactionDto("x", null))).Message);
    }

    [Fact]
    public async Task Todays_totals_count_till_legs_in_their_own_currency()
    {
        var b = await CreateAsync();
        b.Bank.Balance = 1_000; await b.Db.SaveChangesAsync();
        var svc = b.Transactions();
        await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Bank, b.Bank.Id, AccountType.Cash, b.Cash.Id, 300));          // till ⇄ till: in and out
        await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Client, b.Amina.Id, AccountType.Cash, b.Cash.Id, 100, Currency.USD, 13_000, Currency.KES)); // KES in
        await svc.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Debit, AccountType.Client, b.Amina.Id, AccountType.Client, b.Baraka.Id, 10, Currency.USD)); // no till

        var s = (await svc.GetTodaySummaryAsync(b.Co)).Data!;
        Assert.Equal(3, s.TotalCount);
        Assert.Equal(13_300m, s.TotalDebitKES);
        Assert.Equal(300m, s.TotalCreditKES);
        Assert.Equal(13_000m, s.NetFlowKES);
        Assert.Equal(0m, s.TotalDebitUSD);
        Assert.Single(s.ByCurrency);
    }
}
