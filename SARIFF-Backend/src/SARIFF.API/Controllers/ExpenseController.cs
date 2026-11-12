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

/// <summary>
/// Office expenses: categories, recording, listing, deleting (with audit trail) and totals.
/// </summary>
[Authorize(Policy = "OfficeUserOnly")]
[Route("api/expense")]
public class ExpenseController : BaseApiController
{
    private readonly IExpenseService _expenseService;
    private readonly ILogger<ExpenseController> _logger;

    public ExpenseController(IExpenseService expenseService, ILogger<ExpenseController> logger)
    {
        _expenseService = expenseService;
        _logger = logger;
    }

    [HttpPost("category")]
    public async Task<IActionResult> CreateCategory([FromBody] CreateExpenseCategoryDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _expenseService.CreateCategoryAsync(CompanyId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("category")]
    public async Task<IActionResult> GetCategories()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _expenseService.GetCategoriesAsync(CompanyId.Value);
        return Ok(result);
    }

    [HttpPut("category/{id:guid}")]
    public async Task<IActionResult> UpdateCategory(Guid id, [FromBody] UpdateExpenseCategoryDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _expenseService.UpdateCategoryAsync(CompanyId.Value, id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpDelete("category/{id:guid}")]
    public async Task<IActionResult> DeleteCategory(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _expenseService.DeleteCategoryAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateExpenseDto dto)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        
        _logger.LogInformation("Creating expense for company {CompanyId}, amount {Amount} {Currency}",
            CompanyId.Value, dto.Amount, dto.Currency);
            
        var result = await _expenseService.CreateAsync(CompanyId.Value, UserId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _expenseService.GetByIdAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1, 
        [FromQuery] int pageSize = 10,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] Currency? currency = null)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        
        var filter = new ReportFilterDto(startDate, endDate, null, currency,null,null);
        var result = await _expenseService.GetAllAsync(CompanyId.Value, page, pageSize, filter);
        return Ok(result);
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _expenseService.GetStatsAsync(CompanyId.Value);
        return Ok(result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateExpenseDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        
        _logger.LogInformation("Updating expense {Id} for company {CompanyId}", id, CompanyId.Value);
        
        var result = await _expenseService.UpdateAsync(CompanyId.Value, id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// FIXED: Now passes UserId for proper audit trail and reversal tracking
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        
        _logger.LogInformation("Deleting expense {Id} for company {CompanyId} by user {UserId}", 
            id, CompanyId.Value, UserId.Value);
        
        var result = await _expenseService.DeleteAsync(CompanyId.Value, id, UserId.Value);
        return result.Success ? Ok(result) : BadRequest(result);
    }
}
