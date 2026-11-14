using SARIFF.Core.Enums;
using System.ComponentModel.DataAnnotations;

namespace SARIFF.Core.Entities;

/// <summary>
/// Bank Account entity (PDF Section 5.4)
/// </summary>
public class BankAccount : BaseEntity
{
    public string Code { get; set; } = string.Empty; // BA-2025-001
    public Guid CompanyId { get; set; }
    public string BankName { get; set; } = string.Empty;
    public string AccountNumber { get; set; } = string.Empty;
    public string AccountName { get; set; } = string.Empty;
    public string? BranchCode { get; set; }
    public Currency Currency { get; set; }
    public decimal Balance { get; set; } = 0;
    public decimal OpeningBalance { get; set; } = 0;
    public bool IsActive { get; set; } = true;
    [Timestamp] public byte[]? RowVersion { get; set; }
}

/// <summary>
/// M-Pesa Agent entity (PDF Section 5.5)
/// </summary>
public class MpesaAgent : BaseEntity
{
    public string Code { get; set; } = string.Empty; // MP-2025-001
    public Guid CompanyId { get; set; }
    public string AgentName { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string AgentNumber { get; set; } = string.Empty;
    public string? StoreNumber { get; set; }
    public MpesaAgentType AgentType { get; set; }
    /// <summary>M-Pesa, MTN MoMo or Airtel Money.</summary>
    public MobileMoneyProvider Provider { get; set; } = MobileMoneyProvider.MPesa;
    /// <summary>
    /// The currency this wallet holds, set from the network when created (M-Pesa = KES,
    /// MTN MoMo = UGX, Airtel = home). NULL on wallets created before this existed: those
    /// hold the bureau's home currency, as they always did. Read it via MobileMoney.CurrencyOf.
    /// </summary>
    public Currency? Currency { get; set; }
    public decimal Balance { get; set; } = 0;
    public decimal OpeningBalance { get; set; } = 0;
    public bool IsActive { get; set; } = true;
    [Timestamp] public byte[]? RowVersion { get; set; }
}

/// <summary>
/// Cash Account entity (PDF Section 5.3)
/// Each company has one KES and one USD cash account
/// </summary>
public class CashAccount : BaseEntity
{
    public Guid CompanyId { get; set; }
    public Currency Currency { get; set; }
    public decimal Balance { get; set; } = 0;
    public decimal OpeningBalance { get; set; } = 0;
    public bool IsActive { get; set; } = true;
    public string Code { get; set; } = string.Empty;
    [Timestamp] public byte[]? RowVersion { get; set; }
}
