using System.Net;
using System.Security.Claims;
using System.Text.Json;
using SARIFF.Core.DTOs;
using SARIFF.Core.Interfaces;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using SARIFF.Infrastructure.Services;

namespace SARIFF.API.Middleware;

public class ExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionMiddleware> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    public ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> logger, IServiceScopeFactory scopeFactory)
    {
        _next = next;
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception: {Message}", ex.Message);
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var logService = scope.ServiceProvider.GetRequiredService<ISystemLogService>();
            
            Guid? companyId = null;
            Guid? userId = null;
            
            if (context.User?.Identity?.IsAuthenticated == true)
            {
                var companyIdClaim = context.User.FindFirst("company_id")?.Value;
                var userIdClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                
                if (Guid.TryParse(companyIdClaim, out var cId)) companyId = cId;
                if (Guid.TryParse(userIdClaim, out var uId)) userId = uId;
            }

            var ipAddress = context.Connection.RemoteIpAddress?.ToString();
            var requestPath = context.Request.Path.ToString();
            var method = context.Request.Method;

            await logService.LogApiErrorAsync(
                requestPath,
                method,
                exception.Message,
                exception.StackTrace,
                ipAddress,
                companyId
            );
        }
        catch (Exception logEx)
        {
            _logger.LogError(logEx, "Failed to log exception to database");
        }

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = exception switch
        {
            UnauthorizedAccessException => (int)HttpStatusCode.Unauthorized,
            KeyNotFoundException => (int)HttpStatusCode.NotFound,
            ArgumentException => (int)HttpStatusCode.BadRequest,
            InvalidOperationException => (int)HttpStatusCode.BadRequest,
            _ => (int)HttpStatusCode.InternalServerError
        };

        var response = new ApiResponse<object>(false, GetUserFriendlyMessage(exception), null!);
        
        var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
        await context.Response.WriteAsync(JsonSerializer.Serialize(response, options));
    }

    private static string GetUserFriendlyMessage(Exception ex) => ex switch
    {
        UnauthorizedAccessException => "You are not authorized to perform this action",
        KeyNotFoundException => "The requested resource was not found",
        ArgumentException ae when ae.Message.Length < 100 && !ae.Message.Contains("Entity") 
            => ae.Message, // Short, non-internal argument errors are OK to show
        ArgumentException => "Invalid input provided",
        InvalidOperationException ioe when ioe.Message.Length < 100 && !ioe.Message.Contains("Entity")
            => ioe.Message,
        InvalidOperationException => "Operation could not be completed",
        _ => "An unexpected error occurred. Please try again later."
    };
}

/// <summary>
/// PRODUCTION-READY Tenant Middleware
/// 
/// SECURITY FIXES APPLIED:
/// 1. REMOVED X-Company-Id header bypass - was allowing anyone to access any company's data
/// 2. REMOVED X-User-Id header bypass - same vulnerability
/// 3. Now ONLY extracts tenant info from authenticated JWT claims
/// </summary>
public class TenantMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<TenantMiddleware> _logger;

    private readonly IServiceScopeFactory _scopeFactory;

    public TenantMiddleware(RequestDelegate next, ILogger<TenantMiddleware> logger, IServiceScopeFactory scopeFactory)
    {
        _next = next;
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // SECURITY FIX: ONLY extract tenant info from authenticated JWT claims
        // NO header-based bypasses allowed!
        
        if (context.User.Identity?.IsAuthenticated == true)
        {
            // Extract CompanyId from JWT
            var companyIdClaim = context.User.FindFirst("company_id")?.Value;
            if (!string.IsNullOrEmpty(companyIdClaim) && Guid.TryParse(companyIdClaim, out var companyId))
            {
                context.Items["CompanyId"] = companyId;
            }

            // Extract UserId from JWT (try multiple claim types)
            var userIdClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value 
                           ?? context.User.FindFirst("user_id")?.Value
                           ?? context.User.FindFirst("sub")?.Value;
            if (!string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var userId))
            {
                context.Items["UserId"] = userId;
            }

            // Extract Role
            var roleClaim = context.User.FindFirst(ClaimTypes.Role)?.Value;
            if (!string.IsNullOrEmpty(roleClaim))
            {
                context.Items["UserRole"] = roleClaim;
                
                // For OfficeUser: If no UserId but has CompanyId, use CompanyId as UserId
                // This is because OfficeUser login is company-based
                if (roleClaim == "OfficeUser" && !context.Items.ContainsKey("UserId") && context.Items.ContainsKey("CompanyId"))
                {
                    context.Items["UserId"] = context.Items["CompanyId"];
                }

                // The phone-login token (no bureau yet) may only list, link and pick bureaus.
                // Some controllers accept any signed-in user; this keeps it out of all of them.
                if (roleClaim == "ClientIdentity" && !context.Request.Path.StartsWithSegments("/api/identity"))
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await context.Response.WriteAsJsonAsync(new { success = false, message = "Pick a bureau first.", data = (object?)null });
                    return;
                }
            }
        }

        // A suspended or lapsed bureau (and its clients) is refused on every request,
        // not just at the next sign-in. Super admins have no company and pass.
        if (context.Items["CompanyId"] is Guid tenantId && !context.Request.Path.StartsWithSegments("/api/auth"))
        {
            if (!CompanyAccessCache.TryGet(tenantId, out var block))
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var company = await db.Companies.IgnoreQueryFilters().AsNoTracking()
                    .FirstOrDefaultAsync(c => c.Id == tenantId);
                block = company == null || company.IsDeleted || !company.IsActive
                    ? "This bureau's account is not active."
                    : AuthService.SubscriptionBlock(company);
                CompanyAccessCache.Set(tenantId, block);
            }
            if (block != null)
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync(JsonSerializer.Serialize(new { success = false, message = block, data = (object?)null }));
                return;
            }
        }

        // A signed-out token stops working on the next request, not 60 minutes later.
        // Every super admin / office / client request needs a live session for that person
        // (cached 30 s; sign-in and sign-out reset it). The phone-login token has no session.
        if (context.User.Identity?.IsAuthenticated == true
            && context.Items["UserId"] is Guid principal
            && context.Items["UserRole"] is string roleName
            && roleName is "SuperAdmin" or "OfficeUser" or "Client"
            && !context.Request.Path.StartsWithSegments("/api/auth"))
        {
            if (!SessionAliveCache.TryGet(principal, roleName, out var alive))
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var role = Enum.Parse<UserRole>(roleName);
                var now = DateTime.UtcNow;
                alive = await db.UserSessions.AsNoTracking().AnyAsync(x =>
                    !x.IsRevoked && x.ExpiresAt > now && x.UserRole == role &&
                    (role == UserRole.OfficeUser ? x.CompanyId == principal : x.UserId == principal));
                SessionAliveCache.Set(principal, roleName, alive);
            }
            if (!alive)
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync(JsonSerializer.Serialize(new { success = false, message = "You were signed out. Please sign in again.", data = (object?)null }));
                return;
            }
        }

        // SECURITY FIX: REMOVED all header-based fallbacks
        // The following code was REMOVED because it allowed authorization bypass:
        //
        // if (!context.Items.ContainsKey("CompanyId"))
        // {
        //     var headerCompanyId = context.Request.Headers["X-Company-Id"].FirstOrDefault();
        //     if (!string.IsNullOrEmpty(headerCompanyId) && Guid.TryParse(headerCompanyId, out var companyId))
        //     {
        //         context.Items["CompanyId"] = companyId;  // VULNERABILITY!
        //     }
        // }

        await _next(context);
    }
}

/// <summary>
/// Rate Limiting Middleware for auth endpoints
/// Prevents brute force attacks
/// </summary>
public class RateLimitingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RateLimitingMiddleware> _logger;
    private static readonly Dictionary<string, (int Count, DateTime ResetTime)> _requestCounts = new();
    private static readonly object _lock = new();

    private const int MaxRequestsPerMinute = 10;
    private const int LockoutMinutes = 1;

    public RateLimitingMiddleware(RequestDelegate next, ILogger<RateLimitingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Apply rate limiting to auth endpoints
        // Login doors: classic login and the phone login (codes, device login, linking).
        // "/api/identity/enabled" is only the on/off switch the login page reads on every load;
        // it opens nothing, and counting it locked a whole office (one shared IP) out of phone
        // login after ten page loads in a minute.
        if ((context.Request.Path.StartsWithSegments("/api/auth") || context.Request.Path.StartsWithSegments("/api/identity"))
            && !context.Request.Path.StartsWithSegments("/api/identity/enabled"))
        {
            var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            // Normalise the path: routing is case-insensitive and ignores a trailing slash,
            // so "/api/auth/LOGIN/" must share the "/api/auth/login" bucket.
            var key = $"{ip}:{context.Request.Path.Value?.TrimEnd('/').ToLowerInvariant()}";
            var rateLimited = false;

            lock (_lock)
            {
                // Clean up old entries periodically
                if (_requestCounts.Count > 10000)
                {
                    var oldEntries = _requestCounts
                        .Where(kvp => kvp.Value.ResetTime < DateTime.UtcNow)
                        .Select(kvp => kvp.Key)
                        .ToList();
                    foreach (var oldKey in oldEntries)
                    {
                        _requestCounts.Remove(oldKey);
                    }
                }

                if (_requestCounts.TryGetValue(key, out var entry))
                {
                    if (DateTime.UtcNow < entry.ResetTime)
                    {
                        if (entry.Count >= MaxRequestsPerMinute)
                        {
                            _logger.LogWarning("Rate limit exceeded for {IP} on {Path}", ip, context.Request.Path);
                            context.Response.StatusCode = 429; // Too Many Requests
                            context.Response.Headers["Retry-After"] = (LockoutMinutes * 60).ToString();
                            rateLimited = true;
                        }
                        _requestCounts[key] = (entry.Count + 1, entry.ResetTime);
                    }
                    else
                    {
                        _requestCounts[key] = (1, DateTime.UtcNow.AddMinutes(LockoutMinutes));
                    }
                }
                else
                {
                    _requestCounts[key] = (1, DateTime.UtcNow.AddMinutes(LockoutMinutes));
                }
            }

            if (rateLimited)
            {
                // Same shape as ApiResponse so both apps can show the message.
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync(
                    "{\"success\":false,\"message\":\"Too many attempts. Wait a minute and try again.\",\"data\":null}");
                return;
            }
        }

        await _next(context);
    }
}

/// <summary>
/// Request Logging Middleware for audit trail
/// </summary>
public class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var startTime = DateTime.UtcNow;
        
        await _next(context);
        
        var duration = DateTime.UtcNow - startTime;
        
        // Log slow requests
        if (duration.TotalMilliseconds > 1000)
        {
            _logger.LogWarning("Slow request: {Method} {Path} took {Duration}ms", 
                context.Request.Method, 
                context.Request.Path, 
                duration.TotalMilliseconds);
        }
    }
}
/// <summary>
/// Idempotency for POST/PUT/PATCH/DELETE carrying an "Idempotency-Key" header.
///  • first time: the request runs and its response is stored;
///  • same key again, finished: the stored response is replayed (nothing runs twice);
///  • same key again while the first is still running: 409;
///  • same key on a different endpoint: 422.
/// Anything but a 2xx (or an exception) forgets the key, so the client may retry.
/// Scoped per signed-in user (or company), so keys can't collide across tenants.
/// </summary>
public class IdempotencyMiddleware
{
    private static readonly HashSet<string> Mutating = new(StringComparer.OrdinalIgnoreCase) { "POST", "PUT", "PATCH", "DELETE" };
    private readonly RequestDelegate _next;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<IdempotencyMiddleware> _logger;

    public IdempotencyMiddleware(RequestDelegate next, IServiceScopeFactory scopeFactory, ILogger<IdempotencyMiddleware> logger)
    {
        _next = next;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var key = context.Request.Headers["Idempotency-Key"].FirstOrDefault()?.Trim();
        var scopeId = (context.Items["UserId"] as Guid?) ?? (context.Items["CompanyId"] as Guid?);
        if (!Mutating.Contains(context.Request.Method) || string.IsNullOrEmpty(key) || key.Length > 100 || scopeId == null)
        {
            await _next(context);
            return;
        }

        var scope = scopeId.Value.ToString();
        var path = context.Request.Path.ToString();
        if (path.Length > 300) path = path[..300];

        using var serviceScope = _scopeFactory.CreateScope();
        var db = serviceScope.ServiceProvider.GetRequiredService<AppDbContext>();

        var record = new IdempotencyRecord { Scope = scope, Key = key, Method = context.Request.Method, Path = path };
        db.IdempotencyRecords.Add(record);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Key already used by this caller.
            db.ChangeTracker.Clear();
            var existing = await db.IdempotencyRecords.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Scope == scope && r.Key == key);
            if (existing == null) { await _next(context); return; } // raced with a cleanup: just run it

            context.Response.ContentType = "application/json";
            if (!string.Equals(existing.Path, path, StringComparison.OrdinalIgnoreCase) || existing.Method != context.Request.Method)
            {
                context.Response.StatusCode = StatusCodes.Status422UnprocessableEntity;
                await context.Response.WriteAsync("{\"success\":false,\"message\":\"This request key was already used for a different action.\",\"data\":null}");
                return;
            }
            if (!existing.Completed)
            {
                context.Response.StatusCode = StatusCodes.Status409Conflict;
                await context.Response.WriteAsync("{\"success\":false,\"message\":\"This request is already being processed. Check the list before trying again.\",\"data\":null}");
                return;
            }
            context.Response.StatusCode = existing.StatusCode;
            context.Response.ContentType = existing.ContentType ?? "application/json";
            context.Response.Headers["Idempotent-Replay"] = "true";
            if (!string.IsNullOrEmpty(existing.ResponseBody)) await context.Response.WriteAsync(existing.ResponseBody);
            return;
        }

        // Occasionally prune keys older than a day.
        if (Random.Shared.Next(50) == 0)
        {
            try
            {
                var cutoff = DateTime.UtcNow.AddDays(-1);
                await db.IdempotencyRecords.Where(r => r.CreatedAt < cutoff).ExecuteDeleteAsync();
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Idempotency cleanup failed"); }
        }

        var originalBody = context.Response.Body;
        await using var buffer = new MemoryStream();
        context.Response.Body = buffer;
        try
        {
            await _next(context);

            buffer.Position = 0;
            var body = await new StreamReader(buffer).ReadToEndAsync();
            buffer.Position = 0;
            await buffer.CopyToAsync(originalBody);

            // Only a success is remembered. A validation error (4xx) or server
            // error (5xx) saved nothing, so the key is released for a corrected retry.
            if (context.Response.StatusCode < 200 || context.Response.StatusCode >= 300)
            {
                db.IdempotencyRecords.Remove(record);
            }
            else
            {
                record.Completed = true;
                record.StatusCode = context.Response.StatusCode;
                record.ContentType = context.Response.ContentType;
                record.ResponseBody = body.Length <= 200_000 ? body : null;
            }
            await db.SaveChangesAsync();
        }
        catch
        {
            try { db.IdempotencyRecords.Remove(record); await db.SaveChangesAsync(); } catch { /* best effort */ }
            throw;
        }
        finally
        {
            context.Response.Body = originalBody;
        }
    }
}
