using SARIFF.Core.Enums;
using System.ComponentModel.DataAnnotations;

namespace SARIFF.Core.Entities;

public class Transaction : BaseEntity
{
    public string Code { get; set; } = string.Empty; // TXN-2025-001
    public Guid CompanyId { get; set; }
    public string Reference { get; set; } = string.Empty;
    public DateTime TransactionDate { get; set; }
    public TransactionType TransactionType { get; set; }
    
    // Primary account amount (Source) - the account being debited/credited
    public decimal Amount { get; set; }
    public Currency Currency { get; set; }
    
    // Counter account amount (Dest) - for forex transactions
    // If null, same as Amount (no forex involved)
    public decimal? CounterAmount { get; set; }
    public Currency? CounterCurrency { get; set; }
    
    public string Description { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public decimal? ExchangeRate { get; set; }
    
    // Source account (Primary - the one being debited/credited)
    public AccountType SourceAccountType { get; set; }
    public Guid SourceAccountId { get; set; }
    public decimal SourceBalanceBefore { get; set; }
    public decimal SourceBalanceAfter { get; set; }
    
    // Destination account (Counter - cash, bank, mpesa, transfer)
    public AccountType DestAccountType { get; set; }
    public Guid DestAccountId { get; set; }
    public decimal DestBalanceBefore { get; set; }
    public decimal DestBalanceAfter { get; set; }
    
    // ========== RECONCILIATION FIELDS ==========
    /// <summary>
    /// Default: Pending for Cash, Bank, M-Pesa transactions
    /// Client-only transactions are auto-Matched
    /// </summary>
    public ReconciliationStatus ReconciliationStatus { get; set; } = ReconciliationStatus.Pending;
    
    /// <summary>Actual amount entered during reconciliation</summary>
    public decimal? ActualAmount { get; set; }
    
    /// <summary>Variance = ActualAmount - Amount</summary>
    public decimal? Variance { get; set; }
    
    /// <summary>When reconciliation was completed</summary>
    public DateTime? ReconciledAt { get; set; }
    
    /// <summary>Who completed the reconciliation</summary>
    public Guid? ReconciledByUserId { get; set; }
    
    /// <summary>Notes added during reconciliation</summary>
    public string? ReconciliationNotes { get; set; }
    // ================================================
    
    public Guid CreatedByUserId { get; set; }
    public Guid? DeletedByUserId { get; set; }
    public DateTime? DeletedAt { get; set; }
    public string? DeleteReason { get; set; }
}

/// <summary>
/// Reconciliation entity (PDF Section 5.8)
/// </summary>
public class Reconciliation : BaseEntity
{
    public Guid CompanyId { get; set; }
    public AccountType AccountType { get; set; }
    public Guid AccountId { get; set; }
    public Currency Currency { get; set; }
    public decimal ExpectedBalance { get; set; }
    public decimal ActualBalance { get; set; }
    public decimal Variance { get; set; }
    public ReconciliationStatus Status { get; set; } = ReconciliationStatus.Pending;
    public string? Notes { get; set; }
    public DateTime? ReconciledAt { get; set; }
    public Guid? ReconciledByUserId { get; set; }
}
