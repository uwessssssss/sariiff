using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public partial class ExchangeService
{
    // ==================== FLOAT MANAGEMENT ====================

    public async Task<ApiResponse<ExchangeFloatDto>> GetFloatAsync(Guid companyId)
    {
        var float_ = await GetOrCreateFloatAsync(companyId);
        return new ApiResponse<ExchangeFloatDto>(true, "Success", await ToFloatDtoAsync(float_));
    }

    /// <summary>
    /// Fund the float from a cash/bank/M-Pesa account.
    /// KES funds KES. A foreign currency (USD, UGX, EUR) is funded either from an
    /// account in that same currency, or — when PurchaseRate is given — bought
    /// with KES from a KES account (Amount × PurchaseRate is deducted).
    /// </summary>
    public async Task<ApiResponse<ExchangeFloatDto>> FundFloatAsync(Guid companyId, Guid userId, FundFloatDto dto)
    {
        // Country rule: no NEW holdings in a currency the bureau's country doesn't use (UGX in Kenya).
        var currencyBlock = await _context.CurrencyNotAllowedAsync(companyId, dto.Currency);
        if (currencyBlock != null)
            return new ApiResponse<ExchangeFloatDto>(false, currencyBlock, null);

        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var amountCheck = ValidationHelper.ValidateAmount(dto.Amount, "Fund amount");
        if (!amountCheck.IsValid)
            return new ApiResponse<ExchangeFloatDto>(false, amountCheck.Error!, null);

        if (!Enum.IsDefined(typeof(Currency), dto.Currency))
            return new ApiResponse<ExchangeFloatDto>(false, "Unsupported currency", null);

        if (dto.PurchaseRate.HasValue)
        {
            if (dto.Currency == baseCur)
                return new ApiResponse<ExchangeFloatDto>(false, "A purchase rate only applies when funding a foreign currency", null);
            var rateCheck = ValidationHelper.ValidateRate(dto.PurchaseRate.Value, "Purchase rate");
            if (!rateCheck.IsValid)
                return new ApiResponse<ExchangeFloatDto>(false, rateCheck.Error!, null);
        }

        // What actually leaves the source account, and in which currency.
        var sourceCurrency = dto.PurchaseRate.HasValue ? baseCur : dto.Currency;
        var deductAmount = dto.PurchaseRate.HasValue ? dto.Amount * dto.PurchaseRate.Value : dto.Amount;

        var accountCurrency = await GetAccountCurrencyAsync(companyId, dto.SourceType, dto.SourceAccountId);
        if (accountCurrency == null)
            return new ApiResponse<ExchangeFloatDto>(false, "Source account not found", null);
        if (accountCurrency != sourceCurrency)
            return new ApiResponse<ExchangeFloatDto>(false,
                $"The source account holds {accountCurrency} but this funding takes {sourceCurrency} from it" +
                (dto.Currency != baseCur && !dto.PurchaseRate.HasValue
                    ? $". To buy {dto.Currency} with {baseCur}, enter a purchase rate." : "."), null);

        using var dbTransaction = await _context.Database.BeginTransactionAsync();

        try
        {
            var float_ = await GetOrCreateFloatAsync(companyId);
            var other = IsOtherCurrency(dto.Currency, baseCur) ? await GetOrCreateOtherFloatAsync(companyId, dto.Currency) : null;

            var sourceBalance = await GetAccountBalanceAsync(companyId, dto.SourceType, dto.SourceAccountId);
            if (sourceBalance < deductAmount)
            {
                await dbTransaction.RollbackAsync();
                return new ApiResponse<ExchangeFloatDto>(false,
                    $"Insufficient balance. Available: {sourceCurrency} {sourceBalance:N2}, Required: {sourceCurrency} {deductAmount:N2}", null);
            }

            var balanceBefore = FloatBalance(float_, other, dto.Currency, baseCur);

            await UpdateAccountBalanceAsync(companyId, dto.SourceType, dto.SourceAccountId, -deductAmount);

            if (dto.Currency == baseCur)
            {
                float_.KesBalance += dto.Amount;
            }
            else
            {
                // Cost basis in KES: the purchase rate if given, otherwise today's
                // buy rate for that currency (so average cost isn't dragged to zero).
                var costRate = dto.PurchaseRate ?? (await ActiveRateAsync(companyId, dto.Currency))?.BuyRate ?? 0;
                AddForeign(float_, other, dto.Currency, dto.Amount, dto.Amount * costRate);
            }
            float_.UpdatedAt = DateTime.UtcNow;

            _context.FloatMovements.Add(new FloatMovement
            {
                CompanyId = companyId,
                ExchangeFloatId = float_.Id,
                MovementDate = DateTime.UtcNow,
                MovementType = FloatMovementType.Fund,
                Currency = dto.Currency,
                Amount = dto.Amount,
                BalanceBefore = balanceBefore,
                BalanceAfter = FloatBalance(float_, other, dto.Currency, baseCur),
                RelatedAccountType = dto.SourceType,
                RelatedAccountId = dto.SourceAccountId,
                Notes = dto.Notes ?? $"Float funding from {dto.SourceType}",
                CreatedByUserId = userId
            });

            await CreateFloatTransactionAsync(companyId, userId, dto.SourceType, dto.SourceAccountId,
                TransactionType.Credit, deductAmount, sourceCurrency,
                sourceBalance, sourceBalance - deductAmount,
                $"Transfer to Exchange Float - {dto.Currency} {dto.Amount:N2}", dto.Notes);

            await _context.SaveChangesAsync();
            await dbTransaction.CommitAsync();

            return new ApiResponse<ExchangeFloatDto>(true, "Float funded successfully", await ToFloatDtoAsync(float_));
        }
        catch (DbUpdateConcurrencyException)
        {
            await dbTransaction.RollbackAsync();
            return new ApiResponse<ExchangeFloatDto>(false,
                "Balance was modified by another operation. Please retry.", null);
        }
        catch (Exception ex)
        {
            await dbTransaction.RollbackAsync();
            await _systemLog.LogErrorAsync("ExchangeService", $"Failed to fund float: {ex.Message}", 
                ex.StackTrace, companyId, userId);
            return new ApiResponse<ExchangeFloatDto>(false, "Failed to fund float. Please try again.", null);
        }
    }

    /// <summary>
    /// Withdraw from the float to an account held in the same currency.
    /// </summary>
    public async Task<ApiResponse<ExchangeFloatDto>> WithdrawFloatAsync(Guid companyId, Guid userId, WithdrawFloatDto dto)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var amountCheck = ValidationHelper.ValidateAmount(dto.Amount, "Withdrawal amount");
        if (!amountCheck.IsValid)
            return new ApiResponse<ExchangeFloatDto>(false, amountCheck.Error!, null);

        if (!Enum.IsDefined(typeof(Currency), dto.Currency))
            return new ApiResponse<ExchangeFloatDto>(false, "Unsupported currency", null);

        var accountCurrency = await GetAccountCurrencyAsync(companyId, dto.DestinationType, dto.DestinationAccountId);
        if (accountCurrency == null)
            return new ApiResponse<ExchangeFloatDto>(false, "Destination account not found", null);
        if (accountCurrency != dto.Currency)
            return new ApiResponse<ExchangeFloatDto>(false,
                $"The destination account holds {accountCurrency}, not {dto.Currency}", null);

        using var dbTransaction = await _context.Database.BeginTransactionAsync();

        try
        {
            var float_ = await GetOrCreateFloatAsync(companyId);
            var other = IsOtherCurrency(dto.Currency, baseCur) ? await GetOrCreateOtherFloatAsync(companyId, dto.Currency) : null;

            var balanceBefore = FloatBalance(float_, other, dto.Currency, baseCur);
            if (dto.Amount > balanceBefore)
            {
                await dbTransaction.RollbackAsync();
                return new ApiResponse<ExchangeFloatDto>(false,
                    $"Insufficient float. Available: {dto.Currency} {balanceBefore:N2}", null);
            }

            if (dto.Currency == baseCur) float_.KesBalance -= dto.Amount;
            else RemoveForeign(float_, other, dto.Currency, dto.Amount);
            float_.UpdatedAt = DateTime.UtcNow;

            var destBalanceBefore = await GetAccountBalanceAsync(companyId, dto.DestinationType, dto.DestinationAccountId);
            await UpdateAccountBalanceAsync(companyId, dto.DestinationType, dto.DestinationAccountId, dto.Amount);

            _context.FloatMovements.Add(new FloatMovement
            {
                CompanyId = companyId,
                ExchangeFloatId = float_.Id,
                MovementDate = DateTime.UtcNow,
                MovementType = FloatMovementType.Withdraw,
                Currency = dto.Currency,
                Amount = -dto.Amount,
                BalanceBefore = balanceBefore,
                BalanceAfter = FloatBalance(float_, other, dto.Currency, baseCur),
                RelatedAccountType = dto.DestinationType,
                RelatedAccountId = dto.DestinationAccountId,
                Notes = dto.Notes ?? $"Float withdrawal to {dto.DestinationType}",
                CreatedByUserId = userId
            });

            await CreateFloatTransactionAsync(companyId, userId, dto.DestinationType, dto.DestinationAccountId,
                TransactionType.Debit, dto.Amount, dto.Currency,
                destBalanceBefore, destBalanceBefore + dto.Amount,
                $"Transfer from Exchange Float - {dto.Currency} {dto.Amount:N2}", dto.Notes);

            await _context.SaveChangesAsync();
            await dbTransaction.CommitAsync();

            return new ApiResponse<ExchangeFloatDto>(true, "Float withdrawn successfully", await ToFloatDtoAsync(float_));
        }
        catch (DbUpdateConcurrencyException)
        {
            await dbTransaction.RollbackAsync();
            return new ApiResponse<ExchangeFloatDto>(false,
                "Balance was modified by another operation. Please retry.", null);
        }
        catch (Exception ex)
        {
            await dbTransaction.RollbackAsync();
            await _systemLog.LogErrorAsync("ExchangeService", $"Failed to withdraw float: {ex.Message}",
                ex.StackTrace, companyId, userId);
            return new ApiResponse<ExchangeFloatDto>(false, "Failed to withdraw float. Please try again.", null);
        }
    }

    /// <summary>
    /// Settle accumulated profit — transfer profit from float to a bank/cash/mpesa account.
    /// This is the EVENING operation: move earned profit out of the float.
    /// </summary>
    public async Task<ApiResponse<ExchangeFloatDto>> SettleProfitAsync(Guid companyId, Guid userId, SettleProfitDto dto)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var amountCheck = ValidationHelper.ValidateAmount(dto.Amount, "Settlement amount");
        if (!amountCheck.IsValid)
            return new ApiResponse<ExchangeFloatDto>(false, amountCheck.Error!, null);

        // Exchange profit is booked in KES (older rows may hold USD profit).
        if (dto.Currency != baseCur && dto.Currency != Currency.USD)
            return new ApiResponse<ExchangeFloatDto>(false, $"Exchange profit is held in {baseCur} — settle it in {baseCur}", null);

        var destCurrency = await GetAccountCurrencyAsync(companyId, dto.DestinationType, dto.DestinationAccountId);
        if (destCurrency == null)
            return new ApiResponse<ExchangeFloatDto>(false, "Destination account not found", null);
        if (destCurrency != dto.Currency)
            return new ApiResponse<ExchangeFloatDto>(false,
                $"The destination account holds {destCurrency}, not {dto.Currency}", null);

        using var dbTransaction = await _context.Database.BeginTransactionAsync();

        try
        {
            var float_ = await GetOrCreateFloatAsync(companyId);

            // Validate profit is available
            var availableProfit = dto.Currency == baseCur ? float_.KesProfit : float_.UsdProfit;
            if (dto.Amount > availableProfit)
                return new ApiResponse<ExchangeFloatDto>(false,
                    $"Insufficient profit. Available: {dto.Currency} {availableProfit:N2}", null);

            // Also check float balance (profit is part of float balance)
            var floatBalance = dto.Currency == baseCur ? float_.KesBalance : float_.UsdBalance;
            if (dto.Amount > floatBalance)
                return new ApiResponse<ExchangeFloatDto>(false,
                    $"Insufficient float balance to settle. Float: {dto.Currency} {floatBalance:N2}", null);

            // Capture balances before
            var floatBalanceBefore = floatBalance;
            var destBalanceBefore = await GetAccountBalanceAsync(companyId, dto.DestinationType, dto.DestinationAccountId);

            // Deduct from float
            if (dto.Currency == baseCur)
            {
                float_.KesBalance -= dto.Amount;
                float_.KesProfit -= dto.Amount;
            }
            else
            {
                float_.UsdBalance -= dto.Amount;
                float_.UsdProfit -= dto.Amount;
            }
            float_.UpdatedAt = DateTime.UtcNow;

            // Credit destination account
            await UpdateAccountBalanceAsync(companyId, dto.DestinationType, dto.DestinationAccountId, dto.Amount);

            // Record float movement
            _context.FloatMovements.Add(new FloatMovement
            {
                CompanyId = companyId,
                ExchangeFloatId = float_.Id,
                MovementDate = DateTime.UtcNow,
                MovementType = FloatMovementType.ProfitSettlement,
                Currency = dto.Currency,
                Amount = -dto.Amount,
                BalanceBefore = floatBalanceBefore,
                BalanceAfter = dto.Currency == baseCur ? float_.KesBalance : float_.UsdBalance,
                RelatedAccountType = dto.DestinationType,
                RelatedAccountId = dto.DestinationAccountId,
                Notes = dto.Notes ?? $"Profit settlement: {dto.Currency} {dto.Amount:N2}",
                CreatedByUserId = userId
            });

            // Create transaction record for destination account
            await CreateFloatTransactionAsync(companyId, userId, dto.DestinationType, dto.DestinationAccountId,
                TransactionType.Debit, dto.Amount, dto.Currency,
                destBalanceBefore, destBalanceBefore + dto.Amount,
                $"Exchange profit settlement - {dto.Currency} {dto.Amount:N2}", dto.Notes);

            await _context.SaveChangesAsync();
            await dbTransaction.CommitAsync();

            return new ApiResponse<ExchangeFloatDto>(true,
                $"Profit settled: {dto.Currency} {dto.Amount:N2} transferred", await ToFloatDtoAsync(float_));
        }
        catch (DbUpdateConcurrencyException)
        {
            await dbTransaction.RollbackAsync();
            return new ApiResponse<ExchangeFloatDto>(false,
                "Balance was modified by another operation. Please retry.", null);
        }
        catch (Exception ex)
        {
            await dbTransaction.RollbackAsync();
            await _systemLog.LogErrorAsync("ExchangeService", $"Failed to settle profit: {ex.Message}",
                ex.StackTrace, companyId, userId);
            return new ApiResponse<ExchangeFloatDto>(false, "Failed to settle profit. Please try again.", null);
        }
    }

    /// <summary>
    /// Get float movement history — all fund, withdraw, exchange, and settlement movements.
    /// </summary>
    public async Task<ApiResponse<List<FloatMovementDto>>> GetFloatMovementsAsync(Guid companyId, DateTime? from, DateTime? to)
    {
        var query = _context.FloatMovements
            .Where(m => m.CompanyId == companyId && !m.IsDeleted);

        var (fromUtc, toExclusive) = BureauClock.Range(from, to);
        if (fromUtc.HasValue)
            query = query.Where(m => m.MovementDate >= fromUtc.Value);
        if (toExclusive.HasValue)
            query = query.Where(m => m.MovementDate < toExclusive.Value);

        var movements = await query
            .OrderByDescending(m => m.MovementDate)
            .ThenByDescending(m => m.CreatedAt)
            .ToListAsync();

        var dtos = movements.Select(m => new FloatMovementDto(
            m.Id,
            m.MovementDate,
            m.MovementType.ToString(),
            m.Currency,
            m.Amount,
            m.BalanceBefore,
            m.BalanceAfter,
            m.RelatedAccountType?.ToString(),
            m.Notes
        )).ToList();

        return new ApiResponse<List<FloatMovementDto>>(true, "Success", dtos);
    }
}
