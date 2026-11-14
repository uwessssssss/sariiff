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
[Route("api/client")]
public class ClientController : BaseApiController
{
    private readonly IClientService _clientService;

    public ClientController(IClientService clientService) => _clientService = clientService;

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateClientDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _clientService.CreateAsync(CompanyId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _clientService.GetByIdAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int page = 1, [FromQuery] int pageSize = 10, [FromQuery] string? search = null, [FromQuery] string? filter = null)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _clientService.GetAllAsync(CompanyId.Value, page, pageSize, search, filter);
        return Ok(result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateClientDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _clientService.UpdateAsync(CompanyId.Value, id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("{id:guid}/convert")]
    public async Task<IActionResult> Convert(Guid id, [FromBody] ConvertClientDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _clientService.ConvertToPermamentAsync(CompanyId.Value, id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("{id:guid}/reset-password")]
    public async Task<IActionResult> ResetPassword(Guid id, [FromBody] ResetClientPasswordDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _clientService.ResetPasswordAsync(CompanyId.Value, id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _clientService.DeleteAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _clientService.GetStatsAsync(CompanyId.Value);
        return Ok(result);
    }

    [HttpGet("{id:guid}/statement")]
    public async Task<IActionResult> GetStatement(Guid id, 
        [FromQuery] DateTime? startDate, 
        [FromQuery] DateTime? endDate,
        [FromQuery] Currency? currency,
        [FromQuery] TransactionType? transactionType)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _clientService.GetStatementAsync(CompanyId.Value, id, new StatementFilterDto(startDate, endDate, currency, transactionType));
        return result.Success ? Ok(result) : NotFound(result);
    }

    /// <summary>Cut this client's phone-login link (e.g. a lost phone). Balances are untouched.</summary>
    [HttpPost("{id:guid}/unlink-phone-login")]
    public async Task<IActionResult> UnlinkPhoneLogin(Guid id, [FromServices] IClientIdentityService identity)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await identity.OfficeUnlinkAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Reverse a client transaction from the client statement.
    /// This is the ONLY way to delete transactions involving client accounts.
    /// General DELETE /api/transaction/{id} blocks client transactions.
    /// </summary>
    [HttpDelete("{clientId:guid}/transaction/{transactionId:guid}")]
    public async Task<IActionResult> ReverseTransaction(Guid clientId, Guid transactionId, [FromBody] DeleteTransactionDto dto, [FromServices] AppDbContext db)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        if (await PinRequiredAsync(db) is { } pinBlock) return pinBlock;
        var result = await _clientService.ReverseTransactionAsync(CompanyId.Value, clientId, transactionId, UserId.Value, dto.Reason);
        await PinOutcomeAsync(db, result.Success);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// PERF: Lightweight client list for dropdowns — returns only id, code, name, phone, isActive.
    /// No balance calculation, no transaction totals. Use this for TransactionForm, ExchangeSection, etc.
    /// </summary>
    [HttpGet("lookup")]
    public async Task<IActionResult> Lookup([FromQuery] string? search = null)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _clientService.GetLookupAsync(CompanyId.Value, search);
        return Ok(result);
    }
}
