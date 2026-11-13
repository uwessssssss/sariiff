using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public class ExchangeRateService : IExchangeRateService
{
    private readonly AppDbContext _context;

    public ExchangeRateService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<ApiResponse<ExchangeRateResponseDto>> SetRateAsync(Guid companyId, Guid userId, SetExchangeRateDto dto)
    {
        // Country rule: no NEW holdings in a currency the bureau's country doesn't use (UGX in Kenya).
        var currencyBlock = await _context.CurrencyNotAllowedAsync(companyId, dto.ForeignCurrency ?? Currency.USD);
        if (currencyBlock != null)
            return new ApiResponse<ExchangeRateResponseDto>(false, currencyBlock, null);

        var baseCur = await _context.BaseCurrencyAsync(companyId);
        // Validate rates (same limits as POST /api/exchange/rate)
        var buyCheck = ValidationHelper.ValidateRate(dto.BuyRate, "Buy rate");
        if (!buyCheck.IsValid)
            return new ApiResponse<ExchangeRateResponseDto>(false, buyCheck.Error!, null);
        var sellCheck = ValidationHelper.ValidateRate(dto.SellRate, "Sell rate");
        if (!sellCheck.IsValid)
            return new ApiResponse<ExchangeRateResponseDto>(false, sellCheck.Error!, null);

        if (dto.BuyRate >= dto.SellRate)
            return new ApiResponse<ExchangeRateResponseDto>(false, "Buy rate must be less than sell rate", null);

        // Rates are per foreign currency (the company base currency is the base). Only replace the
        // active rate for THIS currency — never another currency's rate.
        var foreign = dto.ForeignCurrency ?? Currency.USD;
        if (foreign == baseCur)
            return new ApiResponse<ExchangeRateResponseDto>(false, $"{baseCur} is your base currency — pick the foreign currency to quote", null);

        var activeRates = await _context.ExchangeRates
            .Where(r => r.CompanyId == companyId && r.IsActive && r.ForeignCurrency == foreign).ToListAsync();
        foreach (var old in activeRates)   // every active one, not just the first found
        {
            old.IsActive = false;
            old.EffectiveTo = DateTime.UtcNow;
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

        return new ApiResponse<ExchangeRateResponseDto>(true, "Exchange rate set", MapToResponse(newRate));
    }

    public async Task<ApiResponse<ExchangeRateResponseDto>> GetCurrentRateAsync(Guid companyId, Currency foreignCurrency = Currency.USD)
    {
        var rate = await _context.ExchangeRates
            .Where(r => r.CompanyId == companyId && r.IsActive && r.ForeignCurrency == foreignCurrency)
            .OrderByDescending(r => r.EffectiveFrom)   // the one trades are priced with
            .FirstOrDefaultAsync();
            
        if (rate == null) 
            return new ApiResponse<ExchangeRateResponseDto>(false, "No active exchange rate", null);
            
        return new ApiResponse<ExchangeRateResponseDto>(true, "Success", MapToResponse(rate));
    }

    public async Task<ApiResponse<List<ExchangeRateResponseDto>>> GetHistoryAsync(Guid companyId)
    {
        var rates = await _context.ExchangeRates
            .Where(r => r.CompanyId == companyId)
            .OrderByDescending(r => r.EffectiveFrom)
            .ToListAsync();
            
        return new ApiResponse<List<ExchangeRateResponseDto>>(true, "Success", rates.Select(MapToResponse).ToList());
    }

    public async Task<ApiResponse<CurrencyConvertResultDto>> ConvertAsync(Guid companyId, CurrencyConvertDto dto)
    {
        if (dto.Amount <= 0)
            return new ApiResponse<CurrencyConvertResultDto>(false, "Amount must be greater than 0", null);
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        // The company base is the base: exactly one side must be it, the other picks the rate.
        if (dto.From == dto.To)
            return new ApiResponse<CurrencyConvertResultDto>(true, "Success",
                new CurrencyConvertResultDto(dto.Amount, dto.From, dto.Amount, dto.To, 1));
        if (dto.From != baseCur && dto.To != baseCur)
            return new ApiResponse<CurrencyConvertResultDto>(false, $"One side of the conversion must be {baseCur}", null);
        var foreign = dto.From == baseCur ? dto.To : dto.From;

        var rate = await _context.ExchangeRates
            .Where(r => r.CompanyId == companyId && r.IsActive && r.ForeignCurrency == foreign)
            .OrderByDescending(r => r.EffectiveFrom)
            .FirstOrDefaultAsync();
            
        if (rate == null) 
            return new ApiResponse<CurrencyConvertResultDto>(false, $"No active {foreign} exchange rate", null);

        if (rate.BuyRate <= 0 || rate.SellRate <= 0)
            return new ApiResponse<CurrencyConvertResultDto>(false, "Exchange rate is invalid (zero or negative)", null);

        decimal converted;
        decimal usedRate;

        if (dto.From == baseCur)
        {
            usedRate = rate.SellRate;  // Bureau SELLS the foreign currency at SellRate
            converted = dto.Amount / usedRate;
        }
        else
        {
            usedRate = rate.BuyRate;  // Bureau BUYS the foreign currency at BuyRate
            converted = dto.Amount * usedRate;
        }

        return new ApiResponse<CurrencyConvertResultDto>(true, "Success", 
            new CurrencyConvertResultDto(dto.Amount, dto.From, converted, dto.To, usedRate));
    }

    private static ExchangeRateResponseDto MapToResponse(ExchangeRate r) => new(
        r.Id, r.BuyRate, r.SellRate, r.EffectiveFrom, r.EffectiveTo, r.IsActive,
        r.ForeignCurrency, r.ForeignCurrency.ToString());   // was left out: every rate read as USD
}
