
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public partial class TransactionService
{
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
            // Lock the transaction row first, so a second reversal of the same transaction waits
            // here and then sees it already reversed. (The check below used to run before any
            // lock: six reversals sent at the same moment all passed it and all six posted.)
            if (_context.Database.IsNpgsql())
                await _context.Database.ExecuteSqlRawAsync("SELECT 1 FROM \"Transactions\" WHERE \"Id\" = {0} FOR UPDATE", id);

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

            // Lock both accounts, then read their current balances (see BalanceLock).
            await BalanceLock.LockAsync(_context, (transaction.SourceAccountType, transaction.SourceAccountId), (transaction.DestAccountType, transaction.DestAccountId));
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
            await UpdateAccountBalanceAsync(companyId, transaction.SourceAccountType, transaction.SourceAccountId, primaryCurrency, currentSourceBalance.Value, reversedSourceBalance);
            await UpdateAccountBalanceAsync(companyId, transaction.DestAccountType, transaction.DestAccountId, counterCurrency, currentDestBalance.Value, reversedDestBalance);

            // ============================================================
            // MARK ORIGINAL AS REVERSED — but do NOT soft-delete it
            // IsDeleted stays false → transaction remains visible in statements
            // DeletedAt is set as a "reversed" flag
            // Description gets [REVERSED] prefix so it's clear in the statement
            // ============================================================
            // Reconciliation: the pair cancels out. A reversed posting nobody had ticked off
            // stayed "pending" for ever while its reversal counted alone.
            if (transaction.ReconciliationStatus == ReconciliationStatus.Pending)
            {
                transaction.ReconciliationStatus = ReconciliationStatus.Matched;
                transaction.ActualAmount = ReconciliationService.TillLeg(transaction).Amount;
                transaction.Variance = 0;
                transaction.ReconciledAt = DateTime.UtcNow;
                transaction.ReconciledByUserId = userId;
                transaction.ReconciliationNotes = $"Reversed by {reversalCode}";
            }
            reversalTransaction.ActualAmount = transaction.ActualAmount;
            reversalTransaction.Variance = transaction.Variance;
            reversalTransaction.ReconciledAt = DateTime.UtcNow;

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
            _context.ChangeTracker.Clear();   // nothing half-done may be saved by a later SaveChanges (the error log's)
            return new ApiResponse<bool>(false, "Balance was modified by another operation. Please retry.", false);
        }
        catch (Exception ex)
        {
            await dbTransaction.RollbackAsync();
            _context.ChangeTracker.Clear();   // nothing half-done may be saved by a later SaveChanges (the error log's)
            await _systemLog.LogErrorAsync("TransactionService", $"Failed to reverse transaction: {ex.Message}", ex.StackTrace, companyId, userId);
            return new ApiResponse<bool>(false, "Failed to reverse transaction. Please try again.", false);
        }
    }
}
