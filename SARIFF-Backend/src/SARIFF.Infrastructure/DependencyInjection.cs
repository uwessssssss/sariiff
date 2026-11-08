using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using SARIFF.Infrastructure.Services;

namespace SARIFF.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// Npgsql's default pool allows 100 connections per instance — as many as a small
    /// PostgreSQL server accepts in total, so a busy minute could end in "too many clients"
    /// instead of requests briefly queueing. Unless the connection string sets its own
    /// "Maximum Pool Size", cap it (DB_MAX_POOL, default 40; the code counter adds 10).
    /// </summary>
    private static string? WithPoolCap(string? cs)
    {
        if (string.IsNullOrWhiteSpace(cs)) return cs;
        try
        {
            var b = new Npgsql.NpgsqlConnectionStringBuilder(cs);
            if (cs.Contains("Pool Size", StringComparison.OrdinalIgnoreCase)) return cs;
            b.MaxPoolSize = int.TryParse(Environment.GetEnvironmentVariable("DB_MAX_POOL"), out var n) && n > 0 ? n : 40;
            return b.ConnectionString;
        }
        catch (ArgumentException) { return cs; } // not a key=value string; leave it alone
    }

    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // Database
        var connectionString = WithPoolCap(configuration.GetConnectionString("DefaultConnection"));
        services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));

        // HTTP Client for Expo Push API
        services.AddHttpClient("ExpoPush", client =>
        {
            client.Timeout = TimeSpan.FromSeconds(15);
        });

        // Services - Order matters for dependencies
        // Base services (no dependencies on other services)
        services.AddScoped<IPushNotificationService, PushNotificationService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<IAuditService, AuditService>();
        services.AddScoped<ISystemLogService, SystemLogService>();
        
        // Services with notification dependency
        services.AddScoped<AuthService>();
        services.AddScoped<IAuthService>(sp => sp.GetRequiredService<AuthService>());
        services.AddScoped<IClientIdentityService>(sp => sp.GetRequiredService<AuthService>());
        services.AddScoped<ICompanyService, CompanyService>();
        services.AddScoped<IClientService, ClientService>();
        services.AddScoped<ITransactionService, TransactionService>();
        
        // Account services
        services.AddScoped<IBankAccountService, BankAccountService>();
        services.AddScoped<IMpesaAgentService, MpesaAgentService>();
        services.AddScoped<ICashAccountService, CashAccountService>();
        services.AddScoped<IExpenseService, ExpenseService>();
        
        // Services with transaction dependency
        services.AddScoped<IExchangeRateService, ExchangeRateService>();
        services.AddScoped<IExchangeService, ExchangeService>();
        services.AddScoped<IReportService, ReportService>();
        services.AddScoped<IDashboardService, DashboardService>();
        
        // Other services
        services.AddScoped<IInvoiceService, InvoiceService>();
        services.AddScoped<IReconciliationService, ReconciliationService>();
        services.AddScoped<IClientPortalService, ClientPortalService>();
        services.AddScoped<IClientAlertHelper, ClientAlertHelper>(); 
        services.AddScoped<StatementHelper>();
        services.AddScoped<ISuperAdminService, SuperAdminService>();
        services.AddSingleton<ISmsService, SmsService>();
        services.AddScoped<IBalanceAlertService, BalanceAlertService>();
        return services;
    }
}