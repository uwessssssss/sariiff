using Microsoft.EntityFrameworkCore;
using SARIFF.Core.Enums;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>Whether an account may take a NEW posting. Reversing an old one is always allowed.</summary>
public static class AccountActivity
{
    /// <summary>Null when the account is usable; otherwise the reason, ready to show.</summary>
    public static async Task<string?> SwitchedOffAsync(AppDbContext db, Guid companyId, AccountType type, Guid id)
    {
        switch (type)
        {
            case AccountType.Bank:
                var bank = await db.BankAccounts.Where(b => b.Id == id && b.CompanyId == companyId)
                    .Select(b => new { b.BankName, b.IsActive }).FirstOrDefaultAsync();
                return bank is { IsActive: false } ? $"{bank.BankName} is deactivated. Switch it back on to use it." : null;
            case AccountType.Mpesa:
                var agent = await db.MpesaAgents.Where(m => m.Id == id && m.CompanyId == companyId)
                    .Select(m => new { m.AgentName, m.IsActive }).FirstOrDefaultAsync();
                return agent is { IsActive: false } ? $"{agent.AgentName} is deactivated. Switch it back on to use it." : null;
            case AccountType.Client:
                var client = await db.Users.Where(u => u.Id == id && u.CompanyId == companyId)
                    .Select(u => new { u.FullName, u.IsActive }).FirstOrDefaultAsync();
                return client is { IsActive: false } ? $"{client.FullName} is archived. Reactivate the client first." : null;
            case AccountType.Expense:
                var category = await db.ExpenseCategories.Where(c => c.Id == id && c.CompanyId == companyId)
                    .Select(c => new { c.Name, c.IsActive }).FirstOrDefaultAsync();
                return category is { IsActive: false } ? $"Expense category {category.Name} is switched off." : null;
            default:
                return null;
        }
    }
}
