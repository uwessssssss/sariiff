
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
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 1000);

        // The whole account, oldest first, each line carrying its real balance. Filters are
        // applied AFTER the balances are worked out, on the client's own side of each posting
        // (their currency, and money in / money out as they see it). Before Nov 2026 the
        // balances were recomputed over the filtered rows only (a search for "rent" showed
        // balances that ignored everything else), the currency and type filters looked at
        // the posting's first side, and page 1 held the OLDEST rows.
        IEnumerable<ClientTransactionDto> lines = await LedgerAsync(companyId, clientId);

        // Dates picked in the app are bureau-local days; the end day is included in full.
        var (fromUtc, toExclusive) = BureauClock.Range(filters.StartDate, filters.EndDate);
        if (fromUtc.HasValue) { var v = fromUtc.Value; lines = lines.Where(t => t.Date >= v); }
        if (toExclusive.HasValue) { var v = toExclusive.Value; lines = lines.Where(t => t.Date < v); }
        if (filters.Currency.HasValue) { var v = filters.Currency.Value; lines = lines.Where(t => t.Currency == v); }
        if (filters.Type.HasValue) { var v = filters.Type.Value.ToString(); lines = lines.Where(t => t.Type == v); }
        if (!string.IsNullOrWhiteSpace(filters.Search))
        {
            var search = filters.Search.Trim();
            lines = lines.Where(t =>
                (t.Description ?? "").Contains(search, StringComparison.OrdinalIgnoreCase) ||
                (t.Reference ?? "").Contains(search, StringComparison.OrdinalIgnoreCase) ||
                (t.Code ?? "").Contains(search, StringComparison.OrdinalIgnoreCase));
        }

        var matched = lines.ToList();
        matched.Reverse();   // newest first: page 1 is the latest activity
        var pageItems = matched.Skip((page - 1) * pageSize).Take(pageSize).ToList();

        return new ApiResponse<PagedResult<ClientTransactionDto>>(true, "Success",
            new PagedResult<ClientTransactionDto>(pageItems, matched.Count, page, pageSize));
    }

    public async Task<ApiResponse<ClientTransactionDto>> GetTransactionByIdAsync(Guid companyId, Guid clientId, Guid transactionId)
    {
        // From the ledger, so the balances match the list and the statement.
        var line = (await LedgerAsync(companyId, clientId)).FirstOrDefault(t => t.Id == transactionId);

        if (line == null)
            return new ApiResponse<ClientTransactionDto>(false, "Transaction not found", null);

        return new ApiResponse<ClientTransactionDto>(true, "Success", line);
    }

    public async Task<byte[]> GenerateTransactionReceiptAsync(Guid companyId, Guid clientId, Guid transactionId)
    {
        var transaction = await GetClientTransactionsQuery(companyId, clientId)
            .FirstOrDefaultAsync(t => t.Id == transactionId);

        if (transaction == null)
            throw new Exception("Transaction not found");

        var client = await _context.Users.FindAsync(clientId);
        var dto = (await LedgerAsync(companyId, clientId)).First(t => t.Id == transactionId);

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
