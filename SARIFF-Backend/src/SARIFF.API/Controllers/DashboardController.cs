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
[Route("api/dashboard")]
public class DashboardController : BaseApiController
{
    private readonly IDashboardService _dashboardService;
    private readonly ICompanyService _companyService;

    public DashboardController(IDashboardService dashboardService, ICompanyService companyService)
    {
        _dashboardService = dashboardService;
        _companyService = companyService;
    }

    [HttpGet]
    public async Task<IActionResult> GetDashboard()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _dashboardService.GetOfficeUserDashboardAsync(CompanyId.Value);
        return Ok(result);
    }

    /// <summary>
    /// The currencies this company actually uses (derived from real activity).
    /// Frontends drive their columns/pickers off this to avoid empty columns.
    /// </summary>
    [HttpGet("currencies")]
    public async Task<IActionResult> GetCompanyCurrencies()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _dashboardService.GetCompanyCurrenciesAsync(CompanyId.Value);
        return Ok(result);
    }

    /// <summary>
    /// OfficeUser updates their own company settings (name, email, address, etc.)
    /// </summary>
    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] UpdateCompanyDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _companyService.UpdateAsync(CompanyId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// OfficeUser gets their own company info
    /// </summary>
    [HttpGet("company")]
    public async Task<IActionResult> GetCompanyInfo()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _companyService.GetByIdAsync(CompanyId.Value);
        return result.Success ? Ok(result) : NotFound(result);
    }
}
