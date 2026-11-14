using Microsoft.EntityFrameworkCore;
using SARIFF.Core.Entities;

namespace SARIFF.Infrastructure.Data;

/// <summary>
/// EF Core model: every table, its money precision (18,2), indexes and the concurrency
/// tokens that guard balance fields.
/// </summary>
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Company> Companies => Set<Company>();
    public DbSet<User> Users => Set<User>();
    public DbSet<BankAccount> BankAccounts => Set<BankAccount>();
    public DbSet<MpesaAgent> MpesaAgents => Set<MpesaAgent>();
    public DbSet<CashAccount> CashAccounts => Set<CashAccount>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<ExpenseCategory> ExpenseCategories => Set<ExpenseCategory>();
    public DbSet<Expense> Expenses => Set<Expense>();
    public DbSet<ExchangeRate> ExchangeRates => Set<ExchangeRate>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceItem> InvoiceItems => Set<InvoiceItem>();
    public DbSet<Reconciliation> Reconciliations => Set<Reconciliation>();
    public DbSet<OtpCode> OtpCodes => Set<OtpCode>();
    public DbSet<UserSession> UserSessions => Set<UserSession>();
    public DbSet<IdempotencyRecord> IdempotencyRecords => Set<IdempotencyRecord>();
    public DbSet<CodeCounter> CodeCounters => Set<CodeCounter>();
    public DbSet<LoginHistory> LoginHistories => Set<LoginHistory>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<NotificationLog> NotificationLogs => Set<NotificationLog>();
    public DbSet<SystemLog> SystemLogs => Set<SystemLog>();
    public DbSet<AdminIpWhitelist> AdminIpWhitelists => Set<AdminIpWhitelist>();
    public DbSet<ClientAlert> ClientAlerts => Set<ClientAlert>();
    public DbSet<TrustedDevice> TrustedDevices => Set<TrustedDevice>();
    public DbSet<DeviceToken> DeviceTokens => Set<DeviceToken>(); // C3: Push notifications
    public DbSet<BalanceAlertRule> BalanceAlertRules => Set<BalanceAlertRule>();
    public DbSet<PinGrant> PinGrants => Set<PinGrant>();
    public DbSet<ClientIdentity> ClientIdentities => Set<ClientIdentity>();
    public DbSet<ClientIdentityDevice> ClientIdentityDevices => Set<ClientIdentityDevice>();
    public DbSet<SecurityAlert> SecurityAlerts => Set<SecurityAlert>();
    public DbSet<SubscriptionPayment> SubscriptionPayments => Set<SubscriptionPayment>();
    public DbSet<ClientCurrencyBalance> ClientCurrencyBalances => Set<ClientCurrencyBalance>(); // Multi-currency: balances beyond KES/USD
    public DbSet<BlockedIP> BlockedIPs => Set<BlockedIP>();
    public DbSet<ExchangeFloat> ExchangeFloats => Set<ExchangeFloat>();
    public DbSet<ExchangeFloatBalance> ExchangeFloatBalances => Set<ExchangeFloatBalance>(); // Multi-currency float beyond KES/USD
    public DbSet<FloatMovement> FloatMovements => Set<FloatMovement>();
    public DbSet<ExchangeTransaction> ExchangeTransactions => Set<ExchangeTransaction>();
    public DbSet<DailyExchangeSummary> DailyExchangeSummaries => Set<DailyExchangeSummary>();
    public DbSet<DailyExchangeCurrencySummary> DailyExchangeCurrencySummaries => Set<DailyExchangeCurrencySummary>(); // UGX, EUR, ... per day

    // CS0618: UseXminAsConcurrencyToken() is marked obsolete in favour of IsRowVersion().
    // It still works and maps to PostgreSQL's built-in xmin column. Switching API would make
    // EF try to ALTER that system column in the next migration, which fails, so we keep it
    // until a deliberate migration test. Silenced here only, not project-wide.
#pragma warning disable CS0618
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // =====================================================
        // CLIENT CURRENCY BALANCES (multi-currency beyond KES/USD)
        // =====================================================
        // Raw SQL in CodeGenerator targets this exact table/column naming.
        modelBuilder.Entity<CodeCounter>(e =>
        {
            e.ToTable("CodeCounters");
            e.HasKey(x => x.Scope);
            e.Property(x => x.Scope).HasMaxLength(128);
        });

        modelBuilder.Entity<IdempotencyRecord>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Scope).HasMaxLength(64);
            e.Property(x => x.Key).HasMaxLength(100);
            e.Property(x => x.Method).HasMaxLength(10);
            e.Property(x => x.Path).HasMaxLength(300);
            e.Property(x => x.ContentType).HasMaxLength(100);
            e.HasIndex(x => new { x.Scope, x.Key }).IsUnique();
            e.HasIndex(x => x.CreatedAt);
        });

        modelBuilder.Entity<ClientCurrencyBalance>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.ClientId, x.Currency }).IsUnique();
            e.HasIndex(x => x.CompanyId);
            e.Property(x => x.Balance).HasPrecision(18, 2);
            e.Property(x => x.OpeningBalance).HasPrecision(18, 2);
            e.Property(x => x.TotalIn).HasPrecision(18, 2);
            e.Property(x => x.TotalOut).HasPrecision(18, 2);
            // Optimistic lock (PostgreSQL xmin), like every other balance table:
            // two simultaneous postings to one client's UGX/EUR balance can no
            // longer overwrite each other — the second is rejected and rolled back.
            e.UseXminAsConcurrencyToken();
        });

        // =====================================================
        // COMPANY
        // =====================================================
        modelBuilder.Entity<Company>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Code).HasMaxLength(20);
            e.Property(x => x.Name).IsRequired().HasMaxLength(255);
            e.Property(x => x.OwnerName).IsRequired().HasMaxLength(255);
            e.Property(x => x.WhatsAppNumber).IsRequired().HasMaxLength(50);
            e.Property(x => x.Email).HasMaxLength(255);
            e.Property(x => x.PasswordHash).IsRequired();
            e.HasIndex(x => x.Code).IsUnique();
            // Unique among live bureaus only: a deleted bureau's number must be reusable.
            e.HasIndex(x => x.WhatsAppNumber).IsUnique().HasFilter("\"IsDeleted\" = false");
            e.HasQueryFilter(x => !x.IsDeleted);
            
            // FIXED: All decimal fields with precision
            e.Property(x => x.MonthlyFee).HasPrecision(18, 2);
            e.Property(x => x.TotalPaid).HasPrecision(18, 2);
        });

        // =====================================================
        // USER (Clients + SuperAdmin)
        // =====================================================
        modelBuilder.Entity<User>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Code).HasMaxLength(20);
            e.Property(x => x.FullName).IsRequired().HasMaxLength(255);
            e.Property(x => x.WhatsAppNumber).IsRequired().HasMaxLength(50);
            
            // FIXED: All balance fields with precision
            e.Property(x => x.BalanceKES).HasPrecision(18, 2);
            e.Property(x => x.BalanceUSD).HasPrecision(18, 2);
            e.Property(x => x.OpeningBalanceKES).HasPrecision(18, 2);  // NEW
            e.Property(x => x.OpeningBalanceUSD).HasPrecision(18, 2);  // NEW
            
            e.HasIndex(x => new { x.CompanyId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.CompanyId, x.Role });
            e.HasQueryFilter(x => !x.IsDeleted);
            
            // FIX #18: Optimistic concurrency — prevents lost updates on balance fields under load
            e.UseXminAsConcurrencyToken();
        });

        // =====================================================
        // BANK ACCOUNT
        // =====================================================
        modelBuilder.Entity<BankAccount>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Code).HasMaxLength(20);
            e.Property(x => x.BankName).HasMaxLength(100);
            e.Property(x => x.AccountNumber).HasMaxLength(50);
            e.Property(x => x.AccountName).HasMaxLength(255);
            
            // FIXED: All decimal fields
            e.Property(x => x.Balance).HasPrecision(18, 2);
            e.Property(x => x.OpeningBalance).HasPrecision(18, 2);  // NEW
            
            e.HasIndex(x => new { x.CompanyId, x.Code }).IsUnique();
            e.HasQueryFilter(x => !x.IsDeleted);
            e.UseXminAsConcurrencyToken();
        });

        // =====================================================
        // M-PESA AGENT
        // =====================================================
        modelBuilder.Entity<MpesaAgent>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Code).HasMaxLength(20);
            e.Property(x => x.AgentName).HasMaxLength(100);
            e.Property(x => x.PhoneNumber).HasMaxLength(50);
            e.Property(x => x.AgentNumber).HasMaxLength(50);
            
            // FIXED: All decimal fields
            e.Property(x => x.Balance).HasPrecision(18, 2);
            e.Property(x => x.OpeningBalance).HasPrecision(18, 2);  // NEW
            
            e.HasIndex(x => new { x.CompanyId, x.Code }).IsUnique();
            e.HasQueryFilter(x => !x.IsDeleted);
            e.UseXminAsConcurrencyToken();
        });

        // =====================================================
        // CASH ACCOUNT
        // =====================================================
        modelBuilder.Entity<CashAccount>(e =>
        {
            e.HasKey(x => x.Id);
            
            // FIXED: All decimal fields
            e.Property(x => x.Balance).HasPrecision(18, 2);
            e.Property(x => x.OpeningBalance).HasPrecision(18, 2);  // NEW
            
            // One live cash drawer per currency per bureau. Balance lookups pick "the"
            // cash account for a currency, so a second one (two "add cash account"
            // requests racing) would split the money between rows nobody can see.
            e.HasIndex(x => new { x.CompanyId, x.Currency })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false");
            e.HasQueryFilter(x => !x.IsDeleted);
            e.UseXminAsConcurrencyToken();
        });

        // =====================================================
        // TRANSACTION
        // =====================================================
        modelBuilder.Entity<Transaction>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Code).HasMaxLength(30);
            e.Property(x => x.Reference).HasMaxLength(50);
            e.Property(x => x.Description).HasMaxLength(500);
            
            // FIXED: All decimal fields
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.CounterAmount).HasPrecision(18, 2);  // NEW
            e.Property(x => x.ExchangeRate).HasPrecision(18, 6);   // NEW: Higher precision for rates
            e.Property(x => x.SourceBalanceBefore).HasPrecision(18, 2);  // NEW
            e.Property(x => x.SourceBalanceAfter).HasPrecision(18, 2);   // NEW
            e.Property(x => x.DestBalanceBefore).HasPrecision(18, 2);    // NEW
            e.Property(x => x.DestBalanceAfter).HasPrecision(18, 2);     // NEW
            e.Property(x => x.ActualAmount).HasPrecision(18, 2);
            e.Property(x => x.Variance).HasPrecision(18, 2);
            
            // FIXED: Better indexes
            e.HasIndex(x => x.ReconciliationStatus);
            e.HasIndex(x => new { x.CompanyId, x.TransactionDate });
            e.HasIndex(x => x.SourceAccountId);
            e.HasIndex(x => x.DestAccountId);
            e.HasIndex(x => new { x.CompanyId, x.Code }).IsUnique();
            
            e.HasQueryFilter(x => !x.IsDeleted);
        });

        // =====================================================
        // EXPENSE CATEGORY
        // =====================================================
        modelBuilder.Entity<ExpenseCategory>(e => 
        { 
            e.HasKey(x => x.Id); 
            e.Property(x => x.Name).HasMaxLength(100);
            e.HasIndex(x => x.CompanyId);  // NEW
            e.HasQueryFilter(x => !x.IsDeleted); 
        });

        // =====================================================
        // EXPENSE
        // =====================================================
        modelBuilder.Entity<Expense>(e => 
        { 
            e.HasKey(x => x.Id); 
            e.Property(x => x.Code).HasMaxLength(30);
            e.Property(x => x.Description).HasMaxLength(500);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.HasIndex(x => new { x.CompanyId, x.Code }).IsUnique();
            e.HasIndex(x => x.CategoryId);
            e.HasQueryFilter(x => !x.IsDeleted); 
        });

        // =====================================================
        // EXCHANGE RATE
        // =====================================================
        modelBuilder.Entity<ExchangeRate>(e => 
        { 
            e.HasKey(x => x.Id); 
            e.Property(x => x.BuyRate).HasPrecision(18, 6); 
            e.Property(x => x.SellRate).HasPrecision(18, 6); 
            e.HasIndex(x => new { x.CompanyId, x.IsActive });  // NEW
            e.HasQueryFilter(x => !x.IsDeleted); 
        });

        // =====================================================
        // INVOICE
        // =====================================================
        modelBuilder.Entity<Invoice>(e => 
        { 
            e.HasKey(x => x.Id); 
            e.Property(x => x.InvoiceNumber).HasMaxLength(30);
            e.Property(x => x.Subtotal).HasPrecision(18, 2);   // NEW
            e.Property(x => x.TaxRate).HasPrecision(5, 2);     // NEW
            e.Property(x => x.TaxAmount).HasPrecision(18, 2);  // NEW
            e.Property(x => x.DiscountAmount).HasPrecision(18, 2);  // NEW
            e.Property(x => x.Total).HasPrecision(18, 2); 
            e.HasIndex(x => new { x.CompanyId, x.InvoiceNumber }).IsUnique();
            e.HasQueryFilter(x => !x.IsDeleted); 
        });

        // =====================================================
        // INVOICE ITEM
        // =====================================================
        modelBuilder.Entity<InvoiceItem>(e => 
        { 
            e.HasKey(x => x.Id); 
            e.Property(x => x.Quantity).HasPrecision(18, 4);   // NEW
            e.Property(x => x.UnitPrice).HasPrecision(18, 2);  // NEW
            e.Property(x => x.Amount).HasPrecision(18, 2); 
            e.HasIndex(x => x.InvoiceId);  // NEW
            e.HasQueryFilter(x => !x.IsDeleted); 
        });

        // =====================================================
        // RECONCILIATION
        // =====================================================
        modelBuilder.Entity<Reconciliation>(e => 
        { 
            e.HasKey(x => x.Id); 
            e.Property(x => x.ExpectedBalance).HasPrecision(18, 2);  // NEW
            e.Property(x => x.ActualBalance).HasPrecision(18, 2);    // NEW
            e.Property(x => x.Variance).HasPrecision(18, 2); 
            e.HasIndex(x => x.CompanyId);  // NEW
            e.HasQueryFilter(x => !x.IsDeleted); 
        });

        // =====================================================
        // OTP CODE
        // =====================================================
        modelBuilder.Entity<OtpCode>(e => 
        { 
            e.HasKey(x => x.Id); 
            e.Property(x => x.UserCode).HasMaxLength(20);
            e.Property(x => x.PhoneNumber).HasMaxLength(50);
            e.Property(x => x.Code).HasMaxLength(64);   // SHA-256 hash, base64
            e.HasIndex(x => new { x.PhoneNumber, x.IsUsed, x.ExpiresAt });  // NEW
        });

        // =====================================================
        // USER SESSION
        // =====================================================
        modelBuilder.Entity<UserSession>(e => 
        { 
            e.HasKey(x => x.Id); 
            e.Property(x => x.RefreshTokenHash).HasMaxLength(100);
            e.HasIndex(x => x.RefreshTokenHash);  // NEW
            e.HasIndex(x => new { x.UserId, x.IsRevoked });  // NEW
        });

        // =====================================================
        // OTHER ENTITIES
        // =====================================================
        // These three only ever grow; without indexes every admin screen that filters
        // them by bureau or date scans the whole table.
        modelBuilder.Entity<LoginHistory>(e => {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.LoginAt);
            e.HasIndex(x => new { x.UserId, x.LoginAt });
        });
        modelBuilder.Entity<AuditLog>(e => {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.CompanyId, x.CreatedAt });
        });
        modelBuilder.Entity<NotificationLog>(e => {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.CompanyId, x.CreatedAt });
        });
        modelBuilder.Entity<SystemLog>(e => { 
            e.HasKey(x => x.Id); 
            e.HasIndex(x => new { x.Level, x.CreatedAt });  // NEW
            e.HasIndex(x => x.ResolvedAt);
        });
        modelBuilder.Entity<AdminIpWhitelist>(e => { e.HasKey(x => x.Id); });

        // =====================================================
        // CLIENT ALERT
        // =====================================================
        modelBuilder.Entity<ClientAlert>(e => { 
            e.HasKey(x => x.Id); 
            e.Property(x => x.Type).HasMaxLength(20);
            e.Property(x => x.Title).HasMaxLength(200);
            e.Property(x => x.Message).HasMaxLength(1000);
            e.HasIndex(x => new { x.ClientId, x.CompanyId, x.IsDeleted });
            e.HasIndex(x => new { x.ClientId, x.IsRead });
            e.HasQueryFilter(x => !x.IsDeleted); 
        });

        // =====================================================
        // SECURITY ALERT
        // =====================================================
        modelBuilder.Entity<SecurityAlert>(e => { 
            e.HasKey(x => x.Id); 
            e.Property(x => x.Severity).HasMaxLength(20);
            e.Property(x => x.Message).HasMaxLength(1000);
            e.HasIndex(x => new { x.IsResolved, x.CreatedAt });
            e.HasQueryFilter(x => !x.IsDeleted); 
        });

        // =====================================================
        // SUBSCRIPTION PAYMENT
        // =====================================================
        modelBuilder.Entity<SubscriptionPayment>(e => { 
            e.HasKey(x => x.Id); 
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.Currency).HasMaxLength(10);
            e.Property(x => x.PaymentMethod).HasMaxLength(50);
            e.Property(x => x.Status).HasMaxLength(20);
            e.HasIndex(x => x.CompanyId);
            e.HasQueryFilter(x => !x.IsDeleted); 
        });

        // =====================================================
        // BLOCKED IP
        // =====================================================
        modelBuilder.Entity<BlockedIP>(e => { 
            e.HasKey(x => x.Id); 
            e.Property(x => x.IpAddress).HasMaxLength(50);
            e.Property(x => x.Reason).HasMaxLength(500);
            e.HasIndex(x => x.IpAddress);
            e.HasQueryFilter(x => !x.IsDeleted); 
        });

        // =====================================================
        // DAILY EXCHANGE CURRENCY SUMMARIES (UGX, EUR, ... per day)
        // =====================================================
        modelBuilder.Entity<DailyExchangeCurrencySummary>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.DailyExchangeSummaryId, x.Currency }).IsUnique();
            e.HasIndex(x => new { x.CompanyId, x.Date });
            e.Property(x => x.Opening).HasPrecision(18, 2);
            e.Property(x => x.Closing).HasPrecision(18, 2);
            e.Property(x => x.VolumeIn).HasPrecision(18, 2);
            e.Property(x => x.VolumeOut).HasPrecision(18, 2);
            e.Property(x => x.ActualCount).HasPrecision(18, 2);
            e.Property(x => x.Variance).HasPrecision(18, 2);
            e.HasQueryFilter(x => !x.IsDeleted);
        });

        // =====================================================
        // EXCHANGE FLOAT BALANCES (UGX, EUR, ... beyond KES/USD)
        // =====================================================
        modelBuilder.Entity<ExchangeFloatBalance>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.CompanyId, x.Currency }).IsUnique();
            e.Property(x => x.Balance).HasPrecision(18, 2);
            e.Property(x => x.TotalCost).HasPrecision(18, 2);
            e.Property(x => x.AverageCost).HasPrecision(18, 6);
            e.HasQueryFilter(x => !x.IsDeleted);
            e.UseXminAsConcurrencyToken();
        });

        // =====================================================
        // EXCHANGE FLOAT
        // =====================================================
        modelBuilder.Entity<ExchangeFloat>(e => { 
            e.HasKey(x => x.Id);
            e.Property(x => x.KesBalance).HasPrecision(18, 2);
            e.Property(x => x.UsdBalance).HasPrecision(18, 2);
            e.Property(x => x.KesProfit).HasPrecision(18, 2);
            e.Property(x => x.UsdProfit).HasPrecision(18, 2);
            e.Property(x => x.UsdTotalCost).HasPrecision(18, 2);
            e.Property(x => x.UsdAverageCost).HasPrecision(18, 6);
            e.Property(x => x.LastOpeningKes).HasPrecision(18, 2);  // NEW
            e.Property(x => x.LastOpeningUsd).HasPrecision(18, 2);  // NEW
            e.Property(x => x.LowKesThreshold).HasPrecision(18, 2);  // NEW
            e.Property(x => x.LowUsdThreshold).HasPrecision(18, 2);  // NEW
            e.Property(x => x.LargeTransactionThreshold).HasPrecision(18, 2);  // NEW
            e.HasIndex(x => x.CompanyId).IsUnique();
            e.HasQueryFilter(x => !x.IsDeleted);
            e.UseXminAsConcurrencyToken();
        });
        
        // =====================================================
        // FLOAT MOVEMENT
        // =====================================================
        modelBuilder.Entity<FloatMovement>(e => { 
            e.HasKey(x => x.Id);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.BalanceBefore).HasPrecision(18, 2);
            e.Property(x => x.BalanceAfter).HasPrecision(18, 2);
            e.HasIndex(x => new { x.CompanyId, x.MovementDate });
            e.HasQueryFilter(x => !x.IsDeleted);
        });
        
        // =====================================================
        // EXCHANGE TRANSACTION
        // =====================================================
        modelBuilder.Entity<ExchangeTransaction>(e => { 
            e.HasKey(x => x.Id);
            e.Property(x => x.Code).HasMaxLength(20);
            e.Property(x => x.AmountGiven).HasPrecision(18, 2);
            e.Property(x => x.AmountReceived).HasPrecision(18, 2);
            e.Property(x => x.ExchangeRate).HasPrecision(18, 6);
            e.Property(x => x.Profit).HasPrecision(18, 2);
            e.HasIndex(x => new { x.CompanyId, x.Code }).IsUnique();
            e.HasIndex(x => new { x.CompanyId, x.TransactionDate });
            e.HasIndex(x => x.ClientId);  // NEW
            e.HasQueryFilter(x => !x.IsDeleted);
        });
        
        // =====================================================
        // DAILY EXCHANGE SUMMARY
        // =====================================================
        modelBuilder.Entity<DailyExchangeSummary>(e => { 
            e.HasKey(x => x.Id);
            e.Property(x => x.OpeningKes).HasPrecision(18, 2);
            e.Property(x => x.OpeningUsd).HasPrecision(18, 2);
            e.Property(x => x.ClosingKes).HasPrecision(18, 2);
            e.Property(x => x.ClosingUsd).HasPrecision(18, 2);
            e.Property(x => x.KesVolumeIn).HasPrecision(18, 2);
            e.Property(x => x.KesVolumeOut).HasPrecision(18, 2);
            e.Property(x => x.UsdVolumeIn).HasPrecision(18, 2);
            e.Property(x => x.UsdVolumeOut).HasPrecision(18, 2);
            e.Property(x => x.KesProfit).HasPrecision(18, 2);
            e.Property(x => x.UsdProfit).HasPrecision(18, 2);
            e.Property(x => x.ActualKesCount).HasPrecision(18, 2);  // NEW
            e.Property(x => x.ActualUsdCount).HasPrecision(18, 2);  // NEW
            e.Property(x => x.KesVariance).HasPrecision(18, 2);     // NEW
            e.Property(x => x.UsdVariance).HasPrecision(18, 2);     // NEW
            e.HasIndex(x => new { x.CompanyId, x.Date }).IsUnique();
            e.HasQueryFilter(x => !x.IsDeleted);
        });

        modelBuilder.Entity<ClientIdentity>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.PhoneNumber).IsRequired().HasMaxLength(20);
            e.HasIndex(x => x.PhoneNumber).IsUnique().HasFilter("\"IsDeleted\" = false");
            e.HasQueryFilter(x => !x.IsDeleted);
        });
        modelBuilder.Entity<ClientIdentityDevice>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.DeviceIdHash).IsRequired().HasMaxLength(64);
            e.HasIndex(x => new { x.ClientIdentityId, x.DeviceIdHash }).IsUnique();
            e.HasOne<ClientIdentity>().WithMany().HasForeignKey(x => x.ClientIdentityId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PinGrant>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.CompanyId, x.UserId }).IsUnique(); // one live approval per user
            e.HasIndex(x => x.ExpiresAt);
        });

        ConfigureForeignKeys(modelBuilder);
    }
#pragma warning restore CS0618

    /// <summary>
    /// Referential integrity. Until now the database had no foreign keys at all, so a
    /// row could point at a bureau, client or invoice that doesn't exist and nothing
    /// would stop it. Every key is RESTRICT: records are soft-deleted, never removed,
    /// and a hard delete of a parent must fail rather than cascade through money rows.
    ///
    /// Deliberately NOT keyed: Transaction source/destination accounts (one column
    /// points at a cash, bank, M-Pesa or client row depending on the account type),
    /// UserId columns (an office login's UserId is its CompanyId, not a Users row),
    /// log tables, and ClientAlert.ClientId (Guid.Empty means "the whole office").
    /// </summary>
    private static void ConfigureForeignKeys(ModelBuilder b)
    {
        static void ToCompany<T>(ModelBuilder b) where T : class =>
            b.Entity<T>().HasOne<Company>().WithMany()
                .HasForeignKey("CompanyId").OnDelete(DeleteBehavior.Restrict);

        ToCompany<BankAccount>(b);
        ToCompany<MpesaAgent>(b);
        ToCompany<CashAccount>(b);
        ToCompany<Transaction>(b);
        ToCompany<ExpenseCategory>(b);
        ToCompany<Expense>(b);
        ToCompany<ExchangeRate>(b);
        ToCompany<ExchangeFloat>(b);
        ToCompany<ExchangeFloatBalance>(b);
        ToCompany<FloatMovement>(b);
        ToCompany<ExchangeTransaction>(b);
        ToCompany<DailyExchangeSummary>(b);
        ToCompany<DailyExchangeCurrencySummary>(b);
        ToCompany<Invoice>(b);
        ToCompany<Reconciliation>(b);
        ToCompany<ClientCurrencyBalance>(b);
        ToCompany<SubscriptionPayment>(b);
        ToCompany<BalanceAlertRule>(b);
        // Users.CompanyId is null for super admins: optional key.
        b.Entity<User>().HasOne<Company>().WithMany()
            .HasForeignKey(x => x.CompanyId).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        // Phone login link: at most one client account per bureau per identity.
        b.Entity<User>().HasOne<ClientIdentity>().WithMany()
            .HasForeignKey(x => x.ClientIdentityId).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        b.Entity<User>().HasIndex(x => new { x.ClientIdentityId, x.CompanyId }).IsUnique()
            .HasFilter("\"ClientIdentityId\" IS NOT NULL");

        b.Entity<ClientCurrencyBalance>().HasOne<User>().WithMany()
            .HasForeignKey(x => x.ClientId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<ExchangeTransaction>().HasOne<User>().WithMany()
            .HasForeignKey(x => x.ClientId).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Invoice>().HasOne<User>().WithMany()
            .HasForeignKey(x => x.ClientId).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
        b.Entity<InvoiceItem>().HasOne<Invoice>().WithMany()
            .HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Expense>().HasOne<ExpenseCategory>().WithMany()
            .HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<DailyExchangeCurrencySummary>().HasOne<DailyExchangeSummary>().WithMany()
            .HasForeignKey(x => x.DailyExchangeSummaryId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<FloatMovement>().HasOne<ExchangeFloat>().WithMany()
            .HasForeignKey(x => x.ExchangeFloatId).IsRequired(false).OnDelete(DeleteBehavior.Restrict);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries<BaseEntity>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = DateTime.UtcNow;
                entry.Entity.UpdatedAt = DateTime.UtcNow;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = DateTime.UtcNow;
            }
        }
        return base.SaveChangesAsync(cancellationToken);
    }
}