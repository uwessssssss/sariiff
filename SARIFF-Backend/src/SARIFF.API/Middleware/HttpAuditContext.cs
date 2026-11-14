using SARIFF.Infrastructure.Data;

namespace SARIFF.API.Middleware;

/// <summary>The signed-in person behind the current request, for the audit trail.</summary>
public sealed class HttpAuditContext : IAuditContext
{
    private readonly IHttpContextAccessor _http;
    public HttpAuditContext(IHttpContextAccessor http) => _http = http;
    private HttpContext? Ctx => _http.HttpContext;

    public Guid? UserId => Ctx?.Items["UserId"] as Guid?;
    public Guid? CompanyId => Ctx?.Items["CompanyId"] as Guid?;
    public string? Role => Ctx?.Items["UserRole"] as string;
    public string? IpAddress => Ctx?.Connection.RemoteIpAddress is { } ra ? SARIFF.Infrastructure.Services.IpAccess.Normalize(ra.ToString()) : null;
    public string? UserAgent => Ctx?.Request.Headers.UserAgent.ToString();
}
