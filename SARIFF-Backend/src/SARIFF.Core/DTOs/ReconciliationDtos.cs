using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

// EXISTING
public record CreateReconciliationDto(
    AccountType AccountType,
    Guid AccountId,
    decimal ActualBalance,
    string? Notes
);

public record ReconciliationResponseDto(
    Guid Id,
    AccountType AccountType,
    Guid AccountId,
    string AccountName,
    Currency Currency,
    decimal ExpectedBalance,
    decimal ActualBalance,
    decimal Variance,
    ReconciliationStatus Status,
    string? Notes,
    DateTime? ReconciledAt,
    DateTime CreatedAt
);

public record CompleteReconciliationDto(bool CreateAdjustment, string? AdjustmentDescription);

// NEW: Account with pending reconciliation count
public record AccountReconciliationSummaryDto(
    Guid Id,
    string Code,
    string Name,
    AccountType AccountType,
    Currency Currency,
    decimal Balance,
    int PendingCount,
    int MatchedCount,
    int UnmatchedCount
);

// NEW: Transaction for reconciliation view
public record TransactionReconciliationDto(
    Guid Id,
    string Code,
    string Reference,
    DateTime TransactionDate,
    TransactionType TransactionType,
    decimal Amount,
    decimal? ActualAmount,
    decimal? Variance,
    Currency Currency,
    string Description,
    ReconciliationStatus ReconciliationStatus,
    DateTime? ReconciledAt,
    string? ReconciledByName,
    string? ReconciliationNotes,
    AccountType SourceAccountType,
    Guid SourceAccountId
);

// NEW: Summary for an account's reconciliation status
public record AccountReconciliationBalanceDto(
    decimal ExpectedBalance,
    decimal ActualBalance,
    decimal Variance,
    int PendingCount,
    int MatchedCount,
    int UnmatchedCount,
    decimal PendingAmount,
    decimal MatchedAmount,
    decimal UnmatchedAmount
);

// NEW: Reconcile a single transaction
public record ReconcileTransactionDto(
    decimal ActualAmount,
    ReconciliationStatus Status,
    string? Notes
);

// NEW: Bulk reconcile multiple transactions
public record BulkReconcileDto(
    List<Guid> TransactionIds,
    ReconciliationStatus Status,
    string? Notes
);

// NEW: Filter for reconciliation queries
public record ReconciliationFilterDto(
    ReconciliationStatus? Status,
    DateTime? StartDate,
    DateTime? EndDate
);
