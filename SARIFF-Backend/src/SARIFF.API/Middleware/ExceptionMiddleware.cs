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
            _logger.LogError(ex, "Unhandled exception: {Message}", ex.Message);
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        try
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
        context.Response.StatusCode = exception switch
        {
            UnauthorizedAccessException => (int)HttpStatusCode.Unauthorized,
            KeyNotFoundException => (int)HttpStatusCode.NotFound,
            ArgumentException => (int)HttpStatusCode.BadRequest,
            InvalidOperationException => (int)HttpStatusCode.BadRequest,
            _ => (int)HttpStatusCode.InternalServerError
        };

        var response = new ApiResponse<object>(false, GetUserFriendlyMessage(exception), null!);
        
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
