using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

#region Common
public record ApiResponse<T>(bool Success, string Message, T? Data = default);
public record PagedResult<T>(List<T> Items, int TotalCount, int Page, int PageSize);
public record ErrorResponse(string Message, string? Details = null);

// ---- Per-currency figures --------------------------------------------------
// Summaries keep their historical KES/USD fields for compatibility and ALSO
// carry a per-currency list covering EVERY currency in use (KES and USD
// included), so a screen can render UGX/EUR without new fields per currency.

public record CurrencyAmountDto(Currency Currency, string CurrencyCode, decimal Amount);

/// <summary>Account-style totals for one currency (cash, bank).</summary>
public record CurrencyAccountTotalsDto(
    Currency Currency, string CurrencyCode,
    decimal Balance, decimal OpeningBalance,
    decimal TotalDebit, decimal TotalCredit, decimal NetMovement);

/// <summary>Money in/out for one currency over a period.</summary>
public record CurrencyFlowTotalsDto(
    Currency Currency, string CurrencyCode,
    decimal TotalDebit, decimal TotalCredit, decimal NetFlow);

/// <summary>Cash and bank holdings in one currency.</summary>
public record CurrencyCashBankDto(Currency Currency, string CurrencyCode, decimal Cash, decimal Bank);

/// <summary>Client totals in one currency.</summary>
public record CurrencyClientTotalsDto(
    Currency Currency, string CurrencyCode,
    decimal TotalBalance, decimal TotalDebit, decimal TotalCredit,
    int ClientsOwing, int ClientsOwed);

/// <summary>Expense totals in one currency.</summary>
public record CurrencyExpenseTotalsDto(Currency Currency, string CurrencyCode, decimal Total, decimal ThisMonth);

/// <summary>A physical count of one currency (day open / day close).</summary>
public record CurrencyCountDto(Currency Currency, decimal Count);

/// <summary>Exchange day figures for a currency beyond KES/USD.</summary>
public record CurrencyDaySummaryDto(
    Currency Currency, string CurrencyCode,
    decimal Opening, decimal Closing,
    decimal VolumeIn, decimal VolumeOut,
    decimal? ActualCount, decimal? Variance);
#endregion

#region Authentication

// UNIFIED LOGIN - One endpoint for ALL users
public record UnifiedLoginDto(
    string Code,           // SA-2026-001, CO-2026-001, or CL-2026-001
    string PhoneNumber,    // +254...
    string Password,
    string? DeviceId = null // Device fingerprint for trusted device check
);

// OTP verification (for SuperAdmin/OfficeUser only)
public record OtpVerifyWithCodeDto(
    string Code,
    string PhoneNumber,
    string Otp,
    string? DeviceId = null,     // Device fingerprint to trust after verification
    string? DeviceName = null    // "Chrome on Windows", "Samsung Galaxy"
);

// Token response - same for all users

// Token response - same for all users
public record TokenResponseDto(
    string AccessToken, 
    string RefreshToken, 
    DateTime ExpiresAt, 
    UserRole Role, 
    string Name,           // Company name (for OfficeUser) or User name (for others)
    string Code,
    Guid? CompanyId,
    string? OwnerName      // NEW: Owner name for OfficeUser greeting
);

// Keep legacy DTOs for backward compatibility
public record OtpRequestDto(string PhoneNumber, UserRole Role);
public record OtpVerifyDto(string PhoneNumber, string Code, UserRole Role);
public record ClientLoginDto(string Code, string WhatsAppNumber, string Password);
public record LoginRequestDto(string Code, string PhoneNumber, string Password);
public record RefreshTokenDto(string RefreshToken);

#endregion

#region Company
public record CreateCompanyDto(
    string Name,
    string OwnerName,
    string WhatsAppNumber,
    string? Email,
    string Password,
    string? CodePrefix = null,  // Optional: 2-3 char abbreviation, auto-generated from name if not provided
    Currency? BaseCurrency = null  // KES (default) or UGX — the bureau's home currency
);

/// <summary>Super admin: change a company's base currency (only before any exchange history).</summary>
public record SetBaseCurrencyDto(Currency BaseCurrency);

public record UpdateCompanyDto(
    string? Name,
    string? OwnerName,
    string? Email,
    string? LogoUrl,
    string? TaxId,
    string? Website,
    string? Address
);

public record CompanyResponseDto(
    Guid Id,
    string Code,
    string Name,
    string OwnerName,
    string WhatsAppNumber,
    string? Email,
    string? LogoUrl,
    string? TaxId,
    string? Website,
    string? Address,
    bool IsActive,
    DateTime CreatedAt,
    DateTime? LastLoginAt,
    Currency BaseCurrency = Currency.KES
);

public record CompanySummaryDto(
    Guid Id,
    string Code,
    string Name,
    string OwnerName,
    int TotalClients,
    int TotalTransactions,
    decimal TotalBalanceKES,
    decimal TotalBalanceUSD,
    bool IsActive,
    List<CurrencyAmountDto>? OtherClientBalances = null   // UGX, EUR, ... client totals
);

/// <summary>
/// The set of currencies a company actually uses, derived from its real
/// activity (cash/bank accounts, transactions, client balances). Frontends
/// drive their columns and pickers off this so nobody sees empty columns for
/// currencies their business doesn't touch (e.g. a Kenyan bureau never sees UGX).
/// </summary>
public record CompanyCurrenciesDto(
    List<CurrencyOptionDto> Currencies,
    Currency BaseCurrency = Currency.KES,   // home currency: rates are "base per 1 foreign"
    string BaseCurrencyCode = "KES",
    List<CurrencyOptionDto>? AllowedCurrencies = null   // what pickers may offer for NEW entries (by country)
);

public record CurrencyOptionDto(
    Currency Currency,   // enum value
    string Code,         // "KES", "USD", "UGX", "EUR"
    int Value            // numeric enum, for convenience on the frontend
);
#endregion

#region Client
public record CreateClientDto(
    string FullName,
    string WhatsAppNumber,
    string? Email,
    string? IdPassport,
    ClientType ClientType,
    string? Password,
    decimal OpeningBalanceKES = 0,
    decimal OpeningBalanceUSD = 0,
    // Opening balance in the bureau's home currency when that isn't KES or USD
    // (e.g. UGX for a Ugandan bureau). Ignored for KES/USD bureaus.
    decimal OpeningBalanceHome = 0
);

public record UpdateClientDto(
    string? FullName,
    string? Email,
    string WhatsAppNumber,
    string? IdPassport,
    bool? IsActive
);

public record ClientResponseDto(
    Guid Id,
    string Code,
    string FullName,
    string WhatsAppNumber,
    string? Email,
    string? IdPassport,
    ClientType ClientType,
    // Current Balances
    decimal BalanceKES,
    decimal BalanceUSD,
    // Opening Balances
    decimal OpeningBalanceKES,
    decimal OpeningBalanceUSD,
    // Transaction Totals - KES
    decimal TotalDebitKES,
    decimal TotalCreditKES,
    decimal NetMovementKES,
    // Transaction Totals - USD
    decimal TotalDebitUSD,
    decimal TotalCreditUSD,
    decimal NetMovementUSD,
    // Meta
    bool IsActive,
    DateTime CreatedAt,
    // Balances in currencies beyond KES/USD (UGX, EUR, ...). Empty for
    // KES/USD-only clients, so existing office views are unaffected.
    List<CurrencyBalanceDto>? OtherBalances = null,
    // Linked to a phone login (yes/no only — never which other bureaus).
    bool PhoneLoginLinked = false
);

/// <summary>
/// PERF: Lightweight DTO for dropdown selectors — no balance/transaction calculations
/// </summary>
public record ClientLookupDto(
    Guid Id,
    string Code,
    string FullName,
    string WhatsAppNumber,
    string? IdPassport,
    bool IsActive
);

public record ClientStatsDto(
    int TotalClients,
    int PermanentClients,
    int TemporaryClients,
    int ClientsWithDebit,
    int ClientsWithCredit,
    decimal TotalBalanceKES,
    decimal TotalBalanceUSD,
    decimal TotalDebitKES,
    decimal TotalCreditKES,
    decimal TotalDebitUSD,
    decimal TotalCreditUSD,
    List<CurrencyClientTotalsDto>? ByCurrency = null
);

public record ConvertClientDto(string Password);
public record ResetClientPasswordDto(string NewPassword);
#endregion

#region Bank Account
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

#endregion

#region M-Pesa Agent
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

#endregion

#region Cash Account
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

#endregion

#region Transaction

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

#endregion
#region Expense
public record CreateExpenseCategoryDto(string Name, string? Description);
public record UpdateExpenseCategoryDto(string? Name, string? Description, bool? IsActive);

public record ExpenseCategoryResponseDto(
    Guid Id,
    string Name,
    string? Description,
    bool IsActive,
    decimal TotalKES,
    decimal TotalUSD,
    int TransactionCount,
    List<CurrencyAmountDto>? TotalsByCurrency = null
);

public record CreateExpenseDto(
    Guid CategoryId,
    string Description,
    string? VendorPayee,
    decimal Amount,
    Currency Currency,
    PaymentMethod PaymentMethod,
    AccountType PaymentAccountType,
    Guid PaymentAccountId,
    string? Reference,
    DateTime ExpenseDate
);

public record ExpenseResponseDto(
    Guid Id,
    string Code,
    Guid CategoryId,
    string CategoryName,
    string Description,
    string? VendorPayee,
    decimal Amount,
    Currency Currency,
    PaymentMethod PaymentMethod,
    string PaymentAccountName,
    string? Reference,
    DateTime ExpenseDate,
    DateTime CreatedAt
);

public record ExpenseStatsDto(
    decimal TotalKES,
    decimal TotalUSD,
    decimal ThisMonthKES,
    decimal ThisMonthUSD,
    int ActiveCategories,
    List<CurrencyExpenseTotalsDto>? ByCurrency = null
);
public record UpdateExpenseDto(
    string? Description,
    string? VendorPayee,
    decimal? Amount,
    string? Reference
);
#endregion

#region Exchange Rate
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
#endregion

#region Invoice
public record CreateInvoiceDto(
    Guid? ClientId,
    string ClientName,
    string? ClientEmail,
    string? ClientPhone,
    string? ClientAddress,
    DateTime DueDate,
    Currency Currency,
    List<InvoiceItemDto> Items,
    decimal TaxRate,
    decimal DiscountAmount,
    string? Notes,
    string? Terms
);

public record InvoiceItemDto(
    string Description,
    decimal Quantity,
    decimal UnitPrice
);

public record InvoiceResponseDto(
    Guid Id,
    string InvoiceNumber,
    Guid? ClientId,
    string ClientName,
    string? ClientEmail,
    string? ClientPhone,
    string? ClientAddress,
    DateTime InvoiceDate,
    DateTime DueDate,
    Currency Currency,
    InvoiceStatus Status,
    decimal Subtotal,
    decimal TaxRate,
    decimal TaxAmount,
    decimal DiscountAmount,
    decimal Total,
    string? Notes,
    string? Terms,
    List<InvoiceItemResponseDto> Items
);

public record InvoiceItemResponseDto(
    Guid Id,
    string Description,
    decimal Quantity,
    decimal UnitPrice,
    decimal Amount
);

public record UpdateInvoiceStatusDto(InvoiceStatus Status);
#endregion

#region Reconciliation

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

#endregion

#region Reports
public record DailyReportDto(
    DateTime Date,
    OpeningBalancesDto OpeningBalances,
    TransactionSummaryDto TransactionSummary,
    ClosingBalancesDto ClosingBalances,
    List<TransactionResponseDto> Transactions
);

public record OpeningBalancesDto(
    decimal CashKES,
    decimal CashUSD,
    decimal BankKES,
    decimal BankUSD,
    decimal Mpesa,                                   // home-currency wallets only
    List<CurrencyCashBankDto>? ByCurrency = null,
    List<CurrencyAmountDto>? MobileMoneyByCurrency = null
);

public record ClosingBalancesDto(
    decimal CashKES,
    decimal CashUSD,
    decimal BankKES,
    decimal BankUSD,
    decimal Mpesa,                                   // home-currency wallets only
    List<CurrencyCashBankDto>? ByCurrency = null,
    List<CurrencyAmountDto>? MobileMoneyByCurrency = null
);

public record ClientBalanceReportDto(
    List<ClientBalanceItemDto> Clients,
    decimal TotalDebitKES,
    decimal TotalDebitUSD,
    decimal TotalCreditKES,
    decimal TotalCreditUSD,
    List<CurrencyFlowTotalsDto>? ByCurrency = null   // TotalDebit = owed by clients, TotalCredit = owed to clients
);

public record ClientBalanceItemDto(
    Guid Id,
    string Name,
    string WhatsAppNumber,
    decimal BalanceKES,
    decimal BalanceUSD,
    string BalanceType,
    List<CurrencyAmountDto>? OtherBalances = null
);

public record AccountSummaryReportDto(
    List<CashAccountResponseDto> CashAccounts,
    List<BankAccountResponseDto> BankAccounts,
    List<MpesaAgentResponseDto> MpesaAgents,
    decimal TotalCashKES,
    decimal TotalCashUSD,
    decimal TotalBankKES,
    decimal TotalBankUSD,
    decimal TotalMpesa,                              // home-currency wallets only
    List<CurrencyCashBankDto>? ByCurrency = null,
    List<CurrencyAmountDto>? MobileMoneyByCurrency = null
);

public record ReportFilterDto(
    DateTime? StartDate,
    DateTime? EndDate,
    TransactionType? TransactionType,
    Currency? Currency,
    AccountType? AccountType,
    ReconciliationStatus? ReconciliationStatus = null
);
#endregion

#region Dashboard
public record DashboardStatsDto(
    decimal CashKES,
    decimal CashUSD,
    decimal TotalMpesa,
    decimal TotalBankKES,
    decimal TotalBankUSD,
    TransactionSummaryDto TodayTransactions,
    ExchangeRateResponseDto? CurrentExchangeRate,
    List<TransactionResponseDto> RecentTransactions,
    List<CurrencyCashBankDto>? ByCurrency = null,
    List<CurrencyAmountDto>? MobileMoneyByCurrency = null   // TotalMpesa = home-currency wallets only
);

public record SuperAdminDashboardDto(
    int TotalCompanies,
    int ActiveCompanies,
    int InactiveCompanies,
    int TotalTransactionsToday,
    List<SystemLogResponseDto> RecentErrors,
    List<CompanySummaryDto> Companies
);

public record SystemLogResponseDto(
    Guid Id,
    string Level,
    string Source,
    string Message,
    Guid? CompanyId,
    DateTime CreatedAt,
    DateTime? ResolvedAt = null
);
#endregion

#region Statement
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

#endregion

#region Admin
public record AdminLoginHistoryDto(
    Guid Id,
    Guid? CompanyId,
    string? CompanyName,
    Guid? UserId,
    string? UserName,
    UserRole UserRole,
    string IpAddress,
    string? Location,
    bool IsSuccessful,
    string? FailureReason,
    DateTime LoginAt
);

public record AdminAuditLogDto(
    Guid Id,
    Guid? CompanyId,
    string? CompanyName,
    Guid? UserId,
    string? UserName,
    AuditAction Action,
    string EntityType,
    Guid? EntityId,
    string? OldValues,
    string? NewValues,
    DateTime CreatedAt
);

public record AdminResetPasswordDto(string NewPassword);
#endregion
// =====================================================
// ADD TO: SARIFF.Core/DTOs/DTOs.cs
// Add these DTOs in the #region Admin section or create new #region SuperAdmin
// =====================================================

#region SuperAdmin Extended

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

#endregion

#region Exchange Float (Forex Bureau Operations)

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

#endregion
// ==================== BALANCE ALERT DTOs ====================
public record CreateBalanceAlertDto(
    Guid? ClientId,
    int Currency,       // 0=KES, 1=USD
    int Direction,      // 0=Below, 1=Above
    decimal Threshold,
    bool NotifyAllOfficeUsers = true
);

public record BalanceAlertRuleDto(
    Guid Id,
    Guid CompanyId,
    Guid? ClientId,
    string? ClientName,
    int Currency,
    int Direction,
    decimal Threshold,
    bool IsActive,
    bool NotifyAllOfficeUsers,
    DateTime? LastTriggeredAt,
    DateTime CreatedAt
);

// ==================== TRANSACTION PIN DTOs ====================
public record SetTransactionPinDto(string Pin, Guid? CompanyId = null);
public record VerifyTransactionPinDto(string Pin);
public record TransactionPinStatusDto(bool IsEnabled, bool HasPin);

/// <summary>One bureau's line in the legacy exchange-profit correction.</summary>
public record LegacyProfitCorrectionDto(
    Guid CompanyId,
    string CompanyName,
    int BuyExchangesCorrected,
    decimal ProfitRemoved,
    decimal FloatProfitBefore,
    decimal FloatProfitAfter,
    string? Warning);

#region Client identity (one login, several bureaus)
public record IdentityRequestCodeDto(string Phone);
public record IdentityVerifyCodeDto(string Phone, string Code, string? DeviceId = null, string? DeviceName = null);
public record IdentityDeviceLoginDto(string Phone, string DeviceId);
public record IdentityLinkDto(string ClientCode, string Password);
public record IdentitySelectDto(Guid CompanyId);

/// <summary>A bureau the signed-in phone is linked to. Only ever shown to that client.</summary>
public record IdentityBureauDto(Guid CompanyId, string CompanyName, string? LogoUrl, string ClientCode, string ClientName, Currency BaseCurrency);

/// <summary>The limited phone-login token: it can list, link and pick bureaus, nothing else.</summary>
public record IdentityTokenDto(string AccessToken, DateTime ExpiresAt, string Phone, bool DeviceTrusted, List<IdentityBureauDto> Bureaus);
#endregion
