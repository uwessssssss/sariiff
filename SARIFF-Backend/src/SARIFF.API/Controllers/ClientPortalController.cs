using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using SARIFF.Infrastructure.Services;

namespace SARIFF.API.Controllers;

[Authorize(Policy = "ClientOnly")] 
[Route("api/portal")]
public class ClientPortalController : BaseApiController
{
    private readonly IClientPortalService _clientPortalService;
    private readonly ILogger<ClientPortalController> _logger;

    public ClientPortalController(IClientPortalService clientPortalService, ILogger<ClientPortalController> logger)
    {
        _clientPortalService = clientPortalService;
        _logger = logger;
    }

    /// <summary>
    /// Get client dashboard with profile, recent transactions, alerts, and quick stats
    /// </summary>
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _clientPortalService.GetDashboardAsync(CompanyId.Value, UserId.Value);
        return result.Success ? Ok(result) : NotFound(result);
    }

    /// <summary>
    /// Get client profile
    /// </summary>
    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _clientPortalService.GetProfileAsync(CompanyId.Value, UserId.Value);
        return result.Success ? Ok(result) : NotFound(result);
    }

    /// <summary>
    /// Update client profile (email, phone)
    /// </summary>
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateClientProfileDto dto)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _clientPortalService.UpdateProfileAsync(CompanyId.Value, UserId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get client transactions with pagination and filters
    /// </summary>
    [HttpGet("transactions")]
    public async Task<IActionResult> GetTransactions(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] Currency? currency = null,
        [FromQuery] TransactionType? type = null,
        [FromQuery] string? search = null)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();

        var filters = new TransactionFilters
        {
            StartDate = startDate,
            EndDate = endDate,
            Currency = currency,
            Type = type,
            Search = search
        };

        var result = await _clientPortalService.GetTransactionsAsync(
            CompanyId.Value, UserId.Value, page, pageSize, filters);
        return Ok(result);
    }

    /// <summary>
    /// Get a single transaction by ID
    /// </summary>
    [HttpGet("transactions/{transactionId}")]
    public async Task<IActionResult> GetTransactionById(Guid transactionId)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _clientPortalService.GetTransactionByIdAsync(
            CompanyId.Value, UserId.Value, transactionId);
        return result.Success ? Ok(result) : NotFound(result);
    }

    /// <summary>
    /// Download transaction receipt
    /// </summary>
    [HttpGet("transactions/{transactionId}/receipt")]
    public async Task<IActionResult> DownloadReceipt(Guid transactionId)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        try
        {
            var bytes = await _clientPortalService.GenerateTransactionReceiptAsync(
                CompanyId.Value, UserId.Value, transactionId);
            return File(bytes, "text/plain", $"receipt-{transactionId}.txt");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Receipt download failed");
            return NotFound(new ApiResponse<object>(false, "Transaction not found", null));
        }
    }

    /// <summary>
    /// Get client statement for date range
    /// </summary>
    [HttpGet("statement")]
    public async Task<IActionResult> GetStatement(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate,
        [FromQuery] Currency? currency = null)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _clientPortalService.GetStatementAsync(
            CompanyId.Value, UserId.Value, startDate, endDate, currency);
        return result.Success ? Ok(result) : NotFound(result);
    }

    /// <summary>
    /// Download statement as PDF/text
    /// </summary>
    // Returns a plain-text statement. "statement/pdf" is kept only as an alias
    // for older clients; the content has always been text, never a PDF.
    [HttpGet("statement/text")]
    [HttpGet("statement/pdf")]
    public async Task<IActionResult> DownloadStatementPdf(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate,
        [FromQuery] Currency? currency = null)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        try
        {
            var bytes = await _clientPortalService.GenerateStatementPdfAsync(
                CompanyId.Value, UserId.Value, startDate, endDate, currency);
            return File(bytes, "text/plain", $"statement-{startDate:yyyy-MM-dd}-to-{endDate:yyyy-MM-dd}.txt");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Client portal download failed");
            return BadRequest(new ApiResponse<object>(false, "Couldn't prepare the download. Please try again.", null));
        }
    }

    /// <summary>
    /// Export transactions as CSV
    /// </summary>
    [HttpGet("transactions/export")]
    public async Task<IActionResult> ExportTransactionsCsv(
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] Currency? currency = null)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        try
        {
            var bytes = await _clientPortalService.ExportTransactionsCsvAsync(
                CompanyId.Value, UserId.Value, startDate, endDate, currency);
            return File(bytes, "text/csv", $"transactions-{BureauClock.TodayLocal:yyyy-MM-dd}.csv");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Client portal download failed");
            return BadRequest(new ApiResponse<object>(false, "Couldn't prepare the download. Please try again.", null));
        }
    }

    /// <summary>
    /// Get client alerts with pagination
    /// </summary>
    [HttpGet("alerts")]
    public async Task<IActionResult> GetAlerts(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] bool unreadOnly = false)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _clientPortalService.GetAlertsAsync(
            CompanyId.Value, UserId.Value, page, pageSize, unreadOnly);
        return Ok(result);
    }

    /// <summary>
    /// Get unread alerts count
    /// </summary>
    [HttpGet("alerts/unread-count")]
    public async Task<IActionResult> GetUnreadAlertsCount()
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _clientPortalService.GetUnreadCountAsync(CompanyId.Value, UserId.Value);
        return Ok(result);
    }

    /// <summary>
    /// Mark single alert as read
    /// </summary>
    [HttpPost("alerts/{alertId}/read")]
    public async Task<IActionResult> MarkAlertAsRead(Guid alertId)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _clientPortalService.MarkAlertAsReadAsync(
            CompanyId.Value, UserId.Value, alertId);
        return result.Success ? Ok(result) : NotFound(result);
    }

    /// <summary>
    /// Mark all alerts as read
    /// </summary>
    [HttpPost("alerts/read-all")]
    public async Task<IActionResult> MarkAllAlertsAsRead()
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _clientPortalService.MarkAllAlertsAsReadAsync(CompanyId.Value, UserId.Value);
        return Ok(result);
    }

    /// <summary>
    /// Get client analytics
    /// </summary>
    [HttpGet("analytics")]
    public async Task<IActionResult> GetAnalytics([FromQuery] int months = 6)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _clientPortalService.GetAnalyticsAsync(CompanyId.Value, UserId.Value, months);
        return Ok(result);
    }

    /// <summary>
    /// Change client password
    /// </summary>
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _clientPortalService.ChangePasswordAsync(CompanyId.Value, UserId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }
    
}
