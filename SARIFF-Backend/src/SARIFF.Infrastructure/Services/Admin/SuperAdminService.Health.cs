
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
    // ==================== SYSTEM HEALTH ====================

    public async Task<ApiResponse<SystemHealthDto>> GetSystemHealthAsync()
    {
        try
        {
            var now = DateTime.UtcNow;
            var last24h = now.AddHours(-24);

            // Database health check
            var dbStopwatch = Stopwatch.StartNew();
            var canConnect = await _context.Database.CanConnectAsync();
            dbStopwatch.Stop();

            var dbStatus = canConnect ? "Healthy" : "Down";
            var dbLatency = (int)dbStopwatch.ElapsedMilliseconds;

            // Get log counts
            // Resolved entries are kept as evidence but no longer count against health.
            var errorsLast24h = await _context.SystemLogs.CountAsync(l => l.CreatedAt >= last24h && l.Level == "Error" && l.ResolvedAt == null);
            var warningsLast24h = await _context.SystemLogs.CountAsync(l => l.CreatedAt >= last24h && l.Level == "Warning" && l.ResolvedAt == null);
            var criticalLast24h = await _context.SystemLogs.CountAsync(l => l.CreatedAt >= last24h && l.Level == "Critical" && l.ResolvedAt == null);

            // Everything below is measured — no placeholder numbers.
            var (reqPerMin, avgMs, errorRate, _) = RequestMetrics.Snapshot();
            var dbConnections = 0;
            if (canConnect && _context.Database.IsNpgsql())
            {
                try
                {
                    dbConnections = await _context.Database
                        .SqlQueryRaw<int>("SELECT count(*)::int AS \"Value\" FROM pg_stat_activity WHERE datname = current_database()")
                        .SingleAsync();
                }
                catch (Exception ex) { _logger.LogWarning(ex, "Could not read pg_stat_activity"); }
            }
            var cpu = await CpuPercentAsync();
            var memory = MemoryPercent();
            var disk = DiskPercent();

            var apiStatus = errorRate > 5 ? "Degraded" : "Healthy";
            var reasons = new List<string>();
            if (!canConnect) reasons.Add("The database can't be reached");
            if (errorsLast24h > 10) reasons.Add($"{errorsLast24h} unresolved errors in the last 24 hours (see System Logs)");
            if (dbLatency > 1000) reasons.Add($"Database is slow ({dbLatency} ms)");
            if (errorRate > 5) reasons.Add($"{errorRate:0.#}% of requests are failing");
            if (memory > 90) reasons.Add($"Memory is {memory:0.#}% used");
            if (disk > 90) reasons.Add($"Disk is {disk:0.#}% full on the server (free space or a bigger disk)");

            var overallStatus = !canConnect ? "Down" : reasons.Count > 0 ? "Degraded" : "Healthy";

            var uptimeSeconds = (long)(now - _startTime).TotalSeconds;

            var health = new SystemHealthDto(
                overallStatus, apiStatus, avgMs, reqPerMin, errorRate,
                dbStatus, dbLatency, dbConnections, cpu, memory, disk, 0 /* no WebSockets: real-time hub removed */,
                uptimeSeconds, now,
                errorsLast24h, warningsLast24h, criticalLast24h, reasons
            );

            return new ApiResponse<SystemHealthDto>(true, "Health check complete", health);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting system health");
            return new ApiResponse<SystemHealthDto>(false, "Health check failed",
                new SystemHealthDto("Down", "Down", 0, 0, 100, "Down", 0, 0, 0, 0, 0, 0, 0, DateTime.UtcNow, 0, 0, 0));
        }
    }

    /// <summary>This process's CPU use over a 250 ms sample, as a share of all cores it can use.</summary>
    private static async Task<decimal> CpuPercentAsync()
    {
        try
        {
            using var process = Process.GetCurrentProcess();
            var before = process.TotalProcessorTime;
            var clock = Stopwatch.StartNew();
            await Task.Delay(250);
            process.Refresh();
            var usedMs = (process.TotalProcessorTime - before).TotalMilliseconds;
            var pct = usedMs / (clock.Elapsed.TotalMilliseconds * Environment.ProcessorCount) * 100;
            return Math.Round((decimal)Math.Clamp(pct, 0, 100), 1);
        }
        catch { return 0; }
    }

    /// <summary>Memory this process uses, as a share of what it may use (respects container limits).</summary>
    private static decimal MemoryPercent()
    {
        try
        {
            var available = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
            if (available <= 0) return 0;
            using var process = Process.GetCurrentProcess();
            return Math.Round(Math.Min(100m, process.WorkingSet64 * 100m / available), 1);
        }
        catch { return 0; }
    }

    /// <summary>Used space on the drive the API runs from.</summary>
    private static decimal DiskPercent()
    {
        try
        {
            var root = Path.GetPathRoot(AppContext.BaseDirectory);
            if (string.IsNullOrEmpty(root)) return 0;
            var drive = new DriveInfo(root);
            if (!drive.IsReady || drive.TotalSize <= 0) return 0;
            return Math.Round((drive.TotalSize - drive.AvailableFreeSpace) * 100m / drive.TotalSize, 1);
        }
        catch { return 0; }
    }
}
