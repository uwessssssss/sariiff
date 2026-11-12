using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

/// <summary>
/// DTO for creating a transaction.
/// For forex transactions (different currencies between accounts):
/// - Amount/Currency = Primary account amount (converted)
/// - CounterAmount/CounterCurrency = Counter account amount (original entered)
/// </summary>
public record CreateTransactionDto(
    TransactionType TransactionType,
    
    // Primary account (the one being debited/credited)
    AccountType SourceAccountType,
    Guid SourceAccountId,
    
    // Counter account (cash, bank, mpesa, or transfer)
    AccountType DestAccountType,
    Guid DestAccountId,
    
    // Primary account amount (converted amount for forex)
    decimal Amount,
    Currency Currency,
    
    // Counter account amount (original entered amount for forex)
    // If null, same as Amount (no forex)
    decimal? CounterAmount,
    Currency? CounterCurrency,
    
    string Description,
    string? Notes,
    decimal? ExchangeRate,
    PaymentMethod PaymentMethod,
    
    // Optional: back-date a transaction. If null, defaults to UtcNow.
    DateTime? TransactionDate = null
);

public record UpdateTransactionDto(
    string? Description,
    string? Notes
);

public record TransactionResponseDto(
    Guid Id,
    string Code,
    string Reference,
    DateTime TransactionDate,
    TransactionType TransactionType,
    decimal Amount,
    Currency Currency,
    string Description,
    string? Notes,
    decimal? ExchangeRate,
    AccountType SourceAccountType,
    Guid SourceAccountId,
    string SourceAccountName,
    decimal SourceBalanceBefore,
    decimal SourceBalanceAfter,
    AccountType DestAccountType,
    Guid DestAccountId,
    string DestAccountName,
    decimal DestBalanceBefore,
    decimal DestBalanceAfter,
    // NEW: Counter amount for forex display
    decimal? CounterAmount,
    Currency? CounterCurrency,
    ReconciliationStatus ReconciliationStatus,
    DateTime CreatedAt,
    // Reversal status flags
    bool IsReversed = false,   // Original that was reversed (has [REVERSED] prefix)
    bool IsReversal = false    // The reversal entry itself (Reference starts with REV-)
);

public record TransactionSummaryDto(
    int TotalCount,
    decimal TotalDebitKES,
    decimal TotalDebitUSD,
    decimal TotalCreditKES,
    decimal TotalCreditUSD,
    decimal NetFlowKES,
    decimal NetFlowUSD,
    List<CurrencyFlowTotalsDto>? ByCurrency = null
);

public record DeleteTransactionDto(string Reason);
