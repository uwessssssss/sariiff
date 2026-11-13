using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>Counts every SMS, whatever sends it.</summary>
internal sealed class CountingSms : ISmsService
{
    public readonly List<string> Messages = new();
    public Task<bool> SendOtpAsync(string phoneNumber, string otp) { Messages.Add(otp); return Task.FromResult(true); }
    public Task<bool> SendSmsAsync(string phoneNumber, string message) { Messages.Add(message); return Task.FromResult(true); }
}

/// <summary>Line-by-line audit, Services/Admin (and the credential SMS in Clients): one test per finding.</summary>
public class LineAuditAdminTests
{
    private static (CompanyService Companies, ClientService Clients, CountingSms Sms) Services(AppDbContext db)
    {
        var sms = new CountingSms();
        var notify = new NotificationService(db, new FakeConfig(), NullLogger<NotificationService>.Instance, NoOp<IPushNotificationService>.Create(), sms);
        return (new CompanyService(db, notify, sms, new FakeConfig(), NullLogger<CompanyService>.Instance),
                new ClientService(db, notify, NoOp<ITransactionService>.Create(), sms, new FakeConfig()),
                sms);
    }

    private static CreateCompanyDto Bureau(string name, string phone = "+254722000111") =>
        new(name, "Amina Hassan", phone, null, "Secret#2026");

    // CP1
    [Fact]
    public async Task Real_bureau_names_with_an_ampersand_digits_or_a_slash_are_accepted()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var (companies, _, _) = Services(w.Db);

        var made = await companies.CreateAsync(Bureau("24/7 Forex & Exchange (K) Ltd"));
        Assert.True(made.Success, made.Message);
        // The code prefix is made from the name: letters and digits only ("&" and "(" ended up in codes).
        Assert.Matches("^[A-Z0-9]{2,4}-[0-9]{4}-[0-9]{4}$", made.Data!.Code);
        var renamed = await companies.UpdateAsync(w.Co.Id, new UpdateCompanyDto("Amana Forex 2", null, null, null, null, null, null));
        Assert.True(renamed.Success, renamed.Message);
    }

    // CP2 (CM1 for bureaus)
    [Fact]
    public async Task A_space_around_the_bureau_number_does_not_get_past_the_duplicate_check()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var (companies, _, _) = Services(w.Db);

        Assert.False((await companies.CreateAsync(Bureau("Second Forex", w.Co.WhatsAppNumber + " "))).Success,
            "a second bureau with the same number, plus a space");
    }

    // CP3
    [Fact]
    public async Task Bureau_tax_id_website_and_address_have_limits()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var (companies, _, _) = Services(w.Db);
        Assert.False((await companies.UpdateAsync(w.Co.Id, new UpdateCompanyDto(null, null, null, null, new string('9', 51), null, null))).Success, "tax id");
        Assert.False((await companies.UpdateAsync(w.Co.Id, new UpdateCompanyDto(null, null, null, null, null, "javascript:alert(1)", null))).Success, "website");
        Assert.False((await companies.UpdateAsync(w.Co.Id, new UpdateCompanyDto(null, null, null, null, null, null, new string('a', 501)))).Success, "address");
    }

    // DUP
    [Fact]
    public async Task New_login_details_go_out_in_one_sms_not_two()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var (companies, clients, sms) = Services(w.Db);

        // The "WhatsApp" notification is SMS now, and each of these ALSO sent its own SMS:
        // every new client, converted client and new bureau got its password texted twice.
        Assert.True((await clients.CreateAsync(w.Co.Id, new CreateClientDto("Zawadi Njeri", "+254733000123", null, null, ClientType.Permanent, "Kibanda#2027"))).Success);
        Assert.Single(sms.Messages);

        sms.Messages.Clear();
        var walkIn = (await clients.CreateAsync(w.Co.Id, new CreateClientDto("Otieno Okello", "+254733000124", null, null, ClientType.Temporary, null))).Data!;
        Assert.Empty(sms.Messages);
        Assert.True((await clients.ConvertToPermamentAsync(w.Co.Id, walkIn.Id, new ConvertClientDto("Kibanda#2027"))).Success);
        Assert.Single(sms.Messages);

        sms.Messages.Clear();
        Assert.True((await companies.CreateAsync(Bureau("Kilele Forex", "+254722000999"))).Success);
        Assert.Single(sms.Messages);
    }

    // FN2
    [Fact]
    public async Task A_subscription_payment_is_checked_like_any_amount_and_its_text_has_limits()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var admin = new SuperAdminService(w.Db, NullLogger<SuperAdminService>.Instance);

        Assert.False((await admin.RecordPaymentAsync(new RecordPaymentDto(w.Co.Id, 1500.005m, "KES", "M-Pesa", null, null))).Success, "fraction of a cent");
        Assert.False((await admin.RecordPaymentAsync(new RecordPaymentDto(w.Co.Id, 1500, "KES", "M-Pesa", new string('r', 101), null))).Success, "reference");
        Assert.False((await admin.RecordPaymentAsync(new RecordPaymentDto(w.Co.Id, 1500, "KES", "M-Pesa", null, new string('n', 2001)))).Success, "notes");
        Assert.Equal(0m, w.Co.TotalPaid);
    }

    // AN1
    [Fact]
    public async Task The_analytics_screen_does_not_show_an_invented_session_length()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var a = (await new SuperAdminService(w.Db, NullLogger<SuperAdminService>.Instance).GetAnalyticsOverviewAsync()).Data!;

        // Nobody has signed in, yet "Avg. session" read 30 minutes: a constant, never measured.
        Assert.Equal(0, a.AvgSessionDurationSeconds);
    }
    // PG1
    [Fact]
    public async Task Every_list_starts_at_page_one_and_caps_its_page_size()
    {
        // Page 0 sent a negative OFFSET to PostgreSQL (a server error) and pageSize had no cap.
        // The transaction list and system logs were capped in their controllers; these were not.
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var (companies, _, _) = Services(w.Db);
        var admin = new SuperAdminService(w.Db, NullLogger<SuperAdminService>.Instance);
        var audit = new AuditService(w.Db);
        var invoices = new InvoiceService(w.Db);

        void Capped<T>(PagedResult<T>? p, string what)
        {
            Assert.NotNull(p);
            Assert.True(p!.Page == 1 && p.PageSize <= 500, $"{what}: page {p.Page}, page size {p.PageSize}");
        }
        Capped((await companies.GetAllAsync(0, 1_000_000)).Data, "companies");
        Capped((await admin.GetAllCompaniesWithStatsAsync(0, 1_000_000)).Data, "companies with stats");
        Capped((await admin.GetSecurityAlertsAsync(0, 1_000_000)).Data, "security alerts");
        Capped((await admin.GetPaymentHistoryAsync(0, 1_000_000)).Data, "payments");
        Capped((await admin.GetAuditLogsExtendedAsync(0, 1_000_000)).Data, "audit log");
        Capped((await audit.GetAuditLogsAsync(0, 1_000_000)).Data, "audit log (basic)");
        Capped((await audit.GetLoginHistoryAsync(0, 1_000_000)).Data, "login history");
        Capped((await invoices.GetAllAsync(w.Co.Id, 0, 1_000_000)).Data, "invoices");
        Capped((await new ReconciliationService(w.Db).GetAccountTransactionsAsync(w.Co.Id, AccountType.Cash, Guid.NewGuid(), null, 0, 1_000_000)).Data, "reconciliation");
    }
    // BC1
    [Fact]
    public async Task A_bureau_home_currency_is_kenyan_or_ugandan_shillings_only()
    {
        // Both screens offer KES or UGX; the API took USD or EUR too, and a bureau whose home
        // is USD trades "USD against USD" and fails on its first exchange.
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var (companies, _, _) = Services(w.Db);
        Assert.False((await companies.CreateAsync(Bureau("Dollar Forex", "+254722000555") with { BaseCurrency = Currency.USD })).Success);
        var admin = new SuperAdminService(w.Db, NullLogger<SuperAdminService>.Instance);
        Assert.False((await admin.SetBaseCurrencyAsync(w.Co.Id, new SetBaseCurrencyDto(Currency.EUR))).Success);
        Assert.Equal(Currency.KES, w.Co.BaseCurrency);
    }

    // SB1
    [Fact]
    public async Task A_subscription_set_to_expire_today_is_still_running_today()
    {
        // The date picker sends a date ("2026-11-13"); stored as midnight UTC, a subscription
        // "expiring on the 13th" counted as expired from 03:00 that morning in Nairobi.
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var admin = new SuperAdminService(w.Db, NullLogger<SuperAdminService>.Instance);
        var today = BureauClock.TodayLocal;

        Assert.True((await admin.UpdateSubscriptionAsync(w.Co.Id, new UpdateSubscriptionDto(w.Co.SubscriptionPlan, null, 1500, today))).Success);

        Assert.True(w.Co.SubscriptionExpiresAt > DateTime.UtcNow, $"stored {w.Co.SubscriptionExpiresAt:o}");
        Assert.Equal(today, BureauClock.ToLocal(w.Co.SubscriptionExpiresAt!.Value).Date);
    }
}
