using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using SARIFF.Infrastructure.Services;

namespace SARIFF.API.Controllers;

[Authorize(Policy = "SuperAdminOnly")] 
[Route("api/admin")]
public class AdminController : BaseApiController
{
    private readonly IDashboardService _dashboardService;
    private readonly IAuditService _auditService;
    private readonly ISystemLogService _systemLogService;
    private readonly ISuperAdminService _superAdminService;
    private readonly ICompanyService _companyService;

    public AdminController(
        IDashboardService dashboardService, 
        IAuditService auditService, 
        ISystemLogService systemLogService,
        ISuperAdminService superAdminService,
        ICompanyService companyService)
    {
        _dashboardService = dashboardService;
        _auditService = auditService;
        _systemLogService = systemLogService;
        _superAdminService = superAdminService;
        _companyService = companyService;
    }
    

    /// <summary>
    /// Basic dashboard (backward compatible)
    /// </summary>
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        var result = await _dashboardService.GetSuperAdminDashboardAsync();
        return Ok(result);
    }

    /// <summary>
    /// Basic audit logs (backward compatible)
    /// </summary>
    [HttpGet("audit-logs")]
    public async Task<IActionResult> GetAuditLogs([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] Guid? companyId = null)
    {
        var result = await _auditService.GetAuditLogsAsync(page, pageSize, companyId);
        return Ok(result);
    }

    /// <summary>
    /// Login history (backward compatible)
    /// </summary>
    [HttpGet("login-history")]
    public async Task<IActionResult> GetLoginHistory([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] Guid? companyId = null)
    {
        var result = await _auditService.GetLoginHistoryAsync(page, pageSize, companyId);
        return Ok(result);
    }

    /// <summary>
    /// System logs (backward compatible)
    /// </summary>
    [HttpGet("system-logs")]
    public async Task<IActionResult> GetSystemLogs([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] string? level = null, [FromQuery] bool includeResolved = false)
    {
        var result = await _systemLogService.GetLogsAsync(ClampPage(page), ClampPageSize(pageSize), level, includeResolved);
        return Ok(result);
    }

    /// <summary>
    /// Mark a log entry resolved once its cause is fixed. similar=true (default) also
    /// marks every identical unresolved entry, so one click clears a repeated bug.
    /// </summary>
    [HttpPost("system-logs/{id:guid}/resolve")]
    public async Task<IActionResult> ResolveSystemLog(Guid id, [FromQuery] bool similar = true)
    {
        var result = await _systemLogService.ResolveAsync(id, UserId, similar);
        return result.Success ? Ok(result) : NotFound(result);
    }

    /// <summary>
    /// One-off: take the double-counted profit off old BUY exchanges.
    /// POST /api/admin/maintenance/exchange-profit            → report only
    /// POST /api/admin/maintenance/exchange-profit?apply=true → write it
    /// </summary>
    [HttpPost("maintenance/exchange-profit")]
    public async Task<IActionResult> CorrectLegacyExchangeProfit(
        [FromServices] IExchangeService exchangeService, [FromQuery] Guid? companyId = null, [FromQuery] bool apply = false)
    {
        var result = await exchangeService.CorrectLegacyBuyProfitAsync(companyId, apply);
        return result.Success ? Ok(result) : BadRequest(result);
    }

  

    /// <summary>
    /// Extended dashboard with full stats
    /// </summary>
    [HttpGet("dashboard/extended")]
    public async Task<IActionResult> GetDashboardExtended()
    {
        var result = await _superAdminService.GetDashboardAsync();
        return result.Success ? Ok(result) : BadRequest(result);
    }

    // ==================== COMPANIES ====================

    /// <summary>
    /// Get all companies with detailed stats
    /// </summary>
    [HttpGet("companies")]
    public async Task<IActionResult> GetCompanies(
        [FromQuery] int page = 1, 
        [FromQuery] int pageSize = 10, 
        [FromQuery] string? search = null,
        [FromQuery] string? status = null)
    {
        var result = await _superAdminService.GetAllCompaniesWithStatsAsync(page, pageSize, search, status);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get company details with balances and activity
    /// </summary>
    [HttpGet("companies/{id}/details")]
    public async Task<IActionResult> GetCompanyDetails(Guid id)
    {
        var result = await _superAdminService.GetCompanyDetailAsync(id);
        return result.Success ? Ok(result) : NotFound(result);
    }

    /// <summary>
    /// Set a company's base (home) currency — KES or UGX. Super admin only;
    /// refused once the company has exchange or mobile-money history.
    /// </summary>
    [HttpPut("companies/{id}/base-currency")]
    public async Task<IActionResult> SetBaseCurrency(Guid id, [FromBody] SetBaseCurrencyDto dto)
    {
        var result = await _superAdminService.SetBaseCurrencyAsync(id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Update company subscription
    /// </summary>
    [HttpPut("companies/{id}/subscription")]
    public async Task<IActionResult> UpdateSubscription(Guid id, [FromBody] UpdateSubscriptionDto dto)
    {
        var result = await _superAdminService.UpdateSubscriptionAsync(id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Update company details (name, owner, email, etc.)
    /// </summary>
    [HttpPut("companies/{id}")]
    public async Task<IActionResult> UpdateCompanyDetails(Guid id, [FromBody] UpdateCompanyDto dto)
    {
        var result = await _companyService.UpdateAsync(id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Suspend company
    /// </summary>
    [HttpPost("companies/{id}/suspend")]
    public async Task<IActionResult> SuspendCompany(Guid id, [FromBody] SuspendCompanyDto dto)
    {
        var result = await _superAdminService.SuspendCompanyAsync(id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Activate/Unlock company
    /// </summary>
    [HttpPost("companies/{id}/activate")]
    public async Task<IActionResult> ActivateCompany(Guid id)
    {
        var result = await _superAdminService.ActivateCompanyAsync(id);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Reset password for Office User (Company)
    /// SuperAdmin can reset any company's password
    /// </summary>
    [HttpPost("companies/{id}/reset-password")]
    public async Task<IActionResult> ResetOfficeUserPassword(Guid id, [FromBody] AdminResetPasswordDto dto)
    {
        var result = await _superAdminService.ResetOfficeUserPasswordAsync(id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    // ==================== SYSTEM HEALTH ====================

    /// <summary>
    /// Get system health status
    /// </summary>
    [HttpGet("system/health")]
    public async Task<IActionResult> GetSystemHealth()
    {
        var result = await _superAdminService.GetSystemHealthAsync();
        return result.Success ? Ok(result) : BadRequest(result);
    }

    // ==================== SECURITY ====================

    /// <summary>
    /// Get security overview
    /// </summary>
    [HttpGet("security/overview")]
    public async Task<IActionResult> GetSecurityOverview()
    {
        var result = await _superAdminService.GetSecurityOverviewAsync();
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get security alerts
    /// </summary>
    [HttpGet("security/alerts")]
    public async Task<IActionResult> GetSecurityAlerts(
        [FromQuery] int page = 1, 
        [FromQuery] int pageSize = 20, 
        [FromQuery] bool? resolved = null)
    {
        var result = await _superAdminService.GetSecurityAlertsAsync(page, pageSize, resolved);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Resolve a security alert
    /// </summary>
    [HttpPost("security/alerts/{id}/resolve")]
    public async Task<IActionResult> ResolveSecurityAlert(Guid id, [FromBody] ResolveAlertDto dto)
    {
        var result = await _superAdminService.ResolveSecurityAlertAsync(id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Block an IP address
    /// </summary>
    [HttpPost("security/block-ip")]
    public async Task<IActionResult> BlockIP([FromBody] BlockIPDto dto)
    {
        if (!IpAccess.IsValid(dto.IpAddress))
            return BadRequest(new ApiResponse<bool>(false, "Enter a valid IP address, e.g. 102.68.79.12", false));
        if (IpAccess.Normalize(dto.IpAddress) == IpAccess.Normalize(IpAddress))
            return BadRequest(new ApiResponse<bool>(false, "That is your own current IP address. Blocking it would lock you out.", false));
        var result = await _superAdminService.BlockIPAsync(dto with { IpAddress = IpAccess.Normalize(dto.IpAddress) });
        IpAccess.Invalidate();
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Unblock an IP address
    /// </summary>
    [HttpDelete("security/blocked-ips/{id}")]
    public async Task<IActionResult> UnblockIP(Guid id)
    {
        var result = await _superAdminService.UnblockIPAsync(id);
        IpAccess.Invalidate();
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get IP whitelist
    /// </summary>
    [HttpGet("security/ip-whitelist")]
    public async Task<IActionResult> GetIPWhitelist()
    {
        var result = await _superAdminService.GetIPWhitelistAsync();
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Add IP to whitelist
    /// </summary>
    [HttpPost("security/ip-whitelist")]
    public async Task<IActionResult> AddIPToWhitelist([FromBody] AddIPWhitelistDto dto, [FromServices] AppDbContext db)
    {
        if (!IpAccess.IsValid(dto.IpAddress))
            return BadRequest(new ApiResponse<bool>(false, "Enter a valid IP address, e.g. 102.68.79.12", false));
        // The first entry switches the allow-list on: it must include the address you're
        // using now, or this super admin area locks you out the moment it's saved.
        var mine = IpAccess.Normalize(IpAddress);
        var listOn = await db.AdminIpWhitelists.AnyAsync(w => w.IsActive && !w.IsDeleted);
        if (!listOn && IpAccess.Normalize(dto.IpAddress) != mine)
            return BadRequest(new ApiResponse<bool>(false, $"Add your current IP ({mine}) first. The first address turns the allow-list on, and you'd be locked out otherwise.", false));
        var result = await _superAdminService.AddIPToWhitelistAsync(dto with { IpAddress = IpAccess.Normalize(dto.IpAddress) }, UserId ?? Guid.Empty);
        IpAccess.Invalidate();
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Remove IP from whitelist
    /// </summary>
    [HttpDelete("security/ip-whitelist/{id}")]
    public async Task<IActionResult> RemoveIPFromWhitelist(Guid id, [FromServices] AppDbContext db)
    {
        // Removing your own address while others remain would lock you out.
        var mine = IpAccess.Normalize(IpAddress);
        var remaining = (await db.AdminIpWhitelists.AsNoTracking()
                .Where(w => w.IsActive && !w.IsDeleted && w.Id != id).Select(w => w.IpAddress).ToListAsync())
            .Select(IpAccess.Normalize).ToList();
        if (remaining.Count > 0 && !remaining.Contains(mine))
            return BadRequest(new ApiResponse<bool>(false, $"Removing this would lock you out: your current IP ({mine}) isn't in the rest of the list. Add it first.", false));
        var result = await _superAdminService.RemoveIPFromWhitelistAsync(id);
        IpAccess.Invalidate();
        return result.Success ? Ok(result) : BadRequest(result);
    }

    // ==================== FINANCIAL ====================

    /// <summary>
    /// Get financial overview
    /// </summary>
    [HttpGet("financials/overview")]
    public async Task<IActionResult> GetFinancialOverview()
    {
        var result = await _superAdminService.GetFinancialOverviewAsync();
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get payment history
    /// </summary>
    [HttpGet("financials/payments")]
    public async Task<IActionResult> GetPaymentHistory(
        [FromQuery] int page = 1, 
        [FromQuery] int pageSize = 20, 
        [FromQuery] Guid? companyId = null)
    {
        var result = await _superAdminService.GetPaymentHistoryAsync(page, pageSize, companyId);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Record a payment
    /// </summary>
    [HttpPost("financials/payments")]
    public async Task<IActionResult> RecordPayment([FromBody] RecordPaymentDto dto)
    {
        var result = await _superAdminService.RecordPaymentAsync(dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    // ==================== ANALYTICS ====================

    /// <summary>
    /// Get analytics overview
    /// </summary>
    [HttpGet("analytics/overview")]
    public async Task<IActionResult> GetAnalyticsOverview(
        [FromQuery] DateTime? startDate = null, 
        [FromQuery] DateTime? endDate = null)
    {
        var result = await _superAdminService.GetAnalyticsOverviewAsync(startDate, endDate);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    // ==================== AUDIT LOGS (EXTENDED) ====================

    /// <summary>
    /// Get audit logs with extended filtering
    /// </summary>
    [HttpGet("audit-logs/extended")]
    public async Task<IActionResult> GetAuditLogsExtended(
        [FromQuery] int page = 1, 
        [FromQuery] int pageSize = 20,
        [FromQuery] Guid? companyId = null,
        [FromQuery] Guid? userId = null,
        [FromQuery] string? action = null,
        [FromQuery] string? entityType = null,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] string? severity = null)
    {
        var filter = new AuditLogFilterDto(companyId, userId, action, entityType, startDate, endDate, severity);
        var result = await _superAdminService.GetAuditLogsExtendedAsync(page, pageSize, filter);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Export audit logs as CSV
    /// </summary>
    [HttpGet("audit-logs/export")]
    public async Task<IActionResult> ExportAuditLogs(
        [FromQuery] Guid? companyId = null,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null)
    {
        var filter = new AuditLogFilterDto(companyId, null, null, null, startDate, endDate, null);
        var result = await _superAdminService.ExportAuditLogsAsync(filter);
        
        if (!result.Success || result.Data == null)
            return BadRequest(result);
            
        return File(result.Data, "text/csv", $"audit-logs-{BureauClock.TodayLocal:yyyy-MM-dd}.csv");
    }
}
