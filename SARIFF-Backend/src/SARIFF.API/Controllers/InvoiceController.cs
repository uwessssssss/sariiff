using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using SARIFF.Infrastructure.Services;

namespace SARIFF.API.Controllers;

[Authorize(Policy = "OfficeUserOnly")] 
[Route("api/invoice")]
public class InvoiceController : BaseApiController
{
    private readonly IInvoiceService _invoiceService;

    public InvoiceController(IInvoiceService invoiceService) => _invoiceService = invoiceService;

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateInvoiceDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _invoiceService.CreateAsync(CompanyId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int page = 1, [FromQuery] int pageSize = 10)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _invoiceService.GetAllAsync(CompanyId.Value, page, pageSize);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _invoiceService.GetByIdAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : NotFound(result);
    }

    [HttpPut("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateInvoiceStatusDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _invoiceService.UpdateStatusAsync(CompanyId.Value, id, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _invoiceService.DeleteAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("{id:guid}/pdf")]
    public async Task<IActionResult> GeneratePdf(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _invoiceService.GeneratePdfAsync(CompanyId.Value, id);
        if (!result.Success || result.Data == null) return BadRequest(result);
        return File(result.Data, "application/pdf", $"invoice-{id}.pdf");
    }
}
