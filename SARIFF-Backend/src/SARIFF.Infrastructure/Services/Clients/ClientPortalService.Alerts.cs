
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using System.Globalization;
using System.Text;

namespace SARIFF.Infrastructure.Services;

public partial class ClientPortalService
{
    // ==================== ALERTS ====================

    public async Task<ApiResponse<PagedResult<ClientAlertDto>>> GetAlertsAsync(
        Guid companyId, Guid clientId, int page, int pageSize, bool unreadOnly)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = _context.Set<ClientAlert>()
            .Where(a => a.ClientId == clientId && a.CompanyId == companyId && !a.IsDeleted);

        if (unreadOnly)
            query = query.Where(a => !a.IsRead);

        var totalCount = await query.CountAsync();

        var alerts = await query
            .OrderByDescending(a => a.CreatedAt)
            .ThenByDescending(a => a.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new ClientAlertDto
            {
                Id = a.Id,
                Type = a.Type,
                Title = a.Title,
                Message = a.Message,
                IsRead = a.IsRead,
                CreatedAt = a.CreatedAt,
                RelatedTransactionId = a.RelatedTransactionId
            })
            .ToListAsync();

        return new ApiResponse<PagedResult<ClientAlertDto>>(true, "Success",
            new PagedResult<ClientAlertDto>(alerts, totalCount, page, pageSize));
    }

    public async Task<ApiResponse<bool>> MarkAlertAsReadAsync(Guid companyId, Guid clientId, Guid alertId)
    {
        var alert = await _context.Set<ClientAlert>()
            .FirstOrDefaultAsync(a => a.Id == alertId && a.ClientId == clientId && 
                                      a.CompanyId == companyId && !a.IsDeleted);

        if (alert == null)
            return new ApiResponse<bool>(false, "Alert not found", false);

        alert.IsRead = true;
        alert.ReadAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return new ApiResponse<bool>(true, "Alert marked as read", true);
    }

    public async Task<ApiResponse<bool>> MarkAllAlertsAsReadAsync(Guid companyId, Guid clientId)
    {
        var alerts = await _context.Set<ClientAlert>()
            .Where(a => a.ClientId == clientId && a.CompanyId == companyId && !a.IsDeleted && !a.IsRead)
            .ToListAsync();

        foreach (var alert in alerts)
        {
            alert.IsRead = true;
            alert.ReadAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        return new ApiResponse<bool>(true, $"{alerts.Count} alerts marked as read", true);
    }

    public async Task<ApiResponse<int>> GetUnreadCountAsync(Guid companyId, Guid clientId)
    {
        var count = await _context.Set<ClientAlert>()
            .CountAsync(a => a.ClientId == clientId && a.CompanyId == companyId && !a.IsDeleted && !a.IsRead);

        return new ApiResponse<int>(true, "Success", count);
    }
}
