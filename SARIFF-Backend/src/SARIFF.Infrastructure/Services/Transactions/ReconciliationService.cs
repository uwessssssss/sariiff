using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public class ReconciliationService : IReconciliationService
{
    private readonly AppDbContext _context;

    public ReconciliationService(AppDbContext context) => _context = context;

    public async Task<ApiResponse<ReconciliationResponseDto>> CreateAsync(Guid companyId, CreateReconciliationDto dto)
    {
        // A counted till (cash, bank, mobile money) can't hold less than nothing.
        if (dto.AccountType != AccountType.Client && dto.ActualBalance < 0)
            return new ApiResponse<ReconciliationResponseDto>(false, "The counted balance can't be negative", null);
        var expectedBalance = await GetExpectedBalanceInternalAsync(companyId, dto.AccountType, dto.AccountId);
        var variance = dto.ActualBalance - expectedBalance;
        var currency = await GetAccountCurrencyAsync(companyId, dto.AccountType, dto.AccountId);

        var reconciliation = new Reconciliation
        {
            CompanyId = companyId,
            AccountType = dto.AccountType,
            AccountId = dto.AccountId,
            Currency = currency,
            ExpectedBalance = expectedBalance,
            ActualBalance = dto.ActualBalance,
            Variance = variance,
            Status = variance == 0 ? ReconciliationStatus.Matched : ReconciliationStatus.Pending,
            Notes = dto.Notes
        };

        if (variance == 0)
            reconciliation.ReconciledAt = DateTime.UtcNow;

        _context.Reconciliations.Add(reconciliation);
        await _context.SaveChangesAsync();

        return new ApiResponse<ReconciliationResponseDto>(true, "Reconciliation created", await MapToResponseAsync(reconciliation));
    }

    public async Task<ApiResponse<ReconciliationResponseDto>> GetByIdAsync(Guid companyId, Guid id)
    {
        var rec = await _context.Reconciliations.FirstOrDefaultAsync(r => r.Id == id && r.CompanyId == companyId);
        if (rec == null) return new ApiResponse<ReconciliationResponseDto>(false, "Reconciliation not found", null);
        return new ApiResponse<ReconciliationResponseDto>(true, "Success", await MapToResponseAsync(rec));
    }

    public async Task<ApiResponse<List<ReconciliationResponseDto>>> GetAllAsync(Guid companyId, AccountType? accountType = null)
    {
        var query = _context.Reconciliations.Where(r => r.CompanyId == companyId);
        if (accountType.HasValue) { var v = accountType.Value; query = query.Where(r => r.AccountType == v); }

        var recs = await query.OrderByDescending(r => r.CreatedAt).ToListAsync();
        var items = new List<ReconciliationResponseDto>();
        foreach (var r in recs) items.Add(await MapToResponseAsync(r));

        return new ApiResponse<List<ReconciliationResponseDto>>(true, "Success", items);
    }
    /// <summary>
    /// Get all accounts (Bank, M-Pesa, Cash) with reconciliation stats
    /// </summary>
    public async Task<ApiResponse<List<AccountReconciliationSummaryDto>>> GetAccountsWithStatsAsync(Guid companyId)
    {
        var baseCurrency = await _context.BaseCurrencyAsync(companyId);
        var result = new List<AccountReconciliationSummaryDto>();

        // Bank Accounts
        var banks = await _context.BankAccounts
            .Where(b => b.CompanyId == companyId && !b.IsDeleted && b.IsActive)
            .ToListAsync();

        foreach (var bank in banks)
        {
            var stats = await GetAccountStatsAsync(companyId, AccountType.Bank, bank.Id);
            result.Add(new AccountReconciliationSummaryDto(
                bank.Id,
                bank.Code,
                $"{bank.BankName} - {bank.AccountNumber}",
                AccountType.Bank,
                bank.Currency,
                bank.Balance,
                stats.pending,
                stats.matched,
                stats.unmatched
            ));
        }

        // M-Pesa Agents
        var agents = await _context.MpesaAgents
            .Where(a => a.CompanyId == companyId && !a.IsDeleted && a.IsActive)
            .ToListAsync();

        foreach (var agent in agents)
        {
            var stats = await GetAccountStatsAsync(companyId, AccountType.Mpesa, agent.Id);
            result.Add(new AccountReconciliationSummaryDto(
                agent.Id,
                agent.Code,
                $"{agent.AgentName} - {agent.AgentNumber}",
                AccountType.Mpesa,
                MobileMoney.CurrencyOf(agent, baseCurrency), // the wallet's own currency (M-Pesa = KES)
                agent.Balance,
                stats.pending,
                stats.matched,
                stats.unmatched
            ));
        }

        // Cash Accounts
        var cashAccounts = await _context.CashAccounts
            .Where(c => c.CompanyId == companyId && !c.IsDeleted)
            .ToListAsync();

        foreach (var cash in cashAccounts)
        {
            var stats = await GetAccountStatsAsync(companyId, AccountType.Cash, cash.Id);
            result.Add(new AccountReconciliationSummaryDto(
                cash.Id,
                $"CASH-{cash.Currency}",
                $"Cash {cash.Currency}",
                AccountType.Cash,
                cash.Currency,
                cash.Balance,
                stats.pending,
                stats.matched,
                stats.unmatched
            ));
        }

        return new ApiResponse<List<AccountReconciliationSummaryDto>>(true, "Success", result);
    }
    /// <summary>
    /// Get transactions for a specific account with optional filter
    /// </summary>
    public async Task<ApiResponse<PagedResult<TransactionReconciliationDto>>> GetAccountTransactionsAsync(
        Guid companyId, 
        AccountType accountType, 
        Guid accountId, 
        ReconciliationFilterDto? filter,
        int page = 1, 
        int pageSize = 50)
    {
        var query = _context.Transactions
            .Where(t => t.CompanyId == companyId && !t.IsDeleted &&
                        ((t.SourceAccountType == accountType && t.SourceAccountId == accountId) ||
                         (t.DestAccountType == accountType && t.DestAccountId == accountId)));

        // Apply filters
        if (filter?.Status is { } status)
            query = query.Where(t => t.ReconciliationStatus == status);
        var (fromUtc, toExclusive) = BureauClock.Range(filter?.StartDate, filter?.EndDate);
        if (fromUtc.HasValue) { var v = fromUtc.Value; query = query.Where(t => t.TransactionDate >= v); }
        if (toExclusive.HasValue) { var v = toExclusive.Value; query = query.Where(t => t.TransactionDate < v); }
        var totalCount = await query.CountAsync();

        var transactions = await query
            .OrderByDescending(t => t.TransactionDate)
            .ThenByDescending(t => t.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var items = new List<TransactionReconciliationDto>();
        foreach (var t in transactions)
        {
            var reconciledByName = t.ReconciledByUserId.HasValue
                ? await GetUserNameAsync(t.ReconciledByUserId.Value)
                : null;

            items.Add(new TransactionReconciliationDto(
                t.Id,
                t.Code,
                t.Reference,
                t.TransactionDate,
                t.TransactionType,
                t.Amount,
                t.ActualAmount,
                t.Variance,
                t.Currency,
                t.Description,
                t.ReconciliationStatus,
                t.ReconciledAt,
                reconciledByName,
                t.ReconciliationNotes,
                t.SourceAccountType,
                t.SourceAccountId
            ));
        }

        return new ApiResponse<PagedResult<TransactionReconciliationDto>>(
            true, 
            "Success", 
            new PagedResult<TransactionReconciliationDto>(items, totalCount, page, pageSize));
    }

    /// <summary>
    /// Get reconciliation balance summary for an account
    /// ExpectedBalance = based on Matched + Unmatched transactions
    /// ActualBalance = sum of ActualAmounts
    /// Variance = difference
    /// </summary>
    public async Task<ApiResponse<AccountReconciliationBalanceDto>> GetAccountBalanceSummaryAsync(
        Guid companyId, 
        AccountType accountType, 
        Guid accountId)
    {
        var transactions = await _context.Transactions.AsNoTracking()
            .Where(t => t.CompanyId == companyId && !t.IsDeleted &&
                        ((t.SourceAccountType == accountType && t.SourceAccountId == accountId) ||
                         (t.DestAccountType == accountType && t.DestAccountId == accountId)))
            .ToListAsync();

        var pending = transactions.Where(t => t.ReconciliationStatus == ReconciliationStatus.Pending).ToList();
        var matched = transactions.Where(t => t.ReconciliationStatus == ReconciliationStatus.Matched).ToList();
        var unmatched = transactions.Where(t => t.ReconciliationStatus == ReconciliationStatus.Unmatched).ToList();

        // Expected balance: Sum of matched + unmatched (not pending)
        var reconciledTransactions = matched.Concat(unmatched).ToList();
        
        decimal expectedBalance = 0;
        decimal actualBalance = 0;

        foreach (var t in reconciledTransactions)
        {
            bool isSource = t.SourceAccountType == accountType && t.SourceAccountId == accountId;
            // The source leg takes the transaction's type, the destination leg the opposite one.
            // On a till (cash, bank, mobile money — an asset) a debit adds and a credit takes
            // away; on a client account (a liability) it is the other way round. This used to
            // be inverted for tills, so money paid into a bank showed as a minus.
            var debitOnThisLeg = isSource == (t.TransactionType == TransactionType.Debit);
            var sign = (debitOnThisLeg ? 1 : -1) * (accountType == AccountType.Client ? -1 : 1);
            
            expectedBalance += t.Amount * sign;
            if (t.ActualAmount.HasValue)
                actualBalance += t.ActualAmount.Value * sign;
        }

        return new ApiResponse<AccountReconciliationBalanceDto>(true, "Success", new AccountReconciliationBalanceDto(
            expectedBalance,
            actualBalance,
            actualBalance - expectedBalance,
            pending.Count,
            matched.Count,
            unmatched.Count,
            pending.Sum(t => t.Amount),
            matched.Sum(t => t.Amount),
            unmatched.Sum(t => t.Amount)
        ));
    }

    /// <summary>
    /// Reconcile a single transaction
    /// </summary>
    public async Task<ApiResponse<TransactionReconciliationDto>> ReconcileTransactionAsync(
        Guid companyId, 
        Guid transactionId, 
        Guid userId, 
        ReconcileTransactionDto dto)
    {
        if (dto.Status == ReconciliationStatus.Pending)
            return new ApiResponse<TransactionReconciliationDto>(false, "Status must be Matched or Unmatched", null);
        if (dto.ActualAmount < 0)
            return new ApiResponse<TransactionReconciliationDto>(false, "The actual amount can't be negative", null);

        var transaction = await _context.Transactions
            .FirstOrDefaultAsync(t => t.Id == transactionId && t.CompanyId == companyId && !t.IsDeleted);

        if (transaction == null)
            return new ApiResponse<TransactionReconciliationDto>(false, "Transaction not found", null);

        // Update reconciliation fields
        transaction.ActualAmount = dto.ActualAmount;
        transaction.Variance = dto.ActualAmount - transaction.Amount;
        transaction.ReconciliationStatus = dto.Status;
        transaction.ReconciledAt = DateTime.UtcNow;
        transaction.ReconciledByUserId = userId;
        transaction.ReconciliationNotes = dto.Notes;
        transaction.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        var reconciledByName = await GetUserNameAsync(userId);

        return new ApiResponse<TransactionReconciliationDto>(
            true, 
            "Transaction reconciled", 
            new TransactionReconciliationDto(
                transaction.Id,
                transaction.Code,
                transaction.Reference,
                transaction.TransactionDate,
                transaction.TransactionType,
                transaction.Amount,
                transaction.ActualAmount,
                transaction.Variance,
                transaction.Currency,
                transaction.Description,
                transaction.ReconciliationStatus,
                transaction.ReconciledAt,
                reconciledByName,
                transaction.ReconciliationNotes,
                transaction.SourceAccountType,
                transaction.SourceAccountId
            ));
    }

    /// <summary>
    /// Bulk reconcile multiple transactions at once
    /// </summary>
    public async Task<ApiResponse<int>> BulkReconcileAsync(
        Guid companyId, 
        Guid userId, 
        BulkReconcileDto dto)
    {
        if (dto.Status == ReconciliationStatus.Pending)
            return new ApiResponse<int>(false, "Status must be Matched or Unmatched", 0);

        if (!dto.TransactionIds.Any())
            return new ApiResponse<int>(false, "No transactions specified", 0);

        var transactions = await _context.Transactions
            .Where(t => dto.TransactionIds.Contains(t.Id) && 
                        t.CompanyId == companyId && 
                        !t.IsDeleted)
            .ToListAsync();

        if (!transactions.Any())
            return new ApiResponse<int>(false, "No transactions found", 0);

        var now = DateTime.UtcNow;
        foreach (var transaction in transactions)
        {
            // For bulk: ActualAmount = Amount (assuming match), Variance = 0
            transaction.ActualAmount = transaction.Amount;
            transaction.Variance = 0;
            transaction.ReconciliationStatus = dto.Status;
            transaction.ReconciledAt = now;
            transaction.ReconciledByUserId = userId;
            transaction.ReconciliationNotes = dto.Notes ?? $"Bulk reconciled as {dto.Status}";
            transaction.UpdatedAt = now;
        }

        await _context.SaveChangesAsync();

        return new ApiResponse<int>(true, $"{transactions.Count} transactions reconciled", transactions.Count);
    }

    // ==================== Private Helpers ====================

    private async Task<(int pending, int matched, int unmatched)> GetAccountStatsAsync(
        Guid companyId, AccountType accountType, Guid accountId)
    {
        var transactions = await _context.Transactions.AsNoTracking()
            .Where(t => t.CompanyId == companyId && !t.IsDeleted &&
                        ((t.SourceAccountType == accountType && t.SourceAccountId == accountId) ||
                         (t.DestAccountType == accountType && t.DestAccountId == accountId)))
            .ToListAsync();

        return (
            transactions.Count(t => t.ReconciliationStatus == ReconciliationStatus.Pending),
            transactions.Count(t => t.ReconciliationStatus == ReconciliationStatus.Matched),
            transactions.Count(t => t.ReconciliationStatus == ReconciliationStatus.Unmatched)
        );
    }

    private async Task<string?> GetUserNameAsync(Guid userId)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user != null) return user.FullName;
        
        var company = await _context.Companies.FindAsync(userId);
        return company?.OwnerName;
    }

    public async Task<ApiResponse<ReconciliationResponseDto>> CompleteAsync(Guid companyId, Guid id, Guid userId, CompleteReconciliationDto dto)
    {
        var rec = await _context.Reconciliations.FirstOrDefaultAsync(r => r.Id == id && r.CompanyId == companyId);
        if (rec == null) return new ApiResponse<ReconciliationResponseDto>(false, "Reconciliation not found", null);

        rec.Status = rec.Variance == 0 ? ReconciliationStatus.Matched : ReconciliationStatus.Unmatched;
        rec.ReconciledAt = DateTime.UtcNow;
        rec.ReconciledByUserId = userId;

        await _context.SaveChangesAsync();
        return new ApiResponse<ReconciliationResponseDto>(true, "Reconciliation completed", await MapToResponseAsync(rec));
    }

    public async Task<ApiResponse<decimal>> GetExpectedBalanceAsync(Guid companyId, AccountType accountType, Guid accountId)
    {
        var balance = await GetExpectedBalanceInternalAsync(companyId, accountType, accountId);
        return new ApiResponse<decimal>(true, "Success", balance);
    }

    private async Task<decimal> GetExpectedBalanceInternalAsync(Guid companyId, AccountType type, Guid accountId)
    {
        return type switch
        {
            AccountType.Cash => await _context.CashAccounts.Where(c => c.CompanyId == companyId && c.Id == accountId).Select(c => c.Balance).FirstOrDefaultAsync(),
            AccountType.Bank => await _context.BankAccounts.Where(b => b.CompanyId == companyId && b.Id == accountId).Select(b => b.Balance).FirstOrDefaultAsync(),
            AccountType.Mpesa => await _context.MpesaAgents.Where(m => m.CompanyId == companyId && m.Id == accountId).Select(m => m.Balance).FirstOrDefaultAsync(),
            _ => 0
        };
    }

    private async Task<Currency> GetAccountCurrencyAsync(Guid companyId, AccountType type, Guid accountId)
    {
        return type switch
        {
            AccountType.Cash => await _context.CashAccounts.Where(c => c.CompanyId == companyId && c.Id == accountId).Select(c => c.Currency).FirstOrDefaultAsync(),
            AccountType.Bank => await _context.BankAccounts.Where(b => b.CompanyId == companyId && b.Id == accountId).Select(b => b.Currency).FirstOrDefaultAsync(),
            // A mobile money wallet holds its network's currency (M-Pesa = KES even in a Ugandan
            // bureau), the same rule the account list uses; older wallets hold the home currency.
            AccountType.Mpesa => await _context.MpesaAgents.Where(m => m.CompanyId == companyId && m.Id == accountId).Select(m => m.Currency).FirstOrDefaultAsync()
                                 ?? await _context.BaseCurrencyAsync(companyId),
            _ => await _context.BaseCurrencyAsync(companyId)
        };
    }

    private async Task<string> GetAccountNameAsync(AccountType type, Guid accountId)
    {
        return type switch
        {
            AccountType.Cash => "Cash",
            AccountType.Bank => await _context.BankAccounts.Where(b => b.Id == accountId).Select(b => b.BankName).FirstOrDefaultAsync() ?? "Bank",
            AccountType.Mpesa => await _context.MpesaAgents.Where(m => m.Id == accountId).Select(m => m.AgentName).FirstOrDefaultAsync() ?? "M-Pesa",
            _ => "Unknown"
        };
    }

    private async Task<ReconciliationResponseDto> MapToResponseAsync(Reconciliation r) => new(
        r.Id, r.AccountType, r.AccountId, await GetAccountNameAsync(r.AccountType, r.AccountId),
        r.Currency, r.ExpectedBalance, r.ActualBalance, r.Variance, r.Status, r.Notes, r.ReconciledAt, r.CreatedAt);
}
