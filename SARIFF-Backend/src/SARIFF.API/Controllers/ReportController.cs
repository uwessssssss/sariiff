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

[Authorize(Policy = "OfficeUserOnly")] 
[Route("api/report")]
public class ReportController : BaseApiController
{
    private readonly IReportService _reportService;

    public ReportController(IReportService reportService) => _reportService = reportService;

    [HttpGet("daily")]
    public async Task<IActionResult> GetDailyReport([FromQuery] DateTime? date = null)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _reportService.GetDailyReportAsync(CompanyId.Value, date ?? DateTime.UtcNow);
        return Ok(result);
    }

    [HttpGet("transactions")]
    public async Task<IActionResult> GetTransactionReport([FromQuery] int page = 1, [FromQuery] int pageSize = 10, [FromQuery] DateTime? startDate = null, [FromQuery] DateTime? endDate = null, [FromQuery] TransactionType? type = null, [FromQuery] Currency? currency = null)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var filter = new ReportFilterDto(startDate, endDate, type, currency, null);
        var result = await _reportService.GetTransactionReportAsync(CompanyId.Value, filter, ClampPage(page), ClampPageSize(pageSize, 1000));
        return Ok(result);
    }

    [HttpGet("client-balances")]
    public async Task<IActionResult> GetClientBalanceReport([FromQuery] string? balanceType = null)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _reportService.GetClientBalanceReportAsync(CompanyId.Value, balanceType);
        return Ok(result);
    }

    [HttpGet("account-summary")]
    public async Task<IActionResult> GetAccountSummaryReport()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _reportService.GetAccountSummaryReportAsync(CompanyId.Value);
        return Ok(result);
    }
}
