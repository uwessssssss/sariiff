using Microsoft.EntityFrameworkCore;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Locks the account rows a posting will change, for the rest of the database transaction.
///
/// Why: a posting reads the balance, works out the new one and writes it back. Two postings
/// on the same till at the same moment both read 600,000 and both wrote 601,000 — one
/// deposit was saved as a transaction but never reached the balance (load test, Nov 2026:
/// 42 deposits recorded, balances moved by 20). With the rows locked first, the second
/// posting waits until the first commits and then reads the new balance.
///
/// Rows are always locked in the same order (type, then id) so two postings that touch the
/// same pair of accounts the other way round cannot deadlock. A client's balances (KES, USD
/// and the per-currency rows) are all guarded by the client's Users row.
/// Only on PostgreSQL inside a transaction; the in-memory test database has no row locks.
/// </summary>
public static class BalanceLock
{
    public static async Task LockAsync(AppDbContext db, params (AccountType Type, Guid Id)[] accounts)
    {
        if (!db.Database.IsNpgsql() || db.Database.CurrentTransaction == null) return;
        foreach (var (type, id) in accounts.Distinct().OrderBy(a => (int)a.Type).ThenBy(a => a.Id))
        {
            var table = type switch
            {
                AccountType.Cash => "CashAccounts",
                AccountType.Bank => "BankAccounts",
                AccountType.Mpesa => "MpesaAgents",
                AccountType.Client => "Users",
                _ => null,
            };
            if (table == null) continue;
#pragma warning disable EF1002 // the table name is one of the constants above, never user input
            await db.Database.ExecuteSqlRawAsync($"SELECT 1 FROM \"{table}\" WHERE \"Id\" = {{0}} FOR UPDATE", id);
#pragma warning restore EF1002
        }
    }
}
