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

[Authorize(Policy = "OfficeUserOnly")]  // FIXED: Was missing!
[Route("api/cash")]
public class CashController : BaseApiController
{
    private readonly ICashAccountService _cashService;
    private readonly ILogger<CashController> _logger;

    public CashController(ICashAccountService cashService, ILogger<CashController> logger)
    {
        _cashService = cashService;
        _logger = logger;
    }

    /// <summary>
    /// NEW: Create a cash account with opening balance
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCashAccountDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();

        _logger.LogInformation("Creating cash account for company {CompanyId}, currency {Currency}, opening balance {Balance}",
            CompanyId.Value, dto.Currency, dto.OpeningBalance);

        var result = await _cashService.CreateAsync(CompanyId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get all cash accounts for the company
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _cashService.GetAllAsync(CompanyId.Value);
        return Ok(result);
    }

    /// <summary>
    /// NEW: Get cash account by ID
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _cashService.GetByIdAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : NotFound(result);
    }

    /// <summary>
    /// NEW: Get cash account by currency
    /// </summary>
    [HttpGet("currency/{currency}")]
    public async Task<IActionResult> GetByCurrency(Currency currency)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _cashService.GetByCurrencyAsync(CompanyId.Value, currency);
        return result.Success ? Ok(result) : NotFound(result);
    }

    /// <summary>
    /// NEW: Update cash account (opening balance)
    /// </summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCashAccountDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();

        _logger.LogInformation("Updating cash account {Id} for company {CompanyId}", id, CompanyId.Value);

        var result = await _cashService.UpdateAsync(CompanyId.Value, id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// NEW: Delete cash account (only if no transactions)
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();

        _logger.LogInformation("Deleting cash account {Id} for company {CompanyId}", id, CompanyId.Value);

        var result = await _cashService.DeleteAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get cash account statistics
    /// </summary>
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _cashService.GetStatsAsync(CompanyId.Value);
        return Ok(result);
    }

    /// <summary>
    /// Get cash account statement by currency
    /// </summary>
    [HttpGet("statement/{currency}")]
    public async Task<IActionResult> GetStatement(
        Currency currency, 
        [FromQuery] DateTime? startDate, 
        [FromQuery] DateTime? endDate,
        [FromQuery] TransactionType? transactionType)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        
        // The money-in / money-out filter was dropped here (null), unlike bank and wallet statements.
        var filter = new StatementFilterDto(startDate, endDate, currency, transactionType);
        var result = await _cashService.GetStatementAsync(CompanyId.Value, currency, filter);
        return result.Success ? Ok(result) : NotFound(result);
    }
}
