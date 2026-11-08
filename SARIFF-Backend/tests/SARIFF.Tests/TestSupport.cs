using Microsoft.EntityFrameworkCore;
using Npgsql;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Data;
using Xunit;

namespace SARIFF.Tests;

internal static class TestSetup
{
    /// <summary>Same Npgsql timestamp mode as Program.cs, so the test database matches production.</summary>
    [System.Runtime.CompilerServices.ModuleInitializer]
    internal static void Init() => AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);
}

/// <summary>Fresh, isolated in-memory database per call.</summary>
public static class TestDb
{
    public static DbContextOptions<AppDbContext> InMemoryOptions(string? name = null) =>
        new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(name ?? Guid.NewGuid().ToString())
            // The services wrap money moves in BeginTransactionAsync; the in-memory
            // provider has no transactions and would otherwise throw on that call.
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;

    public static AppDbContext InMemory(string? name = null) => new(InMemoryOptions(name));

    public static Transaction Txn(
        DateTime date,
        TransactionType type,
        decimal amount,
        Currency currency,
        AccountType sourceType, Guid sourceId,
        AccountType destType, Guid destId,
        decimal? counterAmount = null,
        Currency? counterCurrency = null,
        string? reference = null,
        Guid? companyId = null) => new()
    {
        Code = "TXN-" + Guid.NewGuid().ToString("N")[..8],
        CompanyId = companyId ?? Guid.Empty,
        Reference = reference ?? "REF",
        Description = "test",
        TransactionDate = date,
        CreatedAt = date,
        TransactionType = type,
        Amount = amount,
        Currency = currency,
        CounterAmount = counterAmount,
        CounterCurrency = counterCurrency,
        SourceAccountType = sourceType,
        SourceAccountId = sourceId,
        DestAccountType = destType,
        DestAccountId = destId,
    };
}

/// <summary>
/// A [Fact] that runs only when SARIFF_TEST_PG holds a PostgreSQL connection string
/// (any database on that server; each run creates and drops its own database).
/// </summary>
public sealed class PostgresFactAttribute : FactAttribute
{
    public const string EnvVar = "SARIFF_TEST_PG";

    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(EnvVar)))
            Skip = $"Set {EnvVar} to a PostgreSQL connection string to run the database tests.";
    }
}

/// <summary>Creates a throwaway PostgreSQL database from the real model, drops it afterwards.</summary>
public sealed class PostgresDatabase : IAsyncLifetime
{
    public string ConnectionString { get; private set; } = "";
    public bool Available { get; private set; }

    public DbContextOptions<AppDbContext> Options =>
        new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(ConnectionString).Options;

    public AppDbContext NewContext() => new(Options);

    public async Task InitializeAsync()
    {
        var baseCs = Environment.GetEnvironmentVariable(PostgresFactAttribute.EnvVar);
        if (string.IsNullOrWhiteSpace(baseCs)) return;
        var builder = new NpgsqlConnectionStringBuilder(baseCs) { Database = "sariff_test_" + Guid.NewGuid().ToString("N")[..12] };
        ConnectionString = builder.ConnectionString;
        await using var ctx = NewContext();
        await ctx.Database.EnsureCreatedAsync();
        Available = true;
    }

    public async Task DisposeAsync()
    {
        if (!Available) return;
        await using var ctx = NewContext();
        await ctx.Database.EnsureDeletedAsync();
    }
}
