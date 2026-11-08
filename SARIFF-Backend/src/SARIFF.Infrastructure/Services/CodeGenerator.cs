using Microsoft.EntityFrameworkCore;
using Npgsql;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;


public static class CodeGenerator
{
    private static readonly SemaphoreSlim _lock = new(1, 1);
    
    // FIX: Track the last generated sequence per prefix to prevent duplicates
    // when multiple codes are generated before SaveChanges
    private static readonly Dictionary<string, int> _lastGenerated = new();

    /// <summary>
    /// Auto-generate company code prefix from company name.
    /// Skips common words, takes first letter of remaining words.
    /// Examples: "Alpha Forex Bureau Ltd" → "AFB", "Sariff Exchange" → "SE"
    /// </summary>
    public static string GenerateCodePrefix(string companyName)
    {
        var skipWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "limited", "ltd", "inc", "incorporated", "llc", "plc", "corp", "corporation",
              "and", "the", "of", "for", "company", "co", "group" };
        
        var words = companyName.Split(new[] { ' ', '-', '_', '.' }, StringSplitOptions.RemoveEmptyEntries)
            .Where(w => !skipWords.Contains(w))
            .ToArray();

        string prefix;
        if (words.Length == 0)
            prefix = companyName.Length >= 2 ? companyName.Substring(0, 2) : companyName;
        else if (words.Length == 1)
            prefix = words[0].Length >= 3 ? words[0].Substring(0, 3) : words[0];
        else
            prefix = string.Concat(words.Select(w => w[0]));
        
        // Cap at 3 characters, uppercase
        prefix = prefix.Length > 3 ? prefix.Substring(0, 3) : prefix;
        prefix = prefix.ToUpper();
        
        // Ensure it doesn't conflict with reserved prefixes
        if (prefix == "SA" || prefix == "CL")
            prefix = prefix + "X";
        
        return prefix;
    }

    /// <summary>
    /// Get next sequence: max of DB value and in-memory last generated
    /// </summary>
    private static int GetNextSequence(string cacheKey, int dbMax)
    {
        int memMax = _lastGenerated.ContainsKey(cacheKey) ? _lastGenerated[cacheKey] : 0;
        int next = Math.Max(dbMax, memMax) + 1;
        _lastGenerated[cacheKey] = next;
        return next;
    }

    private const string NextSql = @"
INSERT INTO ""CodeCounters"" (""Scope"", ""Value"", ""UpdatedAt"")
VALUES (@scope, @seed, now())
ON CONFLICT (""Scope"") DO UPDATE
    SET ""Value"" = GREATEST(""CodeCounters"".""Value"" + 1, EXCLUDED.""Value""),
        ""UpdatedAt"" = now()
RETURNING ""Value"";";

    /// <summary>
    /// Next number in a code series, safe across any number of API instances.
    ///
    /// PostgreSQL: one atomic upsert on CodeCounters. The seed is the highest number
    /// already used + 1, so existing data continues where it left off and a counter
    /// that falls behind (rows imported by hand) heals itself. It runs on its own short
    /// connection, outside the caller's transaction: no counter lock is held while the
    /// request updates balances (no lock-order deadlocks), at the cost of a skipped number
    /// if that request later fails. Numbers are never handed out twice.
    ///
    /// Other providers (the in-memory test database): the original in-process lock.
    /// </summary>
    internal static async Task<int> NextAsync(AppDbContext context, string scope, int dbMax)
    {
        var connectionString = context.Database.IsNpgsql() ? context.Database.GetConnectionString() : null;
        if (!string.IsNullOrEmpty(connectionString))
        {
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(NextSql, connection);
            command.Parameters.AddWithValue("scope", scope);
            command.Parameters.AddWithValue("seed", (long)dbMax + 1);
            var value = Convert.ToInt64(await command.ExecuteScalarAsync());
            return checked((int)value);
        }

        await _lock.WaitAsync();
        try { return GetNextSequence(scope, dbMax); }
        finally { _lock.Release(); }
    }

    /// <summary>
    /// Generate transaction code: TXN-{YEAR}-{SEQUENCE}
    /// Number comes from NextAsync: unique across API instances.
    /// </summary>
    public static async Task<string> GenerateTransactionCodeAsync(AppDbContext context, Guid companyId)
    {
        var year = BureauClock.TodayLocal.Year; // the bureau's year (codes roll over at local midnight)
        var prefix = $"TXN-{year}-";
        var cacheKey = $"{companyId}_{prefix}";
        
        // Get the max sequence number from existing codes
        var maxCode = await context.Transactions.IgnoreQueryFilters()
            .Where(t => t.CompanyId == companyId && t.Code.StartsWith(prefix))
            .Select(t => t.Code)
            .OrderByDescending(c => c!.Length).ThenByDescending(c => c) // numeric order: "10000" > "9999"
            .FirstOrDefaultAsync();

        int dbMax = 0;
        if (maxCode != null)
        {
            var sequencePart = maxCode.Substring(prefix.Length);
            if (int.TryParse(sequencePart, out int currentMax))
                dbMax = currentMax;
        }

        int nextSequence = await NextAsync(context, cacheKey, dbMax);
        return $"{prefix}{nextSequence:D6}";
    }

    /// <summary>
    /// Generate client code: {PREFIX}-CL-{YEAR}-{SEQUENCE}
    /// Example: FB-CL-2026-0001 for Alpha Forex Bureau
    /// Falls back to CL-{YEAR}-{SEQ} if no prefix provided
    /// </summary>
    public static async Task<string> GenerateClientCodeAsync(AppDbContext context, Guid companyId, string? companyPrefix = null)
    {
        var year = BureauClock.TodayLocal.Year; // the bureau's year (codes roll over at local midnight)
        var prefix = string.IsNullOrEmpty(companyPrefix) 
            ? $"CL-{year}-" 
            : $"{companyPrefix}-CL-{year}-";
        var cacheKey = $"{companyId}_{prefix}";
        
        var maxCode = await context.Users.IgnoreQueryFilters()
            .Where(u => u.CompanyId == companyId && u.Code != null && u.Code.Contains($"-CL-{year}-"))
            .Select(u => u.Code)
            .OrderByDescending(c => c!.Length).ThenByDescending(c => c) // numeric order: "10000" > "9999"
            .FirstOrDefaultAsync();

        int dbMax = 0;
        if (maxCode != null)
        {
            // Extract sequence from end of code: "FB-CL-2026-0001" → "0001"
            var lastDash = maxCode.LastIndexOf('-');
            if (lastDash >= 0)
            {
                var sequencePart = maxCode.Substring(lastDash + 1);
                if (int.TryParse(sequencePart, out int currentMax))
                    dbMax = currentMax;
            }
        }

        int nextSequence = await NextAsync(context, cacheKey, dbMax);
        return $"{prefix}{nextSequence:D4}";
    }

    /// <summary>
    /// Generate company code: {PREFIX}-{YEAR}-{SEQUENCE}
    /// Sequence is GLOBAL across all companies (not per-prefix)
    /// Example: AFB-2026-0001, ASW-2026-0002, KMT-2026-0003
    /// </summary>
    public static async Task<string> GenerateCompanyCodeAsync(AppDbContext context, string? companyPrefix = null)
    {
        var year = BureauClock.TodayLocal.Year; // the bureau's year (codes roll over at local midnight)
        var codePrefix = string.IsNullOrEmpty(companyPrefix) ? "CO" : companyPrefix;
        var yearPart = $"-{year}-";
        var cacheKey = $"company_global_{year}";
        
        // Search ALL companies for this year — global sequence
        var allCodes = await context.Companies.IgnoreQueryFilters()
            .Where(c => c.Code.Contains(yearPart))
            .Select(c => c.Code)
            .ToListAsync();

        int dbMax = 0;
        foreach (var code in allCodes)
        {
            var lastDash = code.LastIndexOf('-');
            if (lastDash >= 0)
            {
                var sequencePart = code.Substring(lastDash + 1);
                if (int.TryParse(sequencePart, out int seq) && seq > dbMax)
                    dbMax = seq;
            }
        }

        int nextSequence = await NextAsync(context, cacheKey, dbMax);
        return $"{codePrefix}-{year}-{nextSequence:D4}";
    }

    /// <summary>
    /// Generate bank account code: BA-{YEAR}-{SEQUENCE}
    /// </summary>
    public static async Task<string> GenerateBankAccountCodeAsync(AppDbContext context, Guid companyId)
    {
        var year = BureauClock.TodayLocal.Year; // the bureau's year (codes roll over at local midnight)
        var prefix = $"BA-{year}-";
        var cacheKey = $"{companyId}_{prefix}";
        
        var maxCode = await context.BankAccounts.IgnoreQueryFilters()
            .Where(b => b.CompanyId == companyId && b.Code.StartsWith(prefix))
            .Select(b => b.Code)
            .OrderByDescending(c => c!.Length).ThenByDescending(c => c) // numeric order: "10000" > "9999"
            .FirstOrDefaultAsync();

        int dbMax = 0;
        if (maxCode != null)
        {
            var sequencePart = maxCode.Substring(prefix.Length);
            if (int.TryParse(sequencePart, out int currentMax))
                dbMax = currentMax;
        }

        int nextSequence = await NextAsync(context, cacheKey, dbMax);
        return $"{prefix}{nextSequence:D3}";
    }

    /// <summary>
    /// Generate M-Pesa agent code: MP-{YEAR}-{SEQUENCE}
    /// </summary>
    public static async Task<string> GenerateMpesaAgentCodeAsync(AppDbContext context, Guid companyId)
    {
        var year = BureauClock.TodayLocal.Year; // the bureau's year (codes roll over at local midnight)
        var prefix = $"MP-{year}-";
        var cacheKey = $"{companyId}_{prefix}";
        
        var maxCode = await context.MpesaAgents.IgnoreQueryFilters()
            .Where(m => m.CompanyId == companyId && m.Code.StartsWith(prefix))
            .Select(m => m.Code)
            .OrderByDescending(c => c!.Length).ThenByDescending(c => c) // numeric order: "10000" > "9999"
            .FirstOrDefaultAsync();

        int dbMax = 0;
        if (maxCode != null)
        {
            var sequencePart = maxCode.Substring(prefix.Length);
            if (int.TryParse(sequencePart, out int currentMax))
                dbMax = currentMax;
        }

        int nextSequence = await NextAsync(context, cacheKey, dbMax);
        return $"{prefix}{nextSequence:D3}";
    }

    /// <summary>
    /// Generate expense code: EXP-{YEAR}-{SEQUENCE}
    /// </summary>
    public static async Task<string> GenerateExpenseCodeAsync(AppDbContext context, Guid companyId)
    {
        var year = BureauClock.TodayLocal.Year; // the bureau's year (codes roll over at local midnight)
        var prefix = $"EXP-{year}-";
        var cacheKey = $"{companyId}_{prefix}";
        
        var maxCode = await context.Expenses.IgnoreQueryFilters()
            .Where(e => e.CompanyId == companyId && e.Code.StartsWith(prefix))
            .Select(e => e.Code)
            .OrderByDescending(c => c!.Length).ThenByDescending(c => c) // numeric order: "10000" > "9999"
            .FirstOrDefaultAsync();

        int dbMax = 0;
        if (maxCode != null)
        {
            var sequencePart = maxCode.Substring(prefix.Length);
            if (int.TryParse(sequencePart, out int currentMax))
                dbMax = currentMax;
        }

        int nextSequence = await NextAsync(context, cacheKey, dbMax);
        return $"{prefix}{nextSequence:D5}";
    }

    /// <summary>
    /// Generate invoice number: INV-{YEAR}-{SEQUENCE}
    /// </summary>
    public static async Task<string> GenerateInvoiceNumberAsync(AppDbContext context, Guid companyId)
    {
        var year = BureauClock.TodayLocal.Year; // the bureau's year (codes roll over at local midnight)
        var prefix = $"INV-{year}-";
        var cacheKey = $"{companyId}_{prefix}";
        
        var maxCode = await context.Invoices.IgnoreQueryFilters()
            .Where(i => i.CompanyId == companyId && i.InvoiceNumber.StartsWith(prefix))
            .Select(i => i.InvoiceNumber)
            .OrderByDescending(c => c!.Length).ThenByDescending(c => c) // numeric order: "10000" > "9999"
            .FirstOrDefaultAsync();

        int dbMax = 0;
        if (maxCode != null)
        {
            var sequencePart = maxCode.Substring(prefix.Length);
            if (int.TryParse(sequencePart, out int currentMax))
                dbMax = currentMax;
        }

        int nextSequence = await NextAsync(context, cacheKey, dbMax);
        return $"{prefix}{nextSequence:D4}";
    }

    /// <summary>
    /// Generate Super Admin code: SA-{YEAR}-{SEQUENCE}
    /// </summary>
    public static async Task<string> GenerateSuperAdminCodeAsync(AppDbContext context)
    {
        var year = BureauClock.TodayLocal.Year; // the bureau's year (codes roll over at local midnight)
        var prefix = $"SA-{year}-";
        
        var maxCode = await context.Users.IgnoreQueryFilters()
            .Where(u => u.Role == Core.Enums.UserRole.SuperAdmin && u.Code != null && u.Code.StartsWith(prefix))
            .Select(u => u.Code)
            .OrderByDescending(c => c!.Length).ThenByDescending(c => c) // numeric order: "10000" > "9999"
            .FirstOrDefaultAsync();

        int dbMax = 0;
        if (maxCode != null)
        {
            var sequencePart = maxCode.Substring(prefix.Length);
            if (int.TryParse(sequencePart, out int currentMax))
                dbMax = currentMax;
        }

        int nextSequence = await NextAsync(context, prefix, dbMax);
        return $"{prefix}{nextSequence:D3}";
    }
    
    /// <summary>
    /// Generate exchange code: EXC-{YEAR}-{SEQUENCE}
    /// Number comes from NextAsync: unique across API instances.
    /// </summary>
    public static async Task<string> GenerateExchangeCodeAsync(AppDbContext context, Guid companyId)
    {
        var year = BureauClock.TodayLocal.Year; // the bureau's year (codes roll over at local midnight)
        var prefix = $"EXC-{year}-";
        var cacheKey = $"{companyId}_{prefix}";

        var maxCode = await context.ExchangeTransactions.IgnoreQueryFilters()
            .Where(e => e.CompanyId == companyId && e.Code.StartsWith(prefix))
            .Select(e => e.Code)
            .OrderByDescending(c => c!.Length).ThenByDescending(c => c) // numeric order: "10000" > "9999"
            .FirstOrDefaultAsync();

        int dbMax = 0;
        if (maxCode != null)
        {
            var sequencePart = maxCode.Substring(prefix.Length);
            if (int.TryParse(sequencePart, out int currentMax))
                dbMax = currentMax;
        }

        int nextSequence = await NextAsync(context, cacheKey, dbMax);
        return $"{prefix}{nextSequence:D4}";
    }
}