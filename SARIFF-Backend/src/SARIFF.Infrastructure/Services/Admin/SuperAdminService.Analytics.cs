
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
    // ==================== ANALYTICS ====================

    public async Task<ApiResponse<AnalyticsOverviewDto>> GetAnalyticsOverviewAsync(DateTime? startDate = null, DateTime? endDate = null)
    {
        try
        {
            var today = BureauClock.TodayStartUtc; // the bureaus' day (EAT) as a UTC instant
            var weekAgo = today.AddDays(-7);
            var monthAgo = today.AddDays(-30);

            var dailyActiveUsers = await _context.LoginHistories
                .Where(l => l.LoginAt >= today && l.IsSuccessful)
                .Select(l => l.UserId ?? l.CompanyId)
                .Distinct()
                .CountAsync();

            var weeklyActiveUsers = await _context.LoginHistories
                .Where(l => l.LoginAt >= weekAgo && l.IsSuccessful)
                .Select(l => l.UserId ?? l.CompanyId)
                .Distinct()
                .CountAsync();

            var monthlyActiveUsers = await _context.LoginHistories
                .Where(l => l.LoginAt >= monthAgo && l.IsSuccessful)
                .Select(l => l.UserId ?? l.CompanyId)
                .Distinct()
                .CountAsync();

            // Feature usage (placeholder - would need feature tracking)
            var featureUsage = new List<FeatureUsageDto>
            {
                new("Transactions", await _context.Transactions.CountAsync(), await _context.Transactions.Select(t => t.CompanyId).Distinct().CountAsync()),
                new("Invoices", await _context.Invoices.CountAsync(), await _context.Invoices.Select(i => i.CompanyId).Distinct().CountAsync()),
                new("Expenses", await _context.Expenses.CountAsync(), await _context.Expenses.Select(e => e.CompanyId).Distinct().CountAsync()),
                new("Reconciliation", await _context.Reconciliations.CountAsync(), await _context.Reconciliations.Select(r => r.CompanyId).Distinct().CountAsync())
            };

            var overview = new AnalyticsOverviewDto(
                // Session length is not measured (a session has no end time), so none is
                // reported. It said 30 minutes, always: a constant shown as a measurement.
                dailyActiveUsers, weeklyActiveUsers, monthlyActiveUsers, 0,
                featureUsage,
                new List<GrowthDataPointDto>(),
                new List<GrowthDataPointDto>(),
                new List<GrowthDataPointDto>()
            );

            return new ApiResponse<AnalyticsOverviewDto>(true, "Analytics retrieved", overview);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting analytics overview");
            return new ApiResponse<AnalyticsOverviewDto>(false, "Error retrieving analytics", null!);
        }
    }

    // ==================== AUDIT LOGS ====================

    public Task<ApiResponse<PagedResult<AdminAuditLogDto>>> GetAuditLogsExtendedAsync(
        int page, int pageSize, AuditLogFilterDto? filter = null) =>
        // The screen gets a capped page; the CSV export (below) reads up to 10,000 rows directly.
        AuditLogPageAsync(Math.Max(1, page), Math.Clamp(pageSize, 1, 200), filter);

    private async Task<ApiResponse<PagedResult<AdminAuditLogDto>>> AuditLogPageAsync(
        int page, int pageSize, AuditLogFilterDto? filter)
    {
        try
        {
            var query = _context.AuditLogs.AsQueryable();

            if (filter != null)
            {
                if (filter.CompanyId.HasValue)
                    query = query.Where(l => l.CompanyId == filter.CompanyId);
                if (filter.UserId.HasValue)
                    query = query.Where(l => l.UserId == filter.UserId);
                if (!string.IsNullOrWhiteSpace(filter.Action))
                {
                    // The action is stored as a number: compare the number. (Comparing its
                    // text in the database never matched, so this filter returned nothing.)
                    if (Enum.TryParse<AuditAction>(filter.Action.Trim(), true, out var action) && Enum.IsDefined(typeof(AuditAction), action))
                        query = query.Where(l => l.Action == action);
                    else
                        query = query.Where(l => false);
                }
                if (!string.IsNullOrWhiteSpace(filter.EntityType))
                    query = query.Where(l => l.EntityType == filter.EntityType);
                var (fromUtc, toExclusive) = BureauClock.Range(filter.StartDate, filter.EndDate);
                if (fromUtc.HasValue) { var v = fromUtc.Value; query = query.Where(l => l.CreatedAt >= v); }
                if (toExclusive.HasValue) { var v = toExclusive.Value; query = query.Where(l => l.CreatedAt < v); }
            }

            var totalCount = await query.CountAsync();
            var logs = await query
                .OrderByDescending(l => l.CreatedAt)
                .ThenByDescending(l => l.Id)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var companyIds = logs.Where(l => l.CompanyId.HasValue).Select(l => l.CompanyId!.Value).Distinct();
            var userIds = logs.Where(l => l.UserId.HasValue).Select(l => l.UserId!.Value).Distinct();

            var companies = await _context.Companies.Where(c => companyIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name);
            var users = await _context.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.FullName);

            var dtos = logs.Select(l => new AdminAuditLogDto(
                l.Id, l.CompanyId,
                l.CompanyId.HasValue && companies.ContainsKey(l.CompanyId.Value) ? companies[l.CompanyId.Value] : null,
                l.UserId,
                l.UserId.HasValue && users.ContainsKey(l.UserId.Value) ? users[l.UserId.Value] : null,
                l.Action, l.EntityType, l.EntityId, l.OldValues, l.NewValues, l.CreatedAt
            )).ToList();

            return new ApiResponse<PagedResult<AdminAuditLogDto>>(true, "Audit logs retrieved",
                new PagedResult<AdminAuditLogDto>(dtos, totalCount, page, pageSize));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting audit logs");
            return new ApiResponse<PagedResult<AdminAuditLogDto>>(false, "Error retrieving audit logs", null!);
        }
    }

    public async Task<ApiResponse<byte[]>> ExportAuditLogsAsync(AuditLogFilterDto? filter = null)
    {
        try
        {
            var response = await AuditLogPageAsync(1, 10000, filter);
            if (!response.Success || response.Data == null)
                return new ApiResponse<byte[]>(false, "Error exporting logs", null!);

            // The IP address is on the log row, not in the list DTO.
            var ids = response.Data.Items.Select(l => l.Id).ToList();
            var ips = await _context.AuditLogs.AsNoTracking().Where(l => ids.Contains(l.Id))
                .Select(l => new { l.Id, l.IpAddress }).ToDictionaryAsync(l => l.Id, l => l.IpAddress);

            var csv = new StringBuilder();
            csv.AppendLine("Timestamp (EAT),User,Company,Action,Entity,Details,IP Address");

            foreach (var log in response.Data.Items)
            {
                csv.AppendLine(string.Join(",",
                    CsvText.Cell(BureauClock.ToLocal(log.CreatedAt).ToString("yyyy-MM-dd HH:mm:ss")), CsvText.Cell(log.UserName ?? "System"),
                    CsvText.Cell(log.CompanyName ?? "Platform"), CsvText.Cell(log.Action), CsvText.Cell(log.EntityType),
                    CsvText.Cell(log.NewValues ?? ""), CsvText.Cell(ips.GetValueOrDefault(log.Id) ?? "")));
            }

            return new ApiResponse<byte[]>(true, "Export complete", Encoding.UTF8.GetBytes(csv.ToString()));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error exporting audit logs");
            return new ApiResponse<byte[]>(false, "Error exporting logs", null!);
        }
    }
}
