using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>Line-by-line audit, Services/Clients: one test per finding (see docs/line-audit-ledger.md).</summary>
public class LineAuditClientsTests
{
    private static ClientService Clients(SignInWorld w) =>
        new(w.Db, NoOp<INotificationService>.Create(), NoOp<ITransactionService>.Create(), w.Sms, new FakeConfig());

    private static UpdateClientDto Edit(User c, string? phone = null, string? id = null, bool? active = null, string? name = null) =>
        new(name ?? c.FullName, c.Email, phone ?? c.WhatsAppNumber, id ?? c.IdPassport, active);

    // CL1
    [Fact]
    public async Task Editing_a_clients_phone_number_changes_it()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var r = await Clients(w).UpdateAsync(w.Co.Id, w.Client.Id, Edit(w.Client, phone: "+254700111222"));

        Assert.True(r.Success, r.Message);
        // Both the web and the mobile edit forms send the number; the service never read it
        // and still answered "Client updated successfully".
        Assert.Equal("+254700111222", (await w.Db.Users.SingleAsync(u => u.Id == w.Client.Id)).WhatsAppNumber);
    }

    // CL1 (the same field, its checks)
    [Fact]
    public async Task Editing_a_phone_number_refuses_a_bad_number_or_one_another_client_has()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var other = new User { CompanyId = w.Co.Id, Role = UserRole.Client, ClientType = ClientType.Temporary, FullName = "Zawadi Njeri", Code = "X-CL-1", WhatsAppNumber = "+254733000444", IsActive = true };
        w.Db.Users.Add(other);
        await w.Db.SaveChangesAsync();
        var svc = Clients(w);

        Assert.False((await svc.UpdateAsync(w.Co.Id, w.Client.Id, Edit(w.Client, phone: "0712"))).Success);
        Assert.False((await svc.UpdateAsync(w.Co.Id, w.Client.Id, Edit(w.Client, phone: other.WhatsAppNumber))).Success);
        Assert.NotEqual(other.WhatsAppNumber, (await w.Db.Users.SingleAsync(u => u.Id == w.Client.Id)).WhatsAppNumber);
    }

    // CL1 (phone login proved on the old number)
    [Fact]
    public async Task Changing_the_number_cuts_the_phone_login_that_was_proved_on_the_old_one()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var identity = new ClientIdentity { PhoneNumber = w.Client.WhatsAppNumber, PhoneVerifiedAt = DateTime.UtcNow };
        w.Db.Add(identity);
        w.Client.ClientIdentityId = identity.Id;
        w.Client.IdentityLinkedAt = DateTime.UtcNow;
        await w.Db.SaveChangesAsync();

        Assert.True((await Clients(w).UpdateAsync(w.Co.Id, w.Client.Id, Edit(w.Client, phone: "+254700111222"))).Success);

        // Whoever gets the old number next must not be able to open this account by SMS code.
        Assert.Null((await w.Db.Users.SingleAsync(u => u.Id == w.Client.Id)).ClientIdentityId);
    }

    // CL2
    [Fact]
    public async Task Deactivating_a_client_through_edit_ends_their_open_sessions()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        await w.ClientSignInAsync();

        var r = await Clients(w).UpdateAsync(w.Co.Id, w.Client.Id, Edit(w.Client, active: false));
        Assert.True(r.Success, r.Message);

        // Archive ends sessions; the same change made through edit left the portal open.
        Assert.DoesNotContain(w.Db.UserSessions, s => s.UserId == w.Client.Id && !s.IsRevoked);
    }

    // CL3
    [Fact]
    public async Task Converting_or_resetting_refuses_a_password_longer_than_the_sign_up_limit()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var tooLong = new string('a', 129);   // creating a client refuses this (max 128)
        var svc = Clients(w);

        Assert.False((await svc.ResetPasswordAsync(w.Co.Id, w.Client.Id, new ResetClientPasswordDto(tooLong))).Success);

        var walkIn = new User { CompanyId = w.Co.Id, Role = UserRole.Client, ClientType = ClientType.Temporary, FullName = "Zawadi Njeri", Code = "X-CL-2", WhatsAppNumber = "+254733000555", IsActive = true };
        w.Db.Users.Add(walkIn);
        await w.Db.SaveChangesAsync();
        Assert.False((await svc.ConvertToPermamentAsync(w.Co.Id, walkIn.Id, new ConvertClientDto(tooLong))).Success);

        var changed = await new ClientPortalService(w.Db).ChangePasswordAsync(w.Co.Id, w.Client.Id,
            new ChangePasswordDto { CurrentPassword = SignInWorld.Password, NewPassword = tooLong, ConfirmPassword = tooLong });
        Assert.False(changed.Success);
    }

    // CL4
    [Fact]
    public async Task Editing_refuses_an_id_number_longer_than_creating_allows()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var r = await Clients(w).UpdateAsync(w.Co.Id, w.Client.Id, Edit(w.Client, id: new string('7', 51)));

        Assert.False(r.Success, "edit stored a 51-character ID that create refuses");
    }

    // CL5
    [Fact]
    public async Task Creating_a_client_of_an_unknown_type_is_refused()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var r = await Clients(w).CreateAsync(w.Co.Id,
            new CreateClientDto("Zawadi Njeri", "+254733000666", null, null, (ClientType)5, null));

        Assert.False(r.Success, "a client of type 5 (neither permanent nor walk-in) was created");
    }

    // CL6
    [Fact]
    public async Task Names_are_stored_and_searched_without_surrounding_spaces()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        var svc = Clients(w);
        var made = await svc.CreateAsync(w.Co.Id,
            new CreateClientDto("  Zawadi Njeri ", "+254733000777", null, null, ClientType.Temporary, null));
        Assert.True(made.Success, made.Message);
        Assert.Equal("Zawadi Njeri", made.Data!.FullName);

        // A space typed or pasted around the search word found nobody.
        Assert.Single((await svc.GetAllAsync(w.Co.Id, 1, 20, " zawadi ")).Data!.Items);
        Assert.Single((await svc.GetLookupAsync(w.Co.Id, " zawadi ")).Data!);
    }
    // CL7
    [Fact]
    public async Task The_client_list_and_portal_alerts_cap_the_page_size_and_start_at_page_one()
    {
        var w = await SignInWorld.MakeAsync(TestDb.InMemory());
        // Every other list caps a page (transactions 1,000, logs 200). These two loaded a whole
        // bureau's clients, each with its totals, for pageSize=1000000; page 0 sent a negative
        // offset to the database, which PostgreSQL refuses (a server error).
        var list = (await Clients(w).GetAllAsync(w.Co.Id, 0, 1_000_000)).Data!;
        Assert.Equal(1, list.Page);
        Assert.True(list.PageSize <= 200, $"page size {list.PageSize}");

        var alerts = (await new ClientPortalService(w.Db).GetAlertsAsync(w.Co.Id, w.Client.Id, 0, 1_000_000, false)).Data!;
        Assert.Equal(1, alerts.Page);
        Assert.True(alerts.PageSize <= 200, $"page size {alerts.PageSize}");
    }
}
