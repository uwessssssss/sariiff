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
