using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SARIFF.Core.DTOs;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Services;

namespace SARIFF.API.Controllers;

/// <summary>
/// One login, several bureaus (phone login). Switched off unless
/// Features__ClientIdentity=true; while off every endpoint answers 404 and the
/// apps keep showing only the classic code + password login.
/// </summary>
[Route("api/identity")]
public class IdentityController : BaseApiController
{
    private readonly IClientIdentityService _identity;
    private readonly IConfiguration _config;

    public IdentityController(IClientIdentityService identity, IConfiguration config)
    {
        _identity = identity;
        _config = config;
    }

    private bool Enabled => _config.GetValue<bool>("Features:ClientIdentity");
    private IActionResult Off() => NotFound(new ApiResponse<object>(false, "Phone login is not available yet.", null));

    /// <summary>The identity of the phone login behind this token (identity token or a bureau token picked through it).</summary>
    private Guid? IdentityId =>
        Guid.TryParse(User.FindFirst(AuthService.IdentityClaim)?.Value, out var id) ? id : null;

    private IActionResult NoIdentity() =>
        StatusCode(StatusCodes.Status403Forbidden, new ApiResponse<object>(false, "Sign in with your phone number first.", null));

    private IActionResult Result<T>(ApiResponse<T> r) => r.Success ? Ok(r) : BadRequest(r);

    [AllowAnonymous]
    [HttpGet("enabled")]
    public IActionResult IsEnabled() => Ok(new ApiResponse<object>(true, "ok", new { enabled = Enabled }));

    [AllowAnonymous]
    [HttpPost("request-code")]
    public async Task<IActionResult> RequestCode([FromBody] IdentityRequestCodeDto dto)
        => Enabled ? Result(await _identity.RequestCodeAsync(dto)) : Off();

    [AllowAnonymous]
    [HttpPost("verify-code")]
    public async Task<IActionResult> VerifyCode([FromBody] IdentityVerifyCodeDto dto)
        => Enabled ? Result(await _identity.VerifyCodeAsync(dto, IpAddress, UserAgent)) : Off();

    [AllowAnonymous]
    [HttpPost("device-login")]
    public async Task<IActionResult> DeviceLogin([FromBody] IdentityDeviceLoginDto dto)
        => Enabled ? Result(await _identity.DeviceLoginAsync(dto, IpAddress, UserAgent)) : Off();

    [Authorize(Policy = "IdentityOrClient")]
    [HttpGet("bureaus")]
    public async Task<IActionResult> Bureaus()
    {
        if (!Enabled) return Off();
        return IdentityId is { } id ? Result(await _identity.GetBureausAsync(id)) : NoIdentity();
    }

    [Authorize(Policy = "IdentityOrClient")]
    [HttpPost("link")]
    public async Task<IActionResult> Link([FromBody] IdentityLinkDto dto)
    {
        if (!Enabled) return Off();
        return IdentityId is { } id ? Result(await _identity.LinkAsync(id, dto, IpAddress, UserAgent)) : NoIdentity();
    }

    /// <summary>Pick a bureau after phone login, or switch bureau from inside the portal.</summary>
    [Authorize(Policy = "IdentityOrClient")]
    [HttpPost("select")]
    public async Task<IActionResult> Select([FromBody] IdentitySelectDto dto)
    {
        if (!Enabled) return Off();
        return IdentityId is { } id ? Result(await _identity.SelectAsync(id, dto.CompanyId, IpAddress, UserAgent)) : NoIdentity();
    }

    [Authorize(Policy = "IdentityOrClient")]
    [HttpDelete("bureaus/{companyId:guid}")]
    public async Task<IActionResult> Unlink(Guid companyId)
    {
        if (!Enabled) return Off();
        return IdentityId is { } id ? Result(await _identity.UnlinkAsync(id, companyId)) : NoIdentity();
    }

    [Authorize(Policy = "IdentityOrClient")]
    [HttpPost("sign-out-everywhere")]
    public async Task<IActionResult> SignOutEverywhere()
    {
        if (!Enabled) return Off();
        return IdentityId is { } id ? Result(await _identity.SignOutEverywhereAsync(id)) : NoIdentity();
    }
}
