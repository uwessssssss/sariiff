using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

public record SetExchangeRateDto(decimal BuyRate, decimal SellRate, Currency? ForeignCurrency = null); // null → USD (backward compatible)

public record ExchangeRateResponseDto(
    Guid Id,
    decimal BuyRate,
    decimal SellRate,
    DateTime EffectiveFrom,
    DateTime? EffectiveTo,
    bool IsActive,
    Currency ForeignCurrency = Currency.USD,
    string ForeignCurrencyCode = "USD"
);

public record ExchangeTransactionDto(
    Guid ClientId,
    decimal AmountFrom,
    Currency CurrencyFrom,
    Currency CurrencyTo,
    decimal ExchangeRate
);

public record CurrencyConvertDto(decimal Amount, Currency From, Currency To);

public record CurrencyConvertResultDto(decimal Amount, Currency From, decimal ConvertedAmount, Currency To, decimal Rate);

// ==================== FLOAT MANAGEMENT ====================

/// <summary>
/// Exchange Float balances and profit
/// </summary>
public record ExchangeFloatDto(
    Guid Id,
    decimal KesBalance,
    decimal UsdBalance,
    decimal KesProfit,
    decimal UsdProfit,
    decimal UsdAverageCost,
    DateTime LastUpdated,
    List<FloatCurrencyBalanceDto>? OtherBalances = null,  // currencies beyond base + USD (only those held)
    Currency BaseCurrency = Currency.KES   // KesBalance/KesProfit are in THIS currency (names are historical)
);

/// <summary>Float holding for a currency beyond KES/USD.</summary>
public record FloatCurrencyBalanceDto(
    Currency Currency,
    string CurrencyCode,
    decimal Balance,
    decimal AverageCost     // KES per 1 unit
);

/// <summary>
/// Fund the exchange float (add KES or buy USD)
/// </summary>
public record FundFloatDto(
    Currency Currency,
    decimal Amount,
    AccountType SourceType,
    Guid SourceAccountId,
    decimal? PurchaseRate,
    string? Notes
);

/// <summary>
/// Withdraw from exchange float
/// </summary>
public record WithdrawFloatDto(
    Currency Currency,
    decimal Amount,
    AccountType DestinationType,
    Guid DestinationAccountId,
    string? Notes
);

/// <summary>
/// Settle accumulated profit
/// </summary>
public record SettleProfitDto(
    Currency Currency,
    decimal Amount,
    AccountType DestinationType,
    Guid DestinationAccountId,
    string? Notes
);

// ==================== EXCHANGE TRANSACTIONS ====================

/// <summary>
/// Create a new exchange transaction
/// </summary>
public record CreateExchangeDto(
    Guid? ClientId,             // Required for FromAccount, optional for Cash
    ExchangeType ExchangeType,
    ExchangeDirection Direction,
    decimal Amount,
    decimal? CustomRate,
    string? ClientIdNumber,
    string? ClientName,         // Walk-in client name (used when no ClientId for Cash)
    string? Notes,
    Currency? ForeignCurrency = null   // USD (default), UGX, EUR — the non-KES side of the trade
);

/// <summary>
/// Exchange transaction response
/// </summary>
public record ExchangeResponseDto(
    Guid Id,
    string Code,
    DateTime Date,
    Guid? ClientId,
    string ClientName,
    string ClientType,
    ExchangeType ExchangeType,
    ExchangeDirection Direction,
    decimal AmountGiven,
    Currency CurrencyGiven,
    decimal AmountReceived,
    Currency CurrencyReceived,
    decimal ExchangeRate,
    decimal Profit,
    Currency ProfitCurrency,
    string? Notes,
    string Status,
    bool IsLargeTransaction
);

// ==================== DAILY OPERATIONS ====================

/// <summary>
/// Opening float verification
/// </summary>
public record OpeningFloatDto(
    decimal KesCount,
    decimal UsdCount,
    string? Notes,
    List<CurrencyCountDto>? OtherCounts = null   // UGX, EUR, ... physical counts
);

/// <summary>
/// Closing float verification
/// </summary>
public record ClosingFloatDto(
    decimal KesCount,
    decimal UsdCount,
    string? Notes,
    List<CurrencyCountDto>? OtherCounts = null   // UGX, EUR, ... physical counts
);

/// <summary>
/// Daily summary
/// </summary>
public record DailySummaryDto(
    DateTime Date,
    int TotalTransactions,
    int ExchangeCount,
    decimal KesVolumeIn,
    decimal KesVolumeOut,
    decimal UsdVolumeIn,
    decimal UsdVolumeOut,
    decimal KesProfit,
    decimal UsdProfit,
    decimal OpeningKes,
    decimal OpeningUsd,
    decimal ClosingKes,
    decimal ClosingUsd,
    decimal? KesVariance,
    decimal? UsdVariance,
    bool IsClosed,
    List<CurrencyDaySummaryDto>? OtherCurrencies = null,
    Currency BaseCurrency = Currency.KES   // Kes* fields are in THIS currency (names are historical)
);

// ==================== REPORTS ====================

/// <summary>
/// Profit report for a period
/// </summary>
public record ProfitReportDto(
    DateTime FromDate,
    DateTime ToDate,
    decimal TotalKesProfit,
    decimal TotalUsdProfit,
    decimal TotalProfitInKes,
    int TotalTransactions,
    decimal AverageSpread,
    List<DailyProfitDto> DailyBreakdown,
    Currency BaseCurrency = Currency.KES   // TotalKesProfit / TotalProfitInKes are in THIS currency
);

public record DailyProfitDto(
    DateTime Date,
    decimal KesProfit,
    decimal UsdProfit,
    int Transactions
);

/// <summary>
/// Float movement history
/// </summary>
public record FloatMovementDto(
    Guid Id,
    DateTime Date,
    string Type,
    Currency Currency,
    decimal Amount,
    decimal BalanceBefore,
    decimal BalanceAfter,
    string? SourceOrDest,
    string? Notes
);

/// <summary>
/// Large transaction report (for compliance)
/// </summary>
public record LargeTransactionReportDto(
    Guid TransactionId,
    string Code,
    DateTime Date,
    string ClientName,
    string ClientIdNumber,
    string? ClientPhone,
    decimal Amount,
    Currency Currency,
    decimal KesEquivalent,
    string TransactionType
);

// ==================== ALERTS ====================

public record FloatAlertDto(
    string AlertType,
    string Message,
    Currency? Currency,
    decimal? CurrentBalance,
    decimal? Threshold,
    DateTime Timestamp
);

// ==================== CLIENT EXCHANGE HISTORY ====================

public record ClientExchangeHistoryDto(
    Guid ClientId,
    string ClientName,
    int TotalExchanges,
    decimal TotalKesExchanged,
    decimal TotalUsdExchanged,
    decimal TotalProfitGenerated,
    DateTime? FirstExchange,
    DateTime? LastExchange,
    List<ExchangeResponseDto> RecentExchanges
);

// ==================== POSITION TRACKING ====================

/// <summary>
/// USD Position - Track inventory value
/// </summary>
public record UsdPositionDto(
    decimal UsdBalance,
    decimal AverageCostPerUsd,
    decimal TotalCostBasis,
    decimal CurrentMarketRate,
    decimal CurrentMarketValue,
    decimal UnrealizedPnL,
    decimal UnrealizedPnLPercent
);

// ==================== CALCULATOR ====================

public record CalculateExchangeDto(
    decimal Amount,
    ExchangeDirection Direction,
    Currency? ForeignCurrency = null   // USD when omitted
);

public record CalculationResultDto(
    decimal InputAmount,
    Currency InputCurrency,
    decimal OutputAmount,
    Currency OutputCurrency,
    decimal Rate,
    decimal EstimatedProfit
);

// ==================== ADDITIONAL ====================

public record VoidExchangeDto(string Reason);

public record UpdateAlertThresholdsDto(
    decimal LowKesThreshold,
    decimal LowUsdThreshold,
    decimal LargeTransactionThreshold
);

/// <summary>One bureau's line in the legacy exchange-profit correction.</summary>
public record LegacyProfitCorrectionDto(
    Guid CompanyId,
    string CompanyName,
    int BuyExchangesCorrected,
    decimal ProfitRemoved,
    decimal FloatProfitBefore,
    decimal FloatProfitAfter,
    string? Warning);
