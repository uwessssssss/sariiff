using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

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
