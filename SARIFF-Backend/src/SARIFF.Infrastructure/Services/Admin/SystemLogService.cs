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
        string? stackTrace = null, string? ipAddress = null, Guid? companyId = null, Guid? userId = null)
    {
        var message = $"[{method}] {endpoint}: {errorMessage}";
        await LogAsync("Error", "API", message, stackTrace, companyId, userId, ipAddress, endpoint);
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
            .ThenByDescending(l => l.Id)
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
