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
