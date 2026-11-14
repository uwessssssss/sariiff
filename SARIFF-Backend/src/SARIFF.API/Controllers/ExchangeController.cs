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

// =====================================================
// EXCHANGE CONTROLLER - Forex Bureau Operations
// =====================================================

/// <summary>
/// Exchange Account Controller - Forex Bureau Operations
/// Handles exchange rates, float management, transactions, and reports
/// </summary>
[Authorize(Policy = "OfficeUserOnly")]
[Route("api/exchange")]
public class ExchangeController : BaseApiController
{
    private readonly IExchangeService _exchangeService;
    private readonly ILogger<ExchangeController> _logger;

    public ExchangeController(IExchangeService exchangeService, ILogger<ExchangeController> logger)
    {
        _exchangeService = exchangeService;
        _logger = logger;
    }

    // ==================== RATE MANAGEMENT ====================

    /// <summary>
    /// Get current active exchange rate
    /// </summary>
    [HttpGet("rate")]
    public async Task<IActionResult> GetCurrentRate([FromQuery] Currency? currency = null)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetCurrentRateAsync(CompanyId.Value, currency ?? Currency.USD);
        // "No rate set yet" is a normal state (a new bureau, or a currency it doesn't trade),
        // not a bad request: the body still says success:false, but the HTTP status is 200 so
        // every office page stops logging failed requests for each currency it checks.
        return Ok(result);
    }

    /// <summary>
    /// Set new exchange rate (deactivates previous)
    /// </summary>
    [HttpPost("rate")]
    public async Task<IActionResult> SetRate([FromBody] SetExchangeRateDto dto)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();

        if (dto.BuyRate <= 0 || dto.SellRate <= 0)
            return BadRequest(new ApiResponse<object>(false, "Rates must be greater than 0", null));

        if (dto.BuyRate >= dto.SellRate)
            return BadRequest(new ApiResponse<object>(false, "Sell rate must be higher than buy rate", null));

        var result = await _exchangeService.SetRateAsync(CompanyId.Value, UserId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get exchange rate history
    /// </summary>
    [HttpGet("rate/history")]
    public async Task<IActionResult> GetRateHistory([FromQuery] int days = 30)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetRateHistoryAsync(CompanyId.Value, days);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    // ==================== FLOAT MANAGEMENT ====================

    /// <summary>
    /// Get current float balances and profit
    /// </summary>
    [HttpGet("float")]
    public async Task<IActionResult> GetFloat()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetFloatAsync(CompanyId.Value);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Fund the exchange float (add KES or buy USD)
    /// </summary>
    [HttpPost("float/fund")]
    public async Task<IActionResult> FundFloat([FromBody] FundFloatDto dto)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();

        if (dto.Amount <= 0)
            return BadRequest(new ApiResponse<object>(false, "Amount must be greater than 0", null));

        // No blanket "USD needs a rate" rule here: dollars already held in a USD till/bank move
        // into the float as they are. The service asks for a rate only when the float currency
        // is being BOUGHT with home-currency money.
        var result = await _exchangeService.FundFloatAsync(CompanyId.Value, UserId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Withdraw from exchange float
    /// </summary>
    [HttpPost("float/withdraw")]
    public async Task<IActionResult> WithdrawFloat([FromBody] WithdrawFloatDto dto)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();

        if (dto.Amount <= 0)
            return BadRequest(new ApiResponse<object>(false, "Amount must be greater than 0", null));

        var result = await _exchangeService.WithdrawFloatAsync(CompanyId.Value, UserId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Settle accumulated profit to another account
    /// </summary>
    [HttpPost("float/settle-profit")]
    public async Task<IActionResult> SettleProfit([FromBody] SettleProfitDto dto)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();

        if (dto.Amount <= 0)
            return BadRequest(new ApiResponse<object>(false, "Amount must be greater than 0", null));

        var result = await _exchangeService.SettleProfitAsync(CompanyId.Value, UserId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get float movement history
    /// </summary>
    [HttpGet("float/movements")]
    public async Task<IActionResult> GetFloatMovements([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int page = 1, [FromQuery] int pageSize = 100)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetFloatMovementsAsync(CompanyId.Value, from, to, page, pageSize);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    // ==================== EXCHANGE TRANSACTIONS ====================

    /// <summary>
    /// Create a new exchange transaction
    /// </summary>
    [HttpPost("transaction")]
    public async Task<IActionResult> CreateExchange([FromBody] CreateExchangeDto dto, [FromServices] AppDbContext db)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();

        if (dto.Amount <= 0)
            return BadRequest(new ApiResponse<object>(false, "Amount must be greater than 0", null));

        if (dto.ClientId == Guid.Empty)
            return BadRequest(new ApiResponse<object>(false, "Client is required", null));

        if (await PinRequiredAsync(db) is { } pinBlock) return pinBlock;
        var result = await _exchangeService.CreateExchangeAsync(CompanyId.Value, UserId.Value, dto);
        await PinOutcomeAsync(db, result.Success);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get exchange transactions with filtering and pagination
    /// </summary>
    [HttpGet("transactions")]
    public async Task<IActionResult> GetExchanges(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 15,
        [FromQuery] string? search = null,
        [FromQuery] ExchangeType? type = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetExchangesAsync(CompanyId.Value, page, pageSize, search, type, from, to);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get a single exchange transaction by ID
    /// </summary>
    [HttpGet("transaction/{id}")]
    public async Task<IActionResult> GetExchange(Guid id)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetExchangeByIdAsync(CompanyId.Value, id);
        return result.Success ? Ok(result) : NotFound(result);
    }

    /// <summary>
    /// Void an exchange transaction
    /// </summary>
    [HttpPost("transaction/{id}/void")]
    public async Task<IActionResult> VoidExchange(Guid id, [FromBody] VoidExchangeDto dto, [FromServices] AppDbContext db)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();

        if (string.IsNullOrWhiteSpace(dto.Reason))
            return BadRequest(new ApiResponse<object>(false, "Void reason is required", null));

        if (await PinRequiredAsync(db) is { } pinBlock) return pinBlock;
        var result = await _exchangeService.VoidExchangeAsync(CompanyId.Value, UserId.Value, id, dto.Reason);
        await PinOutcomeAsync(db, result.Success);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    // ==================== DAILY OPERATIONS ====================

    /// <summary>
    /// Get today's summary (volume, profit, opening/closing)
    /// </summary>
    [HttpGet("daily/today")]
    public async Task<IActionResult> GetTodaySummary()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetTodaySummaryAsync(CompanyId.Value);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Record opening float (start of day)
    /// </summary>
    [HttpPost("daily/opening")]
    public async Task<IActionResult> RecordOpeningFloat([FromBody] OpeningFloatDto dto)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();

        if (dto.KesCount < 0 || dto.UsdCount < 0)
            return BadRequest(new ApiResponse<object>(false, "Counts cannot be negative", null));

        var result = await _exchangeService.RecordOpeningFloatAsync(CompanyId.Value, UserId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Record closing float (end of day)
    /// </summary>
    [HttpPost("daily/closing")]
    public async Task<IActionResult> RecordClosingFloat([FromBody] ClosingFloatDto dto)
    {
        if (!CompanyId.HasValue || !UserId.HasValue) return Unauthorized();

        if (dto.KesCount < 0 || dto.UsdCount < 0)
            return BadRequest(new ApiResponse<object>(false, "Counts cannot be negative", null));

        var result = await _exchangeService.RecordClosingFloatAsync(CompanyId.Value, UserId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get daily summaries for a date range
    /// </summary>
    [HttpGet("daily/summaries")]
    public async Task<IActionResult> GetDailySummaries([FromQuery] DateTime from, [FromQuery] DateTime to)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetDailySummariesAsync(CompanyId.Value, from, to);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    // ==================== REPORTS ====================

    /// <summary>
    /// Get profit report for a date range
    /// </summary>
    [HttpGet("reports/profit")]
    public async Task<IActionResult> GetProfitReport([FromQuery] DateTime from, [FromQuery] DateTime to)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetProfitReportAsync(CompanyId.Value, from, to);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get large transactions report (for compliance)
    /// </summary>
    [HttpGet("reports/large-transactions")]
    public async Task<IActionResult> GetLargeTransactions(
        [FromQuery] DateTime from,
        [FromQuery] DateTime to,
        [FromQuery] decimal threshold = 500000)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetLargeTransactionsAsync(CompanyId.Value, from, to, threshold);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get exchange history for a specific client
    /// </summary>
    [HttpGet("reports/client/{clientId}")]
    public async Task<IActionResult> GetClientExchangeHistory(Guid clientId)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetClientExchangeHistoryAsync(CompanyId.Value, clientId);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Get USD position (inventory value and unrealized P&L)
    /// </summary>
    [HttpGet("position/usd")]
    public async Task<IActionResult> GetUsdPosition()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetUsdPositionAsync(CompanyId.Value);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    // ==================== ALERTS ====================

    /// <summary>
    /// Get active float alerts
    /// </summary>
    [HttpGet("alerts")]
    public async Task<IActionResult> GetAlerts()
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.GetAlertsAsync(CompanyId.Value);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    /// <summary>
    /// Update alert thresholds
    /// </summary>
    [HttpPut("alerts/thresholds")]
    public async Task<IActionResult> UpdateAlertThresholds([FromBody] UpdateAlertThresholdsDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.UpdateAlertThresholdsAsync(
            CompanyId.Value, dto.LowKesThreshold, dto.LowUsdThreshold, dto.LargeTransactionThreshold);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    // ==================== CALCULATOR ====================

    /// <summary>
    /// Calculate exchange amount without creating transaction
    /// </summary>
    [HttpPost("calculate")]
    public async Task<IActionResult> Calculate([FromBody] CalculateExchangeDto dto)
    {
        if (!CompanyId.HasValue) return Unauthorized();
        var result = await _exchangeService.CalculateAsync(CompanyId.Value, dto);
        return result.Success ? Ok(result) : BadRequest(result);
    }
}
