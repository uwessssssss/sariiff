using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public partial class ExchangeService
{
    // ==================== RATE MANAGEMENT ====================

    public async Task<ApiResponse<ExchangeRateResponseDto>> SetRateAsync(Guid companyId, Guid userId, SetExchangeRateDto dto)
    {
        // Country rule: no NEW holdings in a currency the bureau's country doesn't use (UGX in Kenya).
        var currencyBlock = await _context.CurrencyNotAllowedAsync(companyId, dto.ForeignCurrency ?? Currency.USD);
        if (currencyBlock != null)
            return new ApiResponse<ExchangeRateResponseDto>(false, currencyBlock, null);

        var baseCur = await _context.BaseCurrencyAsync(companyId);
        // Validate
        var buyCheck = ValidationHelper.ValidateRate(dto.BuyRate, "Buy rate");
        if (!buyCheck.IsValid)
            return new ApiResponse<ExchangeRateResponseDto>(false, buyCheck.Error!, null);
        var sellCheck = ValidationHelper.ValidateRate(dto.SellRate, "Sell rate");
        if (!sellCheck.IsValid)
            return new ApiResponse<ExchangeRateResponseDto>(false, sellCheck.Error!, null);
        if (dto.BuyRate >= dto.SellRate)
            return new ApiResponse<ExchangeRateResponseDto>(false, "Buy rate must be less than sell rate", null);

        // Per-currency rates: KES is the base and cannot be quoted against itself.
        var foreign = dto.ForeignCurrency ?? Currency.USD;
        if (foreign == baseCur)
            return new ApiResponse<ExchangeRateResponseDto>(false, $"{baseCur} is your base currency — pick the foreign currency to quote", null);

        // Deactivate the current rate FOR THIS CURRENCY only
        var currentRate = await _context.ExchangeRates.FirstOrDefaultAsync(
            r => r.CompanyId == companyId && r.IsActive && r.ForeignCurrency == foreign);
        if (currentRate != null)
        {
            currentRate.IsActive = false;
            currentRate.EffectiveTo = DateTime.UtcNow;
        }

        var newRate = new ExchangeRate
        {
            CompanyId = companyId,
            ForeignCurrency = foreign,
            BuyRate = dto.BuyRate,
            SellRate = dto.SellRate,
            EffectiveFrom = DateTime.UtcNow,
            IsActive = true,
            CreatedByUserId = userId
        };

        _context.ExchangeRates.Add(newRate);
        await _context.SaveChangesAsync();

        return new ApiResponse<ExchangeRateResponseDto>(true, "Exchange rate set", MapRateToResponse(newRate));
    }

    public async Task<ApiResponse<ExchangeRateResponseDto>> GetCurrentRateAsync(Guid companyId, Currency foreignCurrency = Currency.USD)
    {
        var rate = await _context.ExchangeRates.FirstOrDefaultAsync(
            r => r.CompanyId == companyId && r.IsActive && r.ForeignCurrency == foreignCurrency);
        if (rate == null) return new ApiResponse<ExchangeRateResponseDto>(false, $"No active exchange rate for {foreignCurrency}", null);
        return new ApiResponse<ExchangeRateResponseDto>(true, "Success", MapRateToResponse(rate));
    }

    /// <summary>
    /// Quote an exchange without recording it. Same maths as CreateExchangeAsync:
    /// direction 0 = client gives foreign (bureau buys at BuyRate), 1 = client
    /// gives base (bureau sells at SellRate); rates are base per 1 foreign.
    /// </summary>
    public async Task<ApiResponse<CalculationResultDto>> CalculateAsync(Guid companyId, CalculateExchangeDto dto)
    {
        if (dto.Amount <= 0)
            return new ApiResponse<CalculationResultDto>(false, "Amount must be greater than 0", null);
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var foreign = dto.ForeignCurrency ?? Currency.USD;
        if (foreign == baseCur || !Enum.IsDefined(typeof(Currency), foreign))
            return new ApiResponse<CalculationResultDto>(false, $"Pick a foreign currency other than {baseCur}", null);

        var rate = await ActiveRateAsync(companyId, foreign);
        if (rate == null || rate.BuyRate <= 0 || rate.SellRate <= 0)
            return new ApiResponse<CalculationResultDto>(false, $"No active {foreign} exchange rate", null);

        bool bureauBuys = dto.Direction == ExchangeDirection.ForeignToKes;
        var used = bureauBuys ? rate.BuyRate : rate.SellRate;
        var result = Math.Round(bureauBuys ? dto.Amount * used : dto.Amount / used, 2, MidpointRounding.AwayFromZero);
        // Same rule as booking: a purchase books no profit; a sale books KES received
        // minus the average cost of the units (today's buy rate if there is no stock).
        var profit = 0m;
        if (!bureauBuys)
        {
            var avg = await AverageCostAsync(companyId, foreign);
            profit = Math.Round(dto.Amount - (avg > 0 ? avg : rate.BuyRate) * result, 2, MidpointRounding.AwayFromZero);
        }

        return new ApiResponse<CalculationResultDto>(true, "Success", new CalculationResultDto(
            dto.Amount, bureauBuys ? foreign : baseCur,
            result, bureauBuys ? baseCur : foreign,
            used, profit));
    }

    public async Task<ApiResponse<List<ExchangeRateResponseDto>>> GetRateHistoryAsync(Guid companyId, int days = 30)
    {
        days = Math.Clamp(days, 1, 3650); // up to ten years back; huge values would overflow the date
        var cutoff = DateTime.UtcNow.AddDays(-days);
        var rates = await _context.ExchangeRates
            .Where(r => r.CompanyId == companyId && r.EffectiveFrom >= cutoff)
            .OrderByDescending(r => r.EffectiveFrom)
            .ToListAsync();
        return new ApiResponse<List<ExchangeRateResponseDto>>(true, "Success", rates.Select(MapRateToResponse).ToList());
    }
}
