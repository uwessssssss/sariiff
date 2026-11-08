using Microsoft.EntityFrameworkCore;
using SARIFF.Core.Entities;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Server-side half of the transaction PIN.
///
/// A correct PIN stores a short-lived approval (PinGrant) for that user. A gated action
/// (post/reverse a transaction, create/void an exchange) CLAIMS the approval before it
/// runs — deleting the row, so two requests sent at the same moment can't both use one
/// PIN entry — and gets it back if the action fails (a typo in the form shouldn't cost
/// the PIN). Wrong PINs are counted on the bureau's row and lock verification for a while.
///
/// Everything lives in the database, so it survives restarts and works with more than
/// one API instance. (It used to be in server memory.)
/// </summary>
public static class PinGate
{
    public static readonly TimeSpan GrantLifetime = TimeSpan.FromMinutes(3);
    public const int MaxFailures = 5;
    public static readonly TimeSpan FailureWindow = TimeSpan.FromMinutes(15);

    /// <summary>Record a correct PIN: one approval for this user, and the failure count reset.</summary>
    public static async Task GrantAsync(AppDbContext db, Company company, Guid userId, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;

        // Housekeeping: expired approvals are useless; drop them as we go.
        var expired = await db.PinGrants.Where(g => g.ExpiresAt <= now).ToListAsync();
        db.PinGrants.RemoveRange(expired);

        var existing = await db.PinGrants.FirstOrDefaultAsync(g => g.CompanyId == company.Id && g.UserId == userId && g.ExpiresAt > now);
        if (existing != null) existing.ExpiresAt = now + GrantLifetime;
        else db.PinGrants.Add(new PinGrant { CompanyId = company.Id, UserId = userId, ExpiresAt = now + GrantLifetime, CreatedAt = now });

        company.PinFailedAttempts = 0;
        company.PinFailuresSince = null;

        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException)
        {
            // Two correct PINs at the same instant: the other request's approval stands.
            db.ChangeTracker.Clear();
        }
    }

    /// <summary>Is there a live approval? (Read-only; used by tests and diagnostics.)</summary>
    public static Task<bool> HasGrantAsync(AppDbContext db, Guid companyId, Guid userId, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        return db.PinGrants.AnyAsync(g => g.CompanyId == companyId && g.UserId == userId && g.ExpiresAt > now);
    }

    /// <summary>Take the approval for one action. False when there is none (or another request just took it).</summary>
    public static async Task<bool> ClaimAsync(AppDbContext db, Guid companyId, Guid userId, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        var grant = await db.PinGrants.FirstOrDefaultAsync(g => g.CompanyId == companyId && g.UserId == userId);
        if (grant == null) return false;

        var live = grant.ExpiresAt > now;
        db.PinGrants.Remove(grant);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            db.ChangeTracker.Clear(); // a parallel request deleted it first: that one owns it
            return false;
        }
        return live;
    }

    /// <summary>Give the approval back after the gated action failed.</summary>
    public static async Task RestoreAsync(AppDbContext db, Guid companyId, Guid userId, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        // The failed action may have left half-made changes tracked; none of them may be saved.
        db.ChangeTracker.Clear();
        if (await db.PinGrants.AnyAsync(g => g.CompanyId == companyId && g.UserId == userId)) return;
        db.PinGrants.Add(new PinGrant { CompanyId = companyId, UserId = userId, ExpiresAt = now + GrantLifetime, CreatedAt = now });
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { db.ChangeTracker.Clear(); }
    }

    /// <summary>Minutes left on a lockout, or null when the bureau may try again.</summary>
    public static int? LockedMinutes(Company company, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        if (company.PinFailuresSince is not { } since || now - since > FailureWindow) return null;
        return company.PinFailedAttempts >= MaxFailures
            ? (int)Math.Ceiling((since + FailureWindow - now).TotalMinutes)
            : null;
    }

    /// <summary>Count one wrong PIN on the bureau (the caller saves).</summary>
    public static void RecordFailure(Company company, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        if (company.PinFailuresSince is not { } since || now - since > FailureWindow)
        {
            company.PinFailuresSince = now;
            company.PinFailedAttempts = 1;
        }
        else
        {
            company.PinFailedAttempts++;
        }
    }
}
