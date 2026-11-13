using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public partial class ExchangeService
{
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
        // Cash or From Account, nothing else: an unknown type number was treated as a cash
        // exchange but skipped the "does the float hold enough" check.
        if (!Enum.IsDefined(typeof(ExchangeType), dto.ExchangeType))
            return new ApiResponse<ExchangeResponseDto>(false, "Invalid exchange type", null);
        var notesCheck = ValidationHelper.ValidateText(dto.Notes, "Notes", 2000);
        if (!notesCheck.IsValid)
            return new ApiResponse<ExchangeResponseDto>(false, notesCheck.Error!, null);
        var idCheck = ValidationHelper.ValidateText(dto.ClientIdNumber, "ID number", 50);
        if (!idCheck.IsValid)
            return new ApiResponse<ExchangeResponseDto>(false, idCheck.Error!, null);

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
                    clientName = string.IsNullOrWhiteSpace(dto.ClientName) ? "Walk-in Client" : dto.ClientName.Trim();
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

        if (type.HasValue) { var v = type.Value; query = query.Where(e => e.ExchangeType == v); }
        var (fromUtc, toExclusive) = BureauClock.Range(from, to);
        if (fromUtc.HasValue) { var v = fromUtc.Value; query = query.Where(e => e.TransactionDate >= v); }
        if (toExclusive.HasValue) { var v = toExclusive.Value; query = query.Where(e => e.TransactionDate < v); }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            // Get matching client IDs first to avoid complex join in EF
            var clientIds = await _context.Users
                .Where(u => u.CompanyId == companyId && u.FullName.ToLower().Contains(s))
                .Select(u => u.Id).ToListAsync();

            // ClientName holds the walk-in customer's name (registered clients are matched by id below).
            query = query.Where(e => e.Code.ToLower().Contains(s) ||
                                     (e.ClientName != null && e.ClientName.ToLower().Contains(s)) ||
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
        var reasonCheck = ValidationHelper.ValidateText(reason, "Void reason", 500, required: true);
        if (!reasonCheck.IsValid)
            return new ApiResponse<bool>(false, reasonCheck.Error!, false);
        reason = reason.Trim();
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

            // Voiding a cash exchange hands the customer back what they gave. If the float no
            // longer holds it (it was sold on, or withdrawn), there is nothing to hand back:
            // the void used to go through anyway and leave the float below zero.
            if (exchange.ExchangeType == ExchangeType.Cash && givenFloatBefore < exchange.AmountGiven)
                return new ApiResponse<bool>(false,
                    $"The float holds {exchange.CurrencyGiven} {givenFloatBefore:N2}, not the {exchange.CurrencyGiven} {exchange.AmountGiven:N2} this void gives back. Fund the float first.", false);
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
}
