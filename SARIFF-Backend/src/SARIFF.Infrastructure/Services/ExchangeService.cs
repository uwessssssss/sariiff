using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// FIXED Exchange Service
/// 
/// Changes:
/// 1. Added database transactions to FundFloatAsync, WithdrawFloatAsync, CreateExchangeAsync
/// 2. Fixed BalanceBefore calculation in float movements
/// 3. Added Transaction records for client balance changes in FromAccount exchanges
/// 4. Fixed CreateFloatTransactionAsync to include balance fields
/// </summary>
public class ExchangeService : IExchangeService
{
    private readonly AppDbContext _context;
    private readonly ISystemLogService _systemLog;
    private readonly IBalanceAlertService? _balanceAlerts;

    public ExchangeService(AppDbContext context, ISystemLogService systemLog, IBalanceAlertService? balanceAlerts = null)
    {
        _context = context;
        _systemLog = systemLog;
        _balanceAlerts = balanceAlerts;
    }

    /// <summary>
    /// The bureau's balance alert rules, after an exchange moved a client's own balances
    /// (FromAccount). Only plain transactions used to check them. Runs after the commit
    /// and never fails the exchange.
    /// </summary>
    private async Task CheckClientAlertsAsync(Guid companyId, User? client)
    {
        if (_balanceAlerts == null || client == null) return;
        try
        {
            await _balanceAlerts.CheckAndNotifyAsync(companyId, client.Id, client.FullName, client.BalanceKES, client.BalanceUSD);
        }
        catch (Exception ex)
        {
            try { await _systemLog.LogWarningAsync("ExchangeService", $"Balance alert check failed for client {client.Id}: {ex.Message}", companyId); }
            catch { /* the exchange is saved; nothing more to do */ }
        }
    }

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
        var cutoff = DateTime.UtcNow.AddDays(-days);
        var rates = await _context.ExchangeRates
            .Where(r => r.CompanyId == companyId && r.EffectiveFrom >= cutoff)
            .OrderByDescending(r => r.EffectiveFrom)
            .ToListAsync();
        return new ApiResponse<List<ExchangeRateResponseDto>>(true, "Success", rates.Select(MapRateToResponse).ToList());
    }

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

    /// <summary>
    /// Create an exchange between KES and a foreign currency (USD, UGX, EUR).
    /// Direction 0 (ForeignToKes): client gives foreign, bureau BUYS at BuyRate.
    /// Direction 1 (KesToForeign): client gives KES, bureau SELLS at SellRate.
    /// Rates are KES per 1 unit of the foreign currency. Profit is in KES.
    /// </summary>
    public async Task<ApiResponse<ExchangeResponseDto>> CreateExchangeAsync(Guid companyId, Guid userId, CreateExchangeDto dto)
    {
        // Country rule: no NEW holdings in a currency the bureau's country doesn't use (UGX in Kenya).
        var currencyBlock = await _context.CurrencyNotAllowedAsync(companyId, dto.ForeignCurrency ?? Currency.USD);
        if (currencyBlock != null)
            return new ApiResponse<ExchangeResponseDto>(false, currencyBlock, null);

        var baseCur = await _context.BaseCurrencyAsync(companyId);
        // Input validation
        var amountCheck = ValidationHelper.ValidateAmount(dto.Amount, "Exchange amount");
        if (!amountCheck.IsValid)
            return new ApiResponse<ExchangeResponseDto>(false, amountCheck.Error!, null);

        if (!string.IsNullOrEmpty(dto.ClientName))
        {
            var nameCheck = ValidationHelper.ValidateName(dto.ClientName, "Client name");
            if (!nameCheck.IsValid)
                return new ApiResponse<ExchangeResponseDto>(false, nameCheck.Error!, null);
        }

        if (!Enum.IsDefined(typeof(ExchangeDirection), dto.Direction))
            return new ApiResponse<ExchangeResponseDto>(false, "Invalid exchange direction", null);

        var foreign = dto.ForeignCurrency ?? Currency.USD;
        if (!Enum.IsDefined(typeof(Currency), foreign))
            return new ApiResponse<ExchangeResponseDto>(false, "Unsupported currency", null);
        if (foreign == baseCur)
            return new ApiResponse<ExchangeResponseDto>(false, $"{baseCur} is your base currency — pick the foreign currency for this exchange", null);

        using var dbTransaction = await _context.Database.BeginTransactionAsync();

        try
        {
            var float_ = await GetOrCreateFloatAsync(companyId);

            // The rate for THIS currency only. Each currency has its own active
            // rate; an unfiltered lookup could price a USD trade at the UGX rate.
            var rate = await ActiveRateAsync(companyId, foreign);
            if (rate == null)
                return new ApiResponse<ExchangeResponseDto>(false, $"No active {foreign} exchange rate set", null);

            if (rate.BuyRate <= 0 || rate.SellRate <= 0)
                return new ApiResponse<ExchangeResponseDto>(false, "Exchange rate is invalid (zero or negative)", null);

            // Client validation depends on exchange type
            string clientName;
            string? clientIdNumber = dto.ClientIdNumber;
            User? client = null;  // Needed for FromAccount balance operations

            if (dto.ExchangeType == ExchangeType.FromAccount)
            {
                // FromAccount REQUIRES a registered client with an account
                if (!dto.ClientId.HasValue)
                    return new ApiResponse<ExchangeResponseDto>(false, "ClientId is required for FromAccount exchanges", null);
                    
                client = await _context.Users.FindAsync(dto.ClientId.Value);
                if (client == null || client.CompanyId != companyId)
                    return new ApiResponse<ExchangeResponseDto>(false, "Client not found", null);
                    
                clientName = client.FullName;
                clientIdNumber ??= client.IdPassport;
            }
            else
            {
                // Cash exchange — client is optional (walk-in)
                if (dto.ClientId.HasValue)
                {
                    client = await _context.Users.FindAsync(dto.ClientId.Value);
                    if (client == null || client.CompanyId != companyId)
                        return new ApiResponse<ExchangeResponseDto>(false, "Client not found", null);
                    clientName = client.FullName;
                    clientIdNumber ??= client.IdPassport;
                }
                else
                {
                    clientName = dto.ClientName ?? "Walk-in Client";
                }
            }

            var other = IsOtherCurrency(foreign, baseCur) ? await GetOrCreateOtherFloatAsync(companyId, foreign) : null;

            // Calculate exchange
            bool bureauBuys = dto.Direction == ExchangeDirection.ForeignToKes;
            Currency currencyGiven = bureauBuys ? foreign : baseCur;
            Currency currencyReceived = bureauBuys ? baseCur : foreign;
            decimal exchangeRate = bureauBuys ? rate.BuyRate : rate.SellRate;

            // A negotiated rate (large clients). It used to be accepted by the API and
            // silently ignored, so the client's receipt showed one rate and the ledger
            // another. Honoured now, within 10% of today's rate to catch typos (1295 vs 129.5).
            if (dto.CustomRate.HasValue)
            {
                var customCheck = ValidationHelper.ValidateRate(dto.CustomRate.Value, "Custom rate");
                if (!customCheck.IsValid)
                    return new ApiResponse<ExchangeResponseDto>(false, customCheck.Error!, null);
                var board = exchangeRate;
                if (dto.CustomRate.Value < board * 0.9m || dto.CustomRate.Value > board * 1.1m)
                    return new ApiResponse<ExchangeResponseDto>(false,
                        $"Custom rate {dto.CustomRate.Value:0.####} is more than 10% away from today's {(bureauBuys ? "buy" : "sell")} rate {board:0.####}. Check the figure, or update today's rate.", null);
                exchangeRate = dto.CustomRate.Value;
            }

            decimal amountReceived = Math.Round(
                bureauBuys ? dto.Amount * exchangeRate : dto.Amount / exchangeRate,
                2, MidpointRounding.AwayFromZero);
            if (amountReceived <= 0)
                return new ApiResponse<ExchangeResponseDto>(false, "Amount is too small to exchange at this rate", null);

            decimal kesAmount = bureauBuys ? amountReceived : dto.Amount;
            // Realised profit, average-cost method: booked only when the bureau SELLS
            // foreign currency — KES received minus what those units cost. A purchase adds
            // stock at cost and books nothing yet. (It was (sell − buy) × quantity on BOTH
            // buys and sells, so a buy-then-sell round trip was counted twice, and that
            // inflated profit could be withdrawn through Settle Profit.)
            decimal profit = 0m;

            if (dto.ExchangeType == ExchangeType.Cash)
            {
                var available = FloatBalance(float_, other, currencyReceived, baseCur);
                if (available < amountReceived)
                    return new ApiResponse<ExchangeResponseDto>(false,
                        $"Insufficient {currencyReceived} float. Available: {currencyReceived} {available:N2}", null);
            }

            // Large transaction check (KES side of the trade)
            bool isLargeTransaction = kesAmount >= float_.LargeTransactionThreshold;

            // Generate code
            var code = await CodeGenerator.GenerateExchangeCodeAsync(_context, companyId);

            var exchange = new ExchangeTransaction
            {
                Code = code,
                CompanyId = companyId,
                TransactionDate = DateTime.UtcNow,
                ClientId = dto.ClientId,
                ClientName = clientName,
                ClientIdNumber = clientIdNumber,
                ExchangeType = dto.ExchangeType,
                Direction = dto.Direction,
                AmountGiven = dto.Amount,
                CurrencyGiven = currencyGiven,
                AmountReceived = amountReceived,
                CurrencyReceived = currencyReceived,
                ExchangeRate = exchangeRate,
                Profit = profit,
                ProfitCurrency = baseCur,
                Status = "Completed",
                Notes = dto.Notes,
                CreatedByUserId = userId
            };

            // From Account: move the client's own balances first (validated).
            if (dto.ExchangeType == ExchangeType.FromAccount)
            {
                var clientId = dto.ClientId!.Value;  // Guaranteed non-null (validated above)
                var clientHas = await ClientBalanceAsync(companyId, client!, currencyGiven);
                if (clientHas < dto.Amount)
                    return new ApiResponse<ExchangeResponseDto>(false,
                        $"Insufficient client {currencyGiven} balance. Available: {currencyGiven} {clientHas:N2}", null);

                var (givenBefore, givenAfter) = await AdjustClientBalanceAsync(companyId, client!, currencyGiven, -dto.Amount);
                var (recvBefore, recvAfter) = await AdjustClientBalanceAsync(companyId, client!, currencyReceived, amountReceived);

                var txn1 = ClientLeg(companyId, userId, clientId, code, TransactionType.Debit, dto.Amount, currencyGiven,
                    givenBefore, givenAfter, $"Exchange: Give {currencyGiven} {dto.Amount:N2} @ {exchangeRate:N4}");
                txn1.Code = await CodeGenerator.GenerateTransactionCodeAsync(_context, companyId);
                _context.Transactions.Add(txn1);
                exchange.ClientSourceTransactionId = txn1.Id;

                var txn2 = ClientLeg(companyId, userId, clientId, code, TransactionType.Credit, amountReceived, currencyReceived,
                    recvBefore, recvAfter, $"Exchange: Receive {currencyReceived} {amountReceived:N2} @ {exchangeRate:N4}");
                txn2.Code = await CodeGenerator.GenerateTransactionCodeAsync(_context, companyId);
                _context.Transactions.Add(txn2);
                exchange.ClientDestTransactionId = txn2.Id;

                client!.UpdatedAt = DateTime.UtcNow;
            }

            // The bureau's position changes the same way for Cash and FromAccount:
            // it receives currencyGiven and pays out currencyReceived.
            var givenFloatBefore = FloatBalance(float_, other, currencyGiven, baseCur);
            var receivedFloatBefore = FloatBalance(float_, other, currencyReceived, baseCur);

            if (bureauBuys)
            {
                AddForeign(float_, other, foreign, dto.Amount, kesAmount);   // cost = KES paid out
                float_.KesBalance -= amountReceived;
            }
            else
            {
                float_.KesBalance += dto.Amount;
                var inStock = FloatBalance(float_, other, foreign, baseCur);
                var costOut = RemoveForeign(float_, other, foreign, amountReceived);
                // Units sold beyond the stock on hand (possible for account exchanges)
                // have no recorded cost: value them at today's buy rate, never at zero.
                var uncovered = Math.Max(0m, amountReceived - Math.Max(0m, inStock));
                costOut += uncovered * rate.BuyRate;
                profit = Math.Round(dto.Amount - costOut, 2, MidpointRounding.AwayFromZero);
            }
            exchange.Profit = profit;

            var how = dto.ExchangeType == ExchangeType.Cash ? "" : " (client account)";
            _context.FloatMovements.Add(new FloatMovement
            {
                CompanyId = companyId,
                ExchangeFloatId = float_.Id,
                MovementDate = DateTime.UtcNow,
                MovementType = FloatMovementType.ExchangeIn,
                Currency = currencyGiven,
                Amount = dto.Amount,
                BalanceBefore = givenFloatBefore,
                BalanceAfter = FloatBalance(float_, other, currencyGiven, baseCur),
                Reference = code,
                Notes = $"Exchange {code} - Received from {clientName}{how}",
                CreatedByUserId = userId
            });
            _context.FloatMovements.Add(new FloatMovement
            {
                CompanyId = companyId,
                ExchangeFloatId = float_.Id,
                MovementDate = DateTime.UtcNow,
                MovementType = FloatMovementType.ExchangeOut,
                Currency = currencyReceived,
                Amount = -amountReceived,
                BalanceBefore = receivedFloatBefore,
                BalanceAfter = FloatBalance(float_, other, currencyReceived, baseCur),
                Reference = code,
                Notes = $"Exchange {code} - Given to {clientName}{how}",
                CreatedByUserId = userId
            });

            // Add profit to float
            float_.KesProfit += profit;
            float_.UpdatedAt = DateTime.UtcNow;

            _context.ExchangeTransactions.Add(exchange);
            await _context.SaveChangesAsync();
            await dbTransaction.CommitAsync();

            if (dto.ExchangeType == ExchangeType.FromAccount)
                await CheckClientAlertsAsync(companyId, client);

            return new ApiResponse<ExchangeResponseDto>(true,
                $"Exchange completed. Profit: {baseCur} {profit:N2}",
                MapToExchangeDto(exchange, clientName, client?.ClientType?.ToString() ?? "WalkIn", isLargeTransaction));
        }
        catch (DbUpdateConcurrencyException)
        {
            await dbTransaction.RollbackAsync();
            return new ApiResponse<ExchangeResponseDto>(false,
                "Balance was modified by another operation. Please retry.", null);
        }
        catch (Exception ex)
        {
            await dbTransaction.RollbackAsync();
            await _systemLog.LogErrorAsync("ExchangeService", $"Exchange failed: {ex.Message}",
                ex.StackTrace, companyId, userId);
            return new ApiResponse<ExchangeResponseDto>(false, "Exchange failed. Please try again.", null);
        }
    }

    public async Task<ApiResponse<List<LegacyProfitCorrectionDto>>> CorrectLegacyBuyProfitAsync(Guid? companyId, bool apply)
    {
        // Since the average-cost fix a buy always books exactly 0, so any COMPLETED buy
        // with profit is a legacy row. Voided rows are skipped: their profit was already
        // taken back off the float when they were voided. Old SELLS keep their
        // (sell − buy) × quantity figure — close to average-cost profit when stock is
        // bought at the board rate, and there's no stored purchase cost to do better.
        var legacy = await _context.ExchangeTransactions
            .Where(e => !e.IsDeleted && e.Status == "Completed" && e.Profit != 0
                        && e.Direction == ExchangeDirection.ForeignToKes
                        && (companyId == null || e.CompanyId == companyId))
            .ToListAsync();

        var report = new List<LegacyProfitCorrectionDto>();
        foreach (var group in legacy.GroupBy(e => e.CompanyId))
        {
            var float_ = await _context.ExchangeFloats.FirstOrDefaultAsync(f => f.CompanyId == group.Key);
            var name = await _context.Companies.Where(c => c.Id == group.Key).Select(c => c.Name).FirstOrDefaultAsync() ?? "?";
            var removedBase = group.Where(e => e.ProfitCurrency != Currency.USD).Sum(e => e.Profit);
            var removedUsd = group.Where(e => e.ProfitCurrency == Currency.USD).Sum(e => e.Profit);
            var before = float_?.KesProfit ?? 0m;
            var after = before - removedBase;

            string? warning = null;
            if (float_ == null) warning = "No float record; exchanges corrected, nothing to adjust.";
            else if (after < 0)
                warning = $"Profit goes negative ({after:N2}): about {-after:N2} of double-counted profit was already settled out. Review the settlements.";
            if (removedUsd != 0)
                warning = (warning == null ? "" : warning + " ") + $"Also removes USD profit {removedUsd:N2}.";

            report.Add(new LegacyProfitCorrectionDto(group.Key, name, group.Count(), removedBase, before, after, warning));

            if (!apply) continue;
            foreach (var e in group)
            {
                e.Notes = $"{e.Notes} [Profit {e.Profit:N2} removed {BureauClock.TodayLocal:yyyy-MM-dd}: buys book no profit under average cost]".Trim();
                e.Profit = 0;
                e.UpdatedAt = DateTime.UtcNow;
            }
            if (float_ != null)
            {
                float_.KesProfit = after;
                float_.UsdProfit -= removedUsd;
                float_.UpdatedAt = DateTime.UtcNow;
            }
        }

        if (apply && report.Count > 0)
        {
            await _context.SaveChangesAsync();
            await _systemLog.LogInfoAsync("ExchangeService",
                $"Legacy exchange profit corrected for {report.Count} bureau(s), {report.Sum(r => r.BuyExchangesCorrected)} buys.");
        }

        return new ApiResponse<List<LegacyProfitCorrectionDto>>(true,
            apply ? "Correction applied" : "Dry run — nothing written. Call again with apply=true to write it.", report);
    }

    /// <summary>
    /// Get exchange transactions with pagination, search, and filters.
    /// </summary>
    public async Task<ApiResponse<PagedResult<ExchangeResponseDto>>> GetExchangesAsync(Guid companyId, int page, int pageSize, string? search, ExchangeType? type, DateTime? from,
        DateTime? to)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var query = _context.ExchangeTransactions
            .Where(e => e.CompanyId == companyId && !e.IsDeleted && e.Status != "Voided");

        if (type.HasValue)
            query = query.Where(e => e.ExchangeType == type.Value);
        var (fromUtc, toExclusive) = BureauClock.Range(from, to);
        if (fromUtc.HasValue)
            query = query.Where(e => e.TransactionDate >= fromUtc.Value);
        if (toExclusive.HasValue)
            query = query.Where(e => e.TransactionDate < toExclusive.Value);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            // Get matching client IDs first to avoid complex join in EF
            var clientIds = await _context.Users
                .Where(u => u.CompanyId == companyId && u.FullName.ToLower().Contains(s))
                .Select(u => u.Id).ToListAsync();

            query = query.Where(e => e.Code.ToLower().Contains(s) ||
                                     (e.ClientIdNumber != null && e.ClientIdNumber.ToLower().Contains(s)) ||
                                     e.ClientId.HasValue && clientIds.Contains(e.ClientId.Value));
        }

        var totalCount = await query.CountAsync();

        var exchanges = await query
            .OrderByDescending(e => e.TransactionDate)
            .ThenByDescending(e => e.CreatedAt)
            .ThenByDescending(e => e.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        // Get client names for registered clients
        var clientIdSet = exchanges.Where(e => e.ClientId.HasValue).Select(e => e.ClientId!.Value).Distinct().ToList();
        var clients = await _context.Users
            .Where(u => clientIdSet.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => new { u.FullName, ClientType = u.ClientType.ToString() });

        var float_ = await GetOrCreateFloatAsync(companyId);

        var items = exchanges.Select(e =>
        {
            string name;
            string clientType;
            if (e.ClientId.HasValue && clients.TryGetValue(e.ClientId.Value, out var c))
            {
                name = c.FullName;
                clientType = c.ClientType ?? "Unknown";
            }
            else
            {
                name = e.ClientName ?? "Walk-in Client";
                clientType = "WalkIn";
            }
            decimal kesEquivalent = e.CurrencyGiven == baseCur ? e.AmountGiven : e.AmountReceived;
            return MapToExchangeDto(e, name, clientType,
                kesEquivalent >= float_.LargeTransactionThreshold);
        }).ToList();

        return new ApiResponse<PagedResult<ExchangeResponseDto>>(true, "Success",
            new PagedResult<ExchangeResponseDto>(items, totalCount, page, pageSize));
    }

    /// <summary>
    /// Get a single exchange transaction by ID.
    /// </summary>
    public async Task<ApiResponse<ExchangeResponseDto>> GetExchangeByIdAsync(Guid companyId, Guid exchangeId)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var exchange = await _context.ExchangeTransactions
            .FirstOrDefaultAsync(e => e.Id == exchangeId && e.CompanyId == companyId && !e.IsDeleted);

        if (exchange == null)
            return new ApiResponse<ExchangeResponseDto>(false, "Exchange transaction not found", null);

        User? client = exchange.ClientId.HasValue ? await _context.Users.FindAsync(exchange.ClientId.Value) : null;
        var float_ = await GetOrCreateFloatAsync(companyId);

        decimal kesEquivalent = exchange.CurrencyGiven == baseCur ? exchange.AmountGiven : exchange.AmountReceived;

        return new ApiResponse<ExchangeResponseDto>(true, "Success",
            MapToExchangeDto(exchange,
                client?.FullName ?? exchange.ClientName ?? "Walk-in Client",
                client?.ClientType?.ToString() ?? "WalkIn",
                kesEquivalent >= float_.LargeTransactionThreshold));
    }

    /// <summary>
    /// Void an exchange transaction — reverses float balances and client account adjustments.
    /// Only Completed exchanges can be voided. Creates reversal audit trail.
    /// Works for any KES ↔ foreign pair (USD, UGX, EUR).
    /// </summary>
    public async Task<ApiResponse<bool>> VoidExchangeAsync(Guid companyId, Guid userId, Guid exchangeId, string reason)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        using var dbTransaction = await _context.Database.BeginTransactionAsync();

        try
        {
            var exchange = await _context.ExchangeTransactions
                .FirstOrDefaultAsync(e => e.Id == exchangeId && e.CompanyId == companyId && !e.IsDeleted);

            if (exchange == null)
                return new ApiResponse<bool>(false, "Exchange transaction not found", false);

            if (exchange.Status != "Completed")
                return new ApiResponse<bool>(false, $"Cannot void exchange with status '{exchange.Status}'", false);

            var float_ = await GetOrCreateFloatAsync(companyId);
            var foreign = exchange.CurrencyGiven == baseCur ? exchange.CurrencyReceived : exchange.CurrencyGiven;
            var other = IsOtherCurrency(foreign, baseCur) ? await GetOrCreateOtherFloatAsync(companyId, foreign) : null;
            bool bureauBought = exchange.CurrencyGiven != baseCur;

            // Reverse float balances — applies to BOTH Cash and FromAccount.
            // Original: float received CurrencyGiven and paid out CurrencyReceived.
            var givenFloatBefore = FloatBalance(float_, other, exchange.CurrencyGiven, baseCur);
            var receivedFloatBefore = FloatBalance(float_, other, exchange.CurrencyReceived, baseCur);
            if (bureauBought)
            {
                RemoveForeign(float_, other, foreign, exchange.AmountGiven);
                float_.KesBalance += exchange.AmountReceived;
            }
            else
            {
                float_.KesBalance -= exchange.AmountGiven;
                // Put the units back at what they cost (KES received minus the profit booked),
                // not at the sale price, so the average cost returns to where it was.
                AddForeign(float_, other, foreign, exchange.AmountReceived, Math.Max(0m, exchange.AmountGiven - exchange.Profit));
            }

            _context.FloatMovements.Add(new FloatMovement
            {
                CompanyId = companyId, ExchangeFloatId = float_.Id, MovementDate = DateTime.UtcNow,
                MovementType = FloatMovementType.Adjustment, Currency = exchange.CurrencyGiven,
                Amount = -exchange.AmountGiven,
                BalanceBefore = givenFloatBefore, BalanceAfter = FloatBalance(float_, other, exchange.CurrencyGiven, baseCur),
                Reference = $"VOID-{exchange.Code}", Notes = $"Void of exchange {exchange.Code}: {reason}",
                CreatedByUserId = userId
            });
            _context.FloatMovements.Add(new FloatMovement
            {
                CompanyId = companyId, ExchangeFloatId = float_.Id, MovementDate = DateTime.UtcNow,
                MovementType = FloatMovementType.Adjustment, Currency = exchange.CurrencyReceived,
                Amount = exchange.AmountReceived,
                BalanceBefore = receivedFloatBefore, BalanceAfter = FloatBalance(float_, other, exchange.CurrencyReceived, baseCur),
                Reference = $"VOID-{exchange.Code}", Notes = $"Void of exchange {exchange.Code}: {reason}",
                CreatedByUserId = userId
            });

            // Reverse profit
            if (exchange.ProfitCurrency == Currency.USD) float_.UsdProfit -= exchange.Profit;
            else float_.KesProfit -= exchange.Profit;
            float_.UpdatedAt = DateTime.UtcNow;

            // Mark exchange as voided
            exchange.Status = "Voided";
            exchange.VoidReason = reason;
            exchange.UpdatedAt = DateTime.UtcNow;

            // Mark the linked client statement lines as voided
            foreach (var linkedId in new[] { exchange.ClientSourceTransactionId, exchange.ClientDestTransactionId })
            {
                if (!linkedId.HasValue) continue;
                var linked = await _context.Transactions.FindAsync(linkedId.Value);
                if (linked == null) continue;
                linked.Description = $"[VOIDED] {linked.Description}";
                linked.DeletedAt = DateTime.UtcNow;
                linked.DeletedByUserId = userId;
                linked.DeleteReason = $"Exchange {exchange.Code} voided: {reason}";
                linked.Notes = (linked.Notes ?? "") + $" [Voided: {exchange.Code}]";
                linked.UpdatedAt = DateTime.UtcNow;
            }

            // FromAccount: give the client back what they gave, take back what they got,
            // with reversal entries for the client statement audit trail.
            if (exchange.ExchangeType == ExchangeType.FromAccount && exchange.ClientId.HasValue)
            {
                var client = await _context.Users.FindAsync(exchange.ClientId.Value);
                if (client != null)
                {
                    var clientId = exchange.ClientId.Value;
                    var (gBefore, gAfter) = await AdjustClientBalanceAsync(companyId, client, exchange.CurrencyGiven, exchange.AmountGiven);
                    var (rBefore, rAfter) = await AdjustClientBalanceAsync(companyId, client, exchange.CurrencyReceived, -exchange.AmountReceived);
                    client.UpdatedAt = DateTime.UtcNow;

                    var rev1 = ClientLeg(companyId, userId, clientId, exchange.Code, TransactionType.Credit,
                        exchange.AmountGiven, exchange.CurrencyGiven, gBefore, gAfter,
                        $"VOID REVERSAL: Return {exchange.CurrencyGiven} {exchange.AmountGiven:N2}",
                        reference: $"REV-EXC-{exchange.Code}", notes: $"Void of exchange {exchange.Code}. Reason: {reason}");
                    rev1.Code = await CodeGenerator.GenerateTransactionCodeAsync(_context, companyId);
                    rev1.ReconciliationStatus = ReconciliationStatus.Matched;
                    _context.Transactions.Add(rev1);

                    var rev2 = ClientLeg(companyId, userId, clientId, exchange.Code, TransactionType.Debit,
                        exchange.AmountReceived, exchange.CurrencyReceived, rBefore, rAfter,
                        $"VOID REVERSAL: Reverse {exchange.CurrencyReceived} {exchange.AmountReceived:N2}",
                        reference: $"REV-EXC-{exchange.Code}", notes: $"Void of exchange {exchange.Code}. Reason: {reason}");
                    rev2.Code = await CodeGenerator.GenerateTransactionCodeAsync(_context, companyId);
                    rev2.ReconciliationStatus = ReconciliationStatus.Matched;
                    _context.Transactions.Add(rev2);
                }
            }

            await _context.SaveChangesAsync();
            await dbTransaction.CommitAsync();

            // A void is a normal action, not an error: it was logged as Error, which pushed up
            // the super admin error count and "System degraded". And a failing log line after
            // the commit fell into the catch below and reported the saved void as failed.
            try
            {
                await _systemLog.LogInfoAsync("ExchangeService",
                    $"Exchange {exchange.Code} voided by user {userId}. Reason: {reason}", companyId, userId);
            }
            catch { /* the void is saved */ }

            if (exchange.ExchangeType == ExchangeType.FromAccount && exchange.ClientId.HasValue)
                await CheckClientAlertsAsync(companyId, await _context.Users.FindAsync(exchange.ClientId.Value));

            return new ApiResponse<bool>(true, $"Exchange {exchange.Code} voided successfully", true);
        }
        catch (DbUpdateConcurrencyException)
        {
            await dbTransaction.RollbackAsync();
            return new ApiResponse<bool>(false, "Balance was modified by another operation. Please retry.", false);
        }
        catch (Exception ex)
        {
            await dbTransaction.RollbackAsync();
            await _systemLog.LogErrorAsync("ExchangeService", $"Failed to void exchange: {ex.Message}",
                ex.StackTrace, companyId, userId);
            return new ApiResponse<bool>(false, "Failed to void exchange. Please try again.", false);
        }
    }

    /// <summary>
    /// Get today's daily summary — builds it from live data if not closed.
    /// Morning: shows opening float + today's exchanges.
    /// Evening: shows full day summary before closing.
    /// </summary>
    public async Task<ApiResponse<DailySummaryDto>> GetTodaySummaryAsync(Guid companyId)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var today = BureauClock.TodayLocal;            // the summary's date: the bureau's calendar day
        var todayStartUtc = BureauClock.TodayStartUtc;  // ...which starts at this UTC instant

        // Check if there's an existing summary for today
        var existing = await _context.DailyExchangeSummaries
            .FirstOrDefaultAsync(d => d.CompanyId == companyId && d.Date == today && !d.IsDeleted);

        if (existing != null)
            return new ApiResponse<DailySummaryDto>(true, "Success",
                MapToDailySummaryDto(existing, await DayCurrencyRowsAsync(existing.Id), baseCur));

        // Build live summary from today's exchanges
        var float_ = await GetOrCreateFloatAsync(companyId);
        var todayExchanges = await _context.ExchangeTransactions.AsNoTracking()
            .Where(e => e.CompanyId == companyId && e.TransactionDate >= todayStartUtc
                        && e.Status == "Completed" && !e.IsDeleted)
            .ToListAsync();

        var totalTransactions = await _context.Transactions
            .CountAsync(t => t.CompanyId == companyId && t.TransactionDate >= todayStartUtc && !t.IsDeleted);

        var dto = new DailySummaryDto(
            Date: today,
            TotalTransactions: totalTransactions,
            ExchangeCount: todayExchanges.Count,
            KesVolumeIn: todayExchanges.Where(e => e.CurrencyGiven == baseCur).Sum(e => e.AmountGiven),
            KesVolumeOut: todayExchanges.Where(e => e.CurrencyReceived == baseCur).Sum(e => e.AmountReceived),
            UsdVolumeIn: todayExchanges.Where(e => e.CurrencyGiven == Currency.USD).Sum(e => e.AmountGiven),
            UsdVolumeOut: todayExchanges.Where(e => e.CurrencyReceived == Currency.USD).Sum(e => e.AmountReceived),
            KesProfit: todayExchanges.Where(e => e.ProfitCurrency == baseCur).Sum(e => e.Profit),
            UsdProfit: todayExchanges.Where(e => e.ProfitCurrency == Currency.USD).Sum(e => e.Profit),
            OpeningKes: float_.LastOpeningKes ?? float_.KesBalance,
            OpeningUsd: float_.LastOpeningUsd ?? float_.UsdBalance,
            ClosingKes: float_.KesBalance,
            ClosingUsd: float_.UsdBalance,
            KesVariance: null,
            UsdVariance: null,
            IsClosed: false,
            OtherCurrencies: await LiveOtherCurrencyDayAsync(companyId, todayExchanges, null),
            BaseCurrency: baseCur
        );

        return new ApiResponse<DailySummaryDto>(true, "Success", dto);
    }

    /// <summary>
    /// Record opening float — cashier physically counts KES/USD at start of day.
    /// Stores the opening snapshot and checks for variance against system balance.
    /// </summary>
    public async Task<ApiResponse<DailySummaryDto>> RecordOpeningFloatAsync(Guid companyId, Guid userId, OpeningFloatDto dto)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var today = BureauClock.TodayLocal;            // the summary's date: the bureau's calendar day
        var todayStartUtc = BureauClock.TodayStartUtc;  // ...which starts at this UTC instant
        var float_ = await GetOrCreateFloatAsync(companyId);

        // Check if already recorded today
        var existing = await _context.DailyExchangeSummaries
            .FirstOrDefaultAsync(d => d.CompanyId == companyId && d.Date == today && !d.IsDeleted);

        if (existing != null)
            return new ApiResponse<DailySummaryDto>(false, "Opening float already recorded for today",
                MapToDailySummaryDto(existing, await DayCurrencyRowsAsync(existing.Id), baseCur));

        // Record the opening physical count
        float_.LastOpeningDate = today;
        float_.LastOpeningKes = dto.KesCount;
        float_.LastOpeningUsd = dto.UsdCount;
        float_.UpdatedAt = DateTime.UtcNow;

        // Create daily summary with opening values
        var summary = new DailyExchangeSummary
        {
            CompanyId = companyId,
            Date = today,
            OpeningKes = dto.KesCount,
            OpeningUsd = dto.UsdCount,
            ClosingKes = float_.KesBalance,
            ClosingUsd = float_.UsdBalance,
            Notes = dto.Notes,
            IsClosed = false
        };

        _context.DailyExchangeSummaries.Add(summary);

        // UGX, EUR, ... opening counts (one row per currency)
        var openingRows = new List<DailyExchangeCurrencySummary>();
        foreach (var count in (dto.OtherCounts ?? new List<CurrencyCountDto>())
                     .Where(c => c.Currency != baseCur && c.Currency != Currency.USD)
                     .GroupBy(c => c.Currency).Select(g => g.Last()))
        {
            var holding = await _context.ExchangeFloatBalances
                .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.Currency == count.Currency);
            var row = new DailyExchangeCurrencySummary
            {
                CompanyId = companyId,
                DailyExchangeSummaryId = summary.Id,
                Date = today,
                Currency = count.Currency,
                Opening = count.Count,
                Closing = holding?.Balance ?? 0
            };
            _context.DailyExchangeCurrencySummaries.Add(row);
            openingRows.Add(row);
        }

        await _context.SaveChangesAsync();

        return new ApiResponse<DailySummaryDto>(true, "Opening float recorded", MapToDailySummaryDto(summary, openingRows, baseCur));
    }

    /// <summary>
    /// Record closing float — cashier physically counts KES/USD at end of day.
    /// Calculates variance (physical count - system balance).
    /// Locks the day from further edits.
    /// </summary>
    public async Task<ApiResponse<DailySummaryDto>> RecordClosingFloatAsync(Guid companyId, Guid userId, ClosingFloatDto dto)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var today = BureauClock.TodayLocal;            // the summary's date: the bureau's calendar day
        var todayStartUtc = BureauClock.TodayStartUtc;  // ...which starts at this UTC instant

        var summary = await _context.DailyExchangeSummaries
            .FirstOrDefaultAsync(d => d.CompanyId == companyId && d.Date == today && !d.IsDeleted);

        if (summary == null)
        {
            // No opening recorded — auto-create with current float as opening
            var floatForOpening = await GetOrCreateFloatAsync(companyId);
            summary = new DailyExchangeSummary
            {
                CompanyId = companyId,
                Date = today,
                OpeningKes = floatForOpening.KesBalance,
                OpeningUsd = floatForOpening.UsdBalance,
                IsClosed = false
            };
            _context.DailyExchangeSummaries.Add(summary);
        }

        if (summary.IsClosed)
            return new ApiResponse<DailySummaryDto>(false, "Today's summary is already closed",
                MapToDailySummaryDto(summary, await DayCurrencyRowsAsync(summary.Id), baseCur));

        var float_ = await GetOrCreateFloatAsync(companyId);

        // Compute today's exchange volumes
        var todayExchanges = await _context.ExchangeTransactions
            .Where(e => e.CompanyId == companyId && e.TransactionDate >= todayStartUtc
                        && e.Status == "Completed" && !e.IsDeleted)
            .ToListAsync();

        summary.ExchangeCount = todayExchanges.Count;
        summary.KesVolumeIn = todayExchanges.Where(e => e.CurrencyGiven == baseCur).Sum(e => e.AmountGiven);
        summary.KesVolumeOut = todayExchanges.Where(e => e.CurrencyReceived == baseCur).Sum(e => e.AmountReceived);
        summary.UsdVolumeIn = todayExchanges.Where(e => e.CurrencyGiven == Currency.USD).Sum(e => e.AmountGiven);
        summary.UsdVolumeOut = todayExchanges.Where(e => e.CurrencyReceived == Currency.USD).Sum(e => e.AmountReceived);
        summary.KesProfit = todayExchanges.Where(e => e.ProfitCurrency == baseCur).Sum(e => e.Profit);
        summary.UsdProfit = todayExchanges.Where(e => e.ProfitCurrency == Currency.USD).Sum(e => e.Profit);

        // Closing = system balance
        summary.ClosingKes = float_.KesBalance;
        summary.ClosingUsd = float_.UsdBalance;

        // Physical count vs system → variance (positive = surplus, negative = shortage)
        summary.ActualKesCount = dto.KesCount;
        summary.ActualUsdCount = dto.UsdCount;
        summary.KesVariance = dto.KesCount - float_.KesBalance;
        summary.UsdVariance = dto.UsdCount - float_.UsdBalance;

        summary.Notes = dto.Notes;
        summary.IsClosed = true;
        summary.ClosedByUserId = userId;
        summary.ClosedAt = DateTime.UtcNow;
        summary.UpdatedAt = DateTime.UtcNow;

        // UGX, EUR, ...: closing = system balance, variance = physical count - system
        var counts = (dto.OtherCounts ?? new List<CurrencyCountDto>())
            .GroupBy(c => c.Currency).ToDictionary(g => g.Key, g => g.Last().Count);
        var rows = await DayCurrencyRowsAsync(summary.Id);
        var live = await LiveOtherCurrencyDayAsync(companyId, todayExchanges, rows);
        var currencies = live.Select(l => l.Currency)
            .Concat(counts.Keys.Where(c => c != baseCur && c != Currency.USD))
            .Distinct().ToList();
        foreach (var cur in currencies)
        {
            var row = rows.FirstOrDefault(r => r.Currency == cur);
            if (row == null)
            {
                var holding = await _context.ExchangeFloatBalances
                    .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.Currency == cur);
                row = new DailyExchangeCurrencySummary
                {
                    CompanyId = companyId,
                    DailyExchangeSummaryId = summary.Id,
                    Date = today,
                    Currency = cur,
                    Opening = holding?.Balance ?? 0   // no opening count → system balance
                };
                _context.DailyExchangeCurrencySummaries.Add(row);
                rows.Add(row);
            }
            var l = live.FirstOrDefault(x => x.Currency == cur);
            row.Closing = l?.Closing ?? 0;
            row.VolumeIn = l?.VolumeIn ?? 0;
            row.VolumeOut = l?.VolumeOut ?? 0;
            if (counts.TryGetValue(cur, out var counted))
            {
                row.ActualCount = counted;
                row.Variance = counted - row.Closing;
            }
            row.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        return new ApiResponse<DailySummaryDto>(true, "Day closed successfully", MapToDailySummaryDto(summary, rows, baseCur));
    }

    /// <summary>
    /// Get daily summaries for a date range.
    /// </summary>
    public async Task<ApiResponse<List<DailySummaryDto>>> GetDailySummariesAsync(Guid companyId, DateTime from, DateTime to)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var summaries = await _context.DailyExchangeSummaries
            .Where(d => d.CompanyId == companyId && d.Date >= from.Date && d.Date <= to.Date && !d.IsDeleted)
            .OrderByDescending(d => d.Date)
            .ToListAsync();

        var ids = summaries.Select(s => s.Id).ToList();
        var allRows = await _context.DailyExchangeCurrencySummaries
            .Where(r => ids.Contains(r.DailyExchangeSummaryId))
            .ToListAsync();

        return new ApiResponse<List<DailySummaryDto>>(true, "Success",
            summaries.Select(s => MapToDailySummaryDto(s, allRows.Where(r => r.DailyExchangeSummaryId == s.Id).ToList(), baseCur)).ToList());
    }

    /// <summary>
    /// Profit report for a date range — aggregates daily profits and transaction counts.
    /// </summary>
    public async Task<ApiResponse<ProfitReportDto>> GetProfitReportAsync(Guid companyId, DateTime from, DateTime to)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        // bureau-local days, end day included; an omitted date means no limit
        var (rf, rt) = BureauClock.Range(from, to);
        var fromUtc = rf ?? DateTime.SpecifyKind(DateTime.MinValue, DateTimeKind.Utc);
        var toExclusive = rt ?? DateTime.SpecifyKind(DateTime.MaxValue, DateTimeKind.Utc);
        var exchanges = await _context.ExchangeTransactions.AsNoTracking()
            .Where(e => e.CompanyId == companyId
                        && e.TransactionDate >= fromUtc
                        && e.TransactionDate < toExclusive
                        && e.Status == "Completed"
                        && !e.IsDeleted)
            .ToListAsync();

        var dailyBreakdown = exchanges
            .GroupBy(e => e.TransactionDate.Date)
            .Select(g => new DailyProfitDto(
                Date: g.Key,
                KesProfit: g.Where(e => e.ProfitCurrency == baseCur).Sum(e => e.Profit),
                UsdProfit: g.Where(e => e.ProfitCurrency == Currency.USD).Sum(e => e.Profit),
                Transactions: g.Count()
            ))
            .OrderByDescending(d => d.Date)
            .ToList();

        var totalKesProfit = exchanges.Where(e => e.ProfitCurrency == baseCur).Sum(e => e.Profit);
        var totalUsdProfit = exchanges.Where(e => e.ProfitCurrency == Currency.USD).Sum(e => e.Profit);

        // Current USD sell rate for the KES equivalent of (legacy) USD profit
        var rate = await ActiveRateAsync(companyId, Currency.USD);
        var rateVal = rate?.SellRate ?? 0;
        var totalInKes = totalKesProfit + (totalUsdProfit * rateVal);

        // Average spread across the period
        decimal avgSpread = 0;
        if (exchanges.Count > 0)
        {
            var rates = await _context.ExchangeRates
                .Where(r => r.CompanyId == companyId && r.ForeignCurrency == Currency.USD
                            && r.EffectiveFrom >= from.Date && r.EffectiveFrom <= to.Date.AddDays(1))
                .ToListAsync();
            if (rates.Count > 0)
                avgSpread = rates.Average(r => r.SellRate - r.BuyRate);
            else if (rate != null)
                avgSpread = rate.SellRate - rate.BuyRate;
        }

        var report = new ProfitReportDto(
            FromDate: from.Date,
            ToDate: to.Date,
            TotalKesProfit: totalKesProfit,
            TotalUsdProfit: totalUsdProfit,
            TotalProfitInKes: totalInKes,
            TotalTransactions: exchanges.Count,
            AverageSpread: avgSpread,
            DailyBreakdown: dailyBreakdown,
            BaseCurrency: baseCur
        );

        return new ApiResponse<ProfitReportDto>(true, "Success", report);
    }

    /// <summary>
    /// Large transactions for CBK compliance reporting.
    /// Returns all exchanges where KES equivalent >= threshold.
    /// </summary>
    public async Task<ApiResponse<List<LargeTransactionReportDto>>> GetLargeTransactionsAsync(Guid companyId, DateTime from, DateTime to, decimal threshold)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        // bureau-local days, end day included; an omitted date means no limit
        var (rf, rt) = BureauClock.Range(from, to);
        var fromUtc = rf ?? DateTime.SpecifyKind(DateTime.MinValue, DateTimeKind.Utc);
        var toExclusive = rt ?? DateTime.SpecifyKind(DateTime.MaxValue, DateTimeKind.Utc);
        var exchanges = await _context.ExchangeTransactions.AsNoTracking()
            .Where(e => e.CompanyId == companyId
                        && e.TransactionDate >= fromUtc
                        && e.TransactionDate < toExclusive
                        && e.Status == "Completed"
                        && !e.IsDeleted)
            .ToListAsync();

        // Get client details for matching exchanges
        var clientIds = exchanges.Where(e => e.ClientId.HasValue).Select(e => e.ClientId!.Value).Distinct().ToList();
        var clients = await _context.Users
            .Where(u => clientIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u);

        var results = new List<LargeTransactionReportDto>();

        foreach (var e in exchanges)
        {
            decimal kesEquivalent = e.CurrencyGiven == baseCur
                ? e.AmountGiven
                : e.AmountReceived; // KES side of the exchange

            if (kesEquivalent < threshold) continue;

            User? client = e.ClientId.HasValue ? clients.GetValueOrDefault(e.ClientId.Value) : null;

            results.Add(new LargeTransactionReportDto(
                TransactionId: e.Id,
                Code: e.Code,
                Date: e.TransactionDate,
                ClientName: client?.FullName ?? e.ClientName ?? "Walk-in Client",
                ClientIdNumber: e.ClientIdNumber ?? client?.IdPassport ?? "N/A",
                ClientPhone: client?.WhatsAppNumber,
                Amount: e.AmountGiven,
                Currency: e.CurrencyGiven,
                KesEquivalent: kesEquivalent,
                TransactionType: $"{e.Direction} ({e.ExchangeType})"
            ));
        }

        return new ApiResponse<List<LargeTransactionReportDto>>(true, "Success",
            results.OrderByDescending(r => r.KesEquivalent).ToList());
    }

    /// <summary>
    /// Client's complete exchange history with totals.
    /// </summary>
    public async Task<ApiResponse<ClientExchangeHistoryDto>> GetClientExchangeHistoryAsync(Guid companyId, Guid clientId)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var client = await _context.Users.FindAsync(clientId);
        if (client == null || client.CompanyId != companyId)
            return new ApiResponse<ClientExchangeHistoryDto>(false, "Client not found", null);

        var exchanges = await _context.ExchangeTransactions.AsNoTracking()
            .Where(e => e.CompanyId == companyId && e.ClientId == clientId
                        && e.Status == "Completed" && !e.IsDeleted)
            .OrderByDescending(e => e.TransactionDate)
            .ToListAsync();

        var float_ = await GetOrCreateFloatAsync(companyId);

        var recentExchanges = exchanges.Take(20).Select(e =>
        {
            decimal kesEq = e.CurrencyGiven == baseCur ? e.AmountGiven : e.AmountReceived;
            return MapToExchangeDto(e, client.FullName, client.ClientType?.ToString() ?? "",
                kesEq >= float_.LargeTransactionThreshold);
        }).ToList();

        var history = new ClientExchangeHistoryDto(
            ClientId: clientId,
            ClientName: client.FullName,
            TotalExchanges: exchanges.Count,
            TotalKesExchanged: exchanges.Where(e => e.CurrencyGiven == baseCur).Sum(e => e.AmountGiven)
                             + exchanges.Where(e => e.CurrencyReceived == baseCur).Sum(e => e.AmountReceived),
            TotalUsdExchanged: exchanges.Where(e => e.CurrencyGiven == Currency.USD).Sum(e => e.AmountGiven)
                             + exchanges.Where(e => e.CurrencyReceived == Currency.USD).Sum(e => e.AmountReceived),
            TotalProfitGenerated: exchanges.Sum(e => e.Profit),
            FirstExchange: exchanges.LastOrDefault()?.TransactionDate,
            LastExchange: exchanges.FirstOrDefault()?.TransactionDate,
            RecentExchanges: recentExchanges
        );

        return new ApiResponse<ClientExchangeHistoryDto>(true, "Success", history);
    }

    /// <summary>
    /// USD Position — average cost inventory tracking.
    /// Shows current USD holdings, cost basis, and unrealized P&L based on current sell rate.
    /// </summary>
    public async Task<ApiResponse<UsdPositionDto>> GetUsdPositionAsync(Guid companyId)
    {
        var float_ = await GetOrCreateFloatAsync(companyId);
        var rate = await ActiveRateAsync(companyId, Currency.USD);

        var currentMarketRate = rate?.SellRate ?? 0;
        var marketValue = float_.UsdBalance * currentMarketRate;
        var unrealizedPnL = marketValue - float_.UsdTotalCost;
        var unrealizedPnLPercent = float_.UsdTotalCost > 0
            ? (unrealizedPnL / float_.UsdTotalCost) * 100
            : 0;

        var position = new UsdPositionDto(
            UsdBalance: float_.UsdBalance,
            AverageCostPerUsd: float_.UsdAverageCost,
            TotalCostBasis: float_.UsdTotalCost,
            CurrentMarketRate: currentMarketRate,
            CurrentMarketValue: marketValue,
            UnrealizedPnL: unrealizedPnL,
            UnrealizedPnLPercent: Math.Round(unrealizedPnLPercent, 2)
        );

        return new ApiResponse<UsdPositionDto>(true, "Success", position);
    }

    /// <summary>
    /// Float alerts — checks low balance thresholds and returns active warnings.
    /// </summary>
    public async Task<ApiResponse<List<FloatAlertDto>>> GetAlertsAsync(Guid companyId)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var float_ = await GetOrCreateFloatAsync(companyId);
        var alerts = new List<FloatAlertDto>();
        var now = DateTime.UtcNow;

        // Low KES balance
        if (float_.KesBalance < float_.LowKesThreshold)
        {
            alerts.Add(new FloatAlertDto(
                AlertType: "LowBalance",
                Message: $"{baseCur} float balance ({float_.KesBalance:N2}) is below threshold ({float_.LowKesThreshold:N2})",
                Currency: baseCur,
                CurrentBalance: float_.KesBalance,
                Threshold: float_.LowKesThreshold,
                Timestamp: now
            ));
        }

        // Low USD balance
        if (float_.UsdBalance < float_.LowUsdThreshold)
        {
            alerts.Add(new FloatAlertDto(
                AlertType: "LowBalance",
                Message: $"USD float balance (${float_.UsdBalance:N2}) is below threshold (${float_.LowUsdThreshold:N2})",
                Currency: Currency.USD,
                CurrentBalance: float_.UsdBalance,
                Threshold: float_.LowUsdThreshold,
                Timestamp: now
            ));
        }

        // Negative balance (critical)
        if (float_.KesBalance < 0)
        {
            alerts.Add(new FloatAlertDto(
                AlertType: "NegativeBalance",
                Message: $"CRITICAL: {baseCur} float is negative ({float_.KesBalance:N2})",
                Currency: baseCur,
                CurrentBalance: float_.KesBalance,
                Threshold: 0,
                Timestamp: now
            ));
        }

        if (float_.UsdBalance < 0)
        {
            alerts.Add(new FloatAlertDto(
                AlertType: "NegativeBalance",
                Message: $"CRITICAL: USD float is negative (${float_.UsdBalance:N2})",
                Currency: Currency.USD,
                CurrentBalance: float_.UsdBalance,
                Threshold: 0,
                Timestamp: now
            ));
        }

        // Negative UGX / EUR / ... float (critical)
        var negativeOthers = await _context.ExchangeFloatBalances
            .Where(b => b.CompanyId == companyId && b.Balance < 0)
            .ToListAsync();
        foreach (var b in negativeOthers)
        {
            alerts.Add(new FloatAlertDto(
                AlertType: "NegativeBalance",
                Message: $"CRITICAL: {b.Currency} float is negative ({b.Balance:N2})",
                Currency: b.Currency,
                CurrentBalance: b.Balance,
                Threshold: 0,
                Timestamp: now
            ));
        }

        // Unsettled profit alert (if profit is large)
        var unsettledProfit = float_.KesProfit + float_.UsdProfit;
        var highProfit = CurrencyInfo.FromKes(100_000m, baseCur);
        if (unsettledProfit > highProfit)
        {
            alerts.Add(new FloatAlertDto(
                AlertType: "HighUnsettledProfit",
                Message: $"Unsettled profit is high: {baseCur} {float_.KesProfit:N2} + USD {float_.UsdProfit:N2}. Consider settling.",
                Currency: null,
                CurrentBalance: unsettledProfit,
                Threshold: highProfit,
                Timestamp: now
            ));
        }

        return new ApiResponse<List<FloatAlertDto>>(true, "Success", alerts);
    }

    /// <summary>
    /// Update alert thresholds for the float.
    /// </summary>
    public async Task<ApiResponse<bool>> UpdateAlertThresholdsAsync(Guid companyId, decimal lowKes, decimal lowUsd, decimal largeTransaction)
    {
        if (lowKes < 0 || lowUsd < 0 || largeTransaction < 0)
            return new ApiResponse<bool>(false, "Thresholds must be non-negative", false);

        var float_ = await GetOrCreateFloatAsync(companyId);

        float_.LowKesThreshold = lowKes;
        float_.LowUsdThreshold = lowUsd;
        float_.LargeTransactionThreshold = largeTransaction;
        float_.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return new ApiResponse<bool>(true, "Thresholds updated", true);
    }

    // ==================== MULTI-CURRENCY HELPERS ====================
    // KES and USD live in dedicated columns (ExchangeFloat, User.BalanceKES/USD).
    // Every other currency lives in a per-currency row (ExchangeFloatBalance,
    // ClientCurrencyBalance). These helpers hide that split.

    /// <summary>True for currencies kept in per-currency rows: anything but the base and USD.</summary>
    private static bool IsOtherCurrency(Currency c, Currency baseCur) => c != baseCur && c != Currency.USD;

    private Task<ExchangeRate?> ActiveRateAsync(Guid companyId, Currency foreign) =>
        _context.ExchangeRates
            .Where(r => r.CompanyId == companyId && r.IsActive && r.ForeignCurrency == foreign)
            .OrderByDescending(r => r.EffectiveFrom)
            .FirstOrDefaultAsync();

    private async Task<ExchangeFloatBalance> GetOrCreateOtherFloatAsync(Guid companyId, Currency currency)
    {
        var row = await _context.ExchangeFloatBalances
            .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.Currency == currency);
        if (row != null) return row;
        row = new ExchangeFloatBalance { CompanyId = companyId, Currency = currency };
        _context.ExchangeFloatBalances.Add(row);   // saved with the caller's SaveChanges
        return row;
    }

    /// <summary>
    /// Float balance in any currency. The Kes* columns hold the company's BASE
    /// currency (KES in Kenya, UGX in Uganda — names are historical), USD has
    /// its own columns, every other currency lives in ExchangeFloatBalances.
    /// </summary>
    private static decimal FloatBalance(ExchangeFloat f, ExchangeFloatBalance? other, Currency c, Currency baseCur) =>
        c == baseCur ? f.KesBalance
        : c == Currency.USD ? f.UsdBalance
        : other?.Currency == c ? other.Balance : 0;

    /// <summary>
    /// Bureau acquires foreign currency: quantity in, KES cost added (average cost).
    /// When the float is short (negative after selling more than it held, possible on
    /// account exchanges), the first units only close that short — they were already
    /// costed at the buy rate when sold — so only the remainder adds to stock cost.
    /// Adding the full cost there inflated the average cost and understated the next
    /// sale's profit.
    /// </summary>
    private static void AddForeign(ExchangeFloat f, ExchangeFloatBalance? other, Currency c, decimal qty, decimal kesCost)
    {
        static decimal StockCost(decimal balance, decimal qty, decimal kesCost)
        {
            if (balance >= 0 || qty <= 0) return kesCost;
            var intoStock = Math.Max(0m, qty - (-balance));
            return kesCost * intoStock / qty;
        }

        if (c == Currency.USD)
        {
            f.UsdTotalCost = Math.Max(0m, f.UsdTotalCost) + StockCost(f.UsdBalance, qty, kesCost);
            f.UsdBalance += qty;
            f.UsdAverageCost = f.UsdBalance > 0 ? f.UsdTotalCost / f.UsdBalance : 0;
            if (f.UsdBalance <= 0) f.UsdTotalCost = 0;
            return;
        }
        if (other == null || other.Currency != c) throw new InvalidOperationException($"No float row loaded for {c}");
        other.TotalCost = Math.Max(0m, other.TotalCost) + StockCost(other.Balance, qty, kesCost);
        other.Balance += qty;
        other.AverageCost = other.Balance > 0 ? other.TotalCost / other.Balance : 0;
        if (other.Balance <= 0) other.TotalCost = 0;
        other.UpdatedAt = DateTime.UtcNow;
    }

    /// <summary>
    /// Bureau disposes of foreign currency: quantity out, cost removed at average cost.
    /// Returns the KES cost removed. Never removes more cost than it holds (selling more
    /// than the stock used to push TotalCost negative).
    /// </summary>
    private static decimal RemoveForeign(ExchangeFloat f, ExchangeFloatBalance? other, Currency c, decimal qty)
    {
        if (c == Currency.USD)
        {
            var covered = Math.Min(qty, Math.Max(0m, f.UsdBalance));
            var cut = f.UsdBalance > 0 ? (covered / f.UsdBalance) * f.UsdTotalCost : 0;
            f.UsdBalance -= qty;
            f.UsdTotalCost -= cut;
            f.UsdAverageCost = f.UsdBalance > 0 ? f.UsdTotalCost / f.UsdBalance : 0;
            return cut;
        }
        if (other == null || other.Currency != c) throw new InvalidOperationException($"No float row loaded for {c}");
        var coveredOther = Math.Min(qty, Math.Max(0m, other.Balance));
        var cutOther = other.Balance > 0 ? (coveredOther / other.Balance) * other.TotalCost : 0;
        other.Balance -= qty;
        other.TotalCost -= cutOther;
        other.AverageCost = other.Balance > 0 ? other.TotalCost / other.Balance : 0;
        other.UpdatedAt = DateTime.UtcNow;
        return cutOther;
    }

    /// <summary>Average KES cost of one unit of a foreign currency held in the float (0 if none).</summary>
    private async Task<decimal> AverageCostAsync(Guid companyId, Currency foreign) =>
        foreign == Currency.USD
            ? await _context.ExchangeFloats.Where(f => f.CompanyId == companyId).Select(f => f.UsdAverageCost).FirstOrDefaultAsync()
            : await _context.ExchangeFloatBalances.Where(b => b.CompanyId == companyId && b.Currency == foreign).Select(b => b.AverageCost).FirstOrDefaultAsync();

    private async Task<decimal> ClientBalanceAsync(Guid companyId, User client, Currency c)
    {
        if (c == Currency.KES) return client.BalanceKES; // storage slot, not the base
        if (c == Currency.USD) return client.BalanceUSD;
        var row = await _context.ClientCurrencyBalances
            .FirstOrDefaultAsync(b => b.ClientId == client.Id && b.CompanyId == companyId && b.Currency == c && !b.IsDeleted);
        return row?.Balance ?? 0;
    }

    /// <summary>Moves a client's balance in any currency. Returns (before, after).</summary>
    private async Task<(decimal Before, decimal After)> AdjustClientBalanceAsync(Guid companyId, User client, Currency c, decimal delta)
    {
        if (c == Currency.KES) // storage slot, not the base
        {
            var b = client.BalanceKES; client.BalanceKES += delta; return (b, client.BalanceKES);
        }
        if (c == Currency.USD)
        {
            var b = client.BalanceUSD; client.BalanceUSD += delta; return (b, client.BalanceUSD);
        }
        var row = await _context.ClientCurrencyBalances
            .FirstOrDefaultAsync(b => b.ClientId == client.Id && b.CompanyId == companyId && b.Currency == c && !b.IsDeleted);
        if (row == null)
        {
            row = new ClientCurrencyBalance { CompanyId = companyId, ClientId = client.Id, Currency = c };
            _context.ClientCurrencyBalances.Add(row);
        }
        var before = row.Balance;
        row.Balance += delta;
        if (delta > 0) row.TotalIn += delta; else row.TotalOut += -delta;
        row.UpdatedAt = DateTime.UtcNow;
        return (before, row.Balance);
    }

    /// <summary>One leg of a client-account exchange, as a client statement line.</summary>
    private static Transaction ClientLeg(Guid companyId, Guid userId, Guid clientId, string exchangeCode,
        TransactionType type, decimal amount, Currency currency, decimal before, decimal after, string description,
        string? reference = null, string? notes = null) => new()
    {
        CompanyId = companyId,
        Reference = reference ?? $"EXC-{exchangeCode}",
        TransactionDate = DateTime.UtcNow,
        TransactionType = type,
        Amount = amount,
        Currency = currency,
        Description = description,
        Notes = notes ?? $"Exchange Code: {exchangeCode}",
        SourceAccountType = AccountType.Client,
        SourceAccountId = clientId,
        SourceBalanceBefore = before,
        SourceBalanceAfter = after,
        DestAccountType = AccountType.Client,
        DestAccountId = clientId,
        DestBalanceBefore = before,
        DestBalanceAfter = after,
        CreatedByUserId = userId
    };

    /// <summary>The currency an office account holds (mobile money: its network's currency). Null if not found.</summary>
    private async Task<Currency?> GetAccountCurrencyAsync(Guid companyId, AccountType type, Guid accountId) => type switch
    {
        AccountType.Cash => await _context.CashAccounts.Where(a => a.Id == accountId && a.CompanyId == companyId && !a.IsDeleted)
            .Select(a => (Currency?)a.Currency).FirstOrDefaultAsync(),
        AccountType.Bank => await _context.BankAccounts.Where(a => a.Id == accountId && a.CompanyId == companyId && !a.IsDeleted)
            .Select(a => (Currency?)a.Currency).FirstOrDefaultAsync(),
        AccountType.Mpesa => await _context.MpesaAgents.Where(a => a.Id == accountId && a.CompanyId == companyId && !a.IsDeleted)
                .Select(a => new { a.Currency }).FirstOrDefaultAsync() is { } m
            ? (Currency?)(m.Currency ?? await _context.BaseCurrencyAsync(companyId)) : null,
        _ => (Currency?)null
    };

    private async Task<ExchangeFloatDto> ToFloatDtoAsync(ExchangeFloat f)
    {
        var others = await _context.ExchangeFloatBalances
            .Where(b => b.CompanyId == f.CompanyId && b.Balance != 0)
            .OrderBy(b => b.Currency)
            .ToListAsync();
        // Include rows added in this unit of work but not yet re-queried
        var pending = _context.ExchangeFloatBalances.Local
            .Where(b => b.CompanyId == f.CompanyId && b.Balance != 0 && others.All(o => o.Id != b.Id));
        var list = others.Concat(pending).OrderBy(b => b.Currency)
            .Select(b => new FloatCurrencyBalanceDto(b.Currency, b.Currency.ToString(), b.Balance, b.AverageCost))
            .ToList();
        var baseCur = await _context.BaseCurrencyAsync(f.CompanyId);
        return new ExchangeFloatDto(f.Id, f.KesBalance, f.UsdBalance, f.KesProfit, f.UsdProfit, f.UsdAverageCost, f.UpdatedAt,
            list.Where(b => b.Currency != baseCur).ToList(), baseCur);
    }

    // ==================== HELPER METHODS ====================

    private async Task<ExchangeFloat> GetOrCreateFloatAsync(Guid companyId)
    {
        var float_ = await _context.ExchangeFloats.FirstOrDefaultAsync(f => f.CompanyId == companyId);
        if (float_ != null) return float_;
        var baseCur = await _context.BaseCurrencyAsync(companyId);

        // Float doesn't exist — try to create it
        try
        {
            float_ = new ExchangeFloat
            {
                CompanyId = companyId,
                KesBalance = 0,   // Kes* columns = the company's base currency
                UsdBalance = 0,
                KesProfit = 0,
                UsdProfit = 0,
                // Defaults sized for the base currency (KES 50,000 ≈ UGX 1,400,000)
                LowKesThreshold = CurrencyInfo.FromKes(50_000m, baseCur),
                LowUsdThreshold = 500,
                LargeTransactionThreshold = CurrencyInfo.FromKes(500_000m, baseCur)
            };
            _context.ExchangeFloats.Add(float_);
            await _context.SaveChangesAsync();
            return float_;
        }
        catch (DbUpdateException)
        {
            // Another request created it first — detach our failed entity and re-query
            _context.Entry(float_!).State = EntityState.Detached;
            return await _context.ExchangeFloats.FirstAsync(f => f.CompanyId == companyId);
        }
    }

    // Both helpers check the bureau themselves, so no caller can touch another bureau's
    // account by passing its id (callers also validate first; this is the second lock).
    private async Task<decimal> GetAccountBalanceAsync(Guid companyId, AccountType type, Guid accountId)
    {
        return type switch
        {
            AccountType.Cash => (await _context.CashAccounts.FirstOrDefaultAsync(a => a.Id == accountId && a.CompanyId == companyId))?.Balance ?? 0,
            AccountType.Bank => (await _context.BankAccounts.FirstOrDefaultAsync(a => a.Id == accountId && a.CompanyId == companyId))?.Balance ?? 0,
            AccountType.Mpesa => (await _context.MpesaAgents.FirstOrDefaultAsync(a => a.Id == accountId && a.CompanyId == companyId))?.Balance ?? 0,
            _ => 0
        };
    }

    private async Task UpdateAccountBalanceAsync(Guid companyId, AccountType type, Guid accountId, decimal amount)
    {
        switch (type)
        {
            case AccountType.Cash:
                var cash = await _context.CashAccounts.FirstOrDefaultAsync(a => a.Id == accountId && a.CompanyId == companyId);
                if (cash != null) { cash.Balance += amount; cash.UpdatedAt = DateTime.UtcNow; }
                break;
            case AccountType.Bank:
                var bank = await _context.BankAccounts.FirstOrDefaultAsync(a => a.Id == accountId && a.CompanyId == companyId);
                if (bank != null) { bank.Balance += amount; bank.UpdatedAt = DateTime.UtcNow; }
                break;
            case AccountType.Mpesa:
                var mpesa = await _context.MpesaAgents.FirstOrDefaultAsync(a => a.Id == accountId && a.CompanyId == companyId);
                if (mpesa != null) { mpesa.Balance += amount; mpesa.UpdatedAt = DateTime.UtcNow; }
                break;
        }
    }

    /// <summary>
    /// FIXED: Create transaction with proper balance fields
    /// </summary>
    private async Task CreateFloatTransactionAsync(
        Guid companyId, Guid userId, AccountType accountType, Guid accountId,
        TransactionType txnType, decimal amount, Currency currency,
        decimal balanceBefore, decimal balanceAfter,
        string description, string? notes)
    {
        var transaction = new Transaction
        {
            Code = await CodeGenerator.GenerateTransactionCodeAsync(_context, companyId),
            CompanyId = companyId,
            Reference = "FLOAT-TXN",
            TransactionDate = DateTime.UtcNow,
            TransactionType = txnType,
            Amount = amount,
            Currency = currency,
            Description = description,
            Notes = notes,
            SourceAccountType = accountType,
            SourceAccountId = accountId,
            SourceBalanceBefore = balanceBefore,   // FIXED: Now included
            SourceBalanceAfter = balanceAfter,     // FIXED: Now included
            DestAccountType = accountType,
            DestAccountId = accountId,
            DestBalanceBefore = balanceBefore,     // FIXED: Now included
            DestBalanceAfter = balanceAfter,       // FIXED: Now included
            CreatedByUserId = userId
        };
        _context.Transactions.Add(transaction);
    }

    private static ExchangeRateResponseDto MapRateToResponse(ExchangeRate r) => new(
        r.Id, r.BuyRate, r.SellRate, r.EffectiveFrom, r.EffectiveTo, r.IsActive,
        r.ForeignCurrency, r.ForeignCurrency.ToString()
    );

    private static ExchangeResponseDto MapToExchangeDto(ExchangeTransaction e, string clientName, string clientType, bool isLarge) => new(
        e.Id, e.Code, e.TransactionDate, e.ClientId, clientName, clientType,
        e.ExchangeType, e.Direction, e.AmountGiven, e.CurrencyGiven,
        e.AmountReceived, e.CurrencyReceived, e.ExchangeRate,
        e.Profit, e.ProfitCurrency, e.Notes, e.Status, isLarge
    );

    private static DailySummaryDto MapToDailySummaryDto(DailyExchangeSummary d, List<DailyExchangeCurrencySummary> rows, Currency baseCur) => new(
        d.Date, 0, d.ExchangeCount,
        d.KesVolumeIn, d.KesVolumeOut,
        d.UsdVolumeIn, d.UsdVolumeOut,
        d.KesProfit, d.UsdProfit,
        d.OpeningKes, d.OpeningUsd,
        d.ClosingKes, d.ClosingUsd,
        d.KesVariance, d.UsdVariance,
        d.IsClosed,
        rows.OrderBy(r => r.Currency)
            .Select(r => new CurrencyDaySummaryDto(r.Currency, CurrencyInfo.Code(r.Currency),
                r.Opening, r.Closing, r.VolumeIn, r.VolumeOut, r.ActualCount, r.Variance))
            .ToList(),
        baseCur
    );

    private Task<List<DailyExchangeCurrencySummary>> DayCurrencyRowsAsync(Guid summaryId) =>
        _context.DailyExchangeCurrencySummaries
            .Where(r => r.DailyExchangeSummaryId == summaryId)
            .ToListAsync();

    /// <summary>
    /// Live day figures for currencies beyond KES/USD: every currency the float
    /// holds or that was traded today. Opening = recorded opening count when
    /// there is one, otherwise the current system balance (same rule as KES/USD).
    /// </summary>
    private async Task<List<CurrencyDaySummaryDto>> LiveOtherCurrencyDayAsync(
        Guid companyId, List<ExchangeTransaction> todayExchanges, List<DailyExchangeCurrencySummary>? rows)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        var holdings = await _context.ExchangeFloatBalances
            .Where(b => b.CompanyId == companyId)
            .ToListAsync();
        var traded = todayExchanges.SelectMany(e => new[] { e.CurrencyGiven, e.CurrencyReceived });
        var currencies = holdings.Where(h => h.Balance != 0).Select(h => h.Currency)
            .Concat(traded)
            .Concat(rows?.Select(r => r.Currency) ?? Enumerable.Empty<Currency>())
            .Where(c => c != baseCur && c != Currency.USD)
            .Distinct().OrderBy(c => c).ToList();

        return currencies.Select(cur =>
        {
            var balance = holdings.FirstOrDefault(h => h.Currency == cur)?.Balance ?? 0;
            var row = rows?.FirstOrDefault(r => r.Currency == cur);
            return new CurrencyDaySummaryDto(cur, CurrencyInfo.Code(cur),
                row?.Opening ?? balance,
                balance,
                todayExchanges.Where(e => e.CurrencyGiven == cur).Sum(e => e.AmountGiven),
                todayExchanges.Where(e => e.CurrencyReceived == cur).Sum(e => e.AmountReceived),
                row?.ActualCount, row?.Variance);
        }).ToList();
    }
}