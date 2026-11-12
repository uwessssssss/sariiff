using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

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
