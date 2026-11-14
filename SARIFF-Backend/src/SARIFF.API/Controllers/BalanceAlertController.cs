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

// ==================== BALANCE ALERT CONTROLLER ====================
[ApiController]
[Route("api/balance-alerts")]
[Authorize(Policy = "AdminOrOffice")]  // M5 FIX: Clients cannot manage alert rules
public class BalanceAlertController : BaseApiController
{
    private readonly IBalanceAlertService _alertService;
    
    public BalanceAlertController(IBalanceAlertService alertService) => _alertService = alertService;

    [HttpGet]
    public async Task<IActionResult> GetRules([FromQuery] Guid? clientId = null)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _alertService.GetRulesAsync(CompanyId.Value, clientId);
        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> CreateRule([FromBody] CreateBalanceAlertDto dto)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _alertService.CreateRuleAsync(CompanyId.Value, UserId.Value, dto);
        return Ok(result);
    }

    [HttpPut("{id:guid}/toggle")]
    public async Task<IActionResult> ToggleRule(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _alertService.ToggleRuleAsync(CompanyId.Value, id);
        return Ok(result);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteRule(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _alertService.DeleteRuleAsync(CompanyId.Value, id);
        return Ok(result);
    }
}
