using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

public record StatementDto(
    // Account Info
    string AccountName,
    string AccountCode,
    AccountType AccountType,
    Currency Currency,
    // Period
    DateTime? PeriodStart,
    DateTime? PeriodEnd,
    // Balances
    decimal OpeningBalance,
    decimal ClosingBalance,
    // Totals for Period
    decimal TotalDebit,
    decimal TotalCredit,
    decimal NetMovement,
    // Transaction Lines
    List<StatementLineDto> Transactions
);

public record StatementLineDto(
    // Transaction Info
    Guid TransactionId,
    string TransactionCode,
    DateTime Date,
    string Reference,
    string Description,
    TransactionType TransactionType,      // Original transaction type (Debit/Credit)
    
    // THIS ACCOUNT'S SIDE
    string ThisAccountAction,              // NEW: "Debit" or "Credit" for THIS account
    decimal? Debit,                        // Money OUT (if applicable)
    decimal? Credit,                       // Money IN (if applicable)
    decimal Amount,                        // Actual amount
    Currency Currency,
    decimal BalanceBefore,
    decimal BalanceAfter,
    
    // RELATED ACCOUNT (Counter Party) - with full action details
    RelatedAccountDto RelatedAccount,
    
    // Forex Info (if applicable)
    decimal? ExchangeRate,
    decimal? CounterAmount,
    Currency? CounterCurrency,
    
    // Meta
    string? Notes,
    ReconciliationStatus ReconciliationStatus,
    
    // Reversal status
    bool IsReversed = false,   // Original that was reversed
    bool IsReversal = false    // The reversal entry itself
);

public record RelatedAccountDto(
    Guid AccountId,
    AccountType AccountType,
    string AccountName,
    string? AccountCode,
    Currency Currency,
    // TRANSACTION ACTION FOR RELATED ACCOUNT
    string Action,                         // NEW: "Debit" or "Credit" for related account
    decimal Amount,                        // Amount on related side
    decimal BalanceBefore,
    decimal BalanceAfter,
    // If related is Client, include extra info
    string? ClientCode,
    string? ClientPhone
);

public record StatementFilterDto(
    DateTime? StartDate,
    DateTime? EndDate,
    Currency? Currency,                    // Filter by currency
    TransactionType? TransactionType       // Filter by type
);
