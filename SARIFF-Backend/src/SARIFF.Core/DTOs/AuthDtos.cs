using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

// UNIFIED LOGIN - One endpoint for ALL users
public record UnifiedLoginDto(
    string Code,           // SA-2026-001, CO-2026-001, or CL-2026-001
    string PhoneNumber,    // +254...
    string Password,
    string? DeviceId = null // Device fingerprint for trusted device check
);

// OTP verification (for SuperAdmin/OfficeUser only)
public record OtpVerifyWithCodeDto(
    string Code,
    string PhoneNumber,
    string Otp,
    string? DeviceId = null,     // Device fingerprint to trust after verification
    string? DeviceName = null    // "Chrome on Windows", "Samsung Galaxy"
);

// Token response - same for all users

// Token response - same for all users
public record TokenResponseDto(
    string AccessToken, 
    string RefreshToken, 
    DateTime ExpiresAt, 
    UserRole Role, 
    string Name,           // Company name (for OfficeUser) or User name (for others)
    string Code,
    Guid? CompanyId,
    string? OwnerName      // NEW: Owner name for OfficeUser greeting
);

// Keep legacy DTOs for backward compatibility
public record OtpRequestDto(string PhoneNumber, UserRole Role);

public record OtpVerifyDto(string PhoneNumber, string Code, UserRole Role);

public record ClientLoginDto(string Code, string WhatsAppNumber, string Password);

public record LoginRequestDto(string Code, string PhoneNumber, string Password);

public record RefreshTokenDto(string RefreshToken);
