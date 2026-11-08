// ============================================================
// SARIFF Backend — Push Notification Support
// ============================================================
// Add these to your existing backend project:
//
// 1. Add this entity to Entities.cs
// 2. Add the service to DependencyInjection.cs
// 3. Add the controller to Controllers.cs
// 4. Add DbSet to AppDbContext
// 5. Run migration: dotnet ef migrations add AddDeviceTokens
// 6. Install: dotnet add package FirebaseAdmin
// 7. Place firebase-service-account.json in project root
// 8. Wire NotificationService.NotifyClientAsync() calls into
//    TransactionService.CreateAsync() and ExchangeService.CreateAsync()
//
// MULTI-BUREAU SUPPORT:
// - One device token maps to MULTIPLE user accounts (same client at different bureaus)
// - RegisterTokenAsync does NOT overwrite — creates per-user entries
// - Push notifications include company name so client knows which bureau
// - Logout does NOT remove device token — all bureaus can still notify
// - RemoveTokenAsync only removes for the specific user, not all users
// ============================================================

// ==================== 1. ENTITY (add to Entities.cs) ====================

/*
public class DeviceToken : BaseEntity
{
    public Guid UserId { get; set; }
    public string Token { get; set; } = string.Empty;
    public string Platform { get; set; } = "unknown"; // "ios", "android", "web"
    public string? DeviceName { get; set; }
    public DateTime LastUsedAt { get; set; } = DateTime.UtcNow;
}
*/

// ==================== 2. DBSET (add to AppDbContext.cs) ====================

/*
public DbSet<DeviceToken> DeviceTokens { get; set; } = null!;
*/

// ==================== 3. SERVICE ====================

/*
using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using Google.Apis.Auth.OAuth2;
using Microsoft.EntityFrameworkCore;

public interface INotificationService
{
    Task RegisterTokenAsync(Guid userId, string token, string platform, string? deviceName);
    Task RemoveTokenAsync(Guid userId, string token);
    Task NotifyClientAsync(Guid clientId, string title, string body, Dictionary<string, string>? data = null);
    Task CreateClientAlertAsync(Guid companyId, Guid clientId, string type, string title, string message, Guid? relatedTransactionId = null);
}

public class NotificationService : INotificationService
{
    private readonly AppDbContext _context;
    private static bool _firebaseInitialized = false;

    public NotificationService(AppDbContext context)
    {
        _context = context;
        InitializeFirebase();
    }

    private static void InitializeFirebase()
    {
        if (_firebaseInitialized) return;
        try
        {
            var credPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "firebase-service-account.json");
            if (File.Exists(credPath))
            {
                FirebaseApp.Create(new AppOptions
                {
                    Credential = GoogleCredential.FromFile(credPath)
                });
                _firebaseInitialized = true;
            }
            else
            {
                Console.WriteLine("WARNING: firebase-service-account.json not found. Push notifications disabled.");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Firebase init error: {ex.Message}");
        }
    }

    public async Task RegisterTokenAsync(Guid userId, string token, string platform, string? deviceName)
    {
        // MULTI-BUREAU FIX: Don't overwrite — one token can belong to multiple users
        // (same client at different bureaus receives notifications from all)
        var existing = await _context.DeviceTokens
            .FirstOrDefaultAsync(t => t.Token == token && t.UserId == userId);
        
        if (existing != null)
        {
            // Same user, same token — just refresh timestamp
            existing.Platform = platform;
            existing.DeviceName = deviceName;
            existing.LastUsedAt = DateTime.UtcNow;
        }
        else
        {
            // New registration — could be same device, different bureau account
            _context.DeviceTokens.Add(new DeviceToken
            {
                UserId = userId,
                Token = token,
                Platform = platform,
                DeviceName = deviceName,
            });
        }
        await _context.SaveChangesAsync();
    }

    public async Task RemoveTokenAsync(Guid userId, string token)
    {
        // Only remove token for THIS user — other bureau accounts keep their registration
        var existing = await _context.DeviceTokens
            .FirstOrDefaultAsync(t => t.Token == token && t.UserId == userId);
        if (existing != null)
        {
            _context.DeviceTokens.Remove(existing);
            await _context.SaveChangesAsync();
        }
    }

    public async Task NotifyClientAsync(Guid clientId, string title, string body, Dictionary<string, string>? data = null)
    {
        if (!_firebaseInitialized) return;

        var tokens = await _context.DeviceTokens
            .Where(t => t.UserId == clientId && !t.IsDeleted)
            .Select(t => t.Token)
            .ToListAsync();

        if (!tokens.Any()) return;

        var message = new MulticastMessage
        {
            Tokens = tokens,
            Notification = new Notification
            {
                Title = title,
                Body = body,
            },
            Data = data ?? new Dictionary<string, string>(),
            Android = new AndroidConfig
            {
                Priority = Priority.High,
                Notification = new AndroidNotification
                {
                    ChannelId = "transactions",
                    Sound = "default",
                }
            },
            Apns = new ApnsConfig
            {
                Aps = new Aps
                {
                    Sound = "default",
                    Badge = 1,
                }
            }
        };

        try
        {
            var response = await FirebaseMessaging.DefaultInstance.SendEachForMulticastAsync(message);
            
            // Clean up invalid tokens
            if (response.FailureCount > 0)
            {
                var invalidTokens = new List<string>();
                for (int i = 0; i < response.Responses.Count; i++)
                {
                    if (!response.Responses[i].IsSuccess &&
                        response.Responses[i].Exception?.MessagingErrorCode == MessagingErrorCode.Unregistered)
                    {
                        invalidTokens.Add(tokens[i]);
                    }
                }
                if (invalidTokens.Any())
                {
                    var toRemove = await _context.DeviceTokens
                        .Where(t => invalidTokens.Contains(t.Token))
                        .ToListAsync();
                    _context.DeviceTokens.RemoveRange(toRemove);
                    await _context.SaveChangesAsync();
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Push notification error: {ex.Message}");
        }
    }

    public async Task CreateClientAlertAsync(Guid companyId, Guid clientId, string type, string title, string message, Guid? relatedTransactionId = null)
    {
        _context.Set<ClientAlert>().Add(new ClientAlert
        {
            ClientId = clientId,
            CompanyId = companyId,
            Type = type,
            Title = title,
            Message = message,
            RelatedTransactionId = relatedTransactionId,
        });
        await _context.SaveChangesAsync();
    }
}
*/

// ==================== 4. CONTROLLER (add to Controllers.cs) ====================

/*
[ApiController]
[Route("api/device-token")]
[Authorize]
public class DeviceTokenController : BaseController
{
    private readonly INotificationService _notificationService;

    public DeviceTokenController(INotificationService notificationService)
    {
        _notificationService = notificationService;
    }

    [HttpPost]
    public async Task<IActionResult> Register([FromBody] RegisterTokenDto dto)
    {
        if (!UserId.HasValue) return Unauthorized();
        await _notificationService.RegisterTokenAsync(UserId.Value, dto.Token, dto.Platform, dto.DeviceName);
        return Ok(new ApiResponse<bool>(true, "Token registered", true));
    }

    [HttpDelete]
    public async Task<IActionResult> Remove([FromBody] RemoveTokenDto dto)
    {
        if (!UserId.HasValue) return Unauthorized();
        await _notificationService.RemoveTokenAsync(UserId.Value, dto.Token);
        return Ok(new ApiResponse<bool>(true, "Token removed", true));
    }
}

public record RegisterTokenDto(string Token, string Platform, string? DeviceName);
public record RemoveTokenDto(string Token);
*/

// ==================== 5. WIRE INTO TRANSACTION SERVICE ====================
// In TransactionService.CreateAsync(), after saving the transaction:

/*
// After: await _context.SaveChangesAsync();

// Auto-notify client (with company name for multi-bureau)
if (dto.SourceAccountType == AccountType.Client || dto.DestAccountType == AccountType.Client)
{
    var clientId = dto.SourceAccountType == AccountType.Client ? dto.SourceAccountId : dto.DestAccountId;
    var client = await _context.Users.FindAsync(clientId);
    if (client != null)
    {
        // Get company name for the notification
        var companyName = await _context.Companies
            .Where(c => c.Id == companyId)
            .Select(c => c.Name)
            .FirstOrDefaultAsync() ?? "SARIFF";

        var currency = dto.Currency == Currency.KES ? "KES" : "USD";
        var amount = dto.Amount.ToString("N2");
        var title = $"🏦 {companyName}";
        var body = $"{currency} {amount} - {dto.Description}. Ref: {transaction.Code}";

        // Push notification
        await _notificationService.NotifyClientAsync(clientId, title, body, new Dictionary<string, string>
        {
            { "type", "transaction" },
            { "transactionId", transaction.Id.ToString() },
            { "code", transaction.Code },
            { "companyId", companyId.ToString() },
            { "companyName", companyName },
        });

        // In-app alert
        if (CompanyId.HasValue)
        {
            await _notificationService.CreateClientAlertAsync(
                CompanyId.Value, clientId, "success", 
                $"Transaction: {currency} {amount}", body, transaction.Id);
        }
    }
}
*/

// ==================== 6. WIRE INTO EXCHANGE SERVICE ====================
// In ExchangeService.CreateAsync(), after saving:

/*
if (transaction.ClientId.HasValue)
{
    var client = await _context.Users.FindAsync(transaction.ClientId.Value);
    if (client != null)
    {
        // Get company name for multi-bureau
        var companyName = await _context.Companies
            .Where(c => c.Id == companyId)
            .Select(c => c.Name)
            .FirstOrDefaultAsync() ?? "SARIFF";

        var dir = transaction.Direction == ExchangeDirection.UsdToKes ? "USD → KES" : "KES → USD";
        var title = $"🏦 {companyName}";
        var body = $"Exchange {dir}: {transaction.AmountGiven:N2} @ {transaction.ExchangeRate}. Ref: {transaction.Code}";

        await _notificationService.NotifyClientAsync(transaction.ClientId.Value, title, body, new Dictionary<string, string>
        {
            { "type", "exchange" },
            { "code", transaction.Code },
            { "companyId", companyId.ToString() },
            { "companyName", companyName },
        });

        if (CompanyId.HasValue)
        {
            await _notificationService.CreateClientAlertAsync(
                CompanyId.Value, transaction.ClientId.Value, "success", 
                $"Exchange: {dir}", body);
        }
    }
}
*/

// ==================== 7. DEPENDENCY INJECTION (add to DI) ====================

/*
services.AddScoped<INotificationService, NotificationService>();
*/

// ==================== 8. FIREBASE SETUP ====================
// 1. Go to https://console.firebase.google.com
// 2. Create project or use existing
// 3. Go to Project Settings → Service Accounts
// 4. Click "Generate New Private Key"
// 5. Save as firebase-service-account.json in backend root
// 6. For Expo push tokens, configure FCM in your Firebase project
//    and add the FCM server key to your Expo project config
