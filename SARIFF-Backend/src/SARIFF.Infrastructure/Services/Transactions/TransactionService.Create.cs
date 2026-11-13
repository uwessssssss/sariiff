
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public partial class TransactionService
{
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
        var notesCheck = ValidationHelper.ValidateText(dto.Notes, "Notes", 2000);
        if (!notesCheck.IsValid)
            return new ApiResponse<TransactionResponseDto>(false, notesCheck.Error!, null);

        // The type arrives as a number: anything but Debit or Credit was treated as a Credit.
        if (!Enum.IsDefined(typeof(TransactionType), dto.TransactionType))
            return new ApiResponse<TransactionResponseDto>(false, "Unknown transaction type", null);

        // Two currencies need both amounts; one currency moves one amount.
        // (Without the first check USD 100 → KES posted as KES 100. Without the second, a
        // "counter amount" in the same currency moved 100 on one side and 90 on the other.)
        var twoCurrencies = dto.CounterCurrency.HasValue && dto.CounterCurrency != dto.Currency;
        if (twoCurrencies && !dto.CounterAmount.HasValue)
            return new ApiResponse<TransactionResponseDto>(false,
                $"This posting is in two currencies ({dto.Currency} and {dto.CounterCurrency}): enter the amount on the other side too.", null);
        if (!twoCurrencies && dto.CounterAmount.HasValue && dto.CounterAmount.Value != dto.Amount)
            return new ApiResponse<TransactionResponseDto>(false,
                "Both sides of a posting in one currency move the same amount. Choose the second currency, or leave the counter amount out.", null);

        // Back-dating is normal book-keeping; a date in the future or before 2000 is a typo.
        if (dto.TransactionDate is { } when)
        {
            if (when > DateTime.UtcNow.AddDays(1))
                return new ApiResponse<TransactionResponseDto>(false, "A transaction can't be dated in the future", null);
            if (when < new DateTime(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc))
                return new ApiResponse<TransactionResponseDto>(false, "That transaction date is too far in the past", null);
        }

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

            // Lock both accounts before reading their balances (see BalanceLock).
            await BalanceLock.LockAsync(_context, (dto.SourceAccountType, dto.SourceAccountId), (dto.DestAccountType, dto.DestAccountId));

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
            await UpdateAccountBalanceAsync(companyId, dto.SourceAccountType, dto.SourceAccountId, primaryCurrency, sourceBalance.Value, newSourceBalance);
            await UpdateAccountBalanceAsync(companyId, dto.DestAccountType, dto.DestAccountId, counterCurrency, destBalance.Value, newDestBalance);

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
}
