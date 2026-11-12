using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

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
