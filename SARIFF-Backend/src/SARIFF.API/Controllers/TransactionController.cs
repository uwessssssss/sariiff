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
[Route("api/transaction")]
public class TransactionController : BaseApiController
{
    private readonly ITransactionService _transactionService;

    public TransactionController(ITransactionService transactionService) => _transactionService = transactionService;

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTransactionDto dto, [FromServices] AppDbContext db)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        if (await PinRequiredAsync(db) is { } pinBlock) return pinBlock;
        var result = await _transactionService.CreateAsync(CompanyId.Value, UserId.Value, dto);
        await PinOutcomeAsync(db, result.Success);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _transactionService.GetByIdAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int page = 1, [FromQuery] int pageSize = 10, [FromQuery] DateTime? startDate = null, [FromQuery] DateTime? endDate = null, [FromQuery] TransactionType? type = null, [FromQuery] Currency? currency = null)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var filter = new ReportFilterDto(startDate, endDate, type, currency, null);
        var result = await _transactionService.GetAllAsync(CompanyId.Value, ClampPage(page), ClampPageSize(pageSize, 1000), filter);
        return Ok(result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTransactionDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _transactionService.UpdateAsync(CompanyId.Value, id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, [FromBody] DeleteTransactionDto dto, [FromServices] AppDbContext db)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        if (await PinRequiredAsync(db) is { } pinBlock) return pinBlock;
        var result = await _transactionService.DeleteAsync(CompanyId.Value, id, UserId.Value, dto);
        await PinOutcomeAsync(db, result.Success);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("today")]
    public async Task<IActionResult> GetTodaySummary()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _transactionService.GetTodaySummaryAsync(CompanyId.Value);
        return Ok(result);
    }

    [HttpGet("recent")]
    public async Task<IActionResult> GetRecent([FromQuery] int count = 10)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _transactionService.GetRecentAsync(CompanyId.Value, count);
        return Ok(result);
    }
}
