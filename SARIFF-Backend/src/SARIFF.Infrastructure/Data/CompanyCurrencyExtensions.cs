using Microsoft.EntityFrameworkCore;
using SARIFF.Core.Enums;

namespace SARIFF.Infrastructure.Data;

/// <summary>
/// One place to read a company's base (home) currency. Every service that used
/// to assume KES — rates, profit, float, mobile money — asks this instead.
/// </summary>
public static class CompanyCurrencyExtensions
{
    public static async Task<Currency> BaseCurrencyAsync(this AppDbContext context, Guid companyId) =>
        await context.Companies
            .Where(c => c.Id == companyId)
            .Select(c => (Currency?)c.BaseCurrency)
            .FirstOrDefaultAsync() ?? Currency.KES;

    /// <summary>
    /// Null when the company may use currency c; otherwise the message to return.
    /// Guards NEW accounts, trades, rates and invoices only — existing balances in
    /// a currency the country doesn't use can still be moved out and settled.
    /// </summary>
    public static async Task<string?> CurrencyNotAllowedAsync(this AppDbContext context, Guid companyId, Currency c)
    {
        var home = await context.BaseCurrencyAsync(companyId);
        return CurrencyInfo.IsAllowed(home, c) ? null : CurrencyInfo.NotAllowedMessage(home, c);
    }
}
