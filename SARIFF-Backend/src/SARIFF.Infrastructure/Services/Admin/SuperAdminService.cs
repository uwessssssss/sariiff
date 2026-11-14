
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using System.Diagnostics;
using System.Text;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Platform owner tools: dashboard, companies and subscriptions, system health, security,
/// payments, analytics, audit logs. Split by area into SuperAdminService.Dashboard /
/// .Companies / .Health / .Security / .Financial / .Analytics.
/// </summary>
public partial class SuperAdminService : ISuperAdminService
{
    private readonly AppDbContext _context;
    private readonly ILogger<SuperAdminService> _logger;
    private static readonly DateTime _startTime = DateTime.UtcNow;

    public SuperAdminService(AppDbContext context, ILogger<SuperAdminService> logger)
    {
        _context = context;
        _logger = logger;
    }
}
