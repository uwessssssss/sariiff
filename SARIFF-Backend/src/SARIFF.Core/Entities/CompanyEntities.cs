using SARIFF.Core.Enums;
using System.ComponentModel.DataAnnotations;

namespace SARIFF.Core.Entities;

/// <summary>
/// Company/Office User entity (PDF Section 2.2)
/// Represents a business subscribing to the platform
/// </summary>
public class Company : BaseEntity
{
    public string Code { get; set; } = string.Empty; // FB-2026-0001
    public string CodePrefix { get; set; } = string.Empty; // FB, AFB, SE (2-3 chars)
    public string Name { get; set; } = string.Empty;
    public string OwnerName { get; set; } = string.Empty;
    public string WhatsAppNumber { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string PasswordHash { get; set; } = string.Empty;
    
    // Company branding for invoices (PDF Section 5.9)
    public string? LogoUrl { get; set; }
    public string? TaxId { get; set; }
    public string? Website { get; set; }
    public string? Address { get; set; }
    
    public bool IsActive { get; set; } = true;
    public int FailedLoginAttempts { get; set; } = 0;
    public DateTime? LockedUntil { get; set; }
    public DateTime? LastLoginAt { get; set; }
    // Subscription fields for SuperAdmin billing
    public SubscriptionPlan SubscriptionPlan { get; set; } = SubscriptionPlan.Free;
    public SubscriptionStatus SubscriptionStatus { get; set; } = SubscriptionStatus.Trial;
    public DateTime? SubscriptionStartDate { get; set; }
    public DateTime? SubscriptionExpiresAt { get; set; }
    public decimal MonthlyFee { get; set; } = 0;
    public decimal TotalPaid { get; set; } = 0;
    public DateTime? LastPaymentDate { get; set; }
    
    // Transaction PIN — set by SuperAdmin, verified by office users
    public string? TransactionPinHash { get; set; }
    public bool IsTransactionPinEnabled { get; set; } = false;
    // Wrong transaction-PIN tries, for the lockout (kept here, not in server memory,
    // so it holds across restarts and across more than one API instance).
    public int PinFailedAttempts { get; set; }
    public DateTime? PinFailuresSince { get; set; }

    /// <summary>
    /// The bureau's home currency: rates are quoted as "base per 1 foreign",
    /// profit is booked in it (mobile money wallets hold their network's currency). KES for Kenyan
    /// bureaus, UGX for Ugandan ones. Set by the super admin; it can only be
    /// changed while the company has no exchange history.
    /// </summary>
    public Currency BaseCurrency { get; set; } = Currency.KES;
}

/// <summary>
/// Subscription Payment entity for tracking company payments to platform
/// </summary>
public class SubscriptionPayment : BaseEntity
{
    public Guid CompanyId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "KES";
    public string PaymentMethod { get; set; } = string.Empty; // M-Pesa, Bank Transfer, etc.
    public string Status { get; set; } = "Pending"; // Pending, Completed, Failed, Refunded
    public string? Reference { get; set; }
    public string? MpesaReceiptNumber { get; set; }
    public DateTime? PaidAt { get; set; }
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public string? Notes { get; set; }
}
