using SARIFF.Core.Enums;
using System.ComponentModel.DataAnnotations;

namespace SARIFF.Core.Entities;

/// <summary>
/// User entity - includes Super Admin and Clients (PDF Section 2.1, 2.3)
/// Super Admin: CompanyId = null, Role = SuperAdmin
/// Client: CompanyId = company they belong to, Role = Client
/// </summary>
public class User : BaseEntity
{
    public string Code { get; set; } = string.Empty; // CL-2025-001 for clients
    public Guid? CompanyId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string WhatsAppNumber { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? IdPassport { get; set; }
    public UserRole Role { get; set; }
    public ClientType? ClientType { get; set; } // Only for Role = Client
    // Client rows only: the phone login (ClientIdentity) this bureau account is linked to.
    // Null = not linked. Linking never moves or shares money between bureaus.
    public Guid? ClientIdentityId { get; set; }
    public DateTime? IdentityLinkedAt { get; set; }
    public string? PasswordHash { get; set; } // Required for permanent clients and SuperAdmin
    public bool IsActive { get; set; } = true;
    
    // Client balances (PDF Section 3.1)
    public decimal BalanceKES { get; set; } = 0;
    public decimal BalanceUSD { get; set; } = 0;
    public decimal OpeningBalanceKES { get; set; } = 0;
    public decimal OpeningBalanceUSD { get; set; } = 0;
    
    public int FailedLoginAttempts { get; set; } = 0;
    public DateTime? LockedUntil { get; set; }
    public DateTime? LastLoginAt { get; set; }
    
    [Timestamp]
    public byte[]? RowVersion { get; set; } // H3: Concurrency control for balance updates
}

/// <summary>
/// Per-currency client balance for currencies beyond KES/USD (UGX, EUR, and
/// any future currency). KES and USD remain on the User record's dedicated
/// columns for full backward compatibility; every other currency lives here
/// as one row per (client, currency). Adding a currency in future is just a
/// new enum value — no schema change.
/// </summary>
public class ClientCurrencyBalance : BaseEntity
{
    public Guid CompanyId { get; set; }
    public Guid ClientId { get; set; }  // References User.Id where Role = Client
    public Currency Currency { get; set; }
    public decimal Balance { get; set; } = 0;
    public decimal OpeningBalance { get; set; } = 0;
    public decimal TotalIn { get; set; } = 0;
    public decimal TotalOut { get; set; } = 0;
}

/// <summary>
/// A client's phone login, above their per-bureau client accounts. Holds who the
/// person is (a verified phone) and nothing else: no money, no bureau data, no KYC.
/// </summary>
public class ClientIdentity : BaseEntity
{
    public string PhoneNumber { get; set; } = string.Empty;   // international form, unique
    public DateTime? PhoneVerifiedAt { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public int FailedOtpAttempts { get; set; }
    public DateTime? LockedUntil { get; set; }
}

/// <summary>A phone that may skip the SMS code until TrustedUntil (30 days).</summary>
public class ClientIdentityDevice : BaseEntity
{
    public Guid ClientIdentityId { get; set; }
    public string DeviceIdHash { get; set; } = string.Empty;  // SHA-256 of the app's device secret
    public string? DeviceName { get; set; }
    public DateTime TrustedUntil { get; set; }
    public DateTime LastUsedAt { get; set; } = DateTime.UtcNow;
}
