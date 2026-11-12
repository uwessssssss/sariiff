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

public class ExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionMiddleware> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    public ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> logger, IServiceScopeFactory scopeFactory)
    {
        _next = next;
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            var kind = Classify(ex);
            if (kind == DbFailure.BadValue)
                _logger.LogWarning("Rejected a value the database cannot store ({Path}): {Message}", context.Request.Path, Innermost(ex).Message);
            else if (kind == DbFailure.Conflict)
                _logger.LogWarning("Duplicate request lost a race, answered 409 ({Path}): {Message}", context.Request.Path, Innermost(ex).Message);
            else if (kind == DbFailure.Unavailable)
                _logger.LogWarning("Database unavailable, answered 503 ({Path}): {Message}", context.Request.Path, Innermost(ex).Message);
            else
                _logger.LogError(ex, "Unhandled exception: {Message}", ex.Message);
            await HandleExceptionAsync(context, ex, kind);
        }
    }

    private enum DbFailure { None, BadValue, Unavailable, Conflict }

    private static Exception Innermost(Exception ex)
    {
        while (ex.InnerException != null) ex = ex.InnerException;
        return ex;
    }

    /// <summary>
    /// Database errors that are really the caller's input (a value too large, too long or holding a
    /// character PostgreSQL can't store, SQLSTATE class 22) answer 400; a database that can't be
    /// reached answers 503. Everything else stays a 500.
    /// </summary>
    private static DbFailure Classify(Exception ex)
    {
        for (var e = ex; e != null; e = e.InnerException)
        {
            if (e is Npgsql.PostgresException pg)
            {
                if (pg.SqlState.StartsWith("22")) return DbFailure.BadValue;
                // 23505: two requests raced to create the same record (a double tap, two tills closing
                // the day at once). The unique index kept the data right; the loser is told so.
                if (pg.SqlState == "23505") return DbFailure.Conflict;
                // 08 connection lost, 57P0x server shutting down / not accepting connections, 53 out of resources
                if (pg.SqlState.StartsWith("08") || pg.SqlState.StartsWith("57P") || pg.SqlState.StartsWith("53") || pg.IsTransient)
                    return DbFailure.Unavailable;
                return DbFailure.None;
            }
            if (e is Npgsql.NpgsqlException || e is System.Net.Sockets.SocketException || e is TimeoutException)
                return DbFailure.Unavailable;
        }
        return DbFailure.None;
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception, DbFailure kind)
    {
        // nothing to record for bad input, and nowhere to record it while the database is down
        if (kind == DbFailure.None) try
        {
            using var scope = _scopeFactory.CreateScope();
            var logService = scope.ServiceProvider.GetRequiredService<ISystemLogService>();
            
            Guid? companyId = null;
            Guid? userId = null;
            
            if (context.User?.Identity?.IsAuthenticated == true)
            {
                var companyIdClaim = context.User.FindFirst("company_id")?.Value;
                var userIdClaim = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                
                if (Guid.TryParse(companyIdClaim, out var cId)) companyId = cId;
                if (Guid.TryParse(userIdClaim, out var uId)) userId = uId;
            }

            var ipAddress = context.Connection.RemoteIpAddress is { } ra ? SARIFF.Infrastructure.Services.IpAccess.Normalize(ra.ToString()) : null;
            var requestPath = context.Request.Path.ToString();
            var method = context.Request.Method;

            await logService.LogApiErrorAsync(
                requestPath,
                method,
                exception.Message,
                exception.StackTrace,
                ipAddress,
                companyId
            );
        }
        catch (Exception logEx)
        {
            _logger.LogError(logEx, "Failed to log exception to database");
        }

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = kind == DbFailure.BadValue ? (int)HttpStatusCode.BadRequest
            : kind == DbFailure.Unavailable ? (int)HttpStatusCode.ServiceUnavailable
            : kind == DbFailure.Conflict ? (int)HttpStatusCode.Conflict
            : exception switch
        {
            UnauthorizedAccessException => (int)HttpStatusCode.Unauthorized,
            KeyNotFoundException => (int)HttpStatusCode.NotFound,
            ArgumentException => (int)HttpStatusCode.BadRequest,
            InvalidOperationException => (int)HttpStatusCode.BadRequest,
            _ => (int)HttpStatusCode.InternalServerError
        };

        var message = kind == DbFailure.BadValue ? "Some of the values sent are invalid (too large, too long, or containing characters that can't be stored)."
            : kind == DbFailure.Unavailable ? "The service is temporarily unavailable. Please try again in a moment."
            : kind == DbFailure.Conflict ? "This was just recorded by another request. Refresh to see it."
            : GetUserFriendlyMessage(exception);
        var response = new ApiResponse<object>(false, message, null!);
        
        var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
        await context.Response.WriteAsync(JsonSerializer.Serialize(response, options));
    }

    private static string GetUserFriendlyMessage(Exception ex) => ex switch
    {
        UnauthorizedAccessException => "You are not authorized to perform this action",
        KeyNotFoundException => "The requested resource was not found",
        ArgumentException ae when ae.Message.Length < 100 && !ae.Message.Contains("Entity") 
            => ae.Message, // Short, non-internal argument errors are OK to show
        ArgumentException => "Invalid input provided",
        InvalidOperationException ioe when ioe.Message.Length < 100 && !ioe.Message.Contains("Entity")
            => ioe.Message,
        InvalidOperationException => "Operation could not be completed",
        _ => "An unexpected error occurred. Please try again later."
    };
}
