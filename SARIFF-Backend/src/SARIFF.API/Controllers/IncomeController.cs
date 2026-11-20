using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SARIFF.Core.DTOs;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.API.Controllers;

/// <summary>The bureau's own income accounts, income received into them, their statements, and the summary.</summary>
[Authorize(Policy = "OfficeUserOnly")]
[Route("api/income")]
public class IncomeController : BaseApiController
{
    private readonly IIncomeService _income;

    public IncomeController(IIncomeService income) => _income = income;

    [HttpGet("accounts")]
    public async Task<IActionResult> Accounts()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        return Ok(await _income.GetAccountsAsync(CompanyId.Value));
    }

    [HttpPost("accounts")]
    public async Task<IActionResult> CreateAccount([FromBody] CreateIncomeAccountDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var r = await _income.CreateAccountAsync(CompanyId.Value, dto);
        return r.Success ? Ok(r) : BadRequest(r);
    }

    [HttpPut("accounts/{id:guid}")]
    public async Task<IActionResult> UpdateAccount(Guid id, [FromBody] UpdateIncomeAccountDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var r = await _income.UpdateAccountAsync(CompanyId.Value, id, dto);
        return r.Success ? Ok(r) : BadRequest(r);
    }

    [HttpDelete("accounts/{id:guid}")]
    public async Task<IActionResult> DeleteAccount(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var r = await _income.DeleteAccountAsync(CompanyId.Value, id);
        return r.Success ? Ok(r) : BadRequest(r);
    }

    /// <summary>One income account's statement: earned before the start date, each posting with a running total, per currency.</summary>
    [HttpGet("accounts/{id:guid}/statement")]
    public async Task<IActionResult> Statement(Guid id, [FromQuery] DateTime? startDate, [FromQuery] DateTime? endDate)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var r = await _income.StatementAsync(CompanyId.Value, id, startDate, endDate);
        return r.Success ? Ok(r) : NotFound(r);
    }

    /// <summary>Record income received into a till, bank or wallet, or charged to a client.</summary>
    [HttpPost]
    public async Task<IActionResult> Record([FromBody] RecordIncomeDto dto, [FromServices] AppDbContext db)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        if (await PinRequiredAsync(db) is { } pinBlock) return pinBlock;
        var result = await _income.RecordAsync(CompanyId.Value, UserId.Value, dto);
        await PinOutcomeAsync(db, result.Success);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>Income per currency by account for the period (this month by default), and e-float vs cash now.</summary>
    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] DateTime? startDate, [FromQuery] DateTime? endDate)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        return Ok(await _income.SummaryAsync(CompanyId.Value, startDate, endDate));
    }
}
