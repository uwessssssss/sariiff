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

// ==================== TRUSTED DEVICE CONTROLLER ====================
[ApiController]
[Route("api/trusted-devices")]
[Authorize]
public class TrustedDeviceController : BaseApiController
{
    private readonly AppDbContext _context;
    
    public TrustedDeviceController(AppDbContext context) => _context = context;

    [HttpGet]
    public async Task<IActionResult> GetMyDevices()
    {
        if (!UserId.HasValue) return Unauthorized();
        var devices = await _context.TrustedDevices
            .Where(d => d.UserId == UserId.Value && !d.IsDeleted && d.TrustedUntil > DateTime.UtcNow)
            .Select(d => new { d.Id, d.DeviceId, d.Platform, d.DeviceName, d.LastUsedAt, d.TrustedUntil, d.CreatedAt })
            .OrderByDescending(d => d.LastUsedAt)
            .ToListAsync();
        return Ok(new ApiResponse<object>(true, "Trusted devices", devices));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> RemoveDevice(Guid id)
    {
        if (!UserId.HasValue) return Unauthorized();
        var device = await _context.TrustedDevices
            .FirstOrDefaultAsync(d => d.Id == id && d.UserId == UserId.Value);
        if (device == null) return NotFound();
        _context.TrustedDevices.Remove(device);
        await _context.SaveChangesAsync();
        return Ok(new ApiResponse<bool>(true, "Device removed", true));
    }

    [HttpDelete]
    public async Task<IActionResult> RemoveAllDevices()
    {
        if (!UserId.HasValue) return Unauthorized();
        var devices = await _context.TrustedDevices.Where(d => d.UserId == UserId.Value).ToListAsync();
        _context.TrustedDevices.RemoveRange(devices);
        await _context.SaveChangesAsync();
        return Ok(new ApiResponse<bool>(true, "All devices removed", true));
    }
}
