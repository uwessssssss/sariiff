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
