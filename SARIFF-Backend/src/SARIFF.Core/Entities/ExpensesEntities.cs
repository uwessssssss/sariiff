using SARIFF.Core.Enums;
using System.ComponentModel.DataAnnotations;

namespace SARIFF.Core.Entities;

/// <summary>
/// Expense Category (PDF Section 5.6)
/// </summary>
public class ExpenseCategory : BaseEntity
{
    public Guid CompanyId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
}

/// <summary>
/// Expense entity (PDF Section 5.6)
/// Recording expense automatically REDUCES payment account balance
/// </summary>
public class Expense : BaseEntity
{
    public string Code { get; set; } = string.Empty; // EXP-2025-001
    public Guid CompanyId { get; set; }
    public Guid CategoryId { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? VendorPayee { get; set; }
    public decimal Amount { get; set; }
    public Currency Currency { get; set; }
    public PaymentMethod PaymentMethod { get; set; }
    public Guid? TransactionId { get; set; }
    public AccountType PaymentAccountType { get; set; }
    public Guid PaymentAccountId { get; set; }
    public string? Reference { get; set; }
    public DateTime ExpenseDate { get; set; }
    public Guid CreatedByUserId { get; set; }
}
