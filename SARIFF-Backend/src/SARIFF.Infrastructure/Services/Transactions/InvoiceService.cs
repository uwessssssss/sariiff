using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public class InvoiceService : IInvoiceService
{
    private readonly AppDbContext _context;

    public InvoiceService(AppDbContext context) => _context = context;

    public async Task<ApiResponse<InvoiceResponseDto>> CreateAsync(Guid companyId, CreateInvoiceDto dto)
    {
        // Country rule: no NEW holdings in a currency the bureau's country doesn't use (UGX in Kenya).
        var currencyBlock = await _context.CurrencyNotAllowedAsync(companyId, dto.Currency);
        if (currencyBlock != null)
            return new ApiResponse<InvoiceResponseDto>(false, currencyBlock, null);

        // Input validation
        var nameCheck = ValidationHelper.ValidateName(dto.ClientName, "Client name");
        if (!nameCheck.IsValid)
            return new ApiResponse<InvoiceResponseDto>(false, nameCheck.Error!, null);

        var emailCheck = ValidationHelper.ValidateEmail(dto.ClientEmail);
        if (!emailCheck.IsValid)
            return new ApiResponse<InvoiceResponseDto>(false, emailCheck.Error!, null);

        if (dto.Items == null || dto.Items.Count == 0)
            return new ApiResponse<InvoiceResponseDto>(false, "Invoice must have at least one item", null);

        foreach (var item in dto.Items)
        {
            if (string.IsNullOrWhiteSpace(item.Description))
                return new ApiResponse<InvoiceResponseDto>(false, "All invoice items must have a description", null);
            if (item.Quantity <= 0)
                return new ApiResponse<InvoiceResponseDto>(false, $"Item '{item.Description}': quantity must be greater than zero", null);
            if (item.UnitPrice < 0)
                return new ApiResponse<InvoiceResponseDto>(false, $"Item '{item.Description}': unit price cannot be negative", null);
        }

        if (dto.TaxRate < 0 || dto.TaxRate > 100)
            return new ApiResponse<InvoiceResponseDto>(false, "Tax rate must be between 0 and 100", null);

        if (dto.DiscountAmount < 0)
            return new ApiResponse<InvoiceResponseDto>(false, "Discount amount cannot be negative", null);

        if (dto.DueDate.Date < BureauClock.TodayLocal)
            return new ApiResponse<InvoiceResponseDto>(false, "Due date cannot be in the past", null);

        // Money is kept to 2 decimal places, so round each figure once, here, and build the
        // next from the rounded one: lines add up to the subtotal, and subtotal + tax −
        // discount is exactly the total. (Unrounded, 1.5 × 33.33 twice gave lines of 50.00 +
        // 50.00 under a subtotal of 99.99, and the first response showed 4-decimal totals.)
        static decimal Money(decimal v) => Math.Round(v, 2, MidpointRounding.AwayFromZero);
        var subtotal = dto.Items.Sum(i => Money(i.Quantity * i.UnitPrice));
        var taxAmount = Money(subtotal * (dto.TaxRate / 100));
        var total = subtotal + taxAmount - dto.DiscountAmount;
        if (Money(dto.DiscountAmount) != dto.DiscountAmount)
            return new ApiResponse<InvoiceResponseDto>(false, "Discount amount can have at most 2 decimal places", null);
        if (total < 0)
            return new ApiResponse<InvoiceResponseDto>(false, "Discount cannot be more than the invoice total", null);

        const int maxRetries = 3;
        for (int attempt = 0; attempt < maxRetries; attempt++)
        {
            var invoiceNumber = await CodeGenerator.GenerateInvoiceNumberAsync(_context, companyId);
            var invoice = new Invoice
            {
                CompanyId = companyId,
                InvoiceNumber = invoiceNumber,
                ClientId = dto.ClientId,
                ClientName = dto.ClientName,
                ClientEmail = dto.ClientEmail,
                ClientPhone = dto.ClientPhone,
                ClientAddress = dto.ClientAddress,
                InvoiceDate = DateTime.UtcNow,
                DueDate = dto.DueDate,
                Currency = dto.Currency,
                Status = InvoiceStatus.Draft,
                Subtotal = subtotal,
                TaxRate = dto.TaxRate,
                TaxAmount = taxAmount,
                DiscountAmount = dto.DiscountAmount,
                Total = total,
                Notes = dto.Notes,
                Terms = dto.Terms
            };

            _context.Invoices.Add(invoice);

            var sortOrder = 0;
            var items = new List<InvoiceItem>();
            foreach (var item in dto.Items)
            {
                var invoiceItem = new InvoiceItem
                {
                    InvoiceId = invoice.Id,
                    Description = item.Description,
                    Quantity = item.Quantity,
                    UnitPrice = item.UnitPrice,
                    Amount = Money(item.Quantity * item.UnitPrice),
                    SortOrder = sortOrder++
                };
                items.Add(invoiceItem);
                _context.InvoiceItems.Add(invoiceItem);
            }

            try
            {
                await _context.SaveChangesAsync();
                return await GetByIdAsync(companyId, invoice.Id);
            }
            catch (DbUpdateException) when (attempt < maxRetries - 1)
            {
                _context.Entry(invoice).State = EntityState.Detached;
                foreach (var item in items)
                    _context.Entry(item).State = EntityState.Detached;
                await Task.Delay(50 * (attempt + 1));
            }
        }
        return new ApiResponse<InvoiceResponseDto>(false, "Failed to generate unique invoice number. Please try again.", null);
    }

    public async Task<ApiResponse<InvoiceResponseDto>> GetByIdAsync(Guid companyId, Guid id)
    {
        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == id && i.CompanyId == companyId);
        if (invoice == null) return new ApiResponse<InvoiceResponseDto>(false, "Invoice not found", null);

        var items = await _context.InvoiceItems.Where(i => i.InvoiceId == id).OrderBy(i => i.SortOrder).ToListAsync();
        return new ApiResponse<InvoiceResponseDto>(true, "Success", MapToResponse(invoice, items));
    }

    public async Task<ApiResponse<PagedResult<InvoiceResponseDto>>> GetAllAsync(Guid companyId, int page, int pageSize)
    {
        var query = _context.Invoices.Where(i => i.CompanyId == companyId);
        var totalCount = await query.CountAsync();
        var invoices = await query.OrderByDescending(i => i.InvoiceDate).ThenByDescending(i => i.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

        // All line items for the page in one query (it was one query per invoice).
        var invoiceIds = invoices.Select(i => i.Id).ToList();
        var allItems = (await _context.InvoiceItems.Where(i => invoiceIds.Contains(i.InvoiceId)).ToListAsync())
            .GroupBy(i => i.InvoiceId).ToDictionary(g => g.Key, g => g.ToList());
        var items = invoices.Select(inv => MapToResponse(inv, allItems.TryGetValue(inv.Id, out var li) ? li : new List<InvoiceItem>())).ToList();

        return new ApiResponse<PagedResult<InvoiceResponseDto>>(true, "Success", new PagedResult<InvoiceResponseDto>(items, totalCount, page, pageSize));
    }

    public async Task<ApiResponse<InvoiceResponseDto>> UpdateStatusAsync(Guid companyId, Guid id, UpdateInvoiceStatusDto dto)
    {
        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == id && i.CompanyId == companyId && !i.IsDeleted);
        if (invoice == null) return new ApiResponse<InvoiceResponseDto>(false, "Invoice not found", null);

        // Validate status transitions
        var allowed = invoice.Status switch
        {
            InvoiceStatus.Draft => new[] { InvoiceStatus.Sent, InvoiceStatus.Cancelled },
            InvoiceStatus.Sent => new[] { InvoiceStatus.Paid, InvoiceStatus.Cancelled },
            InvoiceStatus.Paid => Array.Empty<InvoiceStatus>(),
            InvoiceStatus.Cancelled => Array.Empty<InvoiceStatus>(),
            _ => Array.Empty<InvoiceStatus>()
        };

        if (!allowed.Contains(dto.Status))
            return new ApiResponse<InvoiceResponseDto>(false, 
                $"Cannot change status from {invoice.Status} to {dto.Status}", null);

        invoice.Status = dto.Status;
        await _context.SaveChangesAsync();
        return await GetByIdAsync(companyId, id);
    }

    public async Task<ApiResponse<bool>> DeleteAsync(Guid companyId, Guid id)
    {
        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == id && i.CompanyId == companyId && !i.IsDeleted);
        if (invoice == null) return new ApiResponse<bool>(false, "Invoice not found", false);

        if (invoice.Status == InvoiceStatus.Paid)
            return new ApiResponse<bool>(false, "Cannot delete a paid invoice", false);

        invoice.IsDeleted = true;
        await _context.SaveChangesAsync();
        return new ApiResponse<bool>(true, "Invoice deleted", true);
    }

    public Task<ApiResponse<byte[]>> GeneratePdfAsync(Guid companyId, Guid id)
    {
        // PDF generation would require a library like QuestPDF or iTextSharp
        // For now, return placeholder
        return Task.FromResult(new ApiResponse<byte[]>(false, "PDF generation not implemented", null));
    }

    private static InvoiceResponseDto MapToResponse(Invoice i, List<InvoiceItem> items) => new(
        i.Id, i.InvoiceNumber, i.ClientId, i.ClientName, i.ClientEmail, i.ClientPhone, i.ClientAddress,
        i.InvoiceDate, i.DueDate, i.Currency, i.Status, i.Subtotal, i.TaxRate, i.TaxAmount, i.DiscountAmount, i.Total,
        i.Notes, i.Terms, items.Select(it => new InvoiceItemResponseDto(it.Id, it.Description, it.Quantity, it.UnitPrice, it.Amount)).ToList());
}
