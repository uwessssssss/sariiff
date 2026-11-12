using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public class NotificationService : INotificationService
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _config;
    private readonly ILogger<NotificationService> _logger;
    private readonly string _websiteUrl;

    private readonly IPushNotificationService _push;
    private readonly ISmsService _sms;

    public NotificationService(AppDbContext context, IConfiguration config, ILogger<NotificationService> logger, IPushNotificationService push, ISmsService sms)
    {
        _context = context;
        _config = config;
        _logger = logger;
        _push = push;
        _sms = sms;
        _websiteUrl = config["App:WebsiteUrl"] ?? "https://app.sariff.com";
    }

    /// <summary>
    /// Core method: sends a notification via SMS (Africa's Talking) and records
    /// it in NotificationLogs. Replaces the former WhatsApp/WAHA channel.
    /// </summary>
    private async Task<bool> SendMessageAsync(Guid? companyId, Guid? userId, string phoneNumber, string message, NotificationType type)
    {
        var log = new NotificationLog
        {
            CompanyId = companyId,
            UserId = userId,
            NotificationType = type,
            RecipientPhone = phoneNumber,
            MessageContent = message
        };

        try
        {
            var sent = await _sms.SendSmsAsync(phoneNumber, message);
            log.IsSent = sent;
            if (sent)
            {
                log.SentAt = DateTime.UtcNow;
                _logger.LogInformation("[SMS] Notification sent to {Phone}", phoneNumber);
            }
            else
            {
                log.ErrorMessage = "SMS provider returned failure or is disabled";
                _logger.LogWarning("[SMS] Notification not sent to {Phone}", phoneNumber);
            }
        }
        catch (Exception ex)
        {
            log.IsSent = false;
            log.ErrorMessage = $"Exception: {ex.Message}";
            _logger.LogError(ex, "[SMS] Exception sending to {Phone}", phoneNumber);
        }

        _context.NotificationLogs.Add(log);
        await _context.SaveChangesAsync();
        return log.IsSent;
    }

    // ==================== NOTIFICATION METHODS (via SMS) ====================

    public async Task<bool> SendTransactionNotificationAsync(Guid companyId, Guid clientId, TransactionResponseDto transaction)
    {
        var client = await _context.Users.FirstOrDefaultAsync(u => u.Id == clientId && u.CompanyId == companyId);
        if (client == null || client.ClientType != ClientType.Permanent)
            return false;

        var company = await _context.Companies.FindAsync(companyId);
        var companyName = company?.Name ?? "Sarif";

        // Balances: the transaction's currency always, plus any other currency
        // the client holds (so a UGX transaction never reports only KES/USD).
        var balanceParts = new List<string>();
        var others = await _context.ClientCurrencyBalances
            .Where(b => b.CompanyId == companyId && b.ClientId == clientId && !b.IsDeleted)
            .OrderBy(b => b.Currency)
            .ToListAsync();
        foreach (var cur in CurrencyInfo.All)
        {
            decimal bal = cur == Currency.KES ? client.BalanceKES
                : cur == Currency.USD ? client.BalanceUSD
                : others.FirstOrDefault(b => b.Currency == cur)?.Balance ?? 0m;
            if (bal != 0 || cur == transaction.Currency || cur == transaction.CounterCurrency)
                balanceParts.Add($"{cur} {bal:N2}");
        }

        // Describe the CLIENT's side of the entry. TransactionType is the source leg's;
        // when the client is the destination their leg is the opposite type, and on a
        // forex entry their amount is the counter amount. A credit to a client account
        // means money in for them (the bureau owes them more), a debit means money out.
        var clientIsSource = transaction.SourceAccountType == AccountType.Client && transaction.SourceAccountId == clientId;
        var clientLeg = clientIsSource ? transaction.TransactionType
            : transaction.TransactionType == TransactionType.Debit ? TransactionType.Credit : TransactionType.Debit;
        var clientAmount = clientIsSource ? transaction.Amount : transaction.CounterAmount ?? transaction.Amount;
        var clientCurrency = clientIsSource ? transaction.Currency : transaction.CounterCurrency ?? transaction.Currency;
        var what = clientLeg == TransactionType.Credit ? "Received" : "Paid out";

        var message = $"{companyName}: {what} {clientCurrency} {clientAmount:N2}. " +
                      $"Ref {transaction.Reference}. " +
                      $"Balance - {string.Join(", ", balanceParts)}.";

        // Push notification (fail-safe; never blocks the transaction)
        await _push.SendToUserAsync(
            clientId,
            $"{companyName} — {what}",
            $"{clientCurrency} {clientAmount:N2} • Ref {transaction.Reference}",
            new Dictionary<string, string> { ["type"] = "transaction", ["reference"] = transaction.Reference ?? "" });

        return await SendMessageAsync(companyId, clientId, client.WhatsAppNumber, message, NotificationType.Transaction);
    }

    public async Task<bool> SendOtpAsync(string phoneNumber, string code)
    {
        var message = $"Sarif verification code: {code}. " +
                      $"It expires in 5 minutes. Do not share it with anyone.";
        return await SendMessageAsync(null, null, phoneNumber, message, NotificationType.Login);
    }

    public async Task<bool> SendWelcomeMessageAsync(Guid companyId, string phoneNumber, string companyName)
    {
        var message = $"Welcome to Sarif. {companyName} has been registered successfully. " +
                      $"Access your account at {_websiteUrl}";
        return await SendMessageAsync(companyId, null, phoneNumber, message, NotificationType.Login);
    }

    public async Task<bool> SendLoginAlertAsync(string phoneNumber, string userName, string ipAddress, DateTime loginTime)
    {
        var message = $"Sarif login alert: {userName} signed in on {BureauClock.ToLocal(loginTime):dd MMM yyyy HH:mm} EAT " +
                      $"from IP {ipAddress}. If this was not you, contact support immediately.";
        return await SendMessageAsync(null, null, phoneNumber, message, NotificationType.Login);
    }

    public async Task<bool> SendSystemErrorAlertAsync(string message, string details)
    {
        var superAdmin = await _context.Users.FirstOrDefaultAsync(u => u.Role == UserRole.SuperAdmin);
        if (superAdmin == null) return false;

        var alertMessage = $"Sarif system alert: {message}. Details: {details}. " +
                           $"({BureauClock.LocalNow:dd MMM HH:mm} EAT)";
        return await SendMessageAsync(null, superAdmin.Id, superAdmin.WhatsAppNumber, alertMessage, NotificationType.SystemError);
    }

    // ==================== NEW METHODS ====================

    /// <summary>
    /// Send login credentials to newly created office user (company)
    /// </summary>
    public async Task<bool> SendOfficeUserCredentialsAsync(Guid companyId, string phoneNumber, string companyName, string code, string password, string websiteUrl)
    {
        var message = $"Welcome to Sarif. Your {companyName} office account is ready. " +
                      $"Login code: {code}, password: {password}. Sign in at {websiteUrl} and change your password. Keep these details private.";
        return await SendMessageAsync(companyId, null, phoneNumber, message, NotificationType.NewClient);
    }

    /// <summary>
    /// Send login credentials to newly created permanent client
    /// </summary>
    public async Task<bool> SendClientCredentialsAsync(Guid companyId, Guid clientId, string phoneNumber, string fullName, string code, string password, string companyName, string websiteUrl)
    {
        var message = $"Welcome {fullName}. Your {companyName} client account is ready. " +
                      $"Login code: {code}, password: {password}. Sign in at {websiteUrl} and change your password. Keep these details private.";
        return await SendMessageAsync(companyId, clientId, phoneNumber, message, NotificationType.NewClient);
    }

    /// <summary>
    /// Notify permanent client that a transaction was processed
    /// </summary>
    public async Task<bool> SendClientTransactionProcessedAsync(Guid companyId, Guid clientId, string phoneNumber, string clientName, string companyName, string transactionCode, string transactionType, decimal amount, string currency, decimal balanceKES, decimal balanceUSD)
    {
        var emoji = transactionType == "Debit" ? "📤" : "📥";
        var message = $"{companyName}: {transactionType} of {currency} {amount:N2} processed (Ref {transactionCode}). " +
                      $"New balance - KES {balanceKES:N2}, USD {balanceUSD:N2}.";
        return await SendMessageAsync(companyId, clientId, phoneNumber, message, NotificationType.Transaction);
    }

    /// <summary>
    /// Notify permanent client that a transaction has been reversed
    /// </summary>
    public async Task<bool> SendReversalNotificationAsync(Guid companyId, Guid clientId, string phoneNumber, string clientName, string companyName, string originalCode, string reversalCode, decimal amount, string currency, string reason)
    {
        var message = $"{companyName}: transaction {originalCode} ({currency} {amount:N2}) has been reversed. " +
                      $"Reversal ref {reversalCode}. Reason: {reason}.";
        return await SendMessageAsync(companyId, clientId, phoneNumber, message, NotificationType.Transaction);
    }

    /// <summary>
    /// Send push notification to all office users of a company (for balance alerts)
    /// </summary>
    public async Task NotifyCompanyAsync(Guid companyId, string title, string body, Dictionary<string, string>? data = null)
    {
        try
        {
            _logger.LogInformation("[NOTIFY COMPANY] {CompanyId}: {Title} - {Body}", companyId, title, body);
            
            // Create an alert record visible to office users
            _context.ClientAlerts.Add(new ClientAlert
            {
                ClientId = Guid.Empty, // Company-wide alert
                CompanyId = companyId,
                Type = "warning",
                Title = title,
                Message = body,
            });
            await _context.SaveChangesAsync();

            // Push to all office-user devices of this company
            // Office devices only. Client phones carry the bureau's CompanyId too, so
            // without this every client received alerts about OTHER clients' balances.
            var companyTokens = await _context.DeviceTokens
                .Where(d => d.CompanyId == companyId && d.IsActive && !d.IsDeleted
                            && !_context.Users.Any(u => u.Id == d.UserId && u.Role == UserRole.Client))
                .Select(d => d.Token)
                .ToListAsync();
            await _push.SendToTokensAsync(companyTokens, title, body, data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[NOTIFY COMPANY] Failed for {CompanyId}", companyId);
        }
    }

    /// <summary>
    /// Create an in-app alert for a specific client or company
    /// </summary>
    public async Task CreateClientAlertAsync(Guid companyId, Guid clientId, string type, string title, string body, Guid? relatedTransactionId = null)
    {
        try
        {
            _context.ClientAlerts.Add(new ClientAlert
            {
                ClientId = clientId,
                CompanyId = companyId,
                Type = type,
                Title = title,
                Message = body,
                RelatedTransactionId = relatedTransactionId,
            });
            await _context.SaveChangesAsync();

            // Push to the client's devices (fail-safe)
            await _push.SendToUserAsync(clientId, title, body,
                new Dictionary<string, string> { ["type"] = type });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[CLIENT ALERT] Failed for {ClientId}", clientId);
        }
    }
}
