using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

public record CreateBankAccountDto(
    string BankName,
    string AccountNumber,
    string AccountName,
    string? BranchCode,
    Currency Currency,
    decimal OpeningBalance
);

public record UpdateBankAccountDto(
    string? BankName,
    string? AccountName,
    string? BranchCode,
    bool? IsActive
);

public record BankAccountResponseDto(
    Guid Id,
    string Code,
    string BankName,
    string AccountNumber,
    string AccountName,
    string? BranchCode,
    Currency Currency,
    decimal Balance,
    decimal OpeningBalance,
    decimal TotalDebit,
    decimal TotalCredit,
    decimal NetMovement,
    bool IsActive,
    DateTime CreatedAt
);

public record BankAccountStatsDto(
    int TotalAccounts,
    decimal TotalBalanceKES,
    decimal TotalBalanceUSD,
    decimal TotalDebitKES,
    decimal TotalCreditKES,
    decimal NetMovementKES,
    decimal TotalDebitUSD,
    decimal TotalCreditUSD,
    decimal NetMovementUSD,
    List<CurrencyAccountTotalsDto>? ByCurrency = null   // every bank currency, incl. UGX/EUR
);

public record CreateMpesaAgentDto(
    string AgentName,
    string PhoneNumber,
    string AgentNumber,
    string? StoreNumber,
    MpesaAgentType AgentType,
    decimal OpeningBalance,
    MobileMoneyProvider? Provider = null   // M-Pesa when omitted
);

public record UpdateMpesaAgentDto(
    string? AgentName,
    string? StoreNumber,
    MpesaAgentType? AgentType,
    bool? IsActive,
    MobileMoneyProvider? Provider = null
);

public record MpesaAgentResponseDto(
    Guid Id,
    string Code,
    string AgentName,
    string PhoneNumber,
    string AgentNumber,
    string? StoreNumber,
    MpesaAgentType AgentType,
    decimal Balance,
    decimal OpeningBalance,
    decimal TotalDebit,
    decimal TotalCredit,
    decimal NetMovement,
    bool IsActive,
    DateTime CreatedAt,
    MobileMoneyProvider Provider = MobileMoneyProvider.MPesa,
    Currency Currency = Currency.KES   // the wallet's own currency (M-Pesa = KES, MTN MoMo = UGX)
);

public record MpesaAgentStatsDto(
    int TotalAgents,
    decimal TotalBalance,      // home-currency wallets only (KES and UGX can't be added)
    decimal TotalDebit,
    decimal TotalCredit,
    decimal NetMovement,
    // Every wallet currency held (an M-Pesa KES wallet in a Ugandan bureau shows here).
    List<CurrencyAccountTotalsDto>? ByCurrency = null
);

/// <summary>
/// NEW: DTO for creating a cash account with opening balance
/// </summary>
public record CreateCashAccountDto(
    Currency Currency,
    decimal OpeningBalance = 0
);

/// <summary>
/// NEW: DTO for updating cash account opening balance
/// </summary>
public record UpdateCashAccountDto(
    decimal? OpeningBalance
);

/// <summary>
/// Existing Cash Account Response DTO
/// </summary>
public record CashAccountResponseDto(
    Guid Id,
    Currency Currency,
    decimal Balance,
    decimal OpeningBalance,
    decimal TotalDebit,
    decimal TotalCredit,
    decimal NetMovement,
    DateTime CreatedAt
);

/// <summary>
/// Existing Cash Stats DTO
/// </summary>
public record CashStatsDto(
    decimal BalanceKES,
    decimal OpeningBalanceKES,
    decimal TotalDebitKES,
    decimal TotalCreditKES,
    decimal NetMovementKES,
    decimal BalanceUSD,
    decimal OpeningBalanceUSD,
    decimal TotalDebitUSD,
    decimal TotalCreditUSD,
    decimal NetMovementUSD,
    List<CurrencyAccountTotalsDto>? ByCurrency = null   // every cash currency, incl. UGX/EUR
);
