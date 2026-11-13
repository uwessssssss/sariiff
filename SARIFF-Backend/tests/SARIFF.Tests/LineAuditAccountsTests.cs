using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Services;
using Xunit;
using static SARIFF.Tests.Bureau;

namespace SARIFF.Tests;

/// <summary>Line-by-line audit, Services/Accounts: one test per finding (see docs/line-audit-ledger.md).</summary>
public class LineAuditAccountsTests
{
    private static ExpenseService Expenses(Bureau b) => new(b.Db, new SystemLogService(b.Db, NullLogger<SystemLogService>.Instance));

    private static CreateExpenseDto Pay(Bureau b, decimal amount, AccountType from, Guid account, Guid? category = null,
        DateTime? date = null, PaymentMethod method = PaymentMethod.Cash) =>
        new(category ?? b.Rent.Id, "October rent", "Landlord Ltd", amount, Currency.KES, method, from, account, "INV-77",
            date ?? new DateTime(2026, 10, 5));

    private static CreateMpesaAgentDto Agent(string name, string? store = null, MpesaAgentType type = MpesaAgentType.Standard) =>
        new(name, "+254711000222", "445566", store, type, 0);

    private static async Task<Bureau> FundedAsync()
    {
        var b = await CreateAsync();
        b.Cash.Balance = 1_000_000; b.Bank.Balance = 1_000_000; b.Wallet.Balance = 1_000_000;
        await b.Db.SaveChangesAsync();
        return b;
    }

    // AC1
    [Fact]
    public async Task Real_bank_and_agent_names_with_an_ampersand_digits_or_brackets_are_accepted()
    {
        var b = await CreateAsync();
        // "I&M Bank" is one of Kenya's largest banks; the name rule allowed letters only.
        var bank = await new BankAccountService(b.Db).CreateAsync(b.Co,
            new CreateBankAccountDto("I&M Bank", "0550012345", "Amana Forex (K) Ltd", null, Currency.KES, 0));
        Assert.True(bank.Success, bank.Message);

        var renamed = await new BankAccountService(b.Db).UpdateAsync(b.Co, bank.Data!.Id, new UpdateBankAccountDto("Bank of Africa 2", null, null, null));
        Assert.True(renamed.Success, renamed.Message);

        var agent = await new MpesaAgentService(b.Db).CreateAsync(b.Co, Agent("Shop 24 M-Pesa & Airtime"));
        Assert.True(agent.Success, agent.Message);
    }

    // AC1 (what is still refused)
    [Fact]
    public async Task Bank_and_agent_names_still_refuse_blank_one_letter_too_long_and_script()
    {
        var b = await CreateAsync();
        var banks = new BankAccountService(b.Db);
        foreach (var name in new[] { " ", "I", new string('B', 101), "<script>x</script>" })
            Assert.False((await banks.CreateAsync(b.Co, new CreateBankAccountDto(name, "0550012345", "Amana Forex", null, Currency.KES, 0))).Success, name);
        Assert.False((await new MpesaAgentService(b.Db).CreateAsync(b.Co, Agent(new string('A', 101)))).Success);
    }

    // AC2
    [Fact]
    public async Task A_new_posting_into_a_deactivated_bank_or_wallet_or_an_archived_client_is_refused()
    {
        var b = await FundedAsync();
        var tx = b.Transactions();
        // Works while active (proves the posting itself is valid)...
        Assert.True((await tx.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Bank, b.Bank.Id, AccountType.Cash, b.Cash.Id, 100))).Success);
        Assert.True((await tx.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Mpesa, b.Wallet.Id, AccountType.Cash, b.Cash.Id, 100))).Success);
        Assert.True((await tx.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Cash, b.Cash.Id, AccountType.Client, b.Amina.Id, 100))).Success);

        // ...then the bureau switches them off. The web hides them; the mobile app and the API did not.
        Assert.True((await new BankAccountService(b.Db).UpdateAsync(b.Co, b.Bank.Id, new UpdateBankAccountDto(null, null, null, false))).Success);
        Assert.True((await new MpesaAgentService(b.Db).UpdateAsync(b.Co, b.Wallet.Id, new UpdateMpesaAgentDto(null, null, null, false))).Success);
        b.Amina.IsActive = false; await b.Db.SaveChangesAsync();   // archived

        Assert.False((await tx.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Bank, b.Bank.Id, AccountType.Cash, b.Cash.Id, 100))).Success, "posted from a deactivated bank account");
        Assert.False((await tx.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Cash, b.Cash.Id, AccountType.Mpesa, b.Wallet.Id, 100))).Success, "posted into a deactivated wallet");
        Assert.False((await tx.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Cash, b.Cash.Id, AccountType.Client, b.Amina.Id, 100))).Success, "posted to an archived client");
        Assert.False((await Expenses(b).CreateAsync(b.Co, b.UserId, Pay(b, 100, AccountType.Bank, b.Bank.Id))).Success, "expense paid from a deactivated bank account");
        Assert.False((await b.Exchange().FundFloatAsync(b.Co, b.UserId, new FundFloatDto(Currency.KES, 100, AccountType.Bank, b.Bank.Id, null, null))).Success, "float funded from a deactivated bank account");
    }

    // AC2 (archived client, exchange)
    [Fact]
    public async Task An_archived_client_cannot_trade_from_their_account()
    {
        var b = await CreateAsync();
        await b.RateAsync(Currency.USD, 128.5m, 129.5m);
        await b.FloatAsync(home: 1_000_000);
        b.Amina.BalanceUSD = 200; await b.Db.SaveChangesAsync();
        var trade = new CreateExchangeDto(b.Amina.Id, ExchangeType.FromAccount, ExchangeDirection.ForeignToKes, 10, null, null, null, null, Currency.USD);
        Assert.True((await b.Exchange().CreateExchangeAsync(b.Co, b.UserId, trade)).Success);

        b.Amina.IsActive = false; await b.Db.SaveChangesAsync();

        Assert.False((await b.Exchange().CreateExchangeAsync(b.Co, b.UserId, trade)).Success, "an archived client traded from their account");
    }

    // AC2 (what must keep working)
    [Fact]
    public async Task A_posting_made_before_deactivation_can_still_be_reversed()
    {
        var b = await FundedAsync();
        var tx = b.Transactions();
        var posted = (await tx.CreateAsync(b.Co, b.UserId, Posting(TransactionType.Credit, AccountType.Bank, b.Bank.Id, AccountType.Cash, b.Cash.Id, 100))).Data!;
        Assert.True((await new BankAccountService(b.Db).UpdateAsync(b.Co, b.Bank.Id, new UpdateBankAccountDto(null, null, null, false))).Success);

        var reversed = await tx.DeleteAsync(b.Co, posted.Id, b.UserId, new DeleteTransactionDto("Posted to the wrong account"));

        Assert.True(reversed.Success, reversed.Message);
        Assert.Equal(1_000_000m, b.Bank.Balance);
    }

    // AC3
    [Fact]
    public async Task Startup_does_not_relabel_a_wallet_that_has_only_received_money()
    {
        var b = await CreateAsync(Currency.UGX);
        // An old M-Pesa wallet in a Ugandan bureau (no currency stored, so it has meant UGX).
        // It received UGX 50,000 from the MTN wallet and paid it all out to the till: balance 0.
        var old = new MpesaAgent { CompanyId = b.Co, Code = "MP-9", AgentName = "Old M-Pesa", PhoneNumber = "+256700000004", AgentNumber = "9", Provider = MobileMoneyProvider.MPesa };
        b.Db.Add(old);
        b.Db.Transactions.Add(TestDb.Txn(DateTime.UtcNow, TransactionType.Credit, 50_000, Currency.UGX, AccountType.Mpesa, b.Wallet.Id, AccountType.Mpesa, old.Id, companyId: b.Co));
        b.Db.Transactions.Add(TestDb.Txn(DateTime.UtcNow, TransactionType.Debit, 50_000, Currency.UGX, AccountType.Cash, b.Cash.Id, AccountType.Mpesa, old.Id, companyId: b.Co));
        await b.Db.SaveChangesAsync();

        await MobileMoney.BackfillAsync(b.Db, NullLogger.Instance);

        // Only the SOURCE side was looked at, so this wallet counted as "never used" and its
        // UGX history was relabelled as Kenyan shillings.
        Assert.Null(old.Currency);
    }

    // AC4
    [Fact]
    public async Task Branch_and_store_numbers_have_a_length_limit()
    {
        var b = await CreateAsync();
        var tooLong = new string('7', 51);
        Assert.False((await new BankAccountService(b.Db).CreateAsync(b.Co, new CreateBankAccountDto("KCB", "0550012345", "Amana Forex", tooLong, Currency.KES, 0))).Success);
        Assert.False((await new BankAccountService(b.Db).UpdateAsync(b.Co, b.Bank.Id, new UpdateBankAccountDto(null, null, tooLong, null))).Success);
        Assert.False((await new MpesaAgentService(b.Db).CreateAsync(b.Co, Agent("Moi Avenue Shop", tooLong))).Success);
        Assert.False((await new MpesaAgentService(b.Db).UpdateAsync(b.Co, b.Wallet.Id, new UpdateMpesaAgentDto(null, tooLong, null, null))).Success);
    }

    // AC5
    [Fact]
    public async Task An_undefined_agent_type_is_refused()
    {
        var b = await CreateAsync();
        Assert.False((await new MpesaAgentService(b.Db).CreateAsync(b.Co, Agent("Moi Avenue Shop", type: (MpesaAgentType)9))).Success);
        Assert.False((await new MpesaAgentService(b.Db).UpdateAsync(b.Co, b.Wallet.Id, new UpdateMpesaAgentDto(null, null, (MpesaAgentType)9, null))).Success);
    }

    // EX1
    [Fact]
    public async Task An_expense_dated_in_the_future_or_before_2000_is_refused()
    {
        var b = await FundedAsync();
        var svc = Expenses(b);
        // Transactions refuse both; an expense IS a transaction (it writes one).
        Assert.False((await svc.CreateAsync(b.Co, b.UserId, Pay(b, 100, AccountType.Cash, b.Cash.Id, date: DateTime.UtcNow.AddDays(30)))).Success);
        Assert.False((await svc.CreateAsync(b.Co, b.UserId, Pay(b, 100, AccountType.Cash, b.Cash.Id, date: DateTime.MinValue))).Success);
        Assert.Empty(b.Db.Transactions);
    }

    // EX2
    [Fact]
    public async Task Editing_an_expense_checks_the_same_limits_as_recording_it()
    {
        var b = await FundedAsync();
        var svc = Expenses(b);
        var e = (await svc.CreateAsync(b.Co, b.UserId, Pay(b, 100, AccountType.Cash, b.Cash.Id))).Data!;

        Assert.False((await svc.UpdateAsync(b.Co, e.Id, new UpdateExpenseDto(" ", null, null, null))).Success, "blank description");
        Assert.False((await svc.UpdateAsync(b.Co, e.Id, new UpdateExpenseDto(new string('d', 501), null, null, null))).Success, "description over 500");
        Assert.False((await svc.UpdateAsync(b.Co, e.Id, new UpdateExpenseDto(null, new string('v', 256), null, null))).Success, "payee over 255");
        Assert.False((await svc.UpdateAsync(b.Co, e.Id, new UpdateExpenseDto(null, null, null, new string('r', 51)))).Success, "reference over 50");
        Assert.Equal("October rent", (await b.Db.Expenses.SingleAsync()).Description);
    }

    // EX3
    [Fact]
    public async Task Expense_category_names_are_checked_on_rename_and_are_unique_ignoring_case()
    {
        var b = await CreateAsync();
        var svc = Expenses(b);
        var fuel = (await svc.CreateCategoryAsync(b.Co, new CreateExpenseCategoryDto("Fuel", null))).Data!;

        Assert.False((await svc.CreateCategoryAsync(b.Co, new CreateExpenseCategoryDto("rent", null))).Success, "a second 'Rent' as 'rent'");
        Assert.False((await svc.UpdateCategoryAsync(b.Co, fuel.Id, new UpdateExpenseCategoryDto(" ", null, null))).Success, "renamed to blank");
        Assert.False((await svc.UpdateCategoryAsync(b.Co, fuel.Id, new UpdateExpenseCategoryDto("Rent", null, null))).Success, "renamed onto another category");
        Assert.False((await svc.UpdateCategoryAsync(b.Co, fuel.Id, new UpdateExpenseCategoryDto(null, new string('d', 501), null))).Success, "description over 500");
    }

    // EX4
    [Fact]
    public async Task An_expense_cannot_be_booked_to_a_switched_off_category()
    {
        var b = await FundedAsync();
        var svc = Expenses(b);
        Assert.True((await svc.UpdateCategoryAsync(b.Co, b.Rent.Id, new UpdateExpenseCategoryDto(null, null, false))).Success);

        Assert.False((await svc.CreateAsync(b.Co, b.UserId, Pay(b, 100, AccountType.Cash, b.Cash.Id))).Success);
    }

    // EX5
    [Fact]
    public async Task The_expense_list_caps_the_page_size_and_starts_at_page_one()
    {
        var b = await CreateAsync();
        var page = (await Expenses(b).GetAllAsync(b.Co, 0, 1_000_000)).Data!;
        Assert.Equal(1, page.Page);
        Assert.True(page.PageSize <= 500, $"page size {page.PageSize}");
    }

    // EX6
    [Fact]
    public async Task An_expense_with_an_undefined_payment_method_is_refused()
    {
        var b = await FundedAsync();
        Assert.False((await Expenses(b).CreateAsync(b.Co, b.UserId, Pay(b, 100, AccountType.Cash, b.Cash.Id, method: (PaymentMethod)9))).Success);
    }
    // CM1
    [Fact]
    public async Task A_space_around_a_phone_or_account_number_does_not_get_past_the_duplicate_checks()
    {
        var b = await CreateAsync();
        // ValidatePhone / ValidateAccountNumber check the TRIMMED value; the services stored and
        // compared the raw one, so "+254700000001 " was a second client with Amina's number.
        var clients = new ClientService(b.Db, NoOp<SARIFF.Core.Interfaces.INotificationService>.Create(), NoOp<SARIFF.Core.Interfaces.ITransactionService>.Create(), new CapturingSms(), new FakeConfig());
        var dup = await clients.CreateAsync(b.Co, new CreateClientDto("Zawadi Njeri", b.Amina.WhatsAppNumber + " ", null, null, ClientType.Temporary, null));
        Assert.False(dup.Success, "a second client with the same number, plus a space");

        var bank = await new BankAccountService(b.Db).CreateAsync(b.Co, new CreateBankAccountDto("KCB", " " + b.Bank.AccountNumber, "Amana Forex", null, Currency.KES, 0));
        Assert.False(bank.Success, "a second bank account with the same number, plus a space");

        var fresh = await clients.CreateAsync(b.Co, new CreateClientDto("Otieno Okello", " +254733000888 ", " otieno@example.com ", null, ClientType.Temporary, null));
        Assert.True(fresh.Success, fresh.Message);
        Assert.Equal(("+254733000888", "otieno@example.com"), (fresh.Data!.WhatsAppNumber, fresh.Data.Email));
    }
}
