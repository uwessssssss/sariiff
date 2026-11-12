using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using SARIFF.API.Middleware;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure;
using SARIFF.Infrastructure.Data;
using Serilog;
// FIX: Npgsql 6+ requires DateTime.Kind=Utc for timestamptz columns.
// This switch restores legacy behavior so Unspecified/Local DateTimes work too.
// Without this, any DateTime from query strings, .Date calls, or default(DateTime) crashes.
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);


var builder = WebApplication.CreateBuilder(args);

// C4/deploy FIX: bind to the port the host injects (Render/Railway/Fly set $PORT).
// Falls back to 8080 locally (matches the Dockerfile EXPOSE).
var listenPort = Environment.GetEnvironmentVariable("PORT") ?? "8080";
builder.WebHost.UseUrls($"http://+:{listenPort}");

// FIX: REMOVED hardcoded development mode - let environment be set properly
// builder.Environment.EnvironmentName = "Development";  // REMOVED - SECURITY FIX

// Serilog - adjust logging level based on environment
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.With(new SARIFF.API.Middleware.StripNewlinesEnricher()) // no forged log lines from user input
    .MinimumLevel.Is(builder.Environment.IsDevelopment() 
        ? Serilog.Events.LogEventLevel.Debug 
        : Serilog.Events.LogEventLevel.Information)
    // Sinks come from appsettings (Serilog:WriteTo). A second .WriteTo.Console() here
    // printed every line twice.
    .CreateLogger();
builder.Host.UseSerilog();

Log.Information("========================================");
Log.Information("SARIFF API - {Environment} MODE", builder.Environment.EnvironmentName.ToUpper());
Log.Information("========================================");

// Add services
builder.Services.AddControllers(o => o.Filters.Add<SARIFF.API.Middleware.PagingClampFilter>())
    // Times leave the API marked as UTC ("...Z"), so screens show the viewer's local time.
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new SARIFF.API.UtcDateTimeConverter()));
builder.Services.AddEndpointsApiExplorer();

// Swagger - only enable detailed docs in development
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo 
    { 
        Title = "Sarif API", 
        Version = "v1",
        Description = builder.Environment.IsDevelopment() 
            ? "Development API Documentation" 
            : "Production API"
    });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter your JWT token"
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

// JWT Authentication — C2 FIX: prefer env var, fail fast on placeholder
var jwtKey = Environment.GetEnvironmentVariable("JWT_SECRET_KEY") is { Length: > 0 } envJwt
    ? envJwt
    : builder.Configuration["Jwt:SecretKey"] ?? "";
// Secrets come from environment variables only (appsettings.json ships empty).
//   JWT_SECRET_KEY, ConnectionStrings__DefaultConnection, AfricasTalking__ApiKey
var weakJwt = string.IsNullOrWhiteSpace(jwtKey) || jwtKey.Length < 32
    || jwtKey.Contains("YourSuper") || jwtKey.Contains("DevSecretKey") || jwtKey.Contains("SuperSecretKeyThat");
if (weakJwt)
{
    if (!builder.Environment.IsDevelopment())
        throw new InvalidOperationException("SECURITY: Set JWT_SECRET_KEY to a random 32+ character value (openssl rand -base64 48).");
    Console.WriteLine("WARNING: Using the development JWT key. Never deploy with it.");
}
if (string.IsNullOrWhiteSpace(builder.Configuration.GetConnectionString("DefaultConnection")))
    throw new InvalidOperationException("Set ConnectionStrings__DefaultConnection (database connection string).");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.Zero
        };
    });

// Authorization Policies
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("SuperAdminOnly", policy => policy.RequireRole("SuperAdmin"));
    options.AddPolicy("OfficeUserOnly", policy => policy.RequireRole("OfficeUser"));
    options.AddPolicy("ClientOnly", policy => policy.RequireRole("Client"));
    options.AddPolicy("AdminOrOffice", policy => policy.RequireRole("SuperAdmin", "OfficeUser"));
    // Phone login: the limited identity token, or a client token picked through it.
    options.AddPolicy("IdentityOrClient", policy => policy.RequireRole("ClientIdentity", "Client"));
});

// CORS - FIX: Configure based on environment
builder.Services.AddCors(options =>
{
    if (builder.Environment.IsDevelopment())
    {
        // Development: Allow any origin (needed for React Native mobile + web)
        options.AddPolicy("AllowFrontend", policy =>
        {
            policy.AllowAnyOrigin()
                .AllowAnyHeader()
                .AllowAnyMethod();
            // Note: AllowAnyOrigin + AllowCredentials is not allowed together.
            // Mobile uses Bearer token in header, not cookies, so this is fine.
        });
    }
    else
    {
        // Production: Only allow specific origins from configuration
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() 
            ?? new[] { "https://yourproductiondomain.com" };
        
        options.AddPolicy("AllowFrontend", policy =>
        {
            policy.WithOrigins(allowedOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
        });
    }
});

// Infrastructure (DbContext, Services)
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddHttpContextAccessor();
// Who did it, for the audit trail written on every save (see AuditInterceptor).
builder.Services.AddScoped<SARIFF.Infrastructure.Data.IAuditContext, SARIFF.API.Middleware.HttpAuditContext>();

// Real-time hub removed (Oct 2026): no web or mobile client ever connected and
// nothing sent through it. Re-add with a client (@microsoft/signalr) if needed.

// Behind Render's proxy the TCP connection comes from the proxy, not the user.
// Read the client IP from X-Forwarded-For so rate limiting and login history
// see real users. ForwardLimit = 1 takes only the entry Render's proxy added,
// so a client can't spoof its IP by sending its own X-Forwarded-For.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor;
    options.ForwardLimit = 1;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

// Don't announce the server software in a "Server: Kestrel" header.
builder.WebHost.ConfigureKestrel(o => o.AddServerHeader = false);

// Compress JSON on the wire (a busy day's report: ~4 MB of JSON → a few hundred KB; it
// matters on mobile data). Fastest level: little CPU on a small instance.
builder.Services.AddResponseCompression(o =>
{
    o.EnableForHttps = true; // behind the proxy the request is HTTPS once forwarded headers apply
    o.Providers.Add<Microsoft.AspNetCore.ResponseCompression.BrotliCompressionProvider>();
    o.Providers.Add<Microsoft.AspNetCore.ResponseCompression.GzipCompressionProvider>();
});
builder.Services.Configure<Microsoft.AspNetCore.ResponseCompression.BrotliCompressionProviderOptions>(o => o.Level = System.IO.Compression.CompressionLevel.Fastest);
builder.Services.Configure<Microsoft.AspNetCore.ResponseCompression.GzipCompressionProviderOptions>(o => o.Level = System.IO.Compression.CompressionLevel.Fastest);

var app = builder.Build();

// Must run first, before anything that reads the client IP.
app.UseForwardedHeaders();

// Standard security headers on every API response (Swagger in development included).
app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    h["X-Content-Type-Options"] = "nosniff";
    h["X-Frame-Options"] = "DENY";
    h["Referrer-Policy"] = "no-referrer";
    h["Cache-Control"] = "no-store"; // balances and statements must not sit in shared caches
    if (!app.Environment.IsDevelopment())
        h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    await next();
});


// Swagger only in Development
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Sarif API v1");
        options.RoutePrefix = "swagger";
    });
}

// Middleware
// Live request numbers for the super-admin System screen. Outermost, so it sees
// the final status code (including 500s produced by ExceptionMiddleware).
app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path.Value ?? "";
    if (path.StartsWith("/health", StringComparison.OrdinalIgnoreCase) || path.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase))
    {
        await next();
        return;
    }
    var sw = System.Diagnostics.Stopwatch.StartNew();
    var failed = false;
    try { await next(); }
    catch { failed = true; throw; }
    finally { SARIFF.Infrastructure.Services.RequestMetrics.Record(sw.ElapsedMilliseconds, failed ? 500 : ctx.Response.StatusCode); }
});

app.UseMiddleware<ExceptionMiddleware>();

// Compression for everything except sign-in: those responses carry tokens, and compressing
// a secret next to input an attacker controls is what the BREACH attack measures.
app.UseWhen(ctx => !ctx.Request.Path.StartsWithSegments("/api/auth") && !ctx.Request.Path.StartsWithSegments("/api/identity"),
    branch => branch.UseResponseCompression());

// FIX: Add Rate Limiting middleware for auth endpoints
app.UseMiddleware<RateLimitingMiddleware>();

app.UseCors("AllowFrontend");

// Blocked IPs and the admin allow-list from the super admin Security screen.
// After CORS, so a refused browser call still gets a readable 403, not a CORS error.
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/health")) { await next(); return; }
    var ip = ctx.Connection.RemoteIpAddress is { } ra ? SARIFF.Infrastructure.Services.IpAccess.Normalize(ra.ToString()) : null;
    string? refusal = null;
    try
    {
        var db = ctx.RequestServices.GetRequiredService<SARIFF.Infrastructure.Data.AppDbContext>();
        if (await SARIFF.Infrastructure.Services.IpAccess.BlockedReasonAsync(db, ip) != null)
            refusal = "Access from your network has been blocked. Contact Sarif support.";
        else if (ctx.Request.Path.StartsWithSegments("/api/admin") && !await SARIFF.Infrastructure.Services.IpAccess.AdminAllowedAsync(db, ip))
            refusal = "The super admin area is limited to approved IP addresses.";
    }
    catch (Exception ex)
    {
        // Lists unreadable (database hiccup): let the request through rather than lock everyone out.
        Log.Warning(ex, "IP access check skipped");
    }
    if (refusal != null)
    {
        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        await ctx.Response.WriteAsJsonAsync(new { success = false, message = refusal, data = (object?)null });
        return;
    }
    await next();
});
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<TenantMiddleware>();
app.UseMiddleware<IdempotencyMiddleware>();   // after the tenant is known

app.MapControllers();

// Health check
app.MapGet("/health", () => Results.Ok(new { Status = "Healthy", Timestamp = DateTime.UtcNow }));
// Readiness: is the database reachable? (/health only says the process is up; point Render's
// health check here so a server that lost its database stops getting traffic.)
app.MapGet("/health/ready", async (SARIFF.Infrastructure.Data.AppDbContext db, CancellationToken ct) =>
{
    try
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(3));
        return await db.Database.CanConnectAsync(cts.Token)
            ? Results.Ok(new { Status = "Ready", Database = "up", Timestamp = DateTime.UtcNow })
            : Results.Json(new { Status = "Unavailable", Database = "down" }, statusCode: 503);
    }
    catch { return Results.Json(new { Status = "Unavailable", Database = "down" }, statusCode: 503); }
});

// ========================================
// DATABASE INITIALIZATION AND SEEDING
// ========================================
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    
    logger.LogInformation("========================================");
    logger.LogInformation("DATABASE INITIALIZATION");
    logger.LogInformation("========================================");
    
    // H4 FIX: Use MigrateAsync for proper schema upgrades
    // First time: run "dotnet ef migrations add InitialCreate" to generate migration
    // For dev convenience, fall back to EnsureCreated if no migrations exist
    // Migrations must succeed or the app must not start: the old fallback to
    // EnsureCreated did nothing on an existing database and let the API run
    // against a stale schema, failing later on live requests.
    // Set RUN_MIGRATIONS=false when migrations run as a separate deploy step
    // (required before running more than one instance).
    if (!string.Equals(Environment.GetEnvironmentVariable("RUN_MIGRATIONS"), "false", StringComparison.OrdinalIgnoreCase))
    {
        try { await context.Database.MigrateAsync(); }
        catch (Exception ex)
        {
            logger.LogCritical(ex, "Database migration failed. Refusing to start on an unknown schema.");
            throw;
        }
    }
    logger.LogInformation("Database schema created/verified");

    // Wallets made before mobile money had its own currency (safe: never relabels money).
    try { await SARIFF.Infrastructure.Services.MobileMoney.BackfillAsync(context, logger); }
    catch (Exception ex) { logger.LogError(ex, "Mobile money currency backfill failed; wallets keep the home currency"); }
    
    // Check if data exists
    var hasUsers = await context.Users.AnyAsync();
    var hasCompanies = await context.Companies.AnyAsync();
    
    logger.LogInformation("Existing data check - Users: {HasUsers}, Companies: {HasCompanies}", hasUsers, hasCompanies);
    
    // Seed data in Development, or in Production when SEED_DATA=true env var is set
    var forceSeed = Environment.GetEnvironmentVariable("SEED_DATA")?.Equals("true", StringComparison.OrdinalIgnoreCase) == true;
    
    if (!hasUsers && !hasCompanies && !app.Environment.IsDevelopment() && forceSeed)
    {
        // PRODUCTION first start: create ONLY the super admin, with a real phone (login
        // needs an SMS code) and a real password. No test bureau, clients or rates.
        // (Production used to get the full test data, including a super admin whose
        // OTP went to the made-up number +254700000000.)
        var adminPassword = Environment.GetEnvironmentVariable("SEED_ADMIN_PASSWORD") ?? "";
        var adminPhone = (Environment.GetEnvironmentVariable("SEED_ADMIN_PHONE") ?? "").Replace(" ", "");
        var adminEmail = Environment.GetEnvironmentVariable("SEED_ADMIN_EMAIL");
        var adminName = Environment.GetEnvironmentVariable("SEED_ADMIN_NAME") is { Length: > 0 } n ? n : "Super Admin";
        if (adminPassword.Length < 12)
            throw new InvalidOperationException("SEED_DATA=true needs SEED_ADMIN_PASSWORD (12+ characters).");
        if (!System.Text.RegularExpressions.Regex.IsMatch(adminPhone, @"^\+\d{10,15}$"))
            throw new InvalidOperationException("SEED_DATA=true needs SEED_ADMIN_PHONE in international form, e.g. +254712345678 — the login SMS goes there.");

        context.Users.Add(new User
        {
            Id = Guid.Parse("a0000000-0000-0000-0000-000000000001"),
            Code = "SA-2026-001",
            CompanyId = null,
            FullName = adminName,
            WhatsAppNumber = adminPhone,
            Email = string.IsNullOrWhiteSpace(adminEmail) ? null : adminEmail.Trim(),
            Role = UserRole.SuperAdmin,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(adminPassword),
            IsActive = true,
        });
        await context.SaveChangesAsync();
        logger.LogWarning("Production seed: super admin SA-2026-001 created for phone ending {Last4}. Remove SEED_DATA and SEED_ADMIN_PASSWORD from the environment now.",
            adminPhone[^4..]);
    }
    else if (!hasUsers && !hasCompanies)
    {
        if (app.Environment.IsDevelopment())
        {
        logger.LogInformation("========================================");
        logger.LogInformation("SEEDING TEST DATA...");
        logger.LogInformation("========================================");
        
        // Development seeds the known test password. Production seeding (SEED_DATA=true)
        // REQUIRES SEED_ADMIN_PASSWORD, so a fresh live database never gets "Test@123".
        var seedPassword = "Test@123";
        if (!app.Environment.IsDevelopment())
        {
            seedPassword = Environment.GetEnvironmentVariable("SEED_ADMIN_PASSWORD") ?? "";
            if (seedPassword.Length < 12)
                throw new InvalidOperationException("SEED_DATA=true outside Development needs SEED_ADMIN_PASSWORD (12+ characters).");
        }
        var passwordHash = BCrypt.Net.BCrypt.HashPassword(seedPassword);
        logger.LogInformation("Seed password hash generated");
        
        // 1. Create Super Admin
        var superAdmin = new User
        {
            Id = Guid.Parse("a0000000-0000-0000-0000-000000000001"),
            Code = "SA-2026-001",
            CompanyId = null,
            FullName = "Super Admin",
            WhatsAppNumber = "+254700000000",
            Email = "admin@sariff.com",
            Role = UserRole.SuperAdmin,
            PasswordHash = passwordHash,
            IsActive = true,
            BalanceKES = 0,
            BalanceUSD = 0
        };
        context.Users.Add(superAdmin);
        logger.LogInformation("Created Super Admin: {Code} / {Phone}", superAdmin.Code, superAdmin.WhatsAppNumber);
        
        // 2. Create Company (Office User)
        var company1 = new Company
        {
            Id = Guid.Parse("b0000000-0000-0000-0000-000000000001"),
            Code = "AFB-2026-0001",
            CodePrefix = "AFB",
            Name = "Alpha Forex Bureau",
            OwnerName = "John Kamau",
            WhatsAppNumber = "+254711111111",
            Email = "john@alphaforex.co.ke",
            PasswordHash = passwordHash,
            TaxId = "KRA123456",
            Website = "https://alphaforex.co.ke",
            Address = "Nairobi CBD, Kenya",
            IsActive = true
        };
        context.Companies.Add(company1);
        logger.LogInformation("Created Company: {Code} / {Phone}", company1.Code, company1.WhatsAppNumber);
        
        // 3. Create Client (belongs to company1)
        var client1 = new User
        {
            Id = Guid.Parse("d0000000-0000-0000-0000-000000000001"),
            Code = "AFB-CL-2026-0001",
            CompanyId = company1.Id,
            FullName = "Michael Ochieng",
            WhatsAppNumber = "+254733333333",
            Email = "michael@email.com",
            IdPassport = "12345678",
            Role = UserRole.Client,
            ClientType = ClientType.Permanent,
            PasswordHash = passwordHash,
            IsActive = true,
           
        };
        context.Users.Add(client1);
        logger.LogInformation("Created Client: {Code} / {Phone}", client1.Code, client1.WhatsAppNumber);
        
        
        // 7. Create Exchange Rate
        var exchangeRate = new ExchangeRate
        {
            Id = Guid.Parse("f0000000-0000-0000-0000-000000000001"),
            CompanyId = company1.Id,
            BuyRate = 128.50m,
            SellRate = 129.50m,
            EffectiveFrom = DateTime.UtcNow,
            IsActive = true,
            CreatedByUserId = superAdmin.Id
        };
        context.ExchangeRates.Add(exchangeRate);
        logger.LogInformation("Created Exchange Rate: Buy={Buy}, Sell={Sell}", exchangeRate.BuyRate, exchangeRate.SellRate);
        
        
        await context.SaveChangesAsync();
        logger.LogInformation("Extended test data seeded: {Clients} clients", 3);
        
        logger.LogInformation("========================================");
        logger.LogInformation("SEED DATA COMPLETE!");
        logger.LogInformation("========================================");
        logger.LogInformation("");
        logger.LogInformation("TEST CREDENTIALS (password: the seed password):");
        logger.LogInformation("");
        logger.LogInformation("SUPER ADMIN (OTP Required):");
        logger.LogInformation("  Code: SA-2026-001");
        logger.LogInformation("  Phone: +254700000000");
        logger.LogInformation("");
        logger.LogInformation("OFFICE USER (OTP Required):");
        logger.LogInformation("  Code: AFB-2026-0001");
        logger.LogInformation("  Phone: +254711111111");
        logger.LogInformation("");
        logger.LogInformation("CLIENT (NO OTP):");
        logger.LogInformation("  Code: AFB-CL-2026-0001");
        logger.LogInformation("  Phone: +254733333333");
        logger.LogInformation("");
        logger.LogInformation("MORE TEST CLIENTS (password: the seed password):");
        logger.LogInformation("  Amina Hassan:  AFB-CL-2026-0002 / +254722000001");
        logger.LogInformation("  David Njoroge: AFB-CL-2026-0003 / +254722000002");
        logger.LogInformation("  Grace Wanjiku: AFB-CL-2026-0004 (Walk-in, no login)");
        logger.LogInformation("  Peter Mwangi:  AFB-CL-2026-0005 / +254722000004");
        logger.LogInformation("  Fatima Ali:    AFB-CL-2026-0006 / +254722000005");
        logger.LogInformation("========================================");
    }
    else
    {
        logger.LogWarning("Production: database is empty. Set SEED_DATA=true, SEED_ADMIN_PASSWORD and SEED_ADMIN_PHONE, then restart to create the super admin.");
    }
    }
    else
    {
        logger.LogInformation("Database already has data - skipping seed");
        
        // Log existing counts
        var userCount = await context.Users.CountAsync();
        var companyCount = await context.Companies.CountAsync();
        logger.LogInformation("Existing: {Users} users, {Companies} companies", userCount, companyCount);
    }
}

Log.Information("========================================");
Log.Information("SARIFF API READY - {Environment}", app.Environment.EnvironmentName);
if (app.Environment.IsDevelopment())
{
    Log.Information("Swagger: http://localhost:{Port}/swagger", listenPort);
}
Log.Information("========================================");

try
{
    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}