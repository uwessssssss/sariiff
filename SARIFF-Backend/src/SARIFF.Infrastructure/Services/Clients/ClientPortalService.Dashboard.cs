
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using System.Globalization;
using System.Text;

namespace SARIFF.Infrastructure.Services;

public partial class ClientPortalService
{
    // ==================== DASHBOARD ====================

    public async Task<ApiResponse<ClientDashboardDto>> GetDashboardAsync(Guid companyId, Guid clientId)
    {
        var client = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == clientId && u.CompanyId == companyId && 
                                      u.Role == UserRole.Client && !u.IsDeleted);

        if (client == null)
            return new ApiResponse<ClientDashboardDto>(false, "Client not found", null);

        // Get profile with totals
        var profile = await BuildProfileAsync(companyId, client);

        // Recent transactions (last 10)
        var recentTransactions = (await LedgerAsync(companyId, clientId)).TakeLast(10).Reverse().ToList();

        // Recent alerts (last 5)
        var recentAlerts = await _context.Set<ClientAlert>()
            .Where(a => a.ClientId == clientId && a.CompanyId == companyId && !a.IsDeleted)
            .OrderByDescending(a => a.CreatedAt)
            .Take(5)
            .Select(a => new ClientAlertDto
            {
                Id = a.Id,
                Type = a.Type,
                Title = a.Title,
                Message = a.Message,
                IsRead = a.IsRead,
                CreatedAt = a.CreatedAt,
                RelatedTransactionId = a.RelatedTransactionId
            })
            .ToListAsync();

        // Quick stats for this month
        var startOfMonth = BureauClock.MonthStartUtc(BureauClock.TodayLocal); // the bureau's month
        var monthTxns = await GetClientTransactionsQuery(companyId, clientId)
            .Where(t => t.TransactionDate >= startOfMonth)
            .ToListAsync();

        var (inKES, outKES, inUSD, outUSD) = CalculateInOut(monthTxns, clientId);
        
        var unreadCount = await _context.Set<ClientAlert>()
            .CountAsync(a => a.ClientId == clientId && a.CompanyId == companyId && !a.IsDeleted && !a.IsRead);

        var quickStats = new QuickStatsDto
        {
            ThisMonthInKES = inKES,
            ThisMonthOutKES = outKES,
            ThisMonthInUSD = inUSD,
            ThisMonthOutUSD = outUSD,
            ThisMonthOtherCurrencies = OtherCurrencyFlows(monthTxns, clientId),
            TransactionCount = await GetClientTransactionsQuery(companyId, clientId).CountAsync(),
            UnreadAlerts = unreadCount
        };

        return new ApiResponse<ClientDashboardDto>(true, "Success", new ClientDashboardDto
        {
            Profile = profile,
            RecentTransactions = recentTransactions,
            RecentAlerts = recentAlerts,
            QuickStats = quickStats
        });
    }


    // ==================== PROFILE ====================

    public async Task<ApiResponse<ClientProfileDto>> GetProfileAsync(Guid companyId, Guid clientId)
    {
        var client = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == clientId && u.CompanyId == companyId && 
                                      u.Role == UserRole.Client && !u.IsDeleted);

        if (client == null)
            return new ApiResponse<ClientProfileDto>(false, "Client not found", null);

        return new ApiResponse<ClientProfileDto>(true, "Success", await BuildProfileAsync(companyId, client));
    }

    public async Task<ApiResponse<ClientProfileDto>> UpdateProfileAsync(Guid companyId, Guid clientId, UpdateClientProfileDto dto)
    {
        var client = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == clientId && u.CompanyId == companyId && 
                                      u.Role == UserRole.Client && !u.IsDeleted);

        if (client == null)
            return new ApiResponse<ClientProfileDto>(false, "Client not found", null);

        if (!string.IsNullOrWhiteSpace(dto.Email))
        {
            var emailCheck = ValidationHelper.ValidateEmail(dto.Email);
            if (!emailCheck.IsValid)
                return new ApiResponse<ClientProfileDto>(false, emailCheck.Error!, null);
            client.Email = dto.Email;
        }

        if (!string.IsNullOrWhiteSpace(dto.WhatsAppNumber))
        {
            var phoneCheck = ValidationHelper.ValidatePhone(dto.WhatsAppNumber, "WhatsApp number");
            if (!phoneCheck.IsValid)
                return new ApiResponse<ClientProfileDto>(false, phoneCheck.Error!, null);

            // Check if another client has this number
            var exists = await _context.Users.AnyAsync(u => 
                u.Id != clientId && u.CompanyId == companyId && 
                u.WhatsAppNumber == dto.WhatsAppNumber && !u.IsDeleted);
            
            if (exists)
                return new ApiResponse<ClientProfileDto>(false, "WhatsApp number already in use", null);
            
            if (client.WhatsAppNumber != dto.WhatsAppNumber && client.ClientIdentityId != null)
            {
                // The phone login was proved on the OLD number. Keep it attached and whoever
                // gets that number next could open this account. Cut the link; the client
                // links again from the new number.
                client.ClientIdentityId = null;
                client.IdentityLinkedAt = null;
                foreach (var session in await _context.UserSessions
                             .Where(x => x.UserId == client.Id && x.ClientIdentityId != null && !x.IsRevoked).ToListAsync())
                    session.IsRevoked = true;
            }
            client.WhatsAppNumber = dto.WhatsAppNumber;
        }

        await _context.SaveChangesAsync();

        return new ApiResponse<ClientProfileDto>(true, "Profile updated", await BuildProfileAsync(companyId, client));
    }
}
