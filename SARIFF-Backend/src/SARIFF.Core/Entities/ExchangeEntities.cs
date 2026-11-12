using SARIFF.Core.Enums;
using System.ComponentModel.DataAnnotations;

namespace SARIFF.Core.Entities;

/// <summary>
/// Exchange Rate (PDF Section 5.7)
/// </summary>
public class ExchangeRate : BaseEntity
{
    public Guid CompanyId { get; set; }
    /// <summary>
    /// The foreign currency this rate quotes against KES (USD, UGX, EUR, ...).
    /// Defaults to USD so all pre-multi-currency rows stay correct.
    /// </summary>
    public Currency ForeignCurrency { get; set; } = Currency.USD;
    public decimal BuyRate { get; set; }  // KES per 1 unit of ForeignCurrency when buying
    public decimal SellRate { get; set; } // KES per 1 unit of ForeignCurrency when selling
    public DateTime EffectiveFrom { get; set; }
    public DateTime? EffectiveTo { get; set; }
    public bool IsActive { get; set; } = true;
    public Guid CreatedByUserId { get; set; }
}

/// <summary>
/// Exchange Rate (PDF Section 5.7)
/// </summary>
// =====================================================
// EXCHANGE FLOAT ENTITIES (Forex Bureau Operations)
// =====================================================

/// <summary>
/// Exchange Float - Dedicated working capital for forex operations
/// Separate from main Cash accounts to track forex-specific inventory
/// </summary>
public class ExchangeFloat : BaseEntity
{
    public Guid CompanyId { get; set; }
    
    // Float Balances (Working Capital)
    public decimal KesBalance { get; set; } = 0;
    public decimal UsdBalance { get; set; } = 0;
    
    // Accumulated Profits (Unsettled)
    public decimal KesProfit { get; set; } = 0;
    public decimal UsdProfit { get; set; } = 0;
    
    // USD Position Tracking (Average Cost Method)
    public decimal UsdTotalCost { get; set; } = 0;  // Total KES spent to acquire USD
    public decimal UsdAverageCost { get; set; } = 0; // Average cost per USD
    
    // Daily Tracking
    public DateTime? LastOpeningDate { get; set; }
    public decimal? LastOpeningKes { get; set; }
    public decimal? LastOpeningUsd { get; set; }
    
    // Thresholds for alerts
    public decimal LowKesThreshold { get; set; } = 50000;
    public decimal LowUsdThreshold { get; set; } = 500;
    public decimal LargeTransactionThreshold { get; set; } = 500000; // KES equivalent
    [Timestamp] public byte[]? RowVersion { get; set; }
}

/// <summary>
/// Exchange float holding for currencies beyond KES/USD (UGX, EUR, ...).
/// KES and USD keep their dedicated columns on ExchangeFloat; every other
/// currency is one row per (company, currency) — same pattern as
/// ClientCurrencyBalance. Cost is tracked in KES (average cost method).
/// </summary>
public class ExchangeFloatBalance : BaseEntity
{
    public Guid CompanyId { get; set; }
    public Currency Currency { get; set; }
    public decimal Balance { get; set; } = 0;
    public decimal TotalCost { get; set; } = 0;    // Total KES spent to acquire the current balance
    public decimal AverageCost { get; set; } = 0;  // KES per 1 unit
}

/// <summary>
/// Exchange day figures for a currency beyond KES/USD (UGX, EUR, ...),
/// one row per (summary, currency). KES/USD stay on DailyExchangeSummary.
/// </summary>
public class DailyExchangeCurrencySummary : BaseEntity
{
    public Guid CompanyId { get; set; }
    public Guid DailyExchangeSummaryId { get; set; }
    public DateTime Date { get; set; }
    public Currency Currency { get; set; }
    public decimal Opening { get; set; }
    public decimal Closing { get; set; }
    public decimal VolumeIn { get; set; }
    public decimal VolumeOut { get; set; }
    public decimal? ActualCount { get; set; }
    public decimal? Variance { get; set; }
}

/// <summary>
/// Float Movement - Track all changes to the float
/// </summary>
public class FloatMovement : BaseEntity
{
    public Guid CompanyId { get; set; }
    public Guid? ExchangeFloatId { get; set; }
    public DateTime MovementDate { get; set; }
    public FloatMovementType MovementType { get; set; }
    public Currency Currency { get; set; }
    public decimal Amount { get; set; }
    public decimal BalanceBefore { get; set; }
    public decimal BalanceAfter { get; set; }
    public string? Reference { get; set; }
    public AccountType? RelatedAccountType { get; set; }
    public Guid? RelatedAccountId { get; set; }
    public string? Notes { get; set; }
    public Guid CreatedByUserId { get; set; }
}

/// <summary>
/// Exchange Transaction - Detailed record of each currency exchange
/// </summary>
public class ExchangeTransaction : BaseEntity
{
    public string Code { get; set; } = string.Empty;  // EXC-2025-001
    public Guid CompanyId { get; set; }
    public DateTime TransactionDate { get; set; }
    
    // Client — nullable for walk-in cash clients
    public Guid? ClientId { get; set; }
    public string? ClientName { get; set; }        // Walk-in client name (when no account)
    public string? ClientIdNumber { get; set; }  // For compliance
    
    // Exchange Details
    public ExchangeType ExchangeType { get; set; }
    public ExchangeDirection Direction { get; set; }
    
    // Amounts
    public decimal AmountGiven { get; set; }
    public Currency CurrencyGiven { get; set; }
    public decimal AmountReceived { get; set; }
    public Currency CurrencyReceived { get; set; }
    
    // Rate & Profit
    public decimal ExchangeRate { get; set; }
    public decimal Profit { get; set; }
    public Currency ProfitCurrency { get; set; }
    
    // Status
    public string Status { get; set; } = "Completed";
    public string? VoidReason { get; set; }
    public string? Notes { get; set; }
    
    // Tracking
    public Guid CreatedByUserId { get; set; }
    
    // If from client account - linked transactions
    public Guid? ClientSourceTransactionId { get; set; }
    public Guid? ClientDestTransactionId { get; set; }
}

/// <summary>
/// Daily Exchange Summary - End of day snapshot
/// </summary>
public class DailyExchangeSummary : BaseEntity
{
    public Guid CompanyId { get; set; }
    public DateTime Date { get; set; }
    
    // Opening Balances
    public decimal OpeningKes { get; set; }
    public decimal OpeningUsd { get; set; }
    
    // Closing Balances
    public decimal ClosingKes { get; set; }
    public decimal ClosingUsd { get; set; }
    
    // Volume
    public int ExchangeCount { get; set; }
    public decimal KesVolumeIn { get; set; }
    public decimal KesVolumeOut { get; set; }
    public decimal UsdVolumeIn { get; set; }
    public decimal UsdVolumeOut { get; set; }
    
    // Profit
    public decimal KesProfit { get; set; }
    public decimal UsdProfit { get; set; }
    
    // Verification
    public decimal? ActualKesCount { get; set; }  // Physical count
    public decimal? ActualUsdCount { get; set; }
    public decimal? KesVariance { get; set; }
    public decimal? UsdVariance { get; set; }
    public string? Notes { get; set; }
    
    // Status
    public bool IsClosed { get; set; } = false;
    public Guid? ClosedByUserId { get; set; }
    public DateTime? ClosedAt { get; set; }
}
