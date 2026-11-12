
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
    // ==================== TRANSACTIONS ====================

    public async Task<ApiResponse<PagedResult<ClientTransactionDto>>> GetTransactionsAsync(
        Guid companyId, Guid clientId, int page, int pageSize, TransactionFilters filters)
    {
        // Dates picked in the app are bureau-local days; the end day is included in full.
        var (fromUtc, toExclusive) = BureauClock.Range(filters.StartDate, filters.EndDate);

        var query = GetClientTransactionsQuery(companyId, clientId);

        // Apply filters
        if (fromUtc.HasValue) { var v = fromUtc.Value; query = query.Where(t => t.TransactionDate >= v); }
        if (toExclusive.HasValue) { var v = toExclusive.Value; query = query.Where(t => t.TransactionDate < v); }
        if (filters.Currency.HasValue) { var v = filters.Currency.Value; query = query.Where(t => t.Currency == v); }  // FIX #12: Only match primary currency

        if (filters.Type.HasValue) { var v = filters.Type.Value; query = query.Where(t => t.TransactionType == v); }
        if (!string.IsNullOrWhiteSpace(filters.Search))
        {
            var search = filters.Search.ToLower();
            query = query.Where(t =>
                t.Description.ToLower().Contains(search) ||
                t.Reference.ToLower().Contains(search) ||
                t.Code.ToLower().Contains(search));
        }

        var totalCount = await query.CountAsync();

        // FIX: Compute running balances dynamically
        // Get all matching transactions up to end of current page (chronological order)
        var allUpToPage = await query
            .OrderBy(t => t.TransactionDate)
            .ThenBy(t => t.CreatedAt)
            .Take(page * pageSize)  // Only need up to end of current page
            .ToListAsync();

        var allMapped = allUpToPage.Select(t => MapToClientTransactionDto(t, clientId)).ToList();

        // Running balance PER CURRENCY. KES/USD openings live on the client;
        // UGX/EUR/... openings live in ClientCurrencyBalances. (Previously every
        // non-KES line was added to the USD balance.)
        var client = await _context.Users.FindAsync(clientId);
        var running = new Dictionary<Currency, decimal>
        {
            [Currency.KES] = client?.OpeningBalanceKES ?? 0,
            [Currency.USD] = client?.OpeningBalanceUSD ?? 0
        };
        var otherOpenings = await _context.ClientCurrencyBalances
            .Where(b => b.ClientId == clientId && b.CompanyId == companyId && !b.IsDeleted)
            .Select(b => new { b.Currency, b.OpeningBalance })
            .ToListAsync();
        foreach (var o in otherOpenings) running[o.Currency] = o.OpeningBalance;

        // If there are filters, account for transactions BEFORE the filtered period
        if (fromUtc.HasValue)
        {
            var priorTo = fromUtc.Value;
            var prior = await GetClientTransactionsQuery(companyId, clientId)
                .Where(t => t.TransactionDate < priorTo)
                .ToListAsync();
            foreach (var t in prior)
            {
                var dto = MapToClientTransactionDto(t, clientId);
                running.TryGetValue(dto.Currency, out var bal);
                running[dto.Currency] = bal + (dto.Type == "Credit" ? dto.Amount : -dto.Amount);
            }
        }

        // Compute running balances through all items up to current page
        foreach (var item in allMapped)
        {
            running.TryGetValue(item.Currency, out var bal);
            item.BalanceBefore = bal;
            bal += item.Type == "Credit" ? item.Amount : -item.Amount;
            running[item.Currency] = bal;
            item.BalanceAfter = bal;
        }

        // Extract only current page items, reversed for newest-first display
        var skipCount = (page - 1) * pageSize;
        var pageItems = allMapped.Skip(skipCount).Take(pageSize).Reverse().ToList();

        return new ApiResponse<PagedResult<ClientTransactionDto>>(true, "Success",
            new PagedResult<ClientTransactionDto>(pageItems, totalCount, page, pageSize));
    }

    public async Task<ApiResponse<ClientTransactionDto>> GetTransactionByIdAsync(Guid companyId, Guid clientId, Guid transactionId)
    {
        var transaction = await GetClientTransactionsQuery(companyId, clientId)
            .FirstOrDefaultAsync(t => t.Id == transactionId);

        if (transaction == null)
            return new ApiResponse<ClientTransactionDto>(false, "Transaction not found", null);

        return new ApiResponse<ClientTransactionDto>(true, "Success", MapToClientTransactionDto(transaction, clientId));
    }

    public async Task<byte[]> GenerateTransactionReceiptAsync(Guid companyId, Guid clientId, Guid transactionId)
    {
        var transaction = await GetClientTransactionsQuery(companyId, clientId)
            .FirstOrDefaultAsync(t => t.Id == transactionId);

        if (transaction == null)
            throw new Exception("Transaction not found");

        var client = await _context.Users.FindAsync(clientId);
        var dto = MapToClientTransactionDto(transaction, clientId);

        var sb = new StringBuilder();
        sb.AppendLine("=====================================");
        sb.AppendLine("         TRANSACTION RECEIPT");
        sb.AppendLine("=====================================");
        sb.AppendLine();
        sb.AppendLine($"Receipt No: {transaction.Code}");
        sb.AppendLine($"Date: {BureauClock.ToLocal(transaction.TransactionDate):yyyy-MM-dd HH:mm}");
        sb.AppendLine();
        sb.AppendLine($"Client: {client?.FullName}");
        sb.AppendLine($"Client ID: {client?.Code}");
        sb.AppendLine();
        sb.AppendLine("-------------------------------------");
        sb.AppendLine($"Type: {dto.Type}");
        sb.AppendLine($"Description: {transaction.Description}");
        sb.AppendLine($"Reference: {transaction.Reference}");
        sb.AppendLine();
        sb.AppendLine($"Amount: {dto.Currency} {dto.Amount:N2}");
        sb.AppendLine($"Balance Before: {dto.Currency} {dto.BalanceBefore:N2}");
        sb.AppendLine($"Balance After: {dto.Currency} {dto.BalanceAfter:N2}");
        sb.AppendLine();
        if (dto.ExchangeRate.HasValue)
        {
            sb.AppendLine($"Exchange Rate: {dto.ExchangeRate:N4}");
            sb.AppendLine($"Counter Amount: {dto.CounterCurrency} {dto.CounterAmount:N2}");
            sb.AppendLine();
        }
        sb.AppendLine($"Status: {transaction.ReconciliationStatus}");
        sb.AppendLine();
        sb.AppendLine("-------------------------------------");
        sb.AppendLine($"Generated: {BureauClock.LocalNow:yyyy-MM-dd HH:mm} EAT");
        sb.AppendLine("=====================================");

        return Encoding.UTF8.GetBytes(sb.ToString());
    }
}
