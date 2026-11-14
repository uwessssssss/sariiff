using SARIFF.Core.Interfaces;
using SARIFF.Core.Enums;

namespace SARIFF.Core.DTOs;

public record CreateInvoiceDto(
    Guid? ClientId,
    string ClientName,
    string? ClientEmail,
    string? ClientPhone,
    string? ClientAddress,
    DateTime DueDate,
    Currency Currency,
    List<InvoiceItemDto> Items,
    decimal TaxRate,
    decimal DiscountAmount,
    string? Notes,
    string? Terms,
    // The invoice's own date (the web form asks for it); null means today.
    DateTime? InvoiceDate = null
);

public record InvoiceItemDto(
    string Description,
    decimal Quantity,
    decimal UnitPrice
);

public record InvoiceResponseDto(
    Guid Id,
    string InvoiceNumber,
    Guid? ClientId,
    string ClientName,
    string? ClientEmail,
    string? ClientPhone,
    string? ClientAddress,
    DateTime InvoiceDate,
    DateTime DueDate,
    Currency Currency,
    InvoiceStatus Status,
    decimal Subtotal,
    decimal TaxRate,
    decimal TaxAmount,
    decimal DiscountAmount,
    decimal Total,
    string? Notes,
    string? Terms,
    List<InvoiceItemResponseDto> Items
);

public record InvoiceItemResponseDto(
    Guid Id,
    string Description,
    decimal Quantity,
    decimal UnitPrice,
    decimal Amount
);

public record UpdateInvoiceStatusDto(InvoiceStatus Status);
