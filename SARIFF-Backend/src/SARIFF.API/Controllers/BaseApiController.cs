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

[ApiController]
[Route("api/[controller]")]
public abstract class BaseApiController : ControllerBase
{
    // SECURITY: Only read from JWT claims (set by TenantMiddleware).
    // NEVER fall back to request headers — that's an IDOR vulnerability.
    protected Guid? CompanyId => HttpContext.Items["CompanyId"] as Guid?;
    protected Guid? UserId => HttpContext.Items["UserId"] as Guid?;
    protected string? UserRole => HttpContext.Items["UserRole"] as string;
    // "::ffff:1.2.3.4" (IPv4 seen through an IPv6 socket) is stored and shown as "1.2.3.4"
    protected string IpAddress => HttpContext.Connection.RemoteIpAddress is { } ra ? SARIFF.Infrastructure.Services.IpAccess.Normalize(ra.ToString()) : "unknown";
    protected string? UserAgent => HttpContext.Request.Headers["User-Agent"].FirstOrDefault();

    /// <summary>
    /// Cap page size to prevent abuse (e.g. pageSize=1000000)
    /// </summary>
    protected static int ClampPageSize(int pageSize, int max = 200) => Math.Clamp(pageSize, 1, max);
    protected static int ClampPage(int page) => Math.Max(1, page);

    /// <summary>
    /// Server-side transaction PIN check. Returns a 400 to send back when the bureau
    /// has a PIN switched on and this user hasn't just entered it; null to carry on.
    /// </summary>
    protected async Task<IActionResult?> PinRequiredAsync(AppDbContext db)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();
        var pin = await db.Companies.AsNoTracking()
            .Where(c => c.Id == CompanyId.Value)
            .Select(c => new { c.IsTransactionPinEnabled, c.TransactionPinHash })
            .FirstOrDefaultAsync();
        if (pin == null || !pin.IsTransactionPinEnabled || string.IsNullOrEmpty(pin.TransactionPinHash)) return null;
        if (await PinGate.ClaimAsync(db, CompanyId.Value, UserId.Value))
        {
            HttpContext.Items[PinClaimedKey] = true;
            return null;
        }
        return BadRequest(new ApiResponse<object>(false, "Enter the transaction PIN to continue.", null));
    }

    private const string PinClaimedKey = "PinClaimed";

    /// <summary>
    /// After the gated action: on success the PIN approval stays used up; on failure it
    /// is handed back, so a form error doesn't make staff type the PIN again.
    /// </summary>
    protected async Task PinOutcomeAsync(AppDbContext db, bool succeeded)
    {
        if (succeeded || !HttpContext.Items.ContainsKey(PinClaimedKey) || !CompanyId.HasValue || !UserId.HasValue) return;
        try { await PinGate.RestoreAsync(db, CompanyId.Value, UserId.Value); }
        catch { /* worst case they enter the PIN again */ }
    }
}
