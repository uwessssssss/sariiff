using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

public record IdentityRequestCodeDto(string Phone);

public record IdentityVerifyCodeDto(string Phone, string Code, string? DeviceId = null, string? DeviceName = null);

public record IdentityDeviceLoginDto(string Phone, string DeviceId);

public record IdentityLinkDto(string ClientCode, string Password);

public record IdentitySelectDto(Guid CompanyId);

/// <summary>A bureau the signed-in phone is linked to. Only ever shown to that client.</summary>
public record IdentityBureauDto(Guid CompanyId, string CompanyName, string? LogoUrl, string ClientCode, string ClientName, Currency BaseCurrency);

/// <summary>The limited phone-login token: it can list, link and pick bureaus, nothing else.</summary>
public record IdentityTokenDto(string AccessToken, DateTime ExpiresAt, string Phone, bool DeviceTrusted, List<IdentityBureauDto> Bureaus);
