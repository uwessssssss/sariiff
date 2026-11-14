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

// ==================== C3 FIX: DEVICE TOKEN CONTROLLER ====================
[ApiController]
[Route("api/device-token")]
[Authorize]
public class DeviceTokenController : BaseApiController
{
    private readonly AppDbContext _context;
    public DeviceTokenController(AppDbContext context) => _context = context;

    [HttpPost]
    public async Task<IActionResult> Register([FromBody] RegisterTokenDto dto)
    {
        var userId = UserId;
        if (!userId.HasValue) return Unauthorized();

        // Upsert: update if token exists, create if not
        var existing = await _context.DeviceTokens
            .FirstOrDefaultAsync(d => d.Token == dto.Token && d.UserId == userId);

        if (existing != null)
        {
            existing.LastUsedAt = DateTime.UtcNow;
            existing.Platform = dto.Platform ?? existing.Platform;
            existing.DeviceName = dto.DeviceName ?? existing.DeviceName;
            existing.IsActive = true;
        }
        else
        {
            _context.DeviceTokens.Add(new DeviceToken
            {
                UserId = userId,
                CompanyId = CompanyId,
                Token = dto.Token,
                Platform = dto.Platform ?? "unknown",
                DeviceName = dto.DeviceName,
            });
        }

        // One phone, one account at a time. The app keeps its token after sign-out, so when
        // someone else signs in on that phone the earlier account's rows must stop: office
        // balance alerts and a client's amounts otherwise kept reaching the new user.
        foreach (var other in await _context.DeviceTokens
                     .Where(d => d.Token == dto.Token && d.UserId != userId && d.IsActive).ToListAsync())
            other.IsActive = false;

        await _context.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, "Token registered"));
    }

    [HttpDelete]
    public async Task<IActionResult> Unregister([FromBody] UnregisterTokenDto dto)
    {
        var userId = UserId;
        if (!userId.HasValue) return Unauthorized();

        var existing = await _context.DeviceTokens
            .FirstOrDefaultAsync(d => d.Token == dto.Token && d.UserId == userId);

        if (existing != null)
        {
            existing.IsActive = false;
            await _context.SaveChangesAsync();
        }

        return Ok(new ApiResponse<object>(true, "Token unregistered"));
    }
}

public record RegisterTokenDto(string Token, string? Platform, string? DeviceName);

public record UnregisterTokenDto(string Token);
