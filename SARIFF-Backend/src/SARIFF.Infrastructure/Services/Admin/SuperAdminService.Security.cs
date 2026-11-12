
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using System.Diagnostics;
using System.Text;

namespace SARIFF.Infrastructure.Services;

public partial class SuperAdminService
{
    // ==================== SECURITY ====================

    public async Task<ApiResponse<SecurityOverviewDto>> GetSecurityOverviewAsync()
    {
        try
        {
            var now = DateTime.UtcNow;
            var last24h = now.AddHours(-24);
            var last7d = now.AddDays(-7);

            var failedLogins24h = await _context.LoginHistories.CountAsync(l => l.LoginAt >= last24h && !l.IsSuccessful);
            var failedLogins7d = await _context.LoginHistories.CountAsync(l => l.LoginAt >= last7d && !l.IsSuccessful);

            var lockedCompanies = await _context.Companies.CountAsync(c => c.LockedUntil != null && c.LockedUntil > now);
            var lockedUsers = await _context.Users.CountAsync(u => u.LockedUntil != null && u.LockedUntil > now);

            var activeAlerts = await _context.Set<SecurityAlert>().CountAsync(a => !a.IsResolved && !a.IsDeleted);
            var blockedIPs = await _context.Set<BlockedIP>().CountAsync(b => b.IsActive && !b.IsDeleted);

            var recentAlerts = await _context.Set<SecurityAlert>()
                .Where(a => !a.IsDeleted)
                .OrderByDescending(a => a.CreatedAt)
                .Take(10)
                .Select(a => new SecurityAlertDto(
                    a.Id, a.AlertType, a.Severity, a.Message, a.CompanyId, null, a.IpAddress, a.IsResolved, a.CreatedAt, a.ResolvedAt
                ))
                .ToListAsync();

            var recentFailedLogins = await _context.LoginHistories.AsNoTracking()
                .Where(l => !l.IsSuccessful)
                .OrderByDescending(l => l.LoginAt)
                .Take(20)
                .Select(l => new AdminLoginHistoryDto(
                    l.Id, l.CompanyId, null, l.UserId, null, l.UserRole, l.IpAddress, l.Location, l.IsSuccessful, l.FailureReason, l.LoginAt
                ))
                .ToListAsync();

            var overview = new SecurityOverviewDto(
                failedLogins24h, failedLogins7d, lockedCompanies + lockedUsers, 0, blockedIPs, activeAlerts, recentAlerts, recentFailedLogins
            );

            return new ApiResponse<SecurityOverviewDto>(true, "Security overview retrieved", overview);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting security overview");
            return new ApiResponse<SecurityOverviewDto>(false, "Error retrieving security overview", null!);
        }
    }

    public async Task<ApiResponse<PagedResult<SecurityAlertDto>>> GetSecurityAlertsAsync(int page, int pageSize, bool? resolved = null)
    {
        try
        {
            var query = _context.Set<SecurityAlert>().Where(a => !a.IsDeleted);
            if (resolved.HasValue) { var v = resolved.Value; query = query.Where(a => a.IsResolved == v); }
            var totalCount = await query.CountAsync();
            var alerts = await query
                .OrderByDescending(a => a.CreatedAt)
                .ThenByDescending(a => a.Id)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(a => new SecurityAlertDto(
                    a.Id, a.AlertType, a.Severity, a.Message, a.CompanyId, null, a.IpAddress, a.IsResolved, a.CreatedAt, a.ResolvedAt
                ))
                .ToListAsync();

            return new ApiResponse<PagedResult<SecurityAlertDto>>(true, "Alerts retrieved",
                new PagedResult<SecurityAlertDto>(alerts, totalCount, page, pageSize));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting security alerts");
            return new ApiResponse<PagedResult<SecurityAlertDto>>(false, "Error retrieving alerts", null!);
        }
    }

    public async Task<ApiResponse<bool>> ResolveSecurityAlertAsync(Guid alertId, ResolveAlertDto dto)
    {
        try
        {
            var alert = await _context.Set<SecurityAlert>().FindAsync(alertId);
            if (alert == null)
                return new ApiResponse<bool>(false, "Alert not found", false);

            alert.IsResolved = true;
            alert.ResolvedAt = DateTime.UtcNow;
            alert.ResolutionNotes = dto.Notes;
            await _context.SaveChangesAsync();

            return new ApiResponse<bool>(true, "Alert resolved", true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resolving alert {AlertId}", alertId);
            return new ApiResponse<bool>(false, "Error resolving alert", false);
        }
    }

    public async Task<ApiResponse<bool>> BlockIPAsync(BlockIPDto dto)
    {
        try
        {
            var blockedIP = new BlockedIP
            {
                IpAddress = dto.IpAddress,
                Reason = dto.Reason,
                BlockedUntil = dto.BlockUntil,
                IsActive = true
            };

            _context.Set<BlockedIP>().Add(blockedIP);
            await _context.SaveChangesAsync();

            _logger.LogWarning("IP blocked: {IP} - {Reason}", dto.IpAddress, dto.Reason);
            return new ApiResponse<bool>(true, "IP blocked", true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error blocking IP {IP}", dto.IpAddress);
            return new ApiResponse<bool>(false, "Error blocking IP", false);
        }
    }

    public async Task<ApiResponse<bool>> UnblockIPAsync(Guid id)
    {
        try
        {
            var blockedIP = await _context.Set<BlockedIP>().FindAsync(id);
            if (blockedIP == null)
                return new ApiResponse<bool>(false, "Blocked IP not found", false);

            blockedIP.IsActive = false;
            await _context.SaveChangesAsync();

            return new ApiResponse<bool>(true, "IP unblocked", true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error unblocking IP {Id}", id);
            return new ApiResponse<bool>(false, "Error unblocking IP", false);
        }
    }

    public async Task<ApiResponse<List<IPWhitelistDto>>> GetIPWhitelistAsync()
    {
        try
        {
            var whitelist = await _context.AdminIpWhitelists
                .Where(w => !w.IsDeleted)
                .Select(w => new IPWhitelistDto(w.Id, w.IpAddress, w.Description, w.IsActive, w.CreatedAt))
                .ToListAsync();

            return new ApiResponse<List<IPWhitelistDto>>(true, "Whitelist retrieved", whitelist);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting IP whitelist");
            return new ApiResponse<List<IPWhitelistDto>>(false, "Error retrieving whitelist", null!);
        }
    }

    public async Task<ApiResponse<bool>> AddIPToWhitelistAsync(AddIPWhitelistDto dto, Guid addedByUserId)
    {
        try
        {
            var entry = new AdminIpWhitelist
            {
                IpAddress = dto.IpAddress,
                Description = dto.Description,
                IsActive = true,
                AddedByUserId = addedByUserId
            };

            _context.AdminIpWhitelists.Add(entry);
            await _context.SaveChangesAsync();

            return new ApiResponse<bool>(true, "IP added to whitelist", true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding IP to whitelist");
            return new ApiResponse<bool>(false, "Error adding IP", false);
        }
    }

    public async Task<ApiResponse<bool>> RemoveIPFromWhitelistAsync(Guid id)
    {
        try
        {
            var entry = await _context.AdminIpWhitelists.FindAsync(id);
            if (entry == null)
                return new ApiResponse<bool>(false, "IP not found", false);

            entry.IsDeleted = true;
            await _context.SaveChangesAsync();

            return new ApiResponse<bool>(true, "IP removed from whitelist", true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing IP from whitelist");
            return new ApiResponse<bool>(false, "Error removing IP", false);
        }
    }
}
