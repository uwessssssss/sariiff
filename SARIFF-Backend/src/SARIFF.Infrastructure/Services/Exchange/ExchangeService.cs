using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Forex exchange: buy/sell rates, the foreign-currency float, client exchanges, the
/// day's opening/closing float, profit and alert reports. Split by area into partial files:
/// ExchangeService.Rates / .Float / .Trades / .DailyFloat / .Reports / .Currencies / .Helpers.
/// </summary>
public partial class ExchangeService : IExchangeService
{
    private readonly AppDbContext _context;
    private readonly ISystemLogService _systemLog;
    private readonly IBalanceAlertService? _balanceAlerts;

    public ExchangeService(AppDbContext context, ISystemLogService systemLog, IBalanceAlertService? balanceAlerts = null)
    {
        _context = context;
        _systemLog = systemLog;
        _balanceAlerts = balanceAlerts;
    }

    /// <summary>
    /// The bureau's balance alert rules, after an exchange moved a client's own balances
    /// (FromAccount). Only plain transactions used to check them. Runs after the commit
    /// and never fails the exchange.
    /// </summary>
    private async Task CheckClientAlertsAsync(Guid companyId, User? client)
    {
        if (_balanceAlerts == null || client == null) return;
        try
        {
            await _balanceAlerts.CheckAndNotifyAsync(companyId, client.Id, client.FullName, client.BalanceKES, client.BalanceUSD);
        }
        catch (Exception ex)
        {
            try { await _systemLog.LogWarningAsync("ExchangeService", $"Balance alert check failed for client {client.Id}: {ex.Message}", companyId); }
            catch { /* the exchange is saved; nothing more to do */ }
        }
    }
}
