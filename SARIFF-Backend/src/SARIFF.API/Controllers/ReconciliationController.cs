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
[Route("api/reconciliation")]
public class ReconciliationController : BaseApiController
{
    private readonly IReconciliationService _reconciliationService;

    public ReconciliationController(IReconciliationService reconciliationService) => _reconciliationService = reconciliationService;

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateReconciliationDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _reconciliationService.CreateAsync(CompanyId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] AccountType? accountType = null)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _reconciliationService.GetAllAsync(CompanyId.Value, accountType);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _reconciliationService.GetByIdAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpPost("{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id, [FromBody] CompleteReconciliationDto dto)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _reconciliationService.CompleteAsync(CompanyId.Value, id, UserId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("expected-balance")]
    public async Task<IActionResult> GetExpectedBalance([FromQuery] AccountType accountType, [FromQuery] Guid accountId)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _reconciliationService.GetExpectedBalanceAsync(CompanyId.Value, accountType, accountId);
        return Ok(result);
    }
    
    /// <summary>
    /// Get all accounts (Bank, M-Pesa, Cash) with pending reconciliation count
    /// </summary>
    [HttpGet("accounts")]
    public async Task<IActionResult> GetAccountsWithStats()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _reconciliationService.GetAccountsWithStatsAsync(CompanyId.Value);
        return Ok(result);
    }

    /// <summary>
    /// Get transactions for a specific account
    /// Filter by: status (Pending/Matched/Unmatched), startDate, endDate
    /// </summary>
    [HttpGet("account/{accountType}/{accountId}/transactions")]
    public async Task<IActionResult> GetAccountTransactions(
        AccountType accountType, 
        Guid accountId,
        [FromQuery] ReconciliationStatus? status = null,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        
        var filter = new ReconciliationFilterDto(status, startDate, endDate);
        var result = await _reconciliationService.GetAccountTransactionsAsync(
            CompanyId.Value, accountType, accountId, filter, page, pageSize);
        
        return Ok(result);
    }

    /// <summary>
    /// Get reconciliation balance summary for an account
    /// Returns: ExpectedBalance, ActualBalance, Variance, counts
    /// </summary>
    [HttpGet("account/{accountType}/{accountId}/summary")]
    public async Task<IActionResult> GetAccountSummary(AccountType accountType, Guid accountId)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _reconciliationService.GetAccountBalanceSummaryAsync(CompanyId.Value, accountType, accountId);
        return Ok(result);
    }

    /// <summary>
    /// Reconcile a single transaction
    /// Provide ActualAmount and Status (Matched or Unmatched)
    /// </summary>
    [HttpPut("transaction/{transactionId}")]
    public async Task<IActionResult> ReconcileTransaction(Guid transactionId, [FromBody] ReconcileTransactionDto dto)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _reconciliationService.ReconcileTransactionAsync(
            CompanyId.Value, transactionId, UserId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Bulk reconcile multiple transactions at once
    /// All transactions get the same status
    /// </summary>
    [HttpPut("bulk")]
    public async Task<IActionResult> BulkReconcile([FromBody] BulkReconcileDto dto)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var result = await _reconciliationService.BulkReconcileAsync(CompanyId.Value, UserId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }
}
