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
        page = Math.Max(1, page);                 // page 0 was a negative OFFSET: a server error on PostgreSQL
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = _context.AuditLogs.AsQueryable();
        if (companyId.HasValue) query = query.Where(l => l.CompanyId == companyId);

        var totalCount = await query.CountAsync();
        var logs = await query.OrderByDescending(l => l.CreatedAt).ThenByDescending(l => l.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

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
        page = Math.Max(1, page);                 // page 0 was a negative OFFSET: a server error on PostgreSQL
        pageSize = Math.Clamp(pageSize, 1, 200);
        var query = _context.LoginHistories.AsQueryable();
        if (companyId.HasValue) query = query.Where(l => l.CompanyId == companyId);

        var totalCount = await query.CountAsync();
        var logs = await query.OrderByDescending(l => l.LoginAt).ThenByDescending(l => l.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

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
