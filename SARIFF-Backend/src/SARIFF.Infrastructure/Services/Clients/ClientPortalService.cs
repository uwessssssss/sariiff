
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using System.Globalization;
using System.Text;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// What a signed-in client sees: dashboard + profile, transactions + receipts, statement
/// (PDF/CSV), alerts, analytics, password. Split into ClientPortalService.Dashboard /
/// .Transactions / .Statement / .Alerts / .Analytics / .Helpers.
/// </summary>
public partial class ClientPortalService : IClientPortalService
{
    private readonly AppDbContext _context;

    public ClientPortalService(AppDbContext context)
    {
        _context = context;
    }
}
