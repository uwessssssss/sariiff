using SARIFF.Infrastructure.Services;
using Xunit;

namespace SARIFF.Tests;

/// <summary>
/// The multi-server numbering guarantee, against a real PostgreSQL database.
/// Each call uses its own DbContext, the way separate API instances would.
/// </summary>
public class CodeCounterPostgresTests : IClassFixture<PostgresDatabase>
{
    private readonly PostgresDatabase _pg;
    public CodeCounterPostgresTests(PostgresDatabase pg) => _pg = pg;

    private async Task<int> NextAsync(string scope, int dbMax)
    {
        await using var db = _pg.NewContext();
        return await CodeGenerator.NextAsync(db, scope, dbMax);
    }

    [PostgresFact]
    public async Task Two_hundred_parallel_requests_get_two_hundred_different_numbers()
    {
        var scope = "test_" + Guid.NewGuid();
        var numbers = await Task.WhenAll(Enumerable.Range(0, 200).Select(_ => NextAsync(scope, 0)));
        Assert.Equal(200, numbers.Distinct().Count());
        Assert.Equal(Enumerable.Range(1, 200), numbers.OrderBy(n => n));
    }

    [PostgresFact]
    public async Task A_new_series_continues_after_existing_codes()
    {
        var scope = "test_" + Guid.NewGuid();
        Assert.Equal(501, await NextAsync(scope, 500));
        Assert.Equal(502, await NextAsync(scope, 500));
    }

    [PostgresFact]
    public async Task A_counter_behind_the_data_catches_up()
    {
        var scope = "test_" + Guid.NewGuid();
        Assert.Equal(1, await NextAsync(scope, 0));
        // someone imported codes up to 900 by hand
        Assert.Equal(901, await NextAsync(scope, 900));
        Assert.Equal(902, await NextAsync(scope, 900));
    }

    [PostgresFact]
    public async Task Exchange_codes_from_separate_contexts_never_collide()
    {
        var company = Guid.NewGuid();
        var codes = await Task.WhenAll(Enumerable.Range(0, 50).Select(async _ =>
        {
            await using var db = _pg.NewContext();
            return await CodeGenerator.GenerateExchangeCodeAsync(db, company);
        }));
        Assert.Equal(50, codes.Distinct().Count());
    }
}
