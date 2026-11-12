using SARIFF.Core.Enums;
using System.ComponentModel.DataAnnotations;

namespace SARIFF.Core.Entities;

/// <summary>
/// OTP Code for WhatsApp authentication
/// </summary>
public class OtpCode : BaseEntity
{
    public string PhoneNumber { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? UserCode { get; set; } // SA-2026-001 or CO-2026-001
    public UserRole Role { get; set; }
    public DateTime ExpiresAt { get; set; }
    public bool IsUsed { get; set; } = false;
    public int AttemptCount { get; set; } = 0;
}

/// <summary>
/// User Session for refresh tokens
/// </summary>
public class UserSession : BaseEntity
{
    public Guid? CompanyId { get; set; }
    public Guid? UserId { get; set; }
    public UserRole UserRole { get; set; }
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public string RefreshToken { get; set; } = string.Empty; // M3: NOT persisted, only used to return to client
    public string RefreshTokenHash { get; set; } = string.Empty; // Lookup by hash only
    public DateTime ExpiresAt { get; set; }
    public string IpAddress { get; set; } = string.Empty;
    public string? UserAgent { get; set; }
    public string? DeviceInfo { get; set; }
    public bool IsRevoked { get; set; } = false;
    // Set when this bureau session came from the phone login, so "Switch bureau" can
    // issue another bureau session without a new SMS code.
    public Guid? ClientIdentityId { get; set; }
}

/// <summary>
/// Device Token for push notifications (C3 FIX)
/// </summary>
public class DeviceToken : BaseEntity
{
    public Guid? UserId { get; set; }
    public Guid? CompanyId { get; set; }
    public string Token { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty; // "ios", "android", "web"
    public string? DeviceName { get; set; }
    public DateTime LastUsedAt { get; set; } = DateTime.UtcNow;
    public bool IsActive { get; set; } = true;
}

/// <summary>
/// Login History (PDF Section 6.2)
/// </summary>
public class LoginHistory : BaseEntity
{
    public Guid? CompanyId { get; set; }
    public Guid? UserId { get; set; }
    public UserRole UserRole { get; set; }
    public string IpAddress { get; set; } = string.Empty;
    public string? UserAgent { get; set; }
    public string? Location { get; set; }
    public bool IsSuccessful { get; set; }
    public string? FailureReason { get; set; }
    public DateTime LoginAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Super Admin IP Whitelist
/// </summary>
public class AdminIpWhitelist : BaseEntity
{
    public string IpAddress { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public Guid AddedByUserId { get; set; }
}

/// <summary>
/// Security Alert entity for tracking security events (SuperAdmin monitoring)
/// </summary>
public class SecurityAlert : BaseEntity
{
    public SecurityAlertType AlertType { get; set; }
    public string Severity { get; set; } = "Info"; // Info, Warning, Critical
    public string Message { get; set; } = string.Empty;
    public Guid? CompanyId { get; set; }
    public Guid? UserId { get; set; }
    public string? IpAddress { get; set; }
    public string? Details { get; set; }
    public bool IsResolved { get; set; } = false;
    public DateTime? ResolvedAt { get; set; }
    public Guid? ResolvedByUserId { get; set; }
    public string? ResolutionNotes { get; set; }
}

/// <summary>
/// Blocked IP entity for security
/// </summary>
public class BlockedIP : BaseEntity
{
    public string IpAddress { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public DateTime? BlockedUntil { get; set; } // null = permanent
    public Guid BlockedByUserId { get; set; }
    public bool IsActive { get; set; } = true;
}

// ==================== TRUSTED DEVICE (Smart OTP) ====================
/// <summary>
/// Stores trusted devices that can skip OTP verification
/// </summary>
public class TrustedDevice : BaseEntity
{
    public Guid UserId { get; set; }
    public string DeviceId { get; set; } = string.Empty;
    public string Platform { get; set; } = "unknown";
    public string? DeviceName { get; set; }
    public DateTime LastUsedAt { get; set; } = DateTime.UtcNow;
    public DateTime TrustedUntil { get; set; } = DateTime.UtcNow.AddDays(90);
}

/// <summary>
/// One approval from a correct transaction PIN: lets that user perform ONE gated
/// action (post/reverse a transaction, create/void an exchange) within a few minutes.
/// Stored in the database so it works across restarts and multiple API instances.
/// </summary>
public class PinGrant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CompanyId { get; set; }
    public Guid UserId { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
