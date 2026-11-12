using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

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
