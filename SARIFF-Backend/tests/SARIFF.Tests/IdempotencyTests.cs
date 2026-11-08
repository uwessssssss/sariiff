using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using SARIFF.API.Middleware;
using SARIFF.Core.Entities;
using SARIFF.Infrastructure.Data;
using Xunit;

namespace SARIFF.Tests;

/// <summary>Drives IdempotencyMiddleware with a fake endpoint and a real DbContext.</summary>
internal sealed class IdempotencyHarness
{
    private readonly IServiceProvider _services;
    public int EndpointCalls { get; private set; }
    public int NextStatus { get; set; } = 200;
    public bool NextThrows { get; set; }

    public IdempotencyHarness(Action<DbContextOptionsBuilder> configureDb)
    {
        var services = new ServiceCollection();
        services.AddDbContext<AppDbContext>(configureDb);
        _services = services.BuildServiceProvider();
    }

    public AppDbContext Db() => _services.CreateScope().ServiceProvider.GetRequiredService<AppDbContext>();

    public async Task<(int Status, string Body, bool Replayed)> SendAsync(string method, string path, string? key, Guid? user)
    {
        var middleware = new IdempotencyMiddleware(async ctx =>
        {
            EndpointCalls++;
            if (NextThrows) throw new InvalidOperationException("boom");
            ctx.Response.StatusCode = NextStatus;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.WriteAsync($"{{\"call\":{EndpointCalls}}}");
        }, _services.GetRequiredService<IServiceScopeFactory>(), NullLogger<IdempotencyMiddleware>.Instance);

        var ctx = new DefaultHttpContext();
        ctx.Request.Method = method;
        ctx.Request.Path = path;
        if (key != null) ctx.Request.Headers["Idempotency-Key"] = key;
        if (user != null) ctx.Items["UserId"] = user.Value;
        var body = new MemoryStream();
        ctx.Response.Body = body;

        await middleware.InvokeAsync(ctx);
        return (ctx.Response.StatusCode, Encoding.UTF8.GetString(body.ToArray()), ctx.Response.Headers.ContainsKey("Idempotent-Replay"));
    }
}

public class IdempotencyMiddlewareTests
{
    private static IdempotencyHarness InMemory() { var name = Guid.NewGuid().ToString(); return new IdempotencyHarness(o => o.UseInMemoryDatabase(name)); }

    [Fact]
    public async Task Reads_are_never_intercepted()
    {
        var h = InMemory();
        await h.SendAsync("GET", "/api/client", "k1", Guid.NewGuid());
        await h.SendAsync("GET", "/api/client", "k1", Guid.NewGuid());
        Assert.Equal(2, h.EndpointCalls);
        Assert.Empty(h.Db().IdempotencyRecords);
    }

    [Fact]
    public async Task Writes_without_a_key_run_normally()
    {
        var h = InMemory();
        var r = await h.SendAsync("POST", "/api/transaction", null, Guid.NewGuid());
        Assert.Equal(200, r.Status);
        Assert.Empty(h.Db().IdempotencyRecords);
    }

    [Fact]
    public async Task A_successful_write_is_remembered_with_its_response()
    {
        var h = InMemory();
        var user = Guid.NewGuid();
        var r = await h.SendAsync("POST", "/api/transaction", "key-ok", user);

        Assert.Equal(200, r.Status);
        Assert.Equal("{\"call\":1}", r.Body);
        var rec = Assert.Single(h.Db().IdempotencyRecords);
        Assert.True(rec.Completed);
        Assert.Equal(200, rec.StatusCode);
        Assert.Equal("{\"call\":1}", rec.ResponseBody);
        Assert.Equal(user.ToString(), rec.Scope);
    }

    [Fact]
    public async Task A_rejected_write_releases_the_key_for_a_corrected_retry()
    {
        var h = InMemory();
        h.NextStatus = 400;
        await h.SendAsync("POST", "/api/transaction", "key-400", Guid.NewGuid());
        Assert.Empty(h.Db().IdempotencyRecords);
    }

    [Fact]
    public async Task A_crashed_write_releases_the_key_and_rethrows()
    {
        var h = InMemory();
        h.NextThrows = true;
        await Assert.ThrowsAsync<InvalidOperationException>(() => h.SendAsync("POST", "/api/transaction", "key-boom", Guid.NewGuid()));
        Assert.Empty(h.Db().IdempotencyRecords);
    }

    [Fact]
    public async Task Anonymous_writes_are_not_tracked()
    {
        var h = InMemory();
        await h.SendAsync("POST", "/api/auth/login", "key-anon", null);
        Assert.Empty(h.Db().IdempotencyRecords);
    }
}

/// <summary>
/// Needs PostgreSQL: the in-memory provider does not enforce the unique (Scope, Key)
/// index that duplicate detection relies on.
/// </summary>
public class IdempotencyPostgresTests : IClassFixture<PostgresDatabase>
{
    private readonly PostgresDatabase _pg;
    public IdempotencyPostgresTests(PostgresDatabase pg) => _pg = pg;
    private IdempotencyHarness Harness() => new(o => o.UseNpgsql(_pg.ConnectionString));

    [PostgresFact]
    public async Task Same_key_twice_replays_the_first_response_and_moves_money_once()
    {
        var h = Harness(); var user = Guid.NewGuid();
        var first = await h.SendAsync("POST", "/api/exchange/transaction", "same-key", user);
        var second = await h.SendAsync("POST", "/api/exchange/transaction", "same-key", user);

        Assert.Equal(1, h.EndpointCalls);
        Assert.Equal(first.Body, second.Body);
        Assert.Equal(200, second.Status);
        Assert.True(second.Replayed);
    }

    [PostgresFact]
    public async Task Same_key_on_another_endpoint_is_refused()
    {
        var h = Harness(); var user = Guid.NewGuid();
        await h.SendAsync("POST", "/api/transaction", "reused", user);
        var other = await h.SendAsync("POST", "/api/expense", "reused", user);
        Assert.Equal(422, other.Status);
        Assert.Equal(1, h.EndpointCalls);
    }

    [PostgresFact]
    public async Task Same_key_while_the_first_is_still_running_gets_409()
    {
        var h = Harness(); var user = Guid.NewGuid();
        await using (var db = _pg.NewContext())
        {
            db.IdempotencyRecords.Add(new IdempotencyRecord { Scope = user.ToString(), Key = "in-flight", Method = "POST", Path = "/api/transaction" });
            await db.SaveChangesAsync();
        }
        var r = await h.SendAsync("POST", "/api/transaction", "in-flight", user);
        Assert.Equal(409, r.Status);
        Assert.Equal(0, h.EndpointCalls);
    }

    [PostgresFact]
    public async Task Different_users_may_use_the_same_key()
    {
        var h = Harness();
        await h.SendAsync("POST", "/api/transaction", "shared", Guid.NewGuid());
        await h.SendAsync("POST", "/api/transaction", "shared", Guid.NewGuid());
        Assert.Equal(2, h.EndpointCalls);
    }
}
