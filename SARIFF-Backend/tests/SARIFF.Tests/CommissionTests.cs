using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>
/// Mobile money commission is income, recorded gross; the tax the network keeps is a credit
/// to claim back; cash-in/cash-out never touches income. (Owner, 19 Nov: "how will mobile
/// money commission be treated in terms of debit and credit? How about floats?")
/// </summary>
public class CommissionTests
{
    private static CommissionService Svc(Bureau b) => new(b.Db, b.Transactions());

    private static RecordCommissionDto Paid(Bureau b, decimal gross, decimal tax, DateTime? date = null, AccountType dest = AccountType.Mpesa, Guid? destId = null) =>
        new(dest, destId ?? b.Wallet.Id, b.Wallet.Currency ?? b.Home, gross, tax, date, "MPESA-OCT-26", null);

    [Fact]
    public async Task Commission_is_income_gross_the_net_reaches_the_wallet_and_the_tax_is_recoverable()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var r = await Svc(b).RecordAsync(b.Co, b.UserId, Paid(b, 10_000m, 1_000m));
        Assert.True(r.Success, r.Message);

        Assert.Equal(9_000m, b.Db.MpesaAgents.Single(a => a.Id == b.Wallet.Id).Balance);   // Dr wallet 9,000

        var net = r.Data!.NetPosting;   // Cr commission income 9,000
        Assert.Equal(AccountType.Income, net.SourceAccountType);
        Assert.Equal("Commission", net.SourceAccountName);
        Assert.Equal(9_000m, net.Amount);
        var tax = r.Data.TaxPosting!;   // Dr withholding tax 1,000, Cr commission income 1,000
        Assert.Equal(AccountType.TaxRecoverable, tax.DestAccountType);
        Assert.Equal("Withholding tax recoverable", tax.DestAccountName);
        Assert.Equal(1_000m, tax.Amount);

        var kes = (await Svc(b).SummaryAsync(b.Co, null, null)).Data!.ByCurrency.Single(x => x.Currency == Currency.KES);
        Assert.Equal(10_000m, kes.CommissionGross);
        Assert.Equal(1_000m, kes.WithholdingTax);
        Assert.Equal(9_000m, kes.CommissionNet);
        Assert.Equal(10_000m, kes.TotalIncome);
        Assert.Equal(1_000m, kes.WithholdingTaxRecoverable);
        Assert.Equal(9_000m, kes.EFloat);
    }

    [Fact]
    public async Task Without_tax_there_is_one_posting_and_nothing_to_claim()
    {
        var b = await Bureau.CreateAsync(Currency.UGX);
        var r = await Svc(b).RecordAsync(b.Co, b.UserId, Paid(b, 250_000m, 0m));
        Assert.True(r.Success, r.Message);
        Assert.Null(r.Data!.TaxPosting);
        var ugx = (await Svc(b).SummaryAsync(b.Co, null, null)).Data!.ByCurrency.Single(x => x.Currency == Currency.UGX);
        Assert.Equal(250_000m, ugx.CommissionGross);
        Assert.Equal(0m, ugx.WithholdingTaxRecoverable);
        Assert.Equal(1, b.Db.Transactions.Count());
    }

    [Theory]
    [InlineData(1_000, 1_000)]   // tax equal to the commission
    [InlineData(1_000, 1_500)]   // tax above it
    [InlineData(1_000, -1)]      // negative tax
    [InlineData(0, 0)]           // nothing earned
    public async Task Impossible_amounts_are_refused_and_nothing_is_posted(int gross, int tax)
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var r = await Svc(b).RecordAsync(b.Co, b.UserId, Paid(b, gross, tax));
        Assert.False(r.Success);
        Assert.Empty(b.Db.Transactions);
        Assert.Equal(0m, b.Db.MpesaAgents.Single(a => a.Id == b.Wallet.Id).Balance);
    }

    [Fact]
    public async Task Commission_cannot_be_paid_into_a_client_or_an_unknown_wallet()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        Assert.False((await Svc(b).RecordAsync(b.Co, b.UserId, Paid(b, 1_000m, 100m, dest: AccountType.Client, destId: b.Amina.Id))).Success);
        Assert.False((await Svc(b).RecordAsync(b.Co, b.UserId, Paid(b, 1_000m, 100m, destId: Guid.NewGuid()))).Success);
        Assert.Empty(b.Db.Transactions);
    }

    [Fact]
    public async Task A_bank_or_till_can_receive_it_too()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var r = await Svc(b).RecordAsync(b.Co, b.UserId, Paid(b, 5_000m, 500m, dest: AccountType.Bank, destId: b.Bank.Id));
        Assert.True(r.Success, r.Message);
        Assert.Equal(4_500m, b.Db.BankAccounts.Single(x => x.Id == b.Bank.Id).Balance);
    }

    [Fact]
    public async Task Reversing_the_commission_takes_it_out_of_income_and_the_wallet()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var r = (await Svc(b).RecordAsync(b.Co, b.UserId, Paid(b, 10_000m, 1_000m))).Data!;
        var tx = b.Transactions();
        Assert.True((await tx.DeleteAsync(b.Co, r.NetPosting.Id, b.UserId, new DeleteTransactionDto("wrong month"))).Success);
        Assert.True((await b.Transactions().DeleteAsync(b.Co, r.TaxPosting!.Id, b.UserId, new DeleteTransactionDto("wrong month"))).Success);

        Assert.Equal(0m, b.Db.MpesaAgents.Single(a => a.Id == b.Wallet.Id).Balance);
        var kes = (await Svc(b).SummaryAsync(b.Co, null, null)).Data!.ByCurrency.Single(x => x.Currency == Currency.KES);
        Assert.Equal(0m, kes.CommissionGross);
        Assert.Equal(0m, kes.WithholdingTaxRecoverable);
    }

    [Fact]
    public async Task Last_months_commission_is_out_of_this_months_figures_but_its_tax_is_still_to_claim()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var lastMonth = BureauClock.MonthStartUtc(BureauClock.TodayLocal).AddDays(-3);
        Assert.True((await Svc(b).RecordAsync(b.Co, b.UserId, Paid(b, 8_000m, 800m, date: lastMonth))).Success);
        Assert.True((await Svc(b).RecordAsync(b.Co, b.UserId, Paid(b, 2_000m, 200m))).Success);

        var kes = (await Svc(b).SummaryAsync(b.Co, null, null)).Data!.ByCurrency.Single(x => x.Currency == Currency.KES);
        Assert.Equal(2_000m, kes.CommissionGross);            // this month only
        Assert.Equal(200m, kes.WithholdingTax);
        Assert.Equal(1_000m, kes.WithholdingTaxRecoverable);  // all time: 800 + 200
    }

    [Fact]
    public async Task Customer_cash_in_and_cash_out_swap_the_floats_and_earn_nothing()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        b.Db.CashAccounts.Single(c => c.Id == b.Cash.Id).Balance = 50_000m;
        b.Db.MpesaAgents.Single(a => a.Id == b.Wallet.Id).Balance = 50_000m;
        await b.Db.SaveChangesAsync();

        // Cash-in: the customer hands over 20,000 cash, the agent sends 20,000 e-float. Dr cash, Cr wallet.
        Assert.True((await b.Transactions().CreateAsync(b.Co, b.UserId,
            Bureau.Posting(TransactionType.Debit, AccountType.Cash, b.Cash.Id, AccountType.Mpesa, b.Wallet.Id, 20_000m))).Success);

        var kes = (await Svc(b).SummaryAsync(b.Co, null, null)).Data!.ByCurrency.Single(x => x.Currency == Currency.KES);
        Assert.Equal(30_000m, kes.EFloat);
        Assert.Equal(70_000m, kes.CashOnHand);
        Assert.Equal(100_000m, kes.EFloat + kes.CashOnHand);   // the agency's total float is unchanged
        Assert.Equal(0m, kes.TotalIncome);
    }

    [Fact]
    public async Task A_fee_charged_to_a_client_is_fee_income()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        b.Db.Users.Single(u => u.Id == b.Amina.Id).BalanceKES = 5_000m;
        await b.Db.SaveChangesAsync();

        // Dr client (her balance goes down), Cr fee income.
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Bureau.Posting(TransactionType.Credit, AccountType.Income, IncomeAccounts.Fees, AccountType.Client, b.Amina.Id, 300m));
        Assert.True(r.Success, r.Message);
        Assert.Equal(4_700m, b.Db.Users.Single(u => u.Id == b.Amina.Id).BalanceKES);
        var kes = (await Svc(b).SummaryAsync(b.Co, null, null)).Data!.ByCurrency.Single(x => x.Currency == Currency.KES);
        Assert.Equal(300m, kes.FeeIncome);
        Assert.Equal(0m, kes.CommissionGross);
    }

    [Fact]
    public async Task An_income_account_that_does_not_exist_is_refused()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var r = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Bureau.Posting(TransactionType.Credit, AccountType.Income, Guid.NewGuid(), AccountType.Mpesa, b.Wallet.Id, 300m));
        Assert.False(r.Success);
        Assert.Equal(0m, b.Db.MpesaAgents.Single(a => a.Id == b.Wallet.Id).Balance);
    }

    [Fact]
    public async Task KES_commission_lands_in_a_Ugandan_bureaus_M_Pesa_wallet_and_stays_in_KES()
    {
        var b = await Bureau.CreateAsync(Currency.UGX);
        var mpesa = new MpesaAgent { CompanyId = b.Co, Code = "MP-KE", AgentName = "M-Pesa Busia", PhoneNumber = "+254700000077",
            AgentNumber = "777", Provider = MobileMoneyProvider.MPesa, Currency = Currency.KES };
        b.Db.MpesaAgents.Add(mpesa);
        await b.Db.SaveChangesAsync();

        var r = await Svc(b).RecordAsync(b.Co, b.UserId, new RecordCommissionDto(AccountType.Mpesa, mpesa.Id, Currency.KES, 3_000m, 300m));
        Assert.True(r.Success, r.Message);
        var rows = (await Svc(b).SummaryAsync(b.Co, null, null)).Data!.ByCurrency;
        Assert.Equal(3_000m, rows.Single(x => x.Currency == Currency.KES).CommissionGross);
        Assert.Equal(0m, rows.Single(x => x.Currency == Currency.UGX).CommissionGross);   // never converted or added across
        // Paying KES commission into the UGX wallet is refused (its currency doesn't match).
        Assert.False((await Svc(b).RecordAsync(b.Co, b.UserId, new RecordCommissionDto(AccountType.Mpesa, b.Wallet.Id, Currency.KES, 3_000m, 0m))).Success);
    }

    // ---------- any income, not only commission (owner, 20 Nov: "I just wanted a way to treat other incomes")

    private static RecordIncomeDto Income(Guid kind, AccountType dest, Guid destId, decimal amount, decimal tax = 0, string? what = null) =>
        new(kind, dest, destId, Currency.KES, amount, tax, null, what, null, null);

    [Fact]
    public async Task Rent_received_with_tax_withheld_lands_net_in_the_bank_and_is_income_gross()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        var r = await Svc(b).RecordIncomeAsync(b.Co, b.UserId, Income(IncomeAccounts.Rent, AccountType.Bank, b.Bank.Id, 40_000m, 4_000m, "Shop 3, November"));
        Assert.True(r.Success, r.Message);
        Assert.Equal(36_000m, b.Db.BankAccounts.Single(x => x.Id == b.Bank.Id).Balance);
        Assert.Equal("Rent received", r.Data!.NetPosting.SourceAccountName);
        Assert.Contains("Shop 3, November", r.Data.NetPosting.Description);

        var kes = (await Svc(b).SummaryAsync(b.Co, null, null)).Data!.ByCurrency.Single(x => x.Currency == Currency.KES);
        var rent = kes.ByAccount.Single(l => l.Id == IncomeAccounts.Rent);
        Assert.Equal(40_000m, rent.Gross);
        Assert.Equal(4_000m, rent.WithholdingTax);
        Assert.Equal(36_000m, rent.Net);
        Assert.Equal(40_000m, kes.TotalIncome);
        Assert.Equal(40_000m, kes.OtherIncome);
        Assert.Equal(36_000m, kes.NetReceived);
        Assert.Equal(0m, kes.CommissionGross);
        Assert.Equal(4_000m, kes.WithholdingTaxRecoverable);
    }

    [Fact]
    public async Task Tax_is_attributed_to_the_income_it_was_withheld_from()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        Assert.True((await Svc(b).RecordAsync(b.Co, b.UserId, Paid(b, 10_000m, 1_000m))).Success);
        Assert.True((await Svc(b).RecordIncomeAsync(b.Co, b.UserId, Income(IncomeAccounts.Interest, AccountType.Bank, b.Bank.Id, 2_000m, 300m))).Success);
        Assert.True((await Svc(b).RecordIncomeAsync(b.Co, b.UserId, Income(IncomeAccounts.Other, AccountType.Cash, b.Cash.Id, 500m))).Success);

        var kes = (await Svc(b).SummaryAsync(b.Co, null, null)).Data!.ByCurrency.Single(x => x.Currency == Currency.KES);
        Assert.Equal(1_000m, kes.ByAccount.Single(l => l.Id == IncomeAccounts.Commission).WithholdingTax);
        Assert.Equal(300m, kes.ByAccount.Single(l => l.Id == IncomeAccounts.Interest).WithholdingTax);
        Assert.Equal(0m, kes.ByAccount.Single(l => l.Id == IncomeAccounts.Other).WithholdingTax);
        Assert.Equal(9_000m, kes.CommissionNet);
        Assert.Equal(1_300m, kes.WithholdingTax);
        Assert.Equal(12_500m, kes.TotalIncome);
        Assert.Equal(11_200m, kes.NetReceived);
        Assert.Equal(500m, b.Db.CashAccounts.Single(c => c.Id == b.Cash.Id).Balance);
    }

    [Fact]
    public async Task A_fee_charged_to_a_client_through_record_income_lowers_their_balance()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        b.Db.Users.Single(u => u.Id == b.Amina.Id).BalanceKES = 5_000m;
        await b.Db.SaveChangesAsync();
        var r = await Svc(b).RecordIncomeAsync(b.Co, b.UserId, Income(IncomeAccounts.Fees, AccountType.Client, b.Amina.Id, 250m, 0m, "Statement fee"));
        Assert.True(r.Success, r.Message);
        Assert.Equal(4_750m, b.Db.Users.Single(u => u.Id == b.Amina.Id).BalanceKES);
        Assert.Equal(250m, (await Svc(b).SummaryAsync(b.Co, null, null)).Data!.ByCurrency.Single(x => x.Currency == Currency.KES).FeeIncome);
    }

    [Fact]
    public async Task Refused_unknown_kind_tax_on_a_client_fee_and_an_expense_destination()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        b.Db.Users.Single(u => u.Id == b.Amina.Id).BalanceKES = 5_000m;
        await b.Db.SaveChangesAsync();
        Assert.False((await Svc(b).RecordIncomeAsync(b.Co, b.UserId, Income(Guid.NewGuid(), AccountType.Cash, b.Cash.Id, 100m))).Success);
        Assert.False((await Svc(b).RecordIncomeAsync(b.Co, b.UserId, Income(IncomeAccounts.WithholdingTax, AccountType.Cash, b.Cash.Id, 100m))).Success);
        Assert.False((await Svc(b).RecordIncomeAsync(b.Co, b.UserId, Income(IncomeAccounts.Fees, AccountType.Client, b.Amina.Id, 100m, 10m))).Success);
        Assert.False((await Svc(b).RecordIncomeAsync(b.Co, b.UserId, Income(IncomeAccounts.Other, AccountType.Expense, Guid.NewGuid(), 100m))).Success);
        Assert.Empty(b.Db.Transactions);
        Assert.Equal(5_000m, b.Db.Users.Single(u => u.Id == b.Amina.Id).BalanceKES);
    }

    [Fact]
    public async Task The_transaction_list_can_show_only_income_postings()
    {
        var b = await Bureau.CreateAsync(Currency.KES);
        b.Db.CashAccounts.Single(c => c.Id == b.Cash.Id).Balance = 10_000m;
        b.Db.MpesaAgents.Single(w => w.Id == b.Wallet.Id).Balance = 10_000m;   // a customer cash-in needs e-float to send
        await b.Db.SaveChangesAsync();
        var move = await b.Transactions().CreateAsync(b.Co, b.UserId,
            Bureau.Posting(TransactionType.Debit, AccountType.Cash, b.Cash.Id, AccountType.Mpesa, b.Wallet.Id, 1_000m));
        Assert.True(move.Success, move.Message);
        Assert.True((await Svc(b).RecordIncomeAsync(b.Co, b.UserId, Income(IncomeAccounts.Interest, AccountType.Bank, b.Bank.Id, 2_000m, 300m))).Success);

        var only = (await b.Transactions().GetAllAsync(b.Co, 1, 50, new ReportFilterDto(null, null, null, null, AccountType.Income))).Data!;
        Assert.Equal(2, only.TotalCount);   // the interest and its tax posting, not the cash-to-wallet move
        Assert.All(only.Items, t => Assert.True(t.SourceAccountType == AccountType.Income || t.DestAccountType == AccountType.Income));
    }
}

