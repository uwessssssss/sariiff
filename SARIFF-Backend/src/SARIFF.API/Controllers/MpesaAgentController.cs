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
[Route("api/mpesa")]
public class MpesaAgentController : BaseApiController
{
    private readonly IMpesaAgentService _mpesaService;

    public MpesaAgentController(IMpesaAgentService mpesaService) => _mpesaService = mpesaService;

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateMpesaAgentDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _mpesaService.CreateAsync(CompanyId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _mpesaService.GetAllAsync(CompanyId.Value);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _mpesaService.GetByIdAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateMpesaAgentDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _mpesaService.UpdateAsync(CompanyId.Value, id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _mpesaService.DeleteAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _mpesaService.GetStatsAsync(CompanyId.Value);
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
        var result = await _mpesaService.GetStatementAsync(CompanyId.Value, id, new StatementFilterDto(startDate, endDate, currency, transactionType));
        return result.Success ? Ok(result) : NotFound(result);
    }
}
