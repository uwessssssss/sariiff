
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Transaction Service - Implements TRADITIONAL DOUBLE-ENTRY ACCOUNTING
/// 
/// ACCOUNTING RULES:
/// ┌─────────────────┬────────────────────┬────────────────────┐
/// │ Account Type    │ DEBIT              │ CREDIT             │
/// ├─────────────────┼────────────────────┼────────────────────┤
/// │ ASSET           │ Balance INCREASES  │ Balance DECREASES  │
/// │ (Cash/Bank/     │ (money comes IN)   │ (money goes OUT)   │
/// │  M-Pesa)        │                    │                    │
/// ├─────────────────┼────────────────────┼────────────────────┤
/// │ LIABILITY       │ Balance DECREASES  │ Balance INCREASES  │
/// │ (Client)        │ (we owe less)      │ (we owe more)      │
/// └─────────────────┴────────────────────┴────────────────────┘
/// 
/// DOUBLE-ENTRY: Every transaction affects two accounts with equal and opposite effects.
/// 
/// REVERSAL METHOD: When deleting a transaction, we create a reversal entry
/// (opposite transaction) to maintain audit trail and running balance integrity.
/// </summary>
public class TransactionService : ITransactionService
{
    private readonly AppDbContext _context;
    private readonly INotificationService _notificationService;
    private readonly IClientAlertHelper _alertHelper;
    private readonly ISystemLogService _systemLog;
    private readonly IBalanceAlertService _balanceAlertService;

    public TransactionService(
        AppDbContext context, 
        INotificationService notificationService,
        ISystemLogService systemLog,
        IClientAlertHelper alertHelper,
        IBalanceAlertService balanceAlertService)
    {
        _context = context;
        _notificationService = notificationService;
        _systemLog = systemLog;
        _alertHelper = alertHelper;
        _balanceAlertService = balanceAlertService;
    }

    public async Task<ApiResponse<TransactionResponseDto>> CreateAsync(Guid companyId, Guid userId, CreateTransactionDto dto)
    {
        // Input validation
        var amountCheck = ValidationHelper.ValidateAmount(dto.Amount, "Transaction amount");
        if (!amountCheck.IsValid)
            return new ApiResponse<TransactionResponseDto>(false, amountCheck.Error!, null);
        
        if (dto.CounterAmount.HasValue)
        {
            var counterCheck = ValidationHelper.ValidateAmount(dto.CounterAmount.Value, "Counter amount");
            if (!counterCheck.IsValid)
                return new ApiResponse<TransactionResponseDto>(false, counterCheck.Error!, null);
        }

        if (dto.ExchangeRate.HasValue)
        {
            var rateCheck = ValidationHelper.ValidateRate(dto.ExchangeRate.Value, "Exchange rate");
            if (!rateCheck.IsValid)
                return new ApiResponse<TransactionResponseDto>(false, rateCheck.Error!, null);
        }

        var descCheck = ValidationHelper.ValidateText(dto.Description, "Description", 500);
        if (!descCheck.IsValid)
            return new ApiResponse<TransactionResponseDto>(false, descCheck.Error!, null);

        if (dto.SourceAccountId == dto.DestAccountId && dto.SourceAccountType == dto.DestAccountType)
            return new ApiResponse<TransactionResponseDto>(false, "Source and destination accounts cannot be the same", null);

        // FIX #3: If called from ExchangeRateService (which already opened a dbTransaction),
        // don't open a nested one. PostgreSQL doesn't support nested transactions.
        var existingTransaction = _context.Database.CurrentTransaction;
        var dbTransaction = existingTransaction == null 
            ? await _context.Database.BeginTransactionAsync() 
            : null;
        
        try
        {
            // ==================== FOREX HANDLING ====================
            var primaryAmount = dto.Amount;
            var primaryCurrency = dto.Currency;
            var counterAmount = dto.CounterAmount ?? dto.Amount;
            var counterCurrency = dto.CounterCurrency ?? dto.Currency;
            var isForex = dto.CounterCurrency.HasValue && dto.CounterCurrency != dto.Currency;
            // =========================================================

            // Validate accounts exist and belong to company
            var sourceBalance = await GetAccountBalanceAsync(companyId, dto.SourceAccountType, dto.SourceAccountId, primaryCurrency);
            var destBalance = await GetAccountBalanceAsync(companyId, dto.DestAccountType, dto.DestAccountId, counterCurrency);

            if (sourceBalance == null)
                return new ApiResponse<TransactionResponseDto>(false, $"Source account not found, or it doesn't hold {primaryCurrency}", null);
            if (destBalance == null)
                return new ApiResponse<TransactionResponseDto>(false, $"Destination account not found, or it doesn't hold {counterCurrency}", null);

            // Country rule: a currency the bureau's country doesn't use (UGX in Kenya)
            // can only be SETTLED — moved out of an account that already holds it —
            // never started fresh.
            var homeCur = await _context.BaseCurrencyAsync(companyId);
            if (!CurrencyInfo.IsAllowed(homeCur, primaryCurrency) && sourceBalance.Value == 0)
                return new ApiResponse<TransactionResponseDto>(false, CurrencyInfo.NotAllowedMessage(homeCur, primaryCurrency), null);
            if (!CurrencyInfo.IsAllowed(homeCur, counterCurrency) && destBalance.Value == 0)
                return new ApiResponse<TransactionResponseDto>(false, CurrencyInfo.NotAllowedMessage(homeCur, counterCurrency), null);

            // Generate reference and code
            var reference = await GenerateReferenceAsync(companyId);
            var code = await CodeGenerator.GenerateTransactionCodeAsync(_context, companyId);

            // ============================================================
            // TRADITIONAL ACCOUNTING BALANCE CALCULATION
            // ============================================================
            decimal newSourceBalance = CalculateNewBalance(
                dto.SourceAccountType, 
                sourceBalance.Value, 
                primaryAmount, 
                dto.TransactionType
            );

            // Destination gets the OPPOSITE transaction type effect
            var destTransactionType = dto.TransactionType == TransactionType.Debit 
                ? TransactionType.Credit 
                : TransactionType.Debit;

            decimal newDestBalance = CalculateNewBalance(
                dto.DestAccountType,
                destBalance.Value,
                counterAmount,
                destTransactionType
            );

            // ==================== NEGATIVE BALANCE GUARD ====================
            // Asset accounts (Cash, Bank, Mpesa) must NOT go negative.
            // Example: Client withdraws KES 10,000 but cash only has KES 9,000.
            if (IsAssetAccount(dto.SourceAccountType) && newSourceBalance < 0)
                return new ApiResponse<TransactionResponseDto>(false,
                    $"Insufficient {dto.SourceAccountType} balance. Available: {dto.Currency} {sourceBalance.Value:N2}, Required: {primaryAmount:N2}", null);

            if (IsAssetAccount(dto.DestAccountType) && newDestBalance < 0)
                return new ApiResponse<TransactionResponseDto>(false,
                    $"Insufficient {dto.DestAccountType} balance. Available: {(dto.CounterCurrency ?? dto.Currency)} {destBalance.Value:N2}, Required: {counterAmount:N2}", null);
            // ================================================================

            // ==================== RECONCILIATION STATUS ====================
            var needsReconciliation = 
                dto.SourceAccountType == AccountType.Cash ||
                dto.SourceAccountType == AccountType.Bank ||
                dto.SourceAccountType == AccountType.Mpesa ||
                dto.DestAccountType == AccountType.Cash ||
                dto.DestAccountType == AccountType.Bank ||
                dto.DestAccountType == AccountType.Mpesa;

            var reconciliationStatus = needsReconciliation 
                ? ReconciliationStatus.Pending 
                : ReconciliationStatus.Matched;
            // ================================================================

            // Create transaction record
            var transaction = new Transaction
            {
                CompanyId = companyId,
                Code = code,
                Reference = reference,
                TransactionDate = dto.TransactionDate ?? DateTime.UtcNow,
                TransactionType = dto.TransactionType,
                
                // Primary account amount
                Amount = primaryAmount,
                Currency = primaryCurrency,
                
                // Counter account amount (for forex)
                CounterAmount = isForex ? counterAmount : null,
                CounterCurrency = isForex ? counterCurrency : null,
                
                Description = dto.Description,
                Notes = dto.Notes,
                ExchangeRate = dto.ExchangeRate,
                
                // Source (Primary) account
                SourceAccountType = dto.SourceAccountType,
                SourceAccountId = dto.SourceAccountId,
                SourceBalanceBefore = sourceBalance.Value,
                SourceBalanceAfter = newSourceBalance,
                
                // Dest (Counter) account
                DestAccountType = dto.DestAccountType,
                DestAccountId = dto.DestAccountId,
                DestBalanceBefore = destBalance.Value,
                DestBalanceAfter = newDestBalance,
                
                // Reconciliation fields
                ReconciliationStatus = reconciliationStatus,
                ActualAmount = null,
                Variance = null,
                ReconciledAt = null,
                ReconciledByUserId = null,
                ReconciliationNotes = null,
                CreatedByUserId = userId
            };

            _context.Transactions.Add(transaction);

            // Update account balances
            await UpdateAccountBalanceAsync(companyId, dto.SourceAccountType, dto.SourceAccountId, primaryCurrency, newSourceBalance);
            await UpdateAccountBalanceAsync(companyId, dto.DestAccountType, dto.DestAccountId, counterCurrency, newDestBalance);

            await _context.SaveChangesAsync();
            
            // FIX #3: Only commit if we own the transaction (not nested from ExchangeRateService)
            if (dbTransaction != null)
                await dbTransaction.CommitAsync();

            // ============================================================
            // SEND NOTIFICATIONS AND CREATE ALERTS FOR CLIENTS
            // The money has moved. A failing SMS/alert/log must not report this as
            // "failed": the catch below would try to roll back a committed transaction,
            // return an error, release the idempotency key, and a retry would post twice.
            // ============================================================
            try
            {
            if (dto.SourceAccountType == AccountType.Client)
            {
                var response = await MapToResponseAsync(transaction);
                await _notificationService.SendTransactionNotificationAsync(companyId, dto.SourceAccountId, response);
                
                // Credit to a client account = money in for the client.
                await _alertHelper.CreateTransactionAlertAsync(
                    transaction,
                    dto.SourceAccountId,
                    companyId,
                    isIncoming: dto.TransactionType == TransactionType.Credit,
                    amount: primaryAmount,
                    currency: primaryCurrency
                );
                
                await CheckAndCreateLowBalanceAlertAsync(companyId, dto.SourceAccountId, newSourceBalance, primaryCurrency);
            }
            
            if (dto.DestAccountType == AccountType.Client)
            {
                var response = await MapToResponseAsync(transaction);
                await _notificationService.SendTransactionNotificationAsync(companyId, dto.DestAccountId, response);
                
                await _alertHelper.CreateTransactionAlertAsync(
                    transaction,
                    dto.DestAccountId,
                    companyId,
                    isIncoming: destTransactionType == TransactionType.Credit,
                    amount: counterAmount,
                    currency: counterCurrency
                );

                await CheckAndCreateLowBalanceAlertAsync(companyId, dto.DestAccountId, newDestBalance, counterCurrency);
            }
            
            await _systemLog.LogTransactionSuccessAsync(companyId, transaction.Code, 
                transaction.Amount, transaction.Currency.ToString(), transaction.TransactionType.ToString());
            
            // ============================================================
            // CHECK BALANCE ALERT RULES (notify office users)
            // ============================================================
            if (dto.SourceAccountType == AccountType.Client)
            {
                var client = await _context.Users.FindAsync(dto.SourceAccountId);
                if (client != null)
                    await _balanceAlertService.CheckAndNotifyAsync(companyId, client.Id, client.FullName, client.BalanceKES, client.BalanceUSD);
            }
            if (dto.DestAccountType == AccountType.Client)
            {
                var client = await _context.Users.FindAsync(dto.DestAccountId);
                if (client != null)
                    await _balanceAlertService.CheckAndNotifyAsync(companyId, client.Id, client.FullName, client.BalanceKES, client.BalanceUSD);
            }
            }
            catch (Exception sideEffect)
            {
                await SafeWarnAsync(companyId, userId, $"Transaction {transaction.Code} saved, but a follow-up (notification/alert) failed: {sideEffect.Message}");
            }
            
            return new ApiResponse<TransactionResponseDto>(true, "Transaction created successfully", await MapToResponseAsync(transaction));
        }
        catch (DbUpdateConcurrencyException)
        {
            // FIX #18: Optimistic concurrency — another request modified the same balance
            if (dbTransaction != null)
                await dbTransaction.RollbackAsync();
            return new ApiResponse<TransactionResponseDto>(false,
                "Balance was modified by another operation. Please retry.", null);
        }
        catch (Exception ex)
        {
            // FIX #3: Only rollback if we own the transaction
            if (dbTransaction != null)
                await dbTransaction.RollbackAsync();
            await _systemLog.LogErrorAsync("TransactionService", $"Failed to create transaction: {ex.Message}", ex.StackTrace, companyId, userId);
            return new ApiResponse<TransactionResponseDto>(false, "Failed to create transaction. Please try again.", null);
        }
        finally
        {
            // FIX #3: Dispose our transaction if we created it
            if (dbTransaction != null)
                await dbTransaction.DisposeAsync();
        }
    }

    /// <summary>
    /// Checks if client balance is below threshold and creates a warning alert
    /// </summary>
    private async Task CheckAndCreateLowBalanceAlertAsync(Guid companyId, Guid clientId, decimal newBalance, Currency currency)
    {
        var threshold = CurrencyInfo.LowBalanceThreshold(currency);
        
        if (newBalance < threshold && newBalance >= 0)
        {
            await _alertHelper.CreateLowBalanceAlertAsync(companyId, clientId, newBalance, currency);
        }
    }

    /// <summary>
    /// Calculates new balance based on traditional accounting rules
    /// FIX #17: Removed unused isSourceAccount parameter
    /// </summary>
    private decimal CalculateNewBalance(
        AccountType accountType, 
        decimal currentBalance, 
        decimal amount, 
        TransactionType transactionType)
    {
        bool isAssetAccount = IsAssetAccount(accountType);

        if (transactionType == TransactionType.Debit)
        {
            return isAssetAccount 
                ? currentBalance + amount
                : currentBalance - amount;
        }
        else
        {
            return isAssetAccount 
                ? currentBalance - amount
                : currentBalance + amount;
        }
    }

    /// <summary>
    /// Determines if an account type is an Asset account
    /// </summary>
    private bool IsAssetAccount(AccountType accountType)
    {
        return accountType switch
        {
            AccountType.Cash => true,
            AccountType.Bank => true,
            AccountType.Mpesa => true,
            AccountType.Client => false,
            AccountType.Expense => false, // Expense accounts are not asset accounts
            _ => true
        };
    }

    public async Task<ApiResponse<TransactionResponseDto>> GetByIdAsync(Guid companyId, Guid id)
    {
        var transaction = await _context.Transactions.FirstOrDefaultAsync(t => t.Id == id && t.CompanyId == companyId && !t.IsDeleted);
        if (transaction == null)
            return new ApiResponse<TransactionResponseDto>(false, "Transaction not found", null);

        return new ApiResponse<TransactionResponseDto>(true, "Success", await MapToResponseAsync(transaction));
    }

    public async Task<ApiResponse<PagedResult<TransactionResponseDto>>> GetAllAsync(Guid companyId, int page, int pageSize, ReportFilterDto? filter = null)
    {
        var query = _context.Transactions.Where(t => t.CompanyId == companyId && !t.IsDeleted);

        if (filter != null)
        {
            // Dates picked in the app are bureau-local days; the end day is included in full.
            var (fromUtc, toExclusive) = BureauClock.Range(filter.StartDate, filter.EndDate);
            if (fromUtc.HasValue)
                query = query.Where(t => t.TransactionDate >= fromUtc.Value);
            if (toExclusive.HasValue)
                query = query.Where(t => t.TransactionDate < toExclusive.Value);
            if (filter.TransactionType.HasValue)
                query = query.Where(t => t.TransactionType == filter.TransactionType.Value);
            if (filter.Currency.HasValue)
                query = query.Where(t => t.Currency == filter.Currency.Value);
        }

        var totalCount = await query.CountAsync();
        var transactions = await query
            .OrderByDescending(t => t.TransactionDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        await PreloadAccountNamesAsync(transactions);
        var items = new List<TransactionResponseDto>();
        foreach (var t in transactions)
        {
            items.Add(await MapToResponseAsync(t));
        }

        return new ApiResponse<PagedResult<TransactionResponseDto>>(true, "Success",
            new PagedResult<TransactionResponseDto>(items, totalCount, page, pageSize));
    }

    public async Task<ApiResponse<TransactionResponseDto>> UpdateAsync(Guid companyId, Guid id, UpdateTransactionDto dto)
    {
        var transaction = await _context.Transactions.FirstOrDefaultAsync(t => t.Id == id && t.CompanyId == companyId && !t.IsDeleted);
        if (transaction == null)
            return new ApiResponse<TransactionResponseDto>(false, "Transaction not found", null);

        // Cannot edit a reversed transaction or a reversal entry
        if (transaction.DeletedAt.HasValue)
            return new ApiResponse<TransactionResponseDto>(false, "Cannot edit a reversed transaction", null);
        if (transaction.Reference.StartsWith("REV-"))
            return new ApiResponse<TransactionResponseDto>(false, "Cannot edit a reversal transaction", null);
        if (transaction.Reference.StartsWith("EXC-"))
            return new ApiResponse<TransactionResponseDto>(false, "Cannot edit exchange transactions", null);
        if (transaction.Reference.StartsWith("EXP-"))
            return new ApiResponse<TransactionResponseDto>(false, "Cannot edit expense transactions", null);
        if (transaction.Reference == "FLOAT-TXN")
            return new ApiResponse<TransactionResponseDto>(false, "Cannot edit float transactions", null);

        // Only allow updating description and notes (not amounts - that would corrupt ledger)
        if (dto.Description != null) transaction.Description = dto.Description;
        if (dto.Notes != null) transaction.Notes = dto.Notes;
        transaction.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return new ApiResponse<TransactionResponseDto>(true, "Transaction updated successfully", await MapToResponseAsync(transaction));
    }

    /// <summary>
    /// Delete transaction using proper accounting reversal method.
    /// 
    /// RULES:
    /// 1. Cannot reverse a transaction that is already reversed (DeletedAt != null)
    /// 2. Cannot reverse a reversal transaction (Reference starts with "REV-")
    /// 3. Original transaction stays VISIBLE in statements (IsDeleted stays false)
    ///    so the running balance chain is never broken
    /// 4. Original is marked with [REVERSED] in description and DeletedAt is set
    ///    as a reversal flag (but IsDeleted remains false)
    /// 5. Reversal transaction appears as the next line in the statement
    /// </summary>
    public async Task<ApiResponse<bool>> DeleteAsync(Guid companyId, Guid id, Guid userId, DeleteTransactionDto dto, Guid? clientContext = null)
    {
        using var dbTransaction = await _context.Database.BeginTransactionAsync();
        
        try
        {
            var transaction = await _context.Transactions.FirstOrDefaultAsync(t => t.Id == id && t.CompanyId == companyId && !t.IsDeleted);
            if (transaction == null)
                return new ApiResponse<bool>(false, "Transaction not found", false);

            // GUARD: Cannot reverse a reversal transaction
            if (transaction.Reference.StartsWith("REV-"))
                return new ApiResponse<bool>(false, "Cannot reverse a reversal transaction", false);

            // GUARD: Cannot reverse an already-reversed transaction
            if (transaction.DeletedAt.HasValue)
                return new ApiResponse<bool>(false, 
                    $"Transaction {transaction.Code} has already been reversed", false);

            // GUARD: Cannot reverse exchange-linked transactions — use Void Exchange instead
            if (transaction.Reference.StartsWith("EXC-"))
                return new ApiResponse<bool>(false, 
                    "Cannot reverse exchange transactions here. Use the Void Exchange endpoint instead.", false);

            // GUARD: Cannot reverse expense-linked transactions — use Delete Expense instead
            if (transaction.Reference.StartsWith("EXP-"))
                return new ApiResponse<bool>(false, 
                    "Cannot reverse expense transactions here. Delete the expense instead.", false);

            // GUARD: Cannot reverse float transactions — managed via Exchange module
            if (transaction.Reference == "FLOAT-TXN")
                return new ApiResponse<bool>(false, 
                    "Cannot reverse float transactions here. Use the Exchange module instead.", false);

            // GUARD: Client transactions — controlled access
            bool isClientTransaction = transaction.SourceAccountType == AccountType.Client || transaction.DestAccountType == AccountType.Client;
            if (isClientTransaction)
            {
                if (!clientContext.HasValue)
                {
                    // Called from general endpoint — block
                    return new ApiResponse<bool>(false, 
                        "Transactions involving client accounts can only be deleted from the client statement.", false);
                }
                
                // Called from client statement — validate the transaction belongs to this client
                bool belongsToClient = 
                    (transaction.SourceAccountType == AccountType.Client && transaction.SourceAccountId == clientContext.Value) ||
                    (transaction.DestAccountType == AccountType.Client && transaction.DestAccountId == clientContext.Value);
                    
                if (!belongsToClient)
                    return new ApiResponse<bool>(false, "Transaction does not belong to this client", false);
            }

            // ============================================================
            // METHOD: ACCOUNTING REVERSAL
            // Create an opposite transaction to reverse the original effect
            // Both original + reversal stay visible in statements
            // ============================================================

            var primaryCurrency = transaction.Currency;
            var counterCurrency = transaction.CounterCurrency ?? transaction.Currency;
            var counterAmount = transaction.CounterAmount ?? transaction.Amount;

            // Get current balances
            var currentSourceBalance = await GetAccountBalanceAsync(companyId, transaction.SourceAccountType, transaction.SourceAccountId, primaryCurrency);
            var currentDestBalance = await GetAccountBalanceAsync(companyId, transaction.DestAccountType, transaction.DestAccountId, counterCurrency);

            if (currentSourceBalance == null || currentDestBalance == null)
                return new ApiResponse<bool>(false, "One or more accounts not found", false);

            // Calculate reversal amounts
            // The reversal is the OPPOSITE of the original transaction
            var reversedSourceBalance = CalculateNewBalance(
                transaction.SourceAccountType,
                currentSourceBalance.Value,
                transaction.Amount,
                transaction.TransactionType == TransactionType.Debit ? TransactionType.Credit : TransactionType.Debit
            );

            var reversedDestBalance = CalculateNewBalance(
                transaction.DestAccountType,
                currentDestBalance.Value,
                counterAmount,
                transaction.TransactionType // Opposite of original dest
            );

            // Same rule as posting: cash, bank and mobile money can't go below zero.
            // (Reversing a deposit whose cash has already been paid out would leave a
            // negative cash balance — physically impossible.)
            if (IsAssetAccount(transaction.SourceAccountType) && reversedSourceBalance < 0)
                return new ApiResponse<bool>(false,
                    $"Can't reverse {transaction.Code}: the {AccountLabel(transaction.SourceAccountType)} would go below zero (balance {primaryCurrency} {currentSourceBalance.Value:N2}, reversal needs {transaction.Amount:N2}). Move money back into it first.", false);
            if (IsAssetAccount(transaction.DestAccountType) && reversedDestBalance < 0)
                return new ApiResponse<bool>(false,
                    $"Can't reverse {transaction.Code}: the {AccountLabel(transaction.DestAccountType)} would go below zero (balance {counterCurrency} {currentDestBalance.Value:N2}, reversal needs {counterAmount:N2}). Move money back into it first.", false);

            // Generate new code for reversal
            var reversalCode = await CodeGenerator.GenerateTransactionCodeAsync(_context, companyId);
            var reversalReference = $"REV-{transaction.Reference}";

            // Create reversal transaction
            var reversalTransaction = new Transaction
            {
                CompanyId = companyId,
                Code = reversalCode,
                Reference = reversalReference,
                TransactionDate = DateTime.UtcNow,
                TransactionType = transaction.TransactionType == TransactionType.Debit ? TransactionType.Credit : TransactionType.Debit,
                
                Amount = transaction.Amount,
                Currency = primaryCurrency,
                CounterAmount = transaction.CounterAmount,
                CounterCurrency = transaction.CounterCurrency,
                
                Description = $"REVERSAL: {transaction.Description}",
                Notes = $"Reversal of {transaction.Code}. Reason: {dto.Reason ?? "Not specified"}",
                ExchangeRate = transaction.ExchangeRate,
                
                SourceAccountType = transaction.SourceAccountType,
                SourceAccountId = transaction.SourceAccountId,
                SourceBalanceBefore = currentSourceBalance.Value,
                SourceBalanceAfter = reversedSourceBalance,
                
                DestAccountType = transaction.DestAccountType,
                DestAccountId = transaction.DestAccountId,
                DestBalanceBefore = currentDestBalance.Value,
                DestBalanceAfter = reversedDestBalance,
                
                ReconciliationStatus = ReconciliationStatus.Matched, // Reversals are auto-matched
                CreatedByUserId = userId
            };

            _context.Transactions.Add(reversalTransaction);

            // Update account balances to reversed values
            await UpdateAccountBalanceAsync(companyId, transaction.SourceAccountType, transaction.SourceAccountId, primaryCurrency, reversedSourceBalance);
            await UpdateAccountBalanceAsync(companyId, transaction.DestAccountType, transaction.DestAccountId, counterCurrency, reversedDestBalance);

            // ============================================================
            // MARK ORIGINAL AS REVERSED — but do NOT soft-delete it
            // IsDeleted stays false → transaction remains visible in statements
            // DeletedAt is set as a "reversed" flag
            // Description gets [REVERSED] prefix so it's clear in the statement
            // ============================================================
            transaction.DeletedByUserId = userId;
            transaction.DeletedAt = DateTime.UtcNow;
            transaction.DeleteReason = dto.Reason;
            transaction.UpdatedAt = DateTime.UtcNow;
            transaction.Description = $"[REVERSED] {transaction.Description}";
            transaction.Notes = (transaction.Notes ?? "") + $" [Reversed by: {reversalCode}]";

            await _context.SaveChangesAsync();
            await dbTransaction.CommitAsync();

            // ============================================================
            // CREATE ALERTS FOR REVERSED TRANSACTION — isolated: the reversal is saved.
            // ============================================================
            try
            {
            if (transaction.SourceAccountType == AccountType.Client)
            {
                await _alertHelper.CreateAlertAsync(
                    companyId,
                    transaction.SourceAccountId,
                    "info",
                    "Transaction Reversed",
                    $"Transaction {transaction.Code} for {transaction.Currency} {transaction.Amount:N2} has been reversed. Reason: {dto.Reason ?? "Not specified"}"
                );
            }
            if (transaction.DestAccountType == AccountType.Client)
            {
                await _alertHelper.CreateAlertAsync(
                    companyId,
                    transaction.DestAccountId,
                    "info",
                    "Transaction Reversed",
                    $"Transaction {transaction.Code} for {counterCurrency} {counterAmount:N2} has been reversed. Reason: {dto.Reason ?? "Not specified"}"
                );
            }

            await _systemLog.LogInfoAsync("TransactionService", 
                $"Transaction {transaction.Code} reversed by user {userId}. Reversal: {reversalCode}", companyId, userId);
            }
            catch (Exception sideEffect)
            {
                await SafeWarnAsync(companyId, userId, $"Reversal {reversalCode} saved, but a follow-up (alert/log) failed: {sideEffect.Message}");
            }

            return new ApiResponse<bool>(true, $"Transaction reversed successfully. Reversal code: {reversalCode}", true);
        }
        catch (DbUpdateConcurrencyException)
        {
            await dbTransaction.RollbackAsync();
            return new ApiResponse<bool>(false, "Balance was modified by another operation. Please retry.", false);
        }
        catch (Exception ex)
        {
            await dbTransaction.RollbackAsync();
            await _systemLog.LogErrorAsync("TransactionService", $"Failed to reverse transaction: {ex.Message}", ex.StackTrace, companyId, userId);
            return new ApiResponse<bool>(false, "Failed to reverse transaction. Please try again.", false);
        }
    }

    public async Task<ApiResponse<TransactionSummaryDto>> GetTodaySummaryAsync(Guid companyId)
    {
        var today = BureauClock.TodayStartUtc; // the bureau's day, not the UTC day
        var transactions = await _context.Transactions.AsNoTracking()
            .Where(t => t.CompanyId == companyId && !t.IsDeleted && t.TransactionDate >= today && t.TransactionDate < today.AddDays(1))
            .ToListAsync();

        // Money in/out of the bureau's own tills (cash, bank, M-Pesa), per currency.
        // Only asset legs count, each in its own amount and currency: a debit to an
        // asset is money in, a credit is money out. A transfer between two tills shows
        // as both (nets to zero); exchange statement lines (client↔client) and expense
        // categories move no till money and add nothing. (This used to read the source
        // leg's type for every row, so a client-destination entry was counted backwards.)
        var flows = new Dictionary<Currency, (decimal Debit, decimal Credit)>();
        void Add(Currency c, decimal amount, bool moneyIn)
        {
            flows.TryGetValue(c, out var f);
            flows[c] = moneyIn ? (f.Debit + amount, f.Credit) : (f.Debit, f.Credit + amount);
        }

        foreach (var t in transactions)
        {
            if (IsAssetAccount(t.SourceAccountType))
                Add(t.Currency, t.Amount, moneyIn: t.TransactionType == TransactionType.Debit);
            if (IsAssetAccount(t.DestAccountType))
                Add(t.CounterCurrency ?? t.Currency, t.CounterAmount ?? t.Amount,
                    moneyIn: t.TransactionType == TransactionType.Credit); // dest leg is the opposite type
        }

        flows.TryGetValue(Currency.KES, out var kesFlow);
        flows.TryGetValue(Currency.USD, out var usdFlow);
        decimal totalDebitKES = kesFlow.Debit, totalCreditKES = kesFlow.Credit;
        decimal totalDebitUSD = usdFlow.Debit, totalCreditUSD = usdFlow.Credit;

        var summary = new TransactionSummaryDto(
            TotalCount: transactions.Count,
            TotalDebitKES: totalDebitKES,
            TotalDebitUSD: totalDebitUSD,
            TotalCreditKES: totalCreditKES,
            TotalCreditUSD: totalCreditUSD,
            NetFlowKES: totalDebitKES - totalCreditKES,    // Positive = net inflow
            NetFlowUSD: totalDebitUSD - totalCreditUSD,
            ByCurrency: flows.OrderBy(f => f.Key)
                .Select(f => new CurrencyFlowTotalsDto(f.Key, CurrencyInfo.Code(f.Key),
                    f.Value.Debit, f.Value.Credit, f.Value.Debit - f.Value.Credit))
                .ToList()
        );

        return new ApiResponse<TransactionSummaryDto>(true, "Success", summary);
    }

    public async Task<ApiResponse<List<TransactionResponseDto>>> GetRecentAsync(Guid companyId, int count = 10)
    {
        var transactions = await _context.Transactions.AsNoTracking()
            .Where(t => t.CompanyId == companyId && !t.IsDeleted)
            .OrderByDescending(t => t.TransactionDate)
            .Take(count)
            .ToListAsync();

        await PreloadAccountNamesAsync(transactions);
        var items = new List<TransactionResponseDto>();
        foreach (var t in transactions)
        {
            items.Add(await MapToResponseAsync(t));
        }

        return new ApiResponse<List<TransactionResponseDto>>(true, "Success", items);
    }

    /// <summary>
    /// FIXED: Now uses accountId for cash accounts where appropriate
    /// </summary>
    private async Task<decimal?> MpesaBalanceInAsync(Guid companyId, Guid accountId, Currency currency)
    {
        var agent = await _context.MpesaAgents
            .Where(m => m.CompanyId == companyId && m.Id == accountId && !m.IsDeleted)
            .Select(m => new { m.Balance, m.Currency })
            .FirstOrDefaultAsync();
        if (agent == null) return null;
        var holds = agent.Currency ?? await _context.BaseCurrencyAsync(companyId);
        return holds == currency ? agent.Balance : null;
    }

    private async Task<decimal?> GetAccountBalanceAsync(Guid companyId, AccountType type, Guid accountId, Currency currency)
    {
        return type switch
        {
            // The account's currency must match the money posted to it. Without this a USD
            // amount posted to "Cash KES" was subtracted from shillings with no error.
            AccountType.Cash => await _context.CashAccounts
                .Where(c => c.CompanyId == companyId && c.Id == accountId && !c.IsDeleted && c.Currency == currency)
                .Select(c => (decimal?)c.Balance)
                .FirstOrDefaultAsync(),
            AccountType.Bank => await _context.BankAccounts
                .Where(b => b.CompanyId == companyId && b.Id == accountId && !b.IsDeleted && b.Currency == currency)
                .Select(b => (decimal?)b.Balance)
                .FirstOrDefaultAsync(),
            // A mobile money wallet holds its network's currency (M-Pesa = KES, MTN MoMo = UGX);
            // older wallets without one stored hold the home currency.
            AccountType.Mpesa => await MpesaBalanceInAsync(companyId, accountId, currency),
            AccountType.Client => currency == Currency.KES
                ? await _context.Users.Where(u => u.Id == accountId && u.CompanyId == companyId && !u.IsDeleted).Select(u => (decimal?)u.BalanceKES).FirstOrDefaultAsync()
                : currency == Currency.USD
                    ? await _context.Users.Where(u => u.Id == accountId && u.CompanyId == companyId && !u.IsDeleted).Select(u => (decimal?)u.BalanceUSD).FirstOrDefaultAsync()
                    // Other currencies (UGX, EUR, ...) live in ClientCurrencyBalances.
                    // A missing row means a zero balance for a valid client.
                    : await _context.Users.AnyAsync(u => u.Id == accountId && u.CompanyId == companyId && !u.IsDeleted)
                        ? (await _context.ClientCurrencyBalances
                            .Where(b => b.ClientId == accountId && b.CompanyId == companyId && b.Currency == currency && !b.IsDeleted)
                            .Select(b => (decimal?)b.Balance)
                            .FirstOrDefaultAsync()) ?? 0m
                        : null,
            AccountType.Expense => 0m, // Expense categories don't track running balance
            _ => null
        };
    }

    private async Task UpdateAccountBalanceAsync(Guid companyId, AccountType type, Guid accountId, Currency currency, decimal newBalance)
    {
        switch (type)
        {
            case AccountType.Cash:
                var cash = await _context.CashAccounts.FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Id == accountId && !c.IsDeleted);
                if (cash != null) { cash.Balance = newBalance; cash.UpdatedAt = DateTime.UtcNow; }
                break;
            case AccountType.Bank:
                var bank = await _context.BankAccounts.FirstOrDefaultAsync(b => b.Id == accountId && b.CompanyId == companyId && !b.IsDeleted);
                if (bank != null) { bank.Balance = newBalance; bank.UpdatedAt = DateTime.UtcNow; }
                break;
            case AccountType.Mpesa:
                var mpesa = await _context.MpesaAgents.FirstOrDefaultAsync(m => m.Id == accountId && m.CompanyId == companyId && !m.IsDeleted);
                if (mpesa != null) { mpesa.Balance = newBalance; mpesa.UpdatedAt = DateTime.UtcNow; }
                break;
            case AccountType.Client:
                var client = await _context.Users.FirstOrDefaultAsync(u => u.Id == accountId && u.CompanyId == companyId && !u.IsDeleted);
                if (client != null)
                {
                    if (currency == Currency.KES) client.BalanceKES = newBalance;
                    else if (currency == Currency.USD) client.BalanceUSD = newBalance;
                    else
                    {
                        // Other currencies (UGX, EUR, ...): upsert the per-currency row.
                        var ccb = await _context.ClientCurrencyBalances
                            .FirstOrDefaultAsync(b => b.ClientId == accountId && b.CompanyId == companyId && b.Currency == currency && !b.IsDeleted);
                        if (ccb == null)
                        {
                            ccb = new ClientCurrencyBalance
                            {
                                CompanyId = companyId,
                                ClientId = accountId,
                                Currency = currency,
                                Balance = 0,
                                OpeningBalance = 0
                            };
                            _context.ClientCurrencyBalances.Add(ccb);
                        }
                        var delta = newBalance - ccb.Balance;
                        if (delta > 0) ccb.TotalIn += delta;
                        else ccb.TotalOut += Math.Abs(delta);
                        ccb.Balance = newBalance;
                        ccb.UpdatedAt = DateTime.UtcNow;
                    }
                    client.UpdatedAt = DateTime.UtcNow;
                }
                break;
            case AccountType.Expense:
                // Expense categories don't track running balance - no update needed
                break;
        }
    }

    /// <summary>
    /// TXN-yyyyMMdd-NNNN, unique per bureau per day across any number of API
    /// instances (same atomic counter as codes). It used to be "transactions dated
    /// today + 1", which two simultaneous requests — or a back-dated entry — could repeat.
    /// </summary>
    private async Task<string> GenerateReferenceAsync(Guid companyId)
    {
        var prefix = $"TXN-{BureauClock.TodayLocal:yyyyMMdd}-"; // the bureau's date
        var last = await _context.Transactions.IgnoreQueryFilters()
            .Where(t => t.CompanyId == companyId && t.Reference.StartsWith(prefix))
            .Select(t => t.Reference)
            .OrderByDescending(r => r.Length).ThenByDescending(r => r)
            .FirstOrDefaultAsync();
        var dbMax = last != null && int.TryParse(last[prefix.Length..], out var n) ? n : 0;
        var next = await CodeGenerator.NextAsync(_context, $"{companyId}_{prefix}", dbMax);
        return $"{prefix}{next:D4}";
    }

    private static string AccountLabel(AccountType t) => t switch
    {
        AccountType.Cash => "cash account",
        AccountType.Bank => "bank account",
        AccountType.Mpesa => "mobile money account",
        AccountType.Client => "client account",
        _ => "account"
    };

    /// <summary>Logging must never break the request that triggered it.</summary>
    private async Task SafeWarnAsync(Guid companyId, Guid userId, string message)
    {
        try { await _systemLog.LogWarningAsync("TransactionService", message, companyId, userId); }
        catch { /* the warning itself failed; nothing more we can do */ }
    }

    // Names for a whole page of transactions, fetched in one query per account type.
    // Mapping a list used to run up to two queries PER ROW (2,000 for a 1,000-row page).
    private readonly Dictionary<(AccountType, Guid), string> _accountNames = new();

    private async Task PreloadAccountNamesAsync(IReadOnlyCollection<Transaction> txns)
    {
        var ids = txns.SelectMany(t => new[] { (t.SourceAccountType, t.SourceAccountId), (t.DestAccountType, t.DestAccountId) })
            .Where(k => !_accountNames.ContainsKey(k)).Distinct().ToList();
        List<Guid> Of(AccountType type) => ids.Where(k => k.Item1 == type).Select(k => k.Item2).Distinct().ToList();

        var bankIds = Of(AccountType.Bank);
        if (bankIds.Count > 0)
            foreach (var b in await _context.BankAccounts.IgnoreQueryFilters().AsNoTracking().Where(b => bankIds.Contains(b.Id)).Select(b => new { b.Id, b.BankName }).ToListAsync())
                _accountNames[(AccountType.Bank, b.Id)] = b.BankName;
        var agentIds = Of(AccountType.Mpesa);
        if (agentIds.Count > 0)
            foreach (var m in await _context.MpesaAgents.IgnoreQueryFilters().AsNoTracking().Where(m => agentIds.Contains(m.Id)).Select(m => new { m.Id, m.AgentName }).ToListAsync())
                _accountNames[(AccountType.Mpesa, m.Id)] = m.AgentName;
        var clientIds = Of(AccountType.Client);
        if (clientIds.Count > 0)
            foreach (var u in await _context.Users.IgnoreQueryFilters().AsNoTracking().Where(u => clientIds.Contains(u.Id)).Select(u => new { u.Id, u.FullName }).ToListAsync())
                _accountNames[(AccountType.Client, u.Id)] = u.FullName;
        var categoryIds = Of(AccountType.Expense);
        if (categoryIds.Count > 0)
            foreach (var c in await _context.ExpenseCategories.IgnoreQueryFilters().AsNoTracking().Where(c => categoryIds.Contains(c.Id)).Select(c => new { c.Id, c.Name }).ToListAsync())
                _accountNames[(AccountType.Expense, c.Id)] = c.Name;
    }

    private async Task<string> GetAccountNameAsync(AccountType type, Guid accountId)
    {
        if (_accountNames.TryGetValue((type, accountId), out var known)) return known;
        return type switch
        {
            AccountType.Cash => "Cash",
            AccountType.Bank => await _context.BankAccounts.Where(b => b.Id == accountId).Select(b => b.BankName).FirstOrDefaultAsync() ?? "Bank",
            AccountType.Mpesa => await _context.MpesaAgents.Where(m => m.Id == accountId).Select(m => m.AgentName).FirstOrDefaultAsync() ?? "M-Pesa",
            AccountType.Client => await _context.Users.Where(u => u.Id == accountId).Select(u => u.FullName).FirstOrDefaultAsync() ?? "Client",
            // Expense postings point at their category: show its name, not "Unknown".
            AccountType.Expense => await _context.ExpenseCategories.Where(c => c.Id == accountId).Select(c => c.Name).FirstOrDefaultAsync() ?? "Expense",
            _ => "Unknown"
        };
    }

    private async Task<TransactionResponseDto> MapToResponseAsync(Transaction t) => new(
        t.Id,
        t.Code,
        t.Reference,
        t.TransactionDate,
        t.TransactionType,
        t.Amount,
        t.Currency,
        t.Description,
        t.Notes,
        t.ExchangeRate,
        t.SourceAccountType,
        t.SourceAccountId,
        SourceAccountName: await GetAccountNameAsync(t.SourceAccountType, t.SourceAccountId),
        t.SourceBalanceBefore,
        t.SourceBalanceAfter,
        t.DestAccountType,
        t.DestAccountId,
        DestAccountName: await GetAccountNameAsync(t.DestAccountType, t.DestAccountId),
        t.DestBalanceBefore,
        t.DestBalanceAfter,
        t.CounterAmount,
        t.CounterCurrency,
        t.ReconciliationStatus,
        t.CreatedAt,
        IsReversed: t.DeletedAt.HasValue && !t.IsDeleted,   // Original that was reversed
        IsReversal: t.Reference.StartsWith("REV-")          // The reversal entry
    );
}