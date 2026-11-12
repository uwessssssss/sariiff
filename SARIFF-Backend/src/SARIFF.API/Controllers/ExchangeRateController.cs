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
[Route("api/exchange-rate")]
public class ExchangeRateController : BaseApiController
{
    private readonly IExchangeRateService _exchangeService;

    public ExchangeRateController(IExchangeRateService exchangeService) => _exchangeService = exchangeService;

    [HttpPost]
    public async Task<IActionResult> SetRate([FromBody] SetExchangeRateDto dto)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _exchangeService.SetRateAsync(CompanyId.Value, UserId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("current")]
    public async Task<IActionResult> GetCurrentRate([FromQuery] Currency? currency = null)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetCurrentRateAsync(CompanyId.Value, currency ?? Currency.USD);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetHistoryAsync(CompanyId.Value);
        return Ok(result);
    }

    [HttpPost("convert")]
    public async Task<IActionResult> Convert([FromBody] CurrencyConvertDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.ConvertAsync(CompanyId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Retired (Nov 2026). It booked both till legs the wrong way round (the shilling till went
    /// DOWN when a client paid shillings in) and no app called it. Exchanges are recorded with
    /// POST /api/exchange, which keeps the float, average cost and profit.
    /// </summary>
    [HttpPost("transaction")]
    public IActionResult CreateExchangeTransaction() =>
        StatusCode(StatusCodes.Status410Gone, new ApiResponse<object>(false,
            "This endpoint was retired. Record exchanges with POST /api/exchange.", null!));
}
