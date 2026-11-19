using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SARIFF.Core.DTOs;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.API.Controllers;

/// <summary>The bureau's income (commission, fees, interest, rent, other) and the income / float summary.</summary>
[Authorize(Policy = "OfficeUserOnly")]
[Route("api/income")]
public class IncomeController : BaseApiController
{
    private readonly ICommissionService _commission;

    public IncomeController(ICommissionService commission) => _commission = commission;

    /// <summary>The income accounts: commission, fees, interest, rent, other.</summary>
    [HttpGet("accounts")]
    public IActionResult Accounts() =>
        Ok(new ApiResponse<List<IncomeAccountDto>>(true, "Success",
            SARIFF.Core.Enums.IncomeAccounts.Income.Select(i => new IncomeAccountDto(i.Id, i.Name)).ToList()));

    /// <summary>Record income of any kind: amount earned (gross), tax withheld, and where the net landed.</summary>
    [HttpPost]
    public async Task<IActionResult> Record([FromBody] RecordIncomeDto dto, [FromServices] AppDbContext db)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        if (await PinRequiredAsync(db) is { } pinBlock) return pinBlock;
        var result = await _commission.RecordIncomeAsync(CompanyId.Value, UserId.Value, dto);
        await PinOutcomeAsync(db, result.Success);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>Record commission the network paid: gross, tax withheld, and where the net landed.</summary>
    [HttpPost("commission")]
    public async Task<IActionResult> RecordCommission([FromBody] RecordCommissionDto dto, [FromServices] AppDbContext db)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        if (await PinRequiredAsync(db) is { } pinBlock) return pinBlock;
        var result = await _commission.RecordAsync(CompanyId.Value, UserId.Value, dto);
        await PinOutcomeAsync(db, result.Success);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>Commission (gross, tax, net), fees, tax still to claim, and e-float vs cash, per currency.</summary>
    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] DateTime? startDate, [FromQuery] DateTime? endDate)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        return Ok(await _commission.SummaryAsync(CompanyId.Value, startDate, endDate));
    }
}
