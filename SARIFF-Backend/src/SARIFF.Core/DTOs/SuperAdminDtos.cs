using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

// =====================================================
// COMPANY STATS WITH SUBSCRIPTION INFO
// =====================================================

/// <summary>
/// Extended company stats for SuperAdmin dashboard
/// </summary>
public record CompanyStatsDto(
    Guid Id,
    string Code,
    string Name,
    string OwnerName,
    string? Email,
    string WhatsAppNumber,
    bool IsActive,
    DateTime CreatedAt,
    DateTime? LastLoginAt,
    // Subscription
    SubscriptionPlan SubscriptionPlan,
    SubscriptionStatus SubscriptionStatus,
    DateTime? SubscriptionStartDate,
    DateTime? SubscriptionExpiresAt,
    decimal MonthlyFee,
    decimal TotalPaid,
    DateTime? LastPaymentDate,
    // Usage Stats
    int TotalUsers,
    int ActiveUsers,
    int TotalClients,
    int ActiveClients,
    int TotalTransactions,
    int MonthlyTransactions,
    decimal TotalVolume,      // DEPRECATED: adds amounts across currencies — use the per-currency lists
    decimal MonthlyVolume,    // DEPRECATED: same
    DateTime? LastActivityAt,
    int ErrorCount,
    List<CurrencyAmountDto>? TotalVolumeByCurrency = null,
    List<CurrencyAmountDto>? MonthlyVolumeByCurrency = null,
    Currency BaseCurrency = Currency.KES   // the bureau's home currency (KES / UGX)
);

/// <summary>
/// Company detail for SuperAdmin modal view
/// </summary>
public record CompanyDetailDto(
    Guid Id,
    string Code,
    string Name,
    string OwnerName,
    string? Email,
    string WhatsAppNumber,
    string? LogoUrl,
    string? TaxId,
    string? Website,
    string? Address,
    bool IsActive,
    DateTime CreatedAt,
    DateTime? LastLoginAt,
    // Subscription
    SubscriptionPlan SubscriptionPlan,
    SubscriptionStatus SubscriptionStatus,
    DateTime? SubscriptionStartDate,
    DateTime? SubscriptionExpiresAt,
    decimal MonthlyFee,
    decimal TotalPaid,
    DateTime? LastPaymentDate,
    // Usage Stats
    int TotalUsers,
    int ActiveUsers,
    int TotalClients,
    int ActiveClients,
    int TotalTransactions,
    int MonthlyTransactions,
    decimal TotalVolume,
    decimal MonthlyVolume,
    // Balances
    int BankAccountsCount,
    int MpesaAgentsCount,
    decimal TotalCashBalanceKES,
    decimal TotalCashBalanceUSD,
    decimal TotalBankBalanceKES,
    decimal TotalBankBalanceUSD,
    decimal TotalMpesaBalance,
    decimal TotalClientBalanceKES,
    decimal TotalClientBalanceUSD,
    // Holdings in currencies beyond KES/USD (UGX, EUR, ...) — cash + bank + client balances per currency
    List<CurrencyHoldingDto> OtherCurrencyHoldings,
    // Recent Activity
    List<RecentTransactionDto> RecentTransactions,
    List<AdminLoginHistoryDto> RecentLogins,
    // Issues
    int UnreconciledCount,
    int ErrorCount,
    // Transaction PIN
    bool IsTransactionPinEnabled,
    bool HasTransactionPin,
    // Volume per currency (TotalVolume/MonthlyVolume add currencies together)
    List<CurrencyAmountDto>? TotalVolumeByCurrency = null,
    List<CurrencyAmountDto>? MonthlyVolumeByCurrency = null,
    // Home currency, and whether it can still be changed (no exchange/mobile-money history yet)
    Currency BaseCurrency = Currency.KES,
    bool CanChangeBaseCurrency = true,
    // Mobile money per wallet currency (TotalMpesaBalance = home-currency wallets only)
    List<CurrencyAmountDto>? MobileMoneyByCurrency = null
);

/// <summary>
/// Total holdings for one currency across cash, bank, and client balances —
/// used in the SuperAdmin "Money Held" view for currencies beyond KES/USD.
/// </summary>
public record CurrencyHoldingDto(
    Currency Currency,
    string CurrencyCode,
    decimal CashBalance,
    decimal BankBalance,
    decimal ClientBalance
);

/// <summary>
/// Simplified transaction for lists
/// </summary>
public record RecentTransactionDto(
    Guid Id,
    string Code,
    string Description,
    decimal Amount,
    string Currency,
    string TransactionType,
    DateTime TransactionDate
);

/// <summary>
/// Company ranking for top companies list
/// </summary>
public record CompanyRankDto(
    Guid Id,
    string Name,
    string Code,
    decimal Value,   // count for the "by transactions" list; DEPRECATED mixed-currency sum for "by volume"
    int Rank,
    Currency BaseCurrency = Currency.KES,
    int TransactionCount = 0,
    List<CurrencyAmountDto>? VolumeByCurrency = null   // never added across currencies
);

// =====================================================
// SUBSCRIPTION MANAGEMENT
// =====================================================

public record UpdateSubscriptionDto(
    SubscriptionPlan Plan,
    SubscriptionStatus? Status,
    decimal MonthlyFee,
    DateTime? ExpiresAt
);

public record SuspendCompanyDto(
    string Reason
);

// =====================================================
// SYSTEM HEALTH
// =====================================================

public record SystemHealthDto(
    string OverallStatus, // Healthy, Degraded, Down
    string ApiStatus,
    int ApiResponseTimeMs,
    int ApiRequestsPerMinute,
    decimal ApiErrorRate,
    string DatabaseStatus,
    int DatabaseLatencyMs,
    int DatabaseConnections,
    decimal ServerCpuUsage,
    decimal ServerMemoryUsage,
    decimal ServerDiskUsage,
    int ActiveWebSockets,
    long UptimeSeconds,
    DateTime LastCheckedAt,
    int ErrorsLast24h,
    int WarningsLast24h,
    int CriticalAlertsLast24h,
    // Why the status isn't Healthy, in plain words (empty when Healthy).
    List<string>? Reasons = null
);

// =====================================================
// SECURITY
// =====================================================

public record SecurityOverviewDto(
    int FailedLoginsLast24h,
    int FailedLoginsLast7d,
    int LockedAccounts,
    int SuspiciousActivities,
    int BlockedIPs,
    int ActiveAlerts,
    List<SecurityAlertDto> RecentAlerts,
    List<AdminLoginHistoryDto> RecentFailedLogins
);

public record SecurityAlertDto(
    Guid Id,
    SecurityAlertType AlertType,
    string Severity,
    string Message,
    Guid? CompanyId,
    string? CompanyName,
    string? IpAddress,
    bool IsResolved,
    DateTime CreatedAt,
    DateTime? ResolvedAt
);

public record ResolveAlertDto(
    string? Notes
);

public record BlockIPDto(
    string IpAddress,
    string Reason,
    DateTime? BlockUntil // null = permanent
);

public record IPWhitelistDto(
    Guid Id,
    string IpAddress,
    string? Description,
    bool IsActive,
    DateTime CreatedAt
);

public record AddIPWhitelistDto(
    string IpAddress,
    string? Description
);

// =====================================================
// FINANCIAL OVERVIEW
// =====================================================

public record FinancialOverviewDto(
    // Revenue
    decimal TotalRevenue,
    decimal MonthlyRevenue,
    decimal YearlyRevenue,
    decimal PendingPayments,
    decimal RevenueGrowth, // Percentage
    // Revenue breakdown
    List<RevenueByPlanDto> RevenueByPlan,
    // Platform Transaction Volume
    // DEPRECATED — these three add KES, USD and UGX together and mean nothing once a
    // bureau trades two currencies. Kept for older clients; no screen shows them.
    // Use TotalVolumeByCurrency / MonthlyVolumeByCurrency.
    decimal TotalTransactionsVolume,
    decimal MonthlyTransactionsVolume,
    decimal AvgTransactionSize,
    List<TransactionTypeStatsDto> TransactionsByType,
    List<CurrencyAmountDto>? TotalVolumeByCurrency = null,
    List<CurrencyAmountDto>? MonthlyVolumeByCurrency = null
);

public record RevenueByPlanDto(
    string Plan,
    decimal Revenue,
    int CompanyCount,
    decimal Percentage
);

public record TransactionTypeStatsDto(
    string Type,
    int Count,
    decimal Volume
);

public record PaymentHistoryDto(
    Guid Id,
    Guid CompanyId,
    string CompanyName,
    decimal Amount,
    string Currency,
    string PaymentMethod,
    string Status,
    string? Reference,
    DateTime? PaidAt,
    DateTime PeriodStart,
    DateTime PeriodEnd
);

public record RecordPaymentDto(
    Guid CompanyId,
    decimal Amount,
    string Currency,
    string PaymentMethod,
    string? Reference,
    string? Notes
);

// =====================================================
// ANALYTICS
// =====================================================

public record AnalyticsOverviewDto(
    // User Activity
    int DailyActiveUsers,
    int WeeklyActiveUsers,
    int MonthlyActiveUsers,
    int AvgSessionDurationSeconds,
    // Feature Usage
    List<FeatureUsageDto> FeatureUsage,
    // Growth
    List<GrowthDataPointDto> UserGrowth,
    List<GrowthDataPointDto> TransactionGrowth,
    List<GrowthDataPointDto> RevenueGrowth
);

public record FeatureUsageDto(
    string Feature,
    int TotalUses,
    int UniqueUsers
);

public record GrowthDataPointDto(
    string Period, // "2025-01", "2025-02", etc.
    decimal Value
);

// =====================================================
// EXTENDED SUPERADMIN DASHBOARD (replaces basic version)
// =====================================================

public record SuperAdminDashboardExtendedDto(
    // Company Stats
    int TotalCompanies,
    int ActiveCompanies,
    int TrialCompanies,
    int ExpiredCompanies,
    int SuspendedCompanies,
    decimal CompaniesGrowth,
    // User Stats
    int TotalUsers,
    int TotalClients,
    int ActiveUsersToday,
    decimal UsersGrowth,
    // Revenue Stats
    decimal MonthlyRecurringRevenue,
    decimal TotalRevenue,
    decimal PendingPayments,
    decimal RevenueGrowth,
    // Volume Stats (the two decimals are DEPRECATED mixed-currency sums — use the *ByCurrency lists)
    decimal TotalTransactionsVolume,
    decimal MonthlyTransactionsVolume,
    int TotalTransactionsCount,
    int MonthlyTransactionsCount,
    decimal VolumeGrowth,
    // System Health Summary
    string SystemStatus,
    int ErrorsLast24h,
    int SecurityAlertsActive,
    // Top Companies
    List<CompanyRankDto> TopCompaniesByVolume,
    List<CompanyRankDto> TopCompaniesByTransactions,
    // Recent Activity
    List<CompanyStatsDto> RecentSignups,
    List<CompanyStatsDto> ExpiringSubscriptions,
    // Existing fields for compatibility
    List<SystemLogResponseDto> RecentErrors,
    List<CompanySummaryDto> Companies,
    // Platform volume per currency (KES, USD, UGX, ... never added together)
    List<CurrencyAmountDto>? TotalVolumeByCurrency = null,
    List<CurrencyAmountDto>? MonthlyVolumeByCurrency = null,
    // Bureaus per home currency (e.g. KES: 9, UGX: 5)
    List<CurrencyCountDto>? CompaniesByBaseCurrency = null
);

// =====================================================
// AUDIT LOG FILTER
// =====================================================

public record AuditLogFilterDto(
    Guid? CompanyId,
    Guid? UserId,
    string? Action,
    string? EntityType,
    DateTime? StartDate,
    DateTime? EndDate,
    string? Severity
);
