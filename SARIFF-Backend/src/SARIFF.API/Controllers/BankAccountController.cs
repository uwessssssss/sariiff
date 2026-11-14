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
[Route("api/bank")]
public class BankAccountController : BaseApiController
{
    private readonly IBankAccountService _bankService;

    public BankAccountController(IBankAccountService bankService) => _bankService = bankService;

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateBankAccountDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _bankService.CreateAsync(CompanyId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _bankService.GetAllAsync(CompanyId.Value);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _bankService.GetByIdAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateBankAccountDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _bankService.UpdateAsync(CompanyId.Value, id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _bankService.DeleteAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _bankService.GetStatsAsync(CompanyId.Value);
        return Ok(result);
    }

    [HttpGet("{id:guid}/statement")]
    public async Task<IActionResult> GetStatement( Guid id, 
        [FromQuery] DateTime? startDate, 
        [FromQuery] DateTime? endDate,
        [FromQuery] Currency? currency,
        [FromQuery] TransactionType? transactionType)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _bankService.GetStatementAsync(CompanyId.Value, id, new StatementFilterDto(startDate, endDate, currency, transactionType));
        return result.Success ? Ok(result) : NotFound(result);
    }
}
