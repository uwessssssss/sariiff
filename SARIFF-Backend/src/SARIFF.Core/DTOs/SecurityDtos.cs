using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

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
