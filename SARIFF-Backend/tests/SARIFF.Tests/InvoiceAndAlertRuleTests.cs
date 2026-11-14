using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.Core.DTOs;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Services;
using Xunit;
using static SARIFF.Tests.Bureau;

namespace SARIFF.Tests;

/// <summary>Invoices must add up to the cent; alert rules must mean something.</summary>
public class InvoiceAndAlertRuleTests
{
    private static CreateInvoiceDto Invoice(decimal taxRate, decimal discount, params (decimal qty, decimal price)[] lines) =>
        new(null, "Amina Wanjiru", null, null, null, BureauClock.TodayLocal.AddDays(14), Currency.KES,
            lines.Select((l, i) => new InvoiceItemDto($"Line {i + 1}", l.qty, l.price)).ToList(), taxRate, discount, null, null);

    [Fact]
    public async Task An_invoice_with_fractional_quantities_adds_up_to_the_cent()
    {
        var b = await CreateAsync();
        // 1.5 × 33.33 = 49.995 → 50.00 a line. Two lines: 100.00. Tax 16% = 16.00. Less 0.50.
        var r = await new InvoiceService(b.Db).CreateAsync(b.Co, Invoice(16, 0.50m, (1.5m, 33.33m), (1.5m, 33.33m)));

        Assert.True(r.Success, r.Message);
        var inv = r.Data!;
        Assert.All(inv.Items, line => Assert.Equal(50.00m, line.Amount));
        Assert.Equal(inv.Items.Sum(l => l.Amount), inv.Subtotal);
        Assert.Equal(100.00m, inv.Subtotal);
        Assert.Equal(16.00m, inv.TaxAmount);
        Assert.Equal(115.50m, inv.Total);
        Assert.Equal(inv.Subtotal + inv.TaxAmount - inv.DiscountAmount, inv.Total);
    }

    [Fact]
    public async Task Tax_is_rounded_once_and_the_total_is_built_from_the_rounded_tax()
    {
        var b = await CreateAsync();
        // 33.33 at 16% = 5.3328 → 5.33; total 38.66
        var inv = (await new InvoiceService(b.Db).CreateAsync(b.Co, Invoice(16, 0, (1, 33.33m)))).Data!;

        Assert.Equal(5.33m, inv.TaxAmount);
        Assert.Equal(38.66m, inv.Total);
    }

    [Fact]
    public async Task A_discount_larger_than_the_invoice_is_refused()
    {
        var b = await CreateAsync();
        var svc = new InvoiceService(b.Db);

        Assert.False((await svc.CreateAsync(b.Co, Invoice(0, 150, (1, 100)))).Success);
        Assert.False((await svc.CreateAsync(b.Co, Invoice(0, 0.005m, (1, 100)))).Success);   // not a money amount
        Assert.True((await svc.CreateAsync(b.Co, Invoice(0, 100, (1, 100)))).Success);        // fully discounted is fine
    }

    [Fact]
    public async Task A_paid_invoice_cannot_be_reopened_cancelled_or_deleted()
    {
        var b = await CreateAsync();
        var svc = new InvoiceService(b.Db);
        var id = (await svc.CreateAsync(b.Co, Invoice(0, 0, (1, 100)))).Data!.Id;

        Assert.False((await svc.UpdateStatusAsync(b.Co, id, new UpdateInvoiceStatusDto(InvoiceStatus.Paid))).Success);   // not sent yet
        Assert.True((await svc.UpdateStatusAsync(b.Co, id, new UpdateInvoiceStatusDto(InvoiceStatus.Sent))).Success);
        Assert.True((await svc.UpdateStatusAsync(b.Co, id, new UpdateInvoiceStatusDto(InvoiceStatus.Paid))).Success);
        Assert.False((await svc.UpdateStatusAsync(b.Co, id, new UpdateInvoiceStatusDto(InvoiceStatus.Cancelled))).Success);
        Assert.False((await svc.DeleteAsync(b.Co, id)).Success);
        Assert.False((await svc.UpdateStatusAsync(Guid.NewGuid(), id, new UpdateInvoiceStatusDto(InvoiceStatus.Sent))).Success);   // another bureau
    }

    [Fact]
    public async Task An_alert_rule_needs_a_real_currency_direction_and_client()
    {
        var b = await CreateAsync();
        var svc = new BalanceAlertService(b.Db, NoOp<INotificationService>.Create(), NullLogger<BalanceAlertService>.Instance);

        Assert.False((await svc.CreateRuleAsync(b.Co, b.UserId, new CreateBalanceAlertDto(null, 99, 0, 1_000))).Success);
        Assert.False((await svc.CreateRuleAsync(b.Co, b.UserId, new CreateBalanceAlertDto(null, 0, 7, 1_000))).Success);
        Assert.False((await svc.CreateRuleAsync(b.Co, b.UserId, new CreateBalanceAlertDto(Guid.NewGuid(), 0, 0, 1_000))).Success);   // not this bureau's client
        var ok = await svc.CreateRuleAsync(b.Co, b.UserId, new CreateBalanceAlertDto(b.Amina.Id, (int)Currency.KES, 0, 1_000));
        Assert.True(ok.Success, ok.Message);
        Assert.Equal("Amina Wanjiru", ok.Data!.ClientName);
        Assert.Single((await svc.GetRulesAsync(b.Co, b.Amina.Id)).Data!);
        Assert.Empty((await svc.GetRulesAsync(Guid.NewGuid(), b.Amina.Id)).Data!);   // another bureau sees none
    }
}
