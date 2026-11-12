using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

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
