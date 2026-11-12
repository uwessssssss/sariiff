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

[Route("api/auth")]
public class AuthController : BaseApiController
{
    private readonly IAuthService _authService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(IAuthService authService, ILogger<AuthController> logger)
    {
        _authService = authService;
        _logger = logger;
    }

    /// <summary>
    /// UNIFIED LOGIN - One endpoint for ALL users (SuperAdmin, OfficeUser, Client)
    /// - SuperAdmin/OfficeUser: Returns OTP requirement, then call /verify-otp
    /// - Client: Returns tokens directly (no OTP needed)
    /// </summary>
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] UnifiedLoginDto dto)
    {
        _logger.LogInformation("POST /api/auth/login - Code: {Code}", dto.Code);
        var result = await _authService.UnifiedLoginAsync(dto, IpAddress, UserAgent);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Verify OTP - Step 2 for SuperAdmin/OfficeUser only
    /// </summary>
    [HttpPost("verify-otp")]
    public async Task<IActionResult> VerifyOtp([FromBody] OtpVerifyWithCodeDto dto)
    {
        _logger.LogInformation("POST /api/auth/verify-otp - Code: {Code}", dto.Code);
        var result = await _authService.VerifyOtpAsync(dto, IpAddress, UserAgent);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Refresh Token
    /// </summary>
    [HttpPost("refresh")]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshTokenDto dto)
    {
        var result = await _authService.RefreshTokenAsync(dto, IpAddress);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Logout
    /// </summary>
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        if (UserId.HasValue)
        {
            UserRole? role = Enum.TryParse<UserRole>(User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value, out var r) ? r : null;
            await _authService.LogoutAsync(UserId.Value, role);
        }
        return Ok(new ApiResponse<bool>(true, "Logged out", true));
    }
}
