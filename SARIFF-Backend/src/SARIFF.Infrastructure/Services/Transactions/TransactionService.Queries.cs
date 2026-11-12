
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public partial class TransactionService
{
    public async Task<ApiResponse<TransactionResponseDto>> GetByIdAsync(Guid companyId, Guid id)
    {
        var transaction = await _context.Transactions.FirstOrDefaultAsync(t => t.Id == id && t.CompanyId == companyId && !t.IsDeleted);
        if (transaction == null)
            return new ApiResponse<TransactionResponseDto>(false, "Transaction not found", null);

        return new ApiResponse<TransactionResponseDto>(true, "Success", await MapToResponseAsync(transaction));
    }

    public async Task<ApiResponse<PagedResult<TransactionResponseDto>>> GetAllAsync(Guid companyId, int page, int pageSize, ReportFilterDto? filter = null)
    {
        var query = _context.Transactions.Where(t => t.CompanyId == companyId && !t.IsDeleted);

        if (filter != null)
        {
            // Dates picked in the app are bureau-local days; the end day is included in full.
            var (fromUtc, toExclusive) = BureauClock.Range(filter.StartDate, filter.EndDate);
            if (fromUtc.HasValue) { var v = fromUtc.Value; query = query.Where(t => t.TransactionDate >= v); }
            if (toExclusive.HasValue) { var v = toExclusive.Value; query = query.Where(t => t.TransactionDate < v); }
            if (filter.TransactionType.HasValue) { var v = filter.TransactionType.Value; query = query.Where(t => t.TransactionType == v); }
            if (filter.Currency.HasValue) { var v = filter.Currency.Value; query = query.Where(t => t.Currency == v); }
        }

        var totalCount = await query.CountAsync();
        var transactions = await query
            .OrderByDescending(t => t.TransactionDate)
            .ThenByDescending(t => t.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        await PreloadAccountNamesAsync(transactions);
        var items = new List<TransactionResponseDto>();
        foreach (var t in transactions)
        {
            items.Add(await MapToResponseAsync(t));
        }

        return new ApiResponse<PagedResult<TransactionResponseDto>>(true, "Success",
            new PagedResult<TransactionResponseDto>(items, totalCount, page, pageSize));
    }

    public async Task<ApiResponse<TransactionResponseDto>> UpdateAsync(Guid companyId, Guid id, UpdateTransactionDto dto)
    {
        var transaction = await _context.Transactions.FirstOrDefaultAsync(t => t.Id == id && t.CompanyId == companyId && !t.IsDeleted);
        if (transaction == null)
            return new ApiResponse<TransactionResponseDto>(false, "Transaction not found", null);

        // Cannot edit a reversed transaction or a reversal entry
        if (transaction.DeletedAt.HasValue)
            return new ApiResponse<TransactionResponseDto>(false, "Cannot edit a reversed transaction", null);
        if (transaction.Reference.StartsWith("REV-"))
            return new ApiResponse<TransactionResponseDto>(false, "Cannot edit a reversal transaction", null);
        if (transaction.Reference.StartsWith("EXC-"))
            return new ApiResponse<TransactionResponseDto>(false, "Cannot edit exchange transactions", null);
        if (transaction.Reference.StartsWith("EXP-"))
            return new ApiResponse<TransactionResponseDto>(false, "Cannot edit expense transactions", null);
        if (transaction.Reference == "FLOAT-TXN")
            return new ApiResponse<TransactionResponseDto>(false, "Cannot edit float transactions", null);

        // Only allow updating description and notes (not amounts - that would corrupt ledger)
        if (dto.Description != null) transaction.Description = dto.Description;
        if (dto.Notes != null) transaction.Notes = dto.Notes;
        transaction.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return new ApiResponse<TransactionResponseDto>(true, "Transaction updated successfully", await MapToResponseAsync(transaction));
    }
}
