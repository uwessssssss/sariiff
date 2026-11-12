using SARIFF.Core.Enums;
using System.ComponentModel.DataAnnotations;

namespace SARIFF.Core.Entities;

/// <summary>
/// Client Alert/Notification entity for Client Portal
/// </summary>
public class ClientAlert : BaseEntity
{
    public Guid ClientId { get; set; }  // References User.Id where Role = Client
    public Guid CompanyId { get; set; }
    public string Type { get; set; } = "info";  // success, info, warning, error
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public bool IsRead { get; set; } = false;
    public DateTime? ReadAt { get; set; }
    public Guid? RelatedTransactionId { get; set; }
}

// ==================== BALANCE ALERT RULES ====================
/// <summary>
/// Rules that trigger push notifications when client balances cross thresholds
/// </summary>
public class BalanceAlertRule : BaseEntity
{
    public Guid CompanyId { get; set; }
    public Guid? ClientId { get; set; }        // null = applies to ALL clients
    public string? ClientName { get; set; }     // Cached for display
    public Currency Currency { get; set; }
    public BalanceAlertDirection Direction { get; set; }
    public decimal Threshold { get; set; }
    public bool IsActive { get; set; } = true;
    public bool NotifyAllOfficeUsers { get; set; } = true;
    public DateTime? LastTriggeredAt { get; set; }
    public Guid CreatedByUserId { get; set; }
}

public enum BalanceAlertDirection
{
    Below = 0,
    Above = 1
}
