using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

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
