using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;

namespace SARIFF.Infrastructure.Data;

/// <summary>Who is acting right now (the API fills it from the signed-in request).</summary>
public interface IAuditContext
{
    Guid? UserId { get; }
    Guid? CompanyId { get; }
    string? Role { get; }
    string? IpAddress { get; }
    string? UserAgent { get; }
}

/// <summary>
/// The audit trail: every create, change and delete of a financial record is written to
/// AuditLogs in the same database transaction — who (user, role, bureau, IP), what
/// (record type and id), how (old → new values) and when.
///
/// Before (found Nov 2026) only three actions were ever audited (cash-balance edit,
/// suspending a bureau, password reset): posting, reversing and voiding money left no
/// trail. Doing it here, once, means no service can forget.
///
/// Not logged: secrets (password / PIN / token hashes); balance-only updates of accounts
/// (the Transaction rows that caused them are logged); housekeeping tables (sessions,
/// codes, login history, the audit log itself).
/// </summary>
public sealed class AuditInterceptor : SaveChangesInterceptor
{
    private static readonly HashSet<Type> Audited = new()
    {
        typeof(Transaction), typeof(ExchangeTransaction), typeof(Expense), typeof(ExpenseCategory),
        typeof(User), typeof(Company), typeof(CashAccount), typeof(BankAccount), typeof(MpesaAgent),
        typeof(Invoice), typeof(Reconciliation), typeof(ExchangeRate), typeof(FloatMovement),
        typeof(SubscriptionPayment), typeof(BlockedIP), typeof(AdminIpWhitelist), typeof(BalanceAlertRule),
        typeof(TrustedDevice), typeof(ClientIdentity),
    };
    private static readonly HashSet<string> Secret = new(StringComparer.OrdinalIgnoreCase)
    {
        "PasswordHash", "TransactionPinHash", "RefreshTokenHash", "DeviceIdHash", "Code_Hash",
    };
    // Changes that are the RESULT of a logged transaction, not a separate action.
    private static readonly HashSet<string> BalanceOnly = new(StringComparer.OrdinalIgnoreCase)
    {
        "Balance", "BalanceKES", "BalanceUSD", "UpdatedAt", "LastActivityAt", "LastLoginAt", "FailedLoginAttempts",
        "LockedUntil", "LastUsedAt", "FailedOtpAttempts", "KesBalance", "UsdBalance",
    };

    private readonly IAuditContext? _who;
    public AuditInterceptor(IAuditContext? who) => _who = who;

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        Collect(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Collect(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    private void Collect(DbContext? db)
    {
        if (db == null) return;
        try
        {
            Guid? actor = _who?.UserId;
            Guid? actorCompany = _who?.CompanyId;
            UserRole? role = Enum.TryParse<UserRole>(_who?.Role, out var r) ? r : null;
            var ip = _who?.IpAddress;
            var agent = _who?.UserAgent;
            if (agent is { Length: > 250 }) agent = agent[..250];

            var logs = new List<AuditLog>();
            foreach (var e in db.ChangeTracker.Entries().ToList())
            {
                if (e.Entity is not BaseEntity entity || !Audited.Contains(e.Entity.GetType())) continue;
                if (e.State is not (EntityState.Added or EntityState.Modified or EntityState.Deleted)) continue;

                AuditAction action;
                Dictionary<string, object?>? oldV = null, newV = null;
                if (e.State == EntityState.Added)
                {
                    action = AuditAction.Create;
                    newV = Values(e, p => p.CurrentValue);
                }
                else if (e.State == EntityState.Deleted)
                {
                    action = AuditAction.Delete;
                    oldV = Values(e, p => p.OriginalValue);
                }
                else
                {
                    var changed = e.Properties.Where(p => p.IsModified && !Equals(p.OriginalValue, p.CurrentValue)).ToList();
                    if (changed.Count == 0 || changed.All(p => BalanceOnly.Contains(p.Metadata.Name))) continue;
                    var softDelete = changed.Any(p => p.Metadata.Name == nameof(BaseEntity.IsDeleted) && p.CurrentValue is true);
                    action = softDelete ? AuditAction.Delete : AuditAction.Update;
                    // a password / PIN change is recorded, its value never is
                    oldV = changed.ToDictionary(p => p.Metadata.Name, p => Secret.Contains(p.Metadata.Name) ? "(hidden)" : p.OriginalValue);
                    newV = changed.ToDictionary(p => p.Metadata.Name, p => Secret.Contains(p.Metadata.Name) ? "(changed)" : p.CurrentValue);
                }

                var company = e.Properties.FirstOrDefault(p => p.Metadata.Name == "CompanyId")?.CurrentValue as Guid?
                              ?? (e.Entity is Company c ? c.Id : actorCompany);
                logs.Add(new AuditLog
                {
                    CompanyId = company,
                    UserId = actor,
                    UserRole = role,
                    Action = action,
                    EntityType = e.Entity.GetType().Name,
                    EntityId = entity.Id,
                    OldValues = oldV == null ? null : Json(oldV),
                    NewValues = newV == null ? null : Json(newV),
                    IpAddress = ip,
                    UserAgent = agent,
                });
            }
            if (logs.Count > 0) db.Set<AuditLog>().AddRange(logs);
        }
        catch
        {
            // The audit trail must never stop a money operation from saving.
        }
    }

    private static Dictionary<string, object?> Values(EntityEntry e, Func<PropertyEntry, object?> pick) =>
        e.Properties.Where(p => !Secret.Contains(p.Metadata.Name) && p.Metadata.Name is not ("xmin" or "RowVersion"))
            .ToDictionary(p => p.Metadata.Name, p => pick(p));

    // Always valid JSON: long values are shortened instead of cutting the JSON text.
    private static string Json(Dictionary<string, object?> v)
    {
        var s = JsonSerializer.Serialize(v);
        if (s.Length <= 4000) return s;
        var shortV = v.ToDictionary(k => k.Key, k => k.Value?.ToString() is { Length: > 120 } t ? t[..120] + "…" : k.Value);
        s = JsonSerializer.Serialize(shortV);
        return s.Length <= 4000 ? s : JsonSerializer.Serialize(new Dictionary<string, object?> { ["_fields"] = string.Join(",", v.Keys) });
    }
}
