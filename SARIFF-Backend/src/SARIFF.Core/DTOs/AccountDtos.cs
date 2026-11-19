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

// ==================== INCOME: MOBILE MONEY COMMISSION ====================

/// <summary>
/// Commission the network paid. Gross is the commission earned; WithholdingTax is what the
/// network kept. The net (gross − tax) lands in the destination (usually a commission or
/// float wallet; a bank or till also works). Income is recorded gross.
/// </summary>
public record RecordCommissionDto(
    AccountType DestAccountType,
    Guid DestAccountId,
    Currency Currency,
    decimal GrossAmount,
    decimal WithholdingTax,
    DateTime? Date = null,
    string? Reference = null,
    string? Notes = null
);

public record CommissionResultDto(
    decimal Gross,
    decimal WithholdingTax,
    decimal Net,
    Currency Currency,
    TransactionResponseDto NetPosting,
    TransactionResponseDto? TaxPosting
);

/// <summary>Income and float position for one currency (never added across currencies).</summary>
public record IncomeCurrencyDto(
    Currency Currency,
    decimal CommissionGross,          // in the period
    decimal WithholdingTax,           // kept by the network in the period
    decimal CommissionNet,            // gross − tax: what actually arrived
    decimal FeeIncome,                // in the period
    decimal OtherIncome,              // in the period
    decimal TotalIncome,              // commission gross + fees + other
    decimal WithholdingTaxRecoverable,// all time: tax credit still to claim
    decimal EFloat,                   // now: active mobile money wallets
    decimal CashOnHand                // now: cash tills (the whole bureau's cash)
);

public record IncomeSummaryDto(DateTime FromUtc, DateTime ToUtcExclusive, List<IncomeCurrencyDto> ByCurrency);
