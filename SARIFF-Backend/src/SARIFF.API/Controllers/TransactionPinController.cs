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

// ==================== TRANSACTION PIN CONTROLLER ====================
[ApiController]
[Route("api/transaction-pin")]
[Authorize(Policy = "AdminOrOffice")]  // H1 FIX: Clients cannot access PIN endpoints
public class TransactionPinController : BaseApiController
{
    private readonly AppDbContext _context;
    
    public TransactionPinController(AppDbContext context) => _context = context;

    // Resolve companyId: from JWT for OfficeUser, from query for SuperAdmin
    private Guid? ResolveCompanyId(Guid? queryCompanyId) =>
        CompanyId ?? queryCompanyId;

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus([FromQuery] Guid? companyId = null)
    {
        var cid = ResolveCompanyId(companyId);
        if (!cid.HasValue) return Unauthorized();
        var company = await _context.Companies.FindAsync(cid.Value);
        if (company == null) return NotFound();
        return Ok(new ApiResponse<TransactionPinStatusDto>(true, "PIN status", 
            new TransactionPinStatusDto(company.IsTransactionPinEnabled, !string.IsNullOrEmpty(company.TransactionPinHash))));
    }

    [Authorize(Policy = "SuperAdminOnly")] // a bureau must not be able to switch off its own PIN
    [HttpPost("set")]
    public async Task<IActionResult> SetPin([FromBody] SetTransactionPinDto dto)
    {
        var cid = CompanyId ?? dto.CompanyId;
        if (!cid.HasValue) return Ok(new ApiResponse<bool>(false, "Company not specified", false));
        if (string.IsNullOrEmpty(dto.Pin) || dto.Pin.Length != 4 || !dto.Pin.All(char.IsDigit))
            return Ok(new ApiResponse<bool>(false, "PIN must be exactly 4 digits", false));
        
        var company = await _context.Companies.FindAsync(cid.Value);
        if (company == null) return NotFound();
        
        company.TransactionPinHash = BCrypt.Net.BCrypt.HashPassword(dto.Pin);
        company.IsTransactionPinEnabled = true;
        // A new PIN starts clean: no lockout, and approvals given under the old PIN end.
        company.PinFailedAttempts = 0;
        company.PinFailuresSince = null;
        _context.PinGrants.RemoveRange(await _context.PinGrants.Where(g => g.CompanyId == company.Id).ToListAsync());
        company.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        
        return Ok(new ApiResponse<bool>(true, "Transaction PIN set successfully", true));
    }

    [HttpPost("verify")]
    public async Task<IActionResult> VerifyPin([FromBody] VerifyTransactionPinDto dto, [FromQuery] Guid? companyId = null)
    {
        var cid = ResolveCompanyId(companyId);
        if (!cid.HasValue) return Unauthorized();
        var company = await _context.Companies.FindAsync(cid.Value);
        if (company == null) return NotFound();
        
        if (!company.IsTransactionPinEnabled || string.IsNullOrEmpty(company.TransactionPinHash))
            return Ok(new ApiResponse<bool>(true, "PIN not required", true));
        
        if (PinGate.LockedMinutes(company) is { } mins)
            return Ok(new ApiResponse<bool>(false, $"Too many wrong PINs. Try again in {mins} minute{(mins == 1 ? "" : "s")}.", false));

        var valid = !string.IsNullOrEmpty(dto.Pin) && BCrypt.Net.BCrypt.Verify(dto.Pin, company.TransactionPinHash);
        if (!valid)
        {
            PinGate.RecordFailure(company);
            await _context.SaveChangesAsync();
            var left = PinGate.MaxFailures - company.PinFailedAttempts;
            return Ok(new ApiResponse<bool>(false,
                left > 0 ? $"Incorrect PIN. {left} tr{(left == 1 ? "y" : "ies")} left." : "Incorrect PIN. Locked for 15 minutes.", false));
        }
        if (UserId.HasValue) await PinGate.GrantAsync(_context, company, UserId.Value);
        return Ok(new ApiResponse<bool>(true, "PIN verified", true));
    }

    [Authorize(Policy = "SuperAdminOnly")] // a bureau must not be able to switch off its own PIN
    [HttpPost("toggle")]
    public async Task<IActionResult> TogglePin([FromQuery] Guid? companyId = null)
    {
        var cid = ResolveCompanyId(companyId);
        if (!cid.HasValue) return Unauthorized();
        var company = await _context.Companies.FindAsync(cid.Value);
        if (company == null) return NotFound();
        
        if (string.IsNullOrEmpty(company.TransactionPinHash))
            return BadRequest(new ApiResponse<bool>(false, "Set a PIN first before enabling", false));
        
        company.IsTransactionPinEnabled = !company.IsTransactionPinEnabled;
        company.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        
        return Ok(new ApiResponse<bool>(true, 
            company.IsTransactionPinEnabled ? "PIN requirement enabled" : "PIN requirement disabled", true));
    }

    [Authorize(Policy = "SuperAdminOnly")] // a bureau must not be able to switch off its own PIN
    [HttpDelete]
    public async Task<IActionResult> RemovePin([FromQuery] Guid? companyId = null)
    {
        var cid = ResolveCompanyId(companyId);
        if (!cid.HasValue) return Unauthorized();
        var company = await _context.Companies.FindAsync(cid.Value);
        if (company == null) return NotFound();
        
        company.TransactionPinHash = null;
        company.IsTransactionPinEnabled = false;
        company.PinFailedAttempts = 0;
        company.PinFailuresSince = null;
        _context.PinGrants.RemoveRange(await _context.PinGrants.Where(g => g.CompanyId == company.Id).ToListAsync());
        company.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        
        return Ok(new ApiResponse<bool>(true, "Transaction PIN removed", true));
    }
}
