using SARIFF.Core.Enums;
using System.ComponentModel.DataAnnotations;

namespace SARIFF.Core.Entities;

/// <summary>
/// Audit Log (PDF Section 9.1)
/// </summary>
public class AuditLog : BaseEntity
{
    public Guid? CompanyId { get; set; }
    public Guid? UserId { get; set; }
    public UserRole? UserRole { get; set; }
    public AuditAction Action { get; set; }
    public string EntityType { get; set; } = string.Empty;
    public Guid? EntityId { get; set; }
    public string? OldValues { get; set; }
    public string? NewValues { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
}

/// <summary>
/// Notification Log for WhatsApp messages
/// </summary>
public class NotificationLog : BaseEntity
{
    public Guid? CompanyId { get; set; }
    public Guid? UserId { get; set; }
    public NotificationType NotificationType { get; set; }
    public string RecipientPhone { get; set; } = string.Empty;
    public string MessageContent { get; set; } = string.Empty;
    public bool IsSent { get; set; } = false;
    public DateTime? SentAt { get; set; }
    public string? ErrorMessage { get; set; }
    public string? ProviderMessageId { get; set; }
}

/// <summary>
/// System Log for errors and monitoring (PDF Section 6.2)
/// </summary>
public class SystemLog : BaseEntity
{
    public string Level { get; set; } = string.Empty; // Error, Warning, Info
    public string Source { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? StackTrace { get; set; }
    public Guid? CompanyId { get; set; }
    public Guid? UserId { get; set; }
    public string? IpAddress { get; set; }
    public string? RequestPath { get; set; }
    public string? RequestMethod { get; set; }
    /// <summary>Set by a super admin once the cause is fixed. Resolved entries stay
    /// in the log (evidence) but no longer count towards health or error totals.</summary>
    public DateTime? ResolvedAt { get; set; }
    public Guid? ResolvedByUserId { get; set; }
}
