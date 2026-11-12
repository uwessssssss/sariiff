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
    private readonly ITransactionService _transactionService;
    private readonly ISystemLogService _systemLog;

    public ExchangeRateService(
        AppDbContext context, 
        ITransactionService transactionService,
        ISystemLogService systemLog)
    {
        _context = context;
        _transactionService = transactionService;
        _systemLog = systemLog;
    }

    public async Task<ApiResponse<ExchangeRateResponseDto>> SetRateAsync(Guid companyId, Guid userId, SetExchangeRateDto dto)
    {
        // Country rule: no NEW holdings in a currency the bureau's country doesn't use (UGX in Kenya).
        var currencyBlock = await _context.CurrencyNotAllowedAsync(companyId, dto.ForeignCurrency ?? Currency.USD);
        if (currencyBlock != null)
            return new ApiResponse<ExchangeRateResponseDto>(false, currencyBlock, null);

        var baseCur = await _context.BaseCurrencyAsync(companyId);
        // Validate rates
        if (dto.BuyRate <= 0 || dto.SellRate <= 0)
            return new ApiResponse<ExchangeRateResponseDto>(false, "Exchange rates must be positive", null);

        if (dto.BuyRate >= dto.SellRate)
            return new ApiResponse<ExchangeRateResponseDto>(false, "Buy rate must be less than sell rate", null);

        // Rates are per foreign currency (the company base currency is the base). Only replace the
        // active rate for THIS currency — never another currency's rate.
        var foreign = dto.ForeignCurrency ?? Currency.USD;
        if (foreign == baseCur)
            return new ApiResponse<ExchangeRateResponseDto>(false, $"{baseCur} is your base currency — pick the foreign currency to quote", null);

        var currentRate = await _context.ExchangeRates
            .FirstOrDefaultAsync(r => r.CompanyId == companyId && r.IsActive && r.ForeignCurrency == foreign);
            
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

        return new ApiResponse<ExchangeRateResponseDto>(true, "Exchange rate set", MapToResponse(newRate));
    }

    public async Task<ApiResponse<ExchangeRateResponseDto>> GetCurrentRateAsync(Guid companyId, Currency foreignCurrency = Currency.USD)
    {
        var rate = await _context.ExchangeRates
            .FirstOrDefaultAsync(r => r.CompanyId == companyId && r.IsActive && r.ForeignCurrency == foreignCurrency);
            
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

    /// <summary>
    /// FIXED: Create exchange transaction with proper rollback
    /// 
    /// Exchange creates 2 transactions:
    /// 1. Receive FROM client (client gives currency A)
    /// 2. Give TO client (client receives currency B)
    /// 
    /// If transaction 2 fails, transaction 1 is now rolled back properly.
    /// </summary>
    public async Task<ApiResponse<TransactionResponseDto>> CreateExchangeTransactionAsync(
        Guid companyId, Guid userId, ExchangeTransactionDto dto)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        // Use database transaction for atomicity
        using var dbTransaction = await _context.Database.BeginTransactionAsync();
        
        try
        {
            // Multi-currency: any KES↔X pair (X = USD, UGX, EUR, ...).
            // KES is the base — exactly one side of the pair must be KES.
            if (dto.CurrencyFrom == dto.CurrencyTo)
                return new ApiResponse<TransactionResponseDto>(false, "Currencies must differ for an exchange", null);
            if (dto.CurrencyFrom != baseCur && dto.CurrencyTo != baseCur)
                return new ApiResponse<TransactionResponseDto>(false,
                    $"One side of the exchange must be {baseCur} (cross-currency pairs are not supported yet)", null);
            var foreign = dto.CurrencyFrom == baseCur ? dto.CurrencyTo : dto.CurrencyFrom;

            // Validate client exists
            var client = await _context.Users
                .FirstOrDefaultAsync(u => u.Id == dto.ClientId && u.CompanyId == companyId && !u.IsDeleted);
                
            if (client == null)
                return new ApiResponse<TransactionResponseDto>(false, "Client not found", null);

            // Get cash accounts
            var cashKES = await _context.CashAccounts
                .FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Currency == baseCur && !c.IsDeleted);
            var cashForeign = await _context.CashAccounts
                .FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Currency == foreign && !c.IsDeleted);

            if (cashKES == null || cashForeign == null)
                return new ApiResponse<TransactionResponseDto>(false, 
                    $"Cash accounts not found. Please create both {baseCur} and {foreign} cash accounts.", null);

            // Validate exchange rate
            if (dto.ExchangeRate <= 0)
                return new ApiResponse<TransactionResponseDto>(false, "Invalid exchange rate", null);

            // Calculate the amount to give to client
            // Rate is always base per 1 unit of the foreign currency.
            decimal amountTo;
            if (dto.CurrencyFrom == baseCur)
            {
                // Client gives KES, receives the foreign currency
                amountTo = dto.AmountFrom / dto.ExchangeRate;
                
                if (cashForeign.Balance < amountTo)
                    return new ApiResponse<TransactionResponseDto>(false, 
                        $"Insufficient {foreign} balance. Available: {foreign} {cashForeign.Balance:N2}, Required: {foreign} {amountTo:N2}", null);
            }
            else
            {
                // Client gives the foreign currency, receives KES
                amountTo = dto.AmountFrom * dto.ExchangeRate;
                
                if (cashKES.Balance < amountTo)
                    return new ApiResponse<TransactionResponseDto>(false, 
                        $"Insufficient {baseCur} balance. Available: {baseCur} {cashKES.Balance:N2}, Required: {baseCur} {amountTo:N2}", null);
            }

            // Determine currency to give
            var currencyTo = dto.CurrencyFrom == baseCur ? foreign : baseCur;

            // ==================== TRANSACTION 1 ====================
            // Receive FROM client - Client's account is DEBITED (money out from client)
            var txn1 = new CreateTransactionDto(
                TransactionType: TransactionType.Debit,
                SourceAccountType: AccountType.Client,
                SourceAccountId: dto.ClientId,
                DestAccountType: AccountType.Cash,
                DestAccountId: dto.CurrencyFrom == baseCur ? cashKES.Id : cashForeign.Id,
                Amount: dto.AmountFrom,
                Currency: dto.CurrencyFrom,
                CounterAmount: null,
                CounterCurrency: null,
                Description: $"Exchange: Client gives {dto.CurrencyFrom} {dto.AmountFrom:N2}",
                Notes: $"Exchange rate: {dto.ExchangeRate:N4}",
                ExchangeRate: dto.ExchangeRate,
                PaymentMethod: PaymentMethod.Cash
            );

            var result1 = await _transactionService.CreateAsync(companyId, userId, txn1);
            if (!result1.Success)
            {
                await dbTransaction.RollbackAsync();
                return new ApiResponse<TransactionResponseDto>(false, 
                    $"Failed to create receive transaction: {result1.Message}", null);
            }

            // ==================== TRANSACTION 2 ====================
            // Give TO client - Client's account is CREDITED (money in to client)
            var txn2 = new CreateTransactionDto(
                TransactionType: TransactionType.Credit,
                SourceAccountType: AccountType.Client,
                SourceAccountId: dto.ClientId,
                DestAccountType: AccountType.Cash,
                DestAccountId: currencyTo == baseCur ? cashKES.Id : cashForeign.Id,
                Amount: amountTo,
                Currency: currencyTo,
                CounterAmount: null,
                CounterCurrency: null,
                Description: $"Exchange: Client receives {currencyTo} {amountTo:N2}",
                Notes: $"Exchange rate: {dto.ExchangeRate:N4} | Original: {dto.CurrencyFrom} {dto.AmountFrom:N2}",
                ExchangeRate: dto.ExchangeRate,
                PaymentMethod: PaymentMethod.Cash
            );

            var result2 = await _transactionService.CreateAsync(companyId, userId, txn2);
            if (!result2.Success)
            {
                // FIXED: Rollback the entire database transaction
                // This will undo transaction 1 as well
                await dbTransaction.RollbackAsync();
                
                await _systemLog.LogErrorAsync("ExchangeRateService", 
                    $"Exchange failed on second transaction. Rolled back first transaction. Error: {result2.Message}",
                    null, companyId, userId);
                
                return new ApiResponse<TransactionResponseDto>(false, 
                    $"Exchange failed. All changes rolled back. Error: {result2.Message}", null);
            }

            // Both transactions successful - commit
            await dbTransaction.CommitAsync();
            
            await _systemLog.LogInfoAsync("ExchangeRateService", 
                $"Exchange completed: {dto.CurrencyFrom} {dto.AmountFrom:N2} -> {currencyTo} {amountTo:N2}", 
                companyId, userId);

            return result2;
        }
        catch (Exception ex)
        {
            await dbTransaction.RollbackAsync();
            
            await _systemLog.LogErrorAsync("ExchangeRateService", 
                $"Exchange transaction failed: {ex.Message}", ex.StackTrace, companyId, userId);
            
            return new ApiResponse<TransactionResponseDto>(false,
                "Exchange failed and nothing was saved. Please try again.", null);
        }
    }

    private static ExchangeRateResponseDto MapToResponse(ExchangeRate r) => new(
        r.Id, r.BuyRate, r.SellRate, r.EffectiveFrom, r.EffectiveTo, r.IsActive);
}
