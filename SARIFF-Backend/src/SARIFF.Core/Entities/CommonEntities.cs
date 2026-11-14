using SARIFF.Core.Enums;
using System.ComponentModel.DataAnnotations;

namespace SARIFF.Core.Entities;

/// <summary>
/// Base entity with common audit fields
/// </summary>
public abstract class BaseEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool IsDeleted { get; set; } = false;
}

/// <summary>
/// Base entity with custom readable ID (e.g., CL-2025-001)
/// </summary>
public abstract class BaseEntityWithCode : BaseEntity
{
    public string Code { get; set; } = string.Empty;
}

/// <summary>
/// Remembers a mutating request by its Idempotency-Key so a retry (network
/// drop, timeout, double tap) returns the first result instead of moving
/// money twice. Rows older than 24 hours are pruned.
/// </summary>
public class IdempotencyRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Scope { get; set; } = string.Empty;   // user or company id
    public string Key { get; set; } = string.Empty;     // client-generated UUID
    public string Method { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public bool Completed { get; set; }
    public int StatusCode { get; set; }
    public string? ResponseBody { get; set; }
    public string? ContentType { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Next number for a code series ("{companyId}_TXN-2026-", "company_global_2026", ...).
/// Incremented with one atomic INSERT ... ON CONFLICT ... RETURNING, so any number
/// of API instances can generate codes without handing out the same one twice.
/// </summary>
public class CodeCounter
{
    public string Scope { get; set; } = string.Empty;
    public long Value { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
