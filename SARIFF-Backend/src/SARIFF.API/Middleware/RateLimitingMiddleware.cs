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
            var ip = context.Connection.RemoteIpAddress is { } ra ? SARIFF.Infrastructure.Services.IpAccess.Normalize(ra.ToString()) : "unknown";
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
