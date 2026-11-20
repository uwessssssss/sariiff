using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>
/// Income accounts the bureau creates itself, income received into them, their statements.
/// (Owner, 20 Nov: "I want to create type of income account. There should be statements of
/// particular income." Withholding tax left out on his instruction.)
/// </summary>
public class IncomeTests
{
    private static IncomeService Svc(Bureau b) => new(b.Db, b.Transactions());

    private static async Task<Guid> Account(Bureau b, string name)
    {
        var r = await Svc(b).CreateAccountAsync(b.Co, new CreateIncomeAccountDto(name));
        Assert.True(r.Success, r.Message);
        return r.Data!.Id;
    }

    private static RecordIncomeDto Into(Guid account, AccountType dest, Guid destId, decimal amount, Currency cur = Currency.KES, DateTime? date = null, string? what = null) =>
        new(account, dest, destId, cur, amount, date, what);

    private static async Task<IncomeCurrencyDto> Summary(Bureau b, Currency cur) =>
        (await Svc(b).SummaryAsync(b.Co, null, null)).Data!.ByCurrency.Single(x => x.Currency == cur);

    [Fact]
    public async Task The_bureau_names_its_own_income_accounts_and_names_are_unique()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        await Account(b, "Commission");
        await Account(b, "Consultancy");
        Assert.False((await Svc(b).CreateAccountAsync(b.Co, new CreateIncomeAccountDto("consultancy"))).Success);
        Assert.False((await Svc(b).CreateAccountAsync(b.Co, new CreateIncomeAccountDto("   "))).Success);
        Assert.False((await Svc(b).CreateAccountAsync(b.Co, new CreateIncomeAccountDto(new string('x', 101)))).Success);
        var list = (await Svc(b).GetAccountsAsync(b.Co)).Data!;
        Assert.Equal(new[] { "Commission", "Consultancy" }, list.Select(a => a.Name));
    }

    [Fact]
    public async Task Income_into_a_wallet_is_Dr_wallet_Cr_income_and_shows_in_the_summary()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var commission = await Account(b, "Commission");
        var r = await Svc(b).RecordAsync(b.Co, b.UserId, Into(commission, AccountType.Mpesa, b.Wallet.Id, 9_000m, what: "October"));
        Assert.True(r.Success, r.Message);
        Assert.Equal(9_000m, b.Db.MpesaAgents.Single(a => a.Id == b.Wallet.Id).Balance);
        Assert.Equal(AccountType.Income, r.Data!.SourceAccountType);
        Assert.Equal("Commission", r.Data.SourceAccountName);
        Assert.Contains("October", r.Data.Description);

        var kes = await Summary(b, Currency.KES);
        Assert.Equal(9_000m, kes.TotalIncome);
        Assert.Equal(9_000m, kes.ByAccount.Single(l => l.Id == commission).Amount);
        Assert.Equal(9_000m, kes.EFloat);
        var acc = (await Svc(b).GetAccountsAsync(b.Co)).Data!.Single();
        Assert.Equal(1, acc.Postings);
        Assert.Equal(9_000m, acc.Totals.Single(t => t.Currency == Currency.KES).Amount);
    }

    [Fact]
    public async Task Income_into_a_bank_or_till_and_a_fee_charged_to_a_client()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var rent = await Account(b, "Rent received");
        var fees = await Account(b, "Statement fees");
        b.Db.Users.Single(u => u.Id == b.Amina.Id).BalanceKES = 5_000m;
        await b.Db.SaveChangesAsync();

        Assert.True((await Svc(b).RecordAsync(b.Co, b.UserId, Into(rent, AccountType.Bank, b.Bank.Id, 40_000m))).Success);
        Assert.True((await Svc(b).RecordAsync(b.Co, b.UserId, Into(rent, AccountType.Cash, b.Cash.Id, 2_500m))).Success);
        Assert.True((await Svc(b).RecordAsync(b.Co, b.UserId, Into(fees, AccountType.Client, b.Amina.Id, 300m))).Success);

        Assert.Equal(40_000m, b.Db.BankAccounts.Single(x => x.Id == b.Bank.Id).Balance);
        Assert.Equal(2_500m, b.Db.CashAccounts.Single(x => x.Id == b.Cash.Id).Balance);
        Assert.Equal(4_700m, b.Db.Users.Single(u => u.Id == b.Amina.Id).BalanceKES);   // Dr client: her balance goes down
        var kes = await Summary(b, Currency.KES);
        Assert.Equal(42_500m, kes.ByAccount.Single(l => l.Id == rent).Amount);
        Assert.Equal(300m, kes.ByAccount.Single(l => l.Id == fees).Amount);
        Assert.Equal(42_800m, kes.TotalIncome);
    }

    [Fact]
    public async Task Refused_and_nothing_posted_unknown_other_bureaus_switched_off_bad_amount_wrong_destination()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var other = await Bureau.CreateAsync(Currency.KES);
        var theirs = await Account(other, "Theirs");
        var off = await Account(b, "Old income");
        Assert.True((await Svc(b).UpdateAccountAsync(b.Co, off, new UpdateIncomeAccountDto(IsActive: false))).Success);
        var ok = await Account(b, "Other income");

        Assert.False((await Svc(b).RecordAsync(b.Co, b.UserId, Into(Guid.NewGuid(), AccountType.Cash, b.Cash.Id, 100m))).Success);
        Assert.False((await Svc(b).RecordAsync(b.Co, b.UserId, Into(theirs, AccountType.Cash, b.Cash.Id, 100m))).Success);
        Assert.False((await Svc(b).RecordAsync(b.Co, b.UserId, Into(off, AccountType.Cash, b.Cash.Id, 100m))).Success);
        Assert.False((await Svc(b).RecordAsync(b.Co, b.UserId, Into(ok, AccountType.Cash, b.Cash.Id, 0m))).Success);
        Assert.False((await Svc(b).RecordAsync(b.Co, b.UserId, Into(ok, AccountType.Expense, Guid.NewGuid(), 100m))).Success);
        // ...and not through the general transaction form either.
        Assert.False((await b.Transactions().CreateAsync(b.Co, b.UserId,
            Bureau.Posting(TransactionType.Credit, AccountType.Income, off, AccountType.Cash, b.Cash.Id, 100m))).Success);
        Assert.False((await b.Transactions().CreateAsync(b.Co, b.UserId,
            Bureau.Posting(TransactionType.Credit, AccountType.Income, theirs, AccountType.Cash, b.Cash.Id, 100m))).Success);

        Assert.Empty(b.Db.Transactions.Where(t => t.CompanyId == b.Co));
        Assert.Equal(0m, b.Db.CashAccounts.Single(x => x.Id == b.Cash.Id).Balance);
    }

    [Fact]
    public async Task The_statement_shows_earned_before_each_posting_with_a_running_total_and_earned_to_date()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var consultancy = await Account(b, "Consultancy");
        var monthStart = BureauClock.MonthStartUtc(BureauClock.TodayLocal);
        Assert.True((await Svc(b).RecordAsync(b.Co, b.UserId, Into(consultancy, AccountType.Bank, b.Bank.Id, 10_000m, date: monthStart.AddDays(-5), what: "September job"))).Success);
        var a = (await Svc(b).RecordAsync(b.Co, b.UserId, Into(consultancy, AccountType.Bank, b.Bank.Id, 4_000m, what: "Job A"))).Data!;
        Assert.True((await Svc(b).RecordAsync(b.Co, b.UserId, Into(consultancy, AccountType.Cash, b.Cash.Id, 1_500m, what: "Job B"))).Success);

        var from = new DateTime(BureauClock.TodayLocal.Year, BureauClock.TodayLocal.Month, 1);   // a plain local date
        var st = (await Svc(b).StatementAsync(b.Co, consultancy, from, null)).Data!;
        Assert.Equal("Consultancy", st.AccountName);
        var kes = st.ByCurrency.Single();
        Assert.Equal(10_000m, kes.Opening);
        Assert.Equal(5_500m, kes.InPeriod);
        Assert.Equal(15_500m, kes.Closing);
        Assert.Equal(new[] { 14_000m, 15_500m }, kes.Lines.Select(l => l.RunningTotal));
        Assert.Equal(a.Code, kes.Lines[0].Code);
        Assert.StartsWith("KCB", kes.Lines[0].ReceivedInto);
        Assert.StartsWith("Cash till", kes.Lines[1].ReceivedInto);

        // With no start date the statement starts at the first posting.
        var all = (await Svc(b).StatementAsync(b.Co, consultancy, null, null)).Data!.ByCurrency.Single();
        Assert.Equal(0m, all.Opening);
        Assert.Equal(3, all.Lines.Count);
        Assert.Equal(15_500m, all.Closing);
    }

    [Fact]
    public async Task A_reversal_appears_on_the_statement_as_minus_and_the_original_is_marked()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var commission = await Account(b, "Commission");
        var r = (await Svc(b).RecordAsync(b.Co, b.UserId, Into(commission, AccountType.Mpesa, b.Wallet.Id, 9_000m))).Data!;
        Assert.True((await b.Transactions().DeleteAsync(b.Co, r.Id, b.UserId, new DeleteTransactionDto("wrong month"))).Success);

        Assert.Equal(0m, b.Db.MpesaAgents.Single(a => a.Id == b.Wallet.Id).Balance);
        var st = (await Svc(b).StatementAsync(b.Co, commission, null, null)).Data!.ByCurrency.Single();
        Assert.Equal(2, st.Lines.Count);
        Assert.True(st.Lines[0].IsReversed);
        Assert.True(st.Lines[1].IsReversal);
        Assert.Equal(-9_000m, st.Lines[1].Amount);
        Assert.Equal(0m, st.Closing);
        Assert.Equal(0m, (await Summary(b, Currency.KES)).TotalIncome);
    }

    [Fact]
    public async Task An_account_with_postings_is_switched_off_not_deleted_and_can_still_be_reversed_against()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var used = await Account(b, "Used");
        var unused = await Account(b, "Unused");
        var r = (await Svc(b).RecordAsync(b.Co, b.UserId, Into(used, AccountType.Cash, b.Cash.Id, 700m))).Data!;

        Assert.False((await Svc(b).DeleteAccountAsync(b.Co, used)).Success);
        Assert.True((await Svc(b).DeleteAccountAsync(b.Co, unused)).Success);
        Assert.DoesNotContain((await Svc(b).GetAccountsAsync(b.Co)).Data!, a => a.Id == unused);

        Assert.True((await Svc(b).UpdateAccountAsync(b.Co, used, new UpdateIncomeAccountDto(IsActive: false))).Success);
        Assert.True((await Svc(b).StatementAsync(b.Co, used, null, null)).Success);   // its statement stays
        Assert.True((await b.Transactions().DeleteAsync(b.Co, r.Id, b.UserId, new DeleteTransactionDto("taken in error"))).Success);
        Assert.Equal(0m, b.Db.CashAccounts.Single(x => x.Id == b.Cash.Id).Balance);
    }

    [Fact]
    public async Task Renaming_keeps_the_postings_and_the_new_name_shows_on_them()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var id = await Account(b, "Comission");
        await Svc(b).RecordAsync(b.Co, b.UserId, Into(id, AccountType.Cash, b.Cash.Id, 100m));
        Assert.True((await Svc(b).UpdateAccountAsync(b.Co, id, new UpdateIncomeAccountDto(Name: "Commission"))).Success);
        var list = (await b.Transactions().GetAllAsync(b.Co, 1, 10, new ReportFilterDto(null, null, null, null, AccountType.Income))).Data!;
        Assert.Equal("Commission", list.Items.Single().SourceAccountName);
        Assert.Equal("Commission", (await Svc(b).StatementAsync(b.Co, id, null, null)).Data!.AccountName);
    }

    [Fact]
    public async Task Each_currency_has_its_own_statement_and_summary_never_added_across()
    {
        var b = await Bureau.CreateAsync(Currency.UGX);
        var commission = await Account(b, "Commission");
        var mpesa = new MpesaAgent { CompanyId = b.Co, Code = "MP-KE", AgentName = "M-Pesa Busia", PhoneNumber = "+254700000077",
            AgentNumber = "777", Provider = MobileMoneyProvider.MPesa, Currency = Currency.KES };
        b.Db.MpesaAgents.Add(mpesa);
        await b.Db.SaveChangesAsync();

        Assert.True((await Svc(b).RecordAsync(b.Co, b.UserId, Into(commission, AccountType.Mpesa, b.Wallet.Id, 250_000m, Currency.UGX))).Success);
        Assert.True((await Svc(b).RecordAsync(b.Co, b.UserId, Into(commission, AccountType.Mpesa, mpesa.Id, 3_000m, Currency.KES))).Success);
        // KES into the UGX wallet is refused: the wallet doesn't hold KES.
        Assert.False((await Svc(b).RecordAsync(b.Co, b.UserId, Into(commission, AccountType.Mpesa, b.Wallet.Id, 3_000m, Currency.KES))).Success);

        var st = (await Svc(b).StatementAsync(b.Co, commission, null, null)).Data!;
        Assert.Equal(250_000m, st.ByCurrency.Single(c => c.Currency == Currency.UGX).Closing);
        Assert.Equal(3_000m, st.ByCurrency.Single(c => c.Currency == Currency.KES).Closing);
        Assert.Equal(250_000m, (await Summary(b, Currency.UGX)).TotalIncome);
        Assert.Equal(3_000m, (await Summary(b, Currency.KES)).TotalIncome);
    }

    [Fact]
    public async Task The_transaction_list_can_show_only_income_postings()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var interest = await Account(b, "Interest received");
        b.Db.CashAccounts.Single(c => c.Id == b.Cash.Id).Balance = 10_000m;
        b.Db.MpesaAgents.Single(w => w.Id == b.Wallet.Id).Balance = 10_000m;
        await b.Db.SaveChangesAsync();
        var move = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Bureau.Posting(TransactionType.Debit, AccountType.Cash, b.Cash.Id, AccountType.Mpesa, b.Wallet.Id, 1_000m));
        Assert.True(move.Success, move.Message);
        Assert.True((await Svc(b).RecordAsync(b.Co, b.UserId, Into(interest, AccountType.Bank, b.Bank.Id, 2_000m))).Success);

        var only = (await b.Transactions().GetAllAsync(b.Co, 1, 50, new ReportFilterDto(null, null, null, null, AccountType.Income))).Data!;
        Assert.Equal(1, only.TotalCount);
        Assert.Equal(AccountType.Income, only.Items.Single().SourceAccountType);
    }

    [Fact]
    public async Task Customer_cash_in_and_cash_out_swap_the_floats_and_earn_nothing()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        b.Db.CashAccounts.Single(c => c.Id == b.Cash.Id).Balance = 50_000m;
        b.Db.MpesaAgents.Single(a => a.Id == b.Wallet.Id).Balance = 50_000m;
        await b.Db.SaveChangesAsync();
        Assert.True((await b.Transactions().CreateAsync(b.Co, b.UserId,
            Bureau.Posting(TransactionType.Debit, AccountType.Cash, b.Cash.Id, AccountType.Mpesa, b.Wallet.Id, 20_000m))).Success);
        var kes = await Summary(b, Currency.KES);
        Assert.Equal(30_000m, kes.EFloat);
        Assert.Equal(70_000m, kes.CashOnHand);
        Assert.Equal(0m, kes.TotalIncome);
    }
}
