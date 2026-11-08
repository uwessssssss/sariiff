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

public class AuditService : IAuditService
{
    private readonly AppDbContext _context;

    public AuditService(AppDbContext context) => _context = context;

    public async Task LogAsync(Guid? companyId, Guid? userId, UserRole? role, AuditAction action, string entityType, Guid? entityId, object? oldValues, object? newValues, string? ipAddress, string? userAgent)
    {
        var log = new AuditLog
        {
            CompanyId = companyId,
            UserId = userId,
            UserRole = role,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            OldValues = oldValues != null ? JsonSerializer.Serialize(oldValues) : null,
            NewValues = newValues != null ? JsonSerializer.Serialize(newValues) : null,
            IpAddress = ipAddress,
            UserAgent = userAgent
        };

        _context.AuditLogs.Add(log);
        await _context.SaveChangesAsync();
    }

    public async Task<ApiResponse<PagedResult<AdminAuditLogDto>>> GetAuditLogsAsync(int page, int pageSize, Guid? companyId = null)
    {
        var query = _context.AuditLogs.AsQueryable();
        if (companyId.HasValue) query = query.Where(l => l.CompanyId == companyId);

        var totalCount = await query.CountAsync();
        var logs = await query.OrderByDescending(l => l.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

        var companyNames = await CompanyNamesAsync(logs.Select(l => l.CompanyId));
        var userNames = await UserNamesAsync(logs.Select(l => l.UserId));
        var items = new List<AdminAuditLogDto>();
        foreach (var log in logs)
        {
            var companyName = log.CompanyId is { } cid && companyNames.TryGetValue(cid, out var cn) ? cn : null;
            var userName = log.UserId is { } uid && userNames.TryGetValue(uid, out var un) ? un : null;
            items.Add(new AdminAuditLogDto(log.Id, log.CompanyId, companyName, log.UserId, userName, log.Action, log.EntityType, log.EntityId, log.OldValues, log.NewValues, log.CreatedAt));
        }

        return new ApiResponse<PagedResult<AdminAuditLogDto>>(true, "Success", new PagedResult<AdminAuditLogDto>(items, totalCount, page, pageSize));
    }

    // One query per page for names (it was two queries per row).
    private async Task<Dictionary<Guid, string>> CompanyNamesAsync(IEnumerable<Guid?> ids)
    {
        var list = ids.Where(i => i.HasValue).Select(i => i!.Value).Distinct().ToList();
        return list.Count == 0 ? new() : await _context.Companies.IgnoreQueryFilters().AsNoTracking()
            .Where(c => list.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name);
    }

    private async Task<Dictionary<Guid, string>> UserNamesAsync(IEnumerable<Guid?> ids)
    {
        var list = ids.Where(i => i.HasValue).Select(i => i!.Value).Distinct().ToList();
        return list.Count == 0 ? new() : await _context.Users.IgnoreQueryFilters().AsNoTracking()
            .Where(u => list.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.FullName);
    }

    public async Task<ApiResponse<PagedResult<AdminLoginHistoryDto>>> GetLoginHistoryAsync(int page, int pageSize, Guid? companyId = null)
    {
        var query = _context.LoginHistories.AsQueryable();
        if (companyId.HasValue) query = query.Where(l => l.CompanyId == companyId);

        var totalCount = await query.CountAsync();
        var logs = await query.OrderByDescending(l => l.LoginAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

        var companyNames = await CompanyNamesAsync(logs.Select(l => l.CompanyId));
        var userNames = await UserNamesAsync(logs.Select(l => l.UserId));
        var items = new List<AdminLoginHistoryDto>();
        foreach (var log in logs)
        {
            var companyName = log.CompanyId is { } cid && companyNames.TryGetValue(cid, out var cn) ? cn : null;
            var userName = log.UserId is { } uid && userNames.TryGetValue(uid, out var un) ? un : null;
            items.Add(new AdminLoginHistoryDto(log.Id, log.CompanyId, companyName, log.UserId, userName, log.UserRole, log.IpAddress, log.Location, log.IsSuccessful, log.FailureReason, log.LoginAt));
        }

        return new ApiResponse<PagedResult<AdminLoginHistoryDto>>(true, "Success", new PagedResult<AdminLoginHistoryDto>(items, totalCount, page, pageSize));
    }
}


public class SystemLogService : ISystemLogService
{
    private readonly AppDbContext _context;
    private readonly ILogger<SystemLogService> _logger;

    public SystemLogService(AppDbContext context, ILogger<SystemLogService> logger)
    {
        _context = context;
        _logger = logger;
    }

    // ==================== CORE LOGGING ====================

    public async Task LogErrorAsync(string source, string message, string? stackTrace = null, 
        Guid? companyId = null, Guid? userId = null, string? ipAddress = null, string? requestPath = null)
    {
        await LogAsync("Error", source, message, stackTrace, companyId, userId, ipAddress, requestPath);
        _logger.LogError("[{Source}] {Message}", source, message);
    }

    public async Task LogCriticalAsync(string source, string message, string? stackTrace = null,
        Guid? companyId = null, Guid? userId = null)
    {
        await LogAsync("Critical", source, message, stackTrace, companyId, userId, null, null);
        _logger.LogCritical("[{Source}] {Message}", source, message);
    }

    public async Task LogWarningAsync(string source, string message, Guid? companyId = null, Guid? userId = null)
    {
        await LogAsync("Warning", source, message, null, companyId, userId, null, null);
        _logger.LogWarning("[{Source}] {Message}", source, message);
    }

    public async Task LogInfoAsync(string source, string message, Guid? companyId = null, Guid? userId = null)
    {
        await LogAsync("Info", source, message, null, companyId, userId, null, null);
    }

    // ==================== TRANSACTION LOGGING ====================

    public async Task LogTransactionErrorAsync(Guid companyId, string transactionCode, string errorMessage, 
        string? details = null, Guid? userId = null)
    {
        var message = $"Transaction {transactionCode} failed: {errorMessage}";
        await LogAsync("Error", "TransactionService", message, details, companyId, userId, null, null);
        _logger.LogError("[Transaction] {Code} FAILED: {Error}", transactionCode, errorMessage);
    }

    public async Task LogTransactionWarningAsync(Guid companyId, string transactionCode, string warningMessage,
        Guid? userId = null)
    {
        var message = $"Transaction {transactionCode}: {warningMessage}";
        await LogAsync("Warning", "TransactionService", message, null, companyId, userId, null, null);
    }

    public async Task LogTransactionSuccessAsync(Guid companyId, string transactionCode, decimal amount, 
        string currency, string transactionType, Guid? userId = null)
    {
        var message = $"Transaction {transactionCode} completed: {transactionType} {currency} {amount:N2}";
        await LogAsync("Info", "TransactionService", message, null, companyId, userId, null, null);
    }

    // ==================== AUTH LOGGING ====================

    public async Task LogLoginFailureAsync(string code, string reason, string ipAddress, Guid? companyId = null)
    {
        var message = $"Login failed for {code}: {reason}";
        await LogAsync("Warning", "AuthService", message, null, companyId, null, ipAddress, "/api/auth/login");
        _logger.LogWarning("[Auth] Login FAILED for {Code}: {Reason} from IP {IP}", code, reason, ipAddress);
    }

    public async Task LogLoginSuccessAsync(string code, string role, string ipAddress, Guid? companyId = null, Guid? userId = null)
    {
        var message = $"Login successful for {code} ({role})";
        await LogAsync("Info", "AuthService", message, null, companyId, userId, ipAddress, "/api/auth/login");
    }

    public async Task LogAccountLockedAsync(string code, int failedAttempts, string ipAddress, Guid? companyId = null)
    {
        var message = $"Account {code} LOCKED after {failedAttempts} failed attempts";
        await LogAsync("Warning", "AuthService", message, null, companyId, null, ipAddress, null);
        _logger.LogWarning("[Auth] {Message}", message);
    }

    // ==================== BUSINESS OPERATION LOGGING ====================

    public async Task LogReconciliationErrorAsync(Guid companyId, string errorMessage, string? details = null)
    {
        await LogAsync("Error", "ReconciliationService", errorMessage, details, companyId, null, null, null);
        _logger.LogError("[Reconciliation] {Message}", errorMessage);
    }

    public async Task LogClientErrorAsync(Guid companyId, string clientCode, string errorMessage, Guid? userId = null)
    {
        var message = $"Client {clientCode}: {errorMessage}";
        await LogAsync("Error", "ClientService", message, null, companyId, userId, null, null);
    }

    public async Task LogAccountErrorAsync(Guid companyId, string accountType, string accountName, string errorMessage)
    {
        var message = $"{accountType} account '{accountName}': {errorMessage}";
        await LogAsync("Error", "AccountService", message, null, companyId, null, null, null);
    }

    public async Task LogInvoiceErrorAsync(Guid companyId, string invoiceNumber, string errorMessage)
    {
        var message = $"Invoice {invoiceNumber}: {errorMessage}";
        await LogAsync("Error", "InvoiceService", message, null, companyId, null, null, null);
    }

    public async Task LogExpenseErrorAsync(Guid companyId, string errorMessage, Guid? userId = null)
    {
        await LogAsync("Error", "ExpenseService", errorMessage, null, companyId, userId, null, null);
    }

    public async Task LogCompanyErrorAsync(Guid companyId, string errorMessage)
    {
        await LogAsync("Error", "CompanyService", errorMessage, null, companyId, null, null, null);
    }

    // ==================== SECURITY LOGGING ====================

    public async Task LogSecurityAlertAsync(string alertType, string message, string? ipAddress = null, 
        Guid? companyId = null, Guid? userId = null)
    {
        await LogAsync("Warning", "SecurityService", $"[{alertType}] {message}", null, companyId, userId, ipAddress, null);
        _logger.LogWarning("[Security] [{AlertType}] {Message}", alertType, message);
    }

    public async Task LogSuspiciousActivityAsync(string activity, string ipAddress, Guid? companyId = null)
    {
        var message = $"Suspicious activity: {activity} from IP {ipAddress}";
        await LogAsync("Warning", "SecurityService", message, null, companyId, null, ipAddress, null);
    }

    // ==================== API LOGGING ====================

    public async Task LogApiErrorAsync(string endpoint, string method, string errorMessage, 
        string? stackTrace = null, string? ipAddress = null, Guid? companyId = null)
    {
        var message = $"[{method}] {endpoint}: {errorMessage}";
        await LogAsync("Error", "API", message, stackTrace, companyId, null, ipAddress, endpoint);
        _logger.LogError("[API] {Message}", message);
    }

    // ==================== CORE LOGGING METHOD ====================

    private async Task LogAsync(string level, string source, string message, string? stackTrace, 
        Guid? companyId, Guid? userId, string? ipAddress, string? requestPath)
    {
        try
        {
            var log = new SystemLog
            {
                Level = level,
                Source = source,
                Message = message.Length > 2000 ? message.Substring(0, 2000) : message,
                StackTrace = stackTrace?.Length > 4000 ? stackTrace.Substring(0, 4000) : stackTrace,
                CompanyId = companyId,
                UserId = userId,
                IpAddress = ipAddress,
                RequestPath = requestPath
            };

            _context.SystemLogs.Add(log);
            await _context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to write SystemLog: [{Level}] [{Source}] {Message}", level, source, message);
        }
    }

    // ==================== QUERY METHODS ====================

    public async Task<ApiResponse<PagedResult<SystemLogResponseDto>>> GetLogsAsync(int page, int pageSize, string? level = null, bool includeResolved = false)
    {
        var query = _context.SystemLogs.AsNoTracking().AsQueryable();
        
        if (!string.IsNullOrEmpty(level) && level != "all")
            query = query.Where(l => l.Level == level);
        if (!includeResolved)
            query = query.Where(l => l.ResolvedAt == null);

        var totalCount = await query.CountAsync();
        var logs = await query
            .OrderByDescending(l => l.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var items = logs.Select(l => new SystemLogResponseDto(
            l.Id, l.Level, l.Source, l.Message, l.CompanyId, l.CreatedAt, l.ResolvedAt
        )).ToList();

        return new ApiResponse<PagedResult<SystemLogResponseDto>>(true, "Success", 
            new PagedResult<SystemLogResponseDto>(items, totalCount, page, pageSize));
    }

    public async Task<ApiResponse<int>> ResolveAsync(Guid logId, Guid? resolvedByUserId, bool similar = true)
    {
        var log = await _context.SystemLogs.FirstOrDefaultAsync(l => l.Id == logId);
        if (log == null) return new ApiResponse<int>(false, "Log entry not found", 0);

        var targets = similar
            ? await _context.SystemLogs
                .Where(l => l.ResolvedAt == null && l.Level == log.Level && l.Source == log.Source && l.Message == log.Message)
                .ToListAsync()
            : (log.ResolvedAt == null ? new List<SystemLog> { log } : new List<SystemLog>());

        var now = DateTime.UtcNow;
        foreach (var t in targets)
        {
            t.ResolvedAt = now;
            t.ResolvedByUserId = resolvedByUserId;
        }
        await _context.SaveChangesAsync();

        var n = targets.Count;
        return new ApiResponse<int>(true, n == 1 ? "1 entry marked resolved" : $"{n} entries marked resolved", n);
    }

    public async Task<int> GetErrorCountLast24HoursAsync(Guid? companyId = null)
    {
        var since = DateTime.UtcNow.AddHours(-24);
        var query = _context.SystemLogs.Where(l => l.Level == "Error" && l.CreatedAt >= since && l.ResolvedAt == null);
        
        if (companyId.HasValue)
            query = query.Where(l => l.CompanyId == companyId);
            
        return await query.CountAsync();
    }

    public async Task<List<SystemLogResponseDto>> GetRecentErrorsAsync(int count = 10, Guid? companyId = null)
    {
        var query = _context.SystemLogs.Where(l => (l.Level == "Error" || l.Level == "Critical") && l.ResolvedAt == null);
        
        if (companyId.HasValue)
            query = query.Where(l => l.CompanyId == companyId);

        var logs = await query
            .OrderByDescending(l => l.CreatedAt)
            .Take(count)
            .ToListAsync();

        return logs.Select(l => new SystemLogResponseDto(
            l.Id, l.Level, l.Source, l.Message, l.CompanyId, l.CreatedAt
        )).ToList();
    }
}