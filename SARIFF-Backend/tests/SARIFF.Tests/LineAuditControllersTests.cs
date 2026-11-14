using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.API.Controllers;
using SARIFF.Core.DTOs;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Services;
using Xunit;
using static SARIFF.Tests.Bureau;

namespace SARIFF.Tests;

/// <summary>Line-by-line audit, API controllers: one test per finding (see docs/line-audit-ledger.md).</summary>
public class LineAuditControllersTests
{
    private static T Signed<T>(T c, Guid companyId, Guid userId) where T : ControllerBase
    {
        var http = new DefaultHttpContext();
        http.Items["CompanyId"] = companyId;
        http.Items["UserId"] = userId;
        c.ControllerContext = new ControllerContext { HttpContext = http };
        return c;
    }

    // CC1
    [Fact]
    public async Task The_cash_statement_honours_the_money_in_or_out_filter()
    {
        var b = await CreateAsync();
        b.Db.Transactions.Add(TestDb.Txn(DateTime.UtcNow.AddHours(-2), TransactionType.Debit, 100, Currency.KES, AccountType.Cash, b.Cash.Id, AccountType.Client, b.Amina.Id, companyId: b.Co));
        b.Db.Transactions.Add(TestDb.Txn(DateTime.UtcNow.AddHours(-1), TransactionType.Credit, 40, Currency.KES, AccountType.Cash, b.Cash.Id, AccountType.Client, b.Amina.Id, companyId: b.Co));
        await b.Db.SaveChangesAsync();
        var cash = Signed(new CashController(new CashAccountService(b.Db), NullLogger<CashController>.Instance), b.Co, b.UserId);

        var r = (OkObjectResult)await cash.GetStatement(Currency.KES, null, null, TransactionType.Debit);

        // The bank and wallet statements pass the filter on; the cash one passed null.
        var lines = ((ApiResponse<StatementDto>)r.Value!).Data!.Transactions;
        Assert.Equal(100m, Assert.Single(lines).Amount);
    }

    // DT1
    [Fact]
    public async Task A_phone_token_belongs_to_whoever_signed_in_last_on_that_phone()
    {
        var b = await CreateAsync();
        const string phone = "ExponentPushToken[shared-tablet-0001]";
        // The office signs in on the counter tablet, signs out (the app keeps its push token on
        // purpose), and a client signs in on the same tablet.
        var asOffice = Signed(new DeviceTokenController(b.Db), b.Co, b.Co);
        await asOffice.Register(new RegisterTokenDto(phone, "android", null));
        var asClient = Signed(new DeviceTokenController(b.Db), b.Co, b.Amina.Id);
        await asClient.Register(new RegisterTokenDto(phone, "android", null));

        // Both rows stayed active: office balance alerts (other clients' names and balances)
        // and the office's notifications kept going to the tablet the client now holds.
        var active = await b.Db.DeviceTokens.Where(d => d.Token == phone && d.IsActive && !d.IsDeleted).ToListAsync();
        Assert.Equal(b.Amina.Id, Assert.Single(active).UserId);
    }
    // RC1
    [Fact]
    public async Task Recent_transactions_are_a_handful_however_many_are_asked_for()
    {
        var b = await CreateAsync();
        for (var i = 0; i < 120; i++)
            b.Db.Transactions.Add(TestDb.Txn(DateTime.UtcNow.AddMinutes(-i), TransactionType.Debit, 1, Currency.KES, AccountType.Cash, b.Cash.Id, AccountType.Client, b.Amina.Id, companyId: b.Co));
        await b.Db.SaveChangesAsync();

        // "count" is not a page size, so the global paging filter never capped it:
        // /api/transaction/recent?count=1000000 loaded and mapped the whole history.
        var recent = (await b.Transactions().GetRecentAsync(b.Co, 1_000_000)).Data!;
        Assert.True(recent.Count <= 100, $"{recent.Count} rows");
    }
    // M11
    [Fact]
    public async Task The_transaction_search_box_finds_by_code_reference_or_description()
    {
        var b = await CreateAsync();
        var rent = TestDb.Txn(DateTime.UtcNow.AddHours(-2), TransactionType.Credit, 100, Currency.KES, AccountType.Cash, b.Cash.Id, AccountType.Bank, b.Bank.Id, companyId: b.Co);
        rent.Description = "October rent";
        var fuel = TestDb.Txn(DateTime.UtcNow.AddHours(-1), TransactionType.Credit, 40, Currency.KES, AccountType.Cash, b.Cash.Id, AccountType.Bank, b.Bank.Id, companyId: b.Co);
        fuel.Description = "Generator diesel";
        b.Db.Transactions.AddRange(rent, fuel);
        await b.Db.SaveChangesAsync();
        var txns = Signed(new TransactionController(b.Transactions()), b.Co, b.UserId);

        // The phone's search box sends "search"; the API ignored it and listed everything.
        var r = (OkObjectResult)await txns.GetAll(1, 20, null, null, null, null, " RENT ");
        var items = ((ApiResponse<PagedResult<TransactionResponseDto>>)r.Value!).Data!.Items;
        Assert.Equal("October rent", Assert.Single(items).Description);

        var byCode = (OkObjectResult)await txns.GetAll(1, 20, null, null, null, null, fuel.Code);
        Assert.Single(((ApiResponse<PagedResult<TransactionResponseDto>>)byCode.Value!).Data!.Items);
    }
}
