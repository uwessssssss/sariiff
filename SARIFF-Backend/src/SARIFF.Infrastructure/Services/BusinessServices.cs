using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>Per-currency roll-ups shared by reports and dashboards.</summary>
internal static class CurrencyRollup
{
    /// <summary>Cash + bank per currency (every currency held, KES/USD included).</summary>
    public static List<CurrencyCashBankDto> CashBank(
        IEnumerable<CashAccount> cash, IEnumerable<BankAccount> banks, bool opening)
    {
        var cashList = cash.ToList();
        var bankList = banks.ToList();
        return cashList.Select(c => c.Currency).Concat(bankList.Select(b => b.Currency))
            .Distinct().OrderBy(c => c)
            .Select(cur => new CurrencyCashBankDto(cur, CurrencyInfo.Code(cur),
                cashList.Where(c => c.Currency == cur).Sum(c => opening ? c.OpeningBalance : c.Balance),
                bankList.Where(b => b.Currency == cur).Sum(b => opening ? b.OpeningBalance : b.Balance)))
            .ToList();
    }

    /// <summary>Mobile money per wallet currency (M-Pesa KES and MTN UGX are never added together).</summary>
    public static List<CurrencyAmountDto> Wallets(IEnumerable<MpesaAgent> agents, Currency home, bool opening) =>
        agents.GroupBy(a => MobileMoney.CurrencyOf(a, home)).OrderBy(g => g.Key)
            .Select(g => new CurrencyAmountDto(g.Key, CurrencyInfo.Code(g.Key), g.Sum(a => opening ? a.OpeningBalance : a.Balance)))
            .ToList();

    /// <summary>The single "mobile money" figure older screens show: home-currency wallets only.</summary>
    public static decimal HomeWallets(IEnumerable<MpesaAgent> agents, Currency home, bool opening) =>
        agents.Where(a => MobileMoney.CurrencyOf(a, home) == home).Sum(a => opening ? a.OpeningBalance : a.Balance);
}

public class InvoiceService : IInvoiceService
{
    private readonly AppDbContext _context;

    public InvoiceService(AppDbContext context) => _context = context;

    public async Task<ApiResponse<InvoiceResponseDto>> CreateAsync(Guid companyId, CreateInvoiceDto dto)
    {
        // Country rule: no NEW holdings in a currency the bureau's country doesn't use (UGX in Kenya).
        var currencyBlock = await _context.CurrencyNotAllowedAsync(companyId, dto.Currency);
        if (currencyBlock != null)
            return new ApiResponse<InvoiceResponseDto>(false, currencyBlock, null);

        // Input validation
        var nameCheck = ValidationHelper.ValidateName(dto.ClientName, "Client name");
        if (!nameCheck.IsValid)
            return new ApiResponse<InvoiceResponseDto>(false, nameCheck.Error!, null);

        var emailCheck = ValidationHelper.ValidateEmail(dto.ClientEmail);
        if (!emailCheck.IsValid)
            return new ApiResponse<InvoiceResponseDto>(false, emailCheck.Error!, null);

        if (dto.Items == null || dto.Items.Count == 0)
            return new ApiResponse<InvoiceResponseDto>(false, "Invoice must have at least one item", null);

        foreach (var item in dto.Items)
        {
            if (string.IsNullOrWhiteSpace(item.Description))
                return new ApiResponse<InvoiceResponseDto>(false, "All invoice items must have a description", null);
            if (item.Quantity <= 0)
                return new ApiResponse<InvoiceResponseDto>(false, $"Item '{item.Description}': quantity must be greater than zero", null);
            if (item.UnitPrice < 0)
                return new ApiResponse<InvoiceResponseDto>(false, $"Item '{item.Description}': unit price cannot be negative", null);
        }

        if (dto.TaxRate < 0 || dto.TaxRate > 100)
            return new ApiResponse<InvoiceResponseDto>(false, "Tax rate must be between 0 and 100", null);

        if (dto.DiscountAmount < 0)
            return new ApiResponse<InvoiceResponseDto>(false, "Discount amount cannot be negative", null);

        if (dto.DueDate.Date < BureauClock.TodayLocal)
            return new ApiResponse<InvoiceResponseDto>(false, "Due date cannot be in the past", null);

        var subtotal = dto.Items.Sum(i => i.Quantity * i.UnitPrice);
        var taxAmount = subtotal * (dto.TaxRate / 100);
        var total = subtotal + taxAmount - dto.DiscountAmount;

        const int maxRetries = 3;
        for (int attempt = 0; attempt < maxRetries; attempt++)
        {
            var invoiceNumber = await CodeGenerator.GenerateInvoiceNumberAsync(_context, companyId);
            var invoice = new Invoice
            {
                CompanyId = companyId,
                InvoiceNumber = invoiceNumber,
                ClientId = dto.ClientId,
                ClientName = dto.ClientName,
                ClientEmail = dto.ClientEmail,
                ClientPhone = dto.ClientPhone,
                ClientAddress = dto.ClientAddress,
                InvoiceDate = DateTime.UtcNow,
                DueDate = dto.DueDate,
                Currency = dto.Currency,
                Status = InvoiceStatus.Draft,
                Subtotal = subtotal,
                TaxRate = dto.TaxRate,
                TaxAmount = taxAmount,
                DiscountAmount = dto.DiscountAmount,
                Total = total,
                Notes = dto.Notes,
                Terms = dto.Terms
            };

            _context.Invoices.Add(invoice);

            var sortOrder = 0;
            var items = new List<InvoiceItem>();
            foreach (var item in dto.Items)
            {
                var invoiceItem = new InvoiceItem
                {
                    InvoiceId = invoice.Id,
                    Description = item.Description,
                    Quantity = item.Quantity,
                    UnitPrice = item.UnitPrice,
                    Amount = item.Quantity * item.UnitPrice,
                    SortOrder = sortOrder++
                };
                items.Add(invoiceItem);
                _context.InvoiceItems.Add(invoiceItem);
            }

            try
            {
                await _context.SaveChangesAsync();
                return await GetByIdAsync(companyId, invoice.Id);
            }
            catch (DbUpdateException) when (attempt < maxRetries - 1)
            {
                _context.Entry(invoice).State = EntityState.Detached;
                foreach (var item in items)
                    _context.Entry(item).State = EntityState.Detached;
                await Task.Delay(50 * (attempt + 1));
            }
        }
        return new ApiResponse<InvoiceResponseDto>(false, "Failed to generate unique invoice number. Please try again.", null);
    }

    public async Task<ApiResponse<InvoiceResponseDto>> GetByIdAsync(Guid companyId, Guid id)
    {
        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == id && i.CompanyId == companyId);
        if (invoice == null) return new ApiResponse<InvoiceResponseDto>(false, "Invoice not found", null);

        var items = await _context.InvoiceItems.Where(i => i.InvoiceId == id).OrderBy(i => i.SortOrder).ToListAsync();
        return new ApiResponse<InvoiceResponseDto>(true, "Success", MapToResponse(invoice, items));
    }

    public async Task<ApiResponse<PagedResult<InvoiceResponseDto>>> GetAllAsync(Guid companyId, int page, int pageSize)
    {
        var query = _context.Invoices.Where(i => i.CompanyId == companyId);
        var totalCount = await query.CountAsync();
        var invoices = await query.OrderByDescending(i => i.InvoiceDate).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();

        // All line items for the page in one query (it was one query per invoice).
        var invoiceIds = invoices.Select(i => i.Id).ToList();
        var allItems = (await _context.InvoiceItems.Where(i => invoiceIds.Contains(i.InvoiceId)).ToListAsync())
            .GroupBy(i => i.InvoiceId).ToDictionary(g => g.Key, g => g.ToList());
        var items = invoices.Select(inv => MapToResponse(inv, allItems.TryGetValue(inv.Id, out var li) ? li : new List<InvoiceItem>())).ToList();

        return new ApiResponse<PagedResult<InvoiceResponseDto>>(true, "Success", new PagedResult<InvoiceResponseDto>(items, totalCount, page, pageSize));
    }

    public async Task<ApiResponse<InvoiceResponseDto>> UpdateStatusAsync(Guid companyId, Guid id, UpdateInvoiceStatusDto dto)
    {
        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == id && i.CompanyId == companyId && !i.IsDeleted);
        if (invoice == null) return new ApiResponse<InvoiceResponseDto>(false, "Invoice not found", null);

        // Validate status transitions
        var allowed = invoice.Status switch
        {
            InvoiceStatus.Draft => new[] { InvoiceStatus.Sent, InvoiceStatus.Cancelled },
            InvoiceStatus.Sent => new[] { InvoiceStatus.Paid, InvoiceStatus.Cancelled },
            InvoiceStatus.Paid => Array.Empty<InvoiceStatus>(),
            InvoiceStatus.Cancelled => Array.Empty<InvoiceStatus>(),
            _ => Array.Empty<InvoiceStatus>()
        };

        if (!allowed.Contains(dto.Status))
            return new ApiResponse<InvoiceResponseDto>(false, 
                $"Cannot change status from {invoice.Status} to {dto.Status}", null);

        invoice.Status = dto.Status;
        await _context.SaveChangesAsync();
        return await GetByIdAsync(companyId, id);
    }

    public async Task<ApiResponse<bool>> DeleteAsync(Guid companyId, Guid id)
    {
        var invoice = await _context.Invoices.FirstOrDefaultAsync(i => i.Id == id && i.CompanyId == companyId && !i.IsDeleted);
        if (invoice == null) return new ApiResponse<bool>(false, "Invoice not found", false);

        if (invoice.Status == InvoiceStatus.Paid)
            return new ApiResponse<bool>(false, "Cannot delete a paid invoice", false);

        invoice.IsDeleted = true;
        await _context.SaveChangesAsync();
        return new ApiResponse<bool>(true, "Invoice deleted", true);
    }

    public Task<ApiResponse<byte[]>> GeneratePdfAsync(Guid companyId, Guid id)
    {
        // PDF generation would require a library like QuestPDF or iTextSharp
        // For now, return placeholder
        return Task.FromResult(new ApiResponse<byte[]>(false, "PDF generation not implemented", null));
    }

    private static InvoiceResponseDto MapToResponse(Invoice i, List<InvoiceItem> items) => new(
        i.Id, i.InvoiceNumber, i.ClientId, i.ClientName, i.ClientEmail, i.ClientPhone, i.ClientAddress,
        i.InvoiceDate, i.DueDate, i.Currency, i.Status, i.Subtotal, i.TaxRate, i.TaxAmount, i.DiscountAmount, i.Total,
        i.Notes, i.Terms, items.Select(it => new InvoiceItemResponseDto(it.Id, it.Description, it.Quantity, it.UnitPrice, it.Amount)).ToList());
}

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
        if (accountType.HasValue) query = query.Where(r => r.AccountType == accountType.Value);

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
        if (filter?.Status.HasValue == true)
            query = query.Where(t => t.ReconciliationStatus == filter.Status.Value);
        var (fromUtc, toExclusive) = BureauClock.Range(filter?.StartDate, filter?.EndDate);
        if (fromUtc.HasValue)
            query = query.Where(t => t.TransactionDate >= fromUtc.Value);
        if (toExclusive.HasValue)
            query = query.Where(t => t.TransactionDate < toExclusive.Value);

        var totalCount = await query.CountAsync();

        var transactions = await query
            .OrderByDescending(t => t.TransactionDate)
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
            var sign = isSource 
                ? (t.TransactionType == TransactionType.Debit ? -1 : 1)
                : (t.TransactionType == TransactionType.Debit ? 1 : -1);
            
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
            // Mobile money (and anything else) is in the company's home currency
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

public class ReportService : IReportService
{
    private readonly AppDbContext _context;
    private readonly ITransactionService _transactionService;

    public ReportService(AppDbContext context, ITransactionService transactionService)
    {
        _context = context;
        _transactionService = transactionService;
    }



    public async Task<ApiResponse<DailyReportDto>> GetDailyReportAsync(Guid companyId, DateTime date)
{
    // The bureau's calendar day as UTC bounds (00:00 EAT = 21:00 UTC the day before).
    var startOfDay = BureauClock.DayStartUtc(date);
    var endOfDay = startOfDay.AddDays(1);

    var cashAccounts = await _context.CashAccounts
        .Where(c => c.CompanyId == companyId && !c.IsDeleted)
        .ToListAsync();
    var bankAccounts = await _context.BankAccounts
        .Where(b => b.CompanyId == companyId && !b.IsDeleted)
        .ToListAsync();
    var mpesaAgents = await _context.MpesaAgents
        .Where(m => m.CompanyId == companyId && !m.IsDeleted)
        .ToListAsync();
    var homeCur = await _context.BaseCurrencyAsync(companyId);

    // FIX: Use >= startOfDay AND < endOfDay instead of .Date == date.Date
    var transactions = await _context.Transactions.AsNoTracking()
        .Where(t => t.CompanyId == companyId && 
                    !t.IsDeleted &&
                    t.TransactionDate >= startOfDay && 
                    t.TransactionDate < endOfDay)
        .OrderByDescending(t => t.TransactionDate)
        .ToListAsync();

    var summary = new TransactionSummaryDto(
        transactions.Count,
        transactions.Where(t => t.TransactionType == TransactionType.Debit && t.Currency == Currency.KES).Sum(t => t.Amount),
        transactions.Where(t => t.TransactionType == TransactionType.Debit && t.Currency == Currency.USD).Sum(t => t.Amount),
        transactions.Where(t => t.TransactionType == TransactionType.Credit && t.Currency == Currency.KES).Sum(t => t.Amount),
        transactions.Where(t => t.TransactionType == TransactionType.Credit && t.Currency == Currency.USD).Sum(t => t.Amount),
        0, 0,
        transactions.GroupBy(t => t.Currency).OrderBy(g => g.Key)
            .Select(g =>
            {
                var d = g.Where(t => t.TransactionType == TransactionType.Debit).Sum(t => t.Amount);
                var c = g.Where(t => t.TransactionType == TransactionType.Credit).Sum(t => t.Amount);
                return new CurrencyFlowTotalsDto(g.Key, CurrencyInfo.Code(g.Key), d, c, d - c);
            }).ToList());

    var opening = new OpeningBalancesDto(
        cashAccounts.FirstOrDefault(c => c.Currency == Currency.KES)?.OpeningBalance ?? 0,
        cashAccounts.FirstOrDefault(c => c.Currency == Currency.USD)?.OpeningBalance ?? 0,
        bankAccounts.Where(b => b.Currency == Currency.KES).Sum(b => b.OpeningBalance),
        bankAccounts.Where(b => b.Currency == Currency.USD).Sum(b => b.OpeningBalance),
        CurrencyRollup.HomeWallets(mpesaAgents, homeCur, opening: true),
        CurrencyRollup.CashBank(cashAccounts, bankAccounts, opening: true),
        CurrencyRollup.Wallets(mpesaAgents, homeCur, opening: true));

    var closing = new ClosingBalancesDto(
        cashAccounts.FirstOrDefault(c => c.Currency == Currency.KES)?.Balance ?? 0,
        cashAccounts.FirstOrDefault(c => c.Currency == Currency.USD)?.Balance ?? 0,
        bankAccounts.Where(b => b.Currency == Currency.KES).Sum(b => b.Balance),
        bankAccounts.Where(b => b.Currency == Currency.USD).Sum(b => b.Balance),
        CurrencyRollup.HomeWallets(mpesaAgents, homeCur, opening: false),
        CurrencyRollup.CashBank(cashAccounts, bankAccounts, opening: false),
        CurrencyRollup.Wallets(mpesaAgents, homeCur, opening: false));

    var txnDtos = new List<TransactionResponseDto>();
    foreach (var t in transactions)
    {
        var result = await _transactionService.GetByIdAsync(companyId, t.Id);
        if (result.Data != null) txnDtos.Add(result.Data);
    }

    return new ApiResponse<DailyReportDto>(true, "Success", 
        new DailyReportDto(dateUtc, opening, summary, closing, txnDtos));
}

    public async Task<ApiResponse<PagedResult<TransactionResponseDto>>> GetTransactionReportAsync(Guid companyId, ReportFilterDto filter, int page, int pageSize)
    {
        return await _transactionService.GetAllAsync(companyId, page, pageSize, filter);
    }

    public async Task<ApiResponse<ClientBalanceReportDto>> GetClientBalanceReportAsync(Guid companyId, string? balanceType = null)
    {
        var query = _context.Users.Where(u => u.CompanyId == companyId && u.Role == UserRole.Client);
        var ccbs = _context.ClientCurrencyBalances.Where(b => b.CompanyId == companyId && !b.IsDeleted);

        // Debit/credit in ANY currency — a client owing only UGX still counts.
        if (balanceType == "debit")
            query = query.Where(u => u.BalanceKES > 0 || u.BalanceUSD > 0 || ccbs.Any(b => b.ClientId == u.Id && b.Balance > 0));
        else if (balanceType == "credit")
            query = query.Where(u => u.BalanceKES < 0 || u.BalanceUSD < 0 || ccbs.Any(b => b.ClientId == u.Id && b.Balance < 0));

        var clients = await query.ToListAsync();
        var clientIds = clients.Select(c => c.Id).ToList();
        var others = await ccbs.Where(b => clientIds.Contains(b.ClientId) && b.Balance != 0).ToListAsync();
        var othersByClient = others.GroupBy(b => b.ClientId).ToDictionary(g => g.Key, g => g.OrderBy(b => b.Currency).ToList());

        var items = clients.Select(c =>
        {
            othersByClient.TryGetValue(c.Id, out var mine);
            mine ??= new List<ClientCurrencyBalance>();
            var all = new[] { c.BalanceKES, c.BalanceUSD }.Concat(mine.Select(b => b.Balance)).ToList();
            var type = all.Any(v => v > 0) ? "Debit" : all.Any(v => v < 0) ? "Credit" : "Zero";
            return new ClientBalanceItemDto(c.Id, c.FullName, c.WhatsAppNumber, c.BalanceKES, c.BalanceUSD, type,
                mine.Select(b => new CurrencyAmountDto(b.Currency, CurrencyInfo.Code(b.Currency), b.Balance)).ToList());
        }).ToList();

        // Per-currency totals: KES/USD from columns, others from ClientCurrencyBalances.
        var balances = clients.SelectMany(c => new[] { (Currency.KES, c.BalanceKES), (Currency.USD, c.BalanceUSD) })
            .Concat(others.Select(b => (b.Currency, b.Balance)))
            .ToList();
        var byCurrency = balances.GroupBy(x => x.Item1).OrderBy(g => g.Key)
            .Select(g =>
            {
                var owing = g.Where(x => x.Item2 > 0).Sum(x => x.Item2);
                var owed = g.Where(x => x.Item2 < 0).Sum(x => Math.Abs(x.Item2));
                return new CurrencyFlowTotalsDto(g.Key, CurrencyInfo.Code(g.Key), owing, owed, owing - owed);
            })
            .Where(x => x.TotalDebit != 0 || x.TotalCredit != 0)
            .ToList();

        return new ApiResponse<ClientBalanceReportDto>(true, "Success", new ClientBalanceReportDto(
            items,
            clients.Where(c => c.BalanceKES > 0).Sum(c => c.BalanceKES),
            clients.Where(c => c.BalanceUSD > 0).Sum(c => c.BalanceUSD),
            clients.Where(c => c.BalanceKES < 0).Sum(c => Math.Abs(c.BalanceKES)),
            clients.Where(c => c.BalanceUSD < 0).Sum(c => Math.Abs(c.BalanceUSD)),
            byCurrency));
    }

    public async Task<ApiResponse<AccountSummaryReportDto>> GetAccountSummaryReportAsync(Guid companyId)
    {
        var baseCurrency = await _context.BaseCurrencyAsync(companyId);
        var cash = await _context.CashAccounts.Where(c => c.CompanyId == companyId && !c.IsDeleted).ToListAsync();
        var banks = await _context.BankAccounts.Where(b => b.CompanyId == companyId && !b.IsDeleted).ToListAsync();
        var mpesa = await _context.MpesaAgents.Where(m => m.CompanyId == companyId && !m.IsDeleted).ToListAsync();

        return new ApiResponse<AccountSummaryReportDto>(true, "Success", new AccountSummaryReportDto(
            // CashAccountResponseDto: Id, Currency, Balance, OpeningBalance, TotalDebit, TotalCredit, NetMovement, CreatedAt
            cash.Select(c => new CashAccountResponseDto(c.Id, c.Currency, c.Balance, c.OpeningBalance, 0, 0, 0, c.CreatedAt)).ToList(),
        
            // BankAccountResponseDto: Id, Code, BankName, AccountNumber, AccountName, BranchCode, Currency, Balance, OpeningBalance, TotalDebit, TotalCredit, NetMovement, IsActive, CreatedAt
            banks.Select(b => new BankAccountResponseDto(b.Id, b.Code, b.BankName, b.AccountNumber, b.AccountName, b.BranchCode, b.Currency, b.Balance, b.OpeningBalance, 0, 0, 0, b.IsActive, b.CreatedAt)).ToList(),
        
            // MpesaAgentResponseDto: Id, Code, AgentName, PhoneNumber, AgentNumber, StoreNumber, AgentType, Balance, OpeningBalance, TotalDebit, TotalCredit, NetMovement, IsActive, CreatedAt
            mpesa.Select(m => new MpesaAgentResponseDto(m.Id, m.Code, m.AgentName, m.PhoneNumber, m.AgentNumber, m.StoreNumber, m.AgentType, m.Balance, m.OpeningBalance, 0, 0, 0, m.IsActive, m.CreatedAt, m.Provider, MobileMoney.CurrencyOf(m, baseCurrency))).ToList(),
        
            cash.FirstOrDefault(c => c.Currency == Currency.KES)?.Balance ?? 0,
            cash.FirstOrDefault(c => c.Currency == Currency.USD)?.Balance ?? 0,
            banks.Where(b => b.Currency == Currency.KES).Sum(b => b.Balance),
            banks.Where(b => b.Currency == Currency.USD).Sum(b => b.Balance),
            CurrencyRollup.HomeWallets(mpesa, baseCurrency, opening: false),
            CurrencyRollup.CashBank(cash, banks, opening: false),
            CurrencyRollup.Wallets(mpesa, baseCurrency, opening: false)
        ));
    }

    public Task<ApiResponse<byte[]>> ExportToPdfAsync(Guid companyId, string reportType, ReportFilterDto filter)
    {
        return Task.FromResult(new ApiResponse<byte[]>(false, "PDF export not implemented", null));
    }

    public Task<ApiResponse<byte[]>> ExportToExcelAsync(Guid companyId, string reportType, ReportFilterDto filter)
    {
        return Task.FromResult(new ApiResponse<byte[]>(false, "Excel export not implemented", null));
    }
}

public class DashboardService : IDashboardService
{
    private readonly AppDbContext _context;
    private readonly ITransactionService _transactionService;
    private readonly IExchangeRateService _exchangeRateService;

    public DashboardService(AppDbContext context, ITransactionService transactionService, IExchangeRateService exchangeRateService)
    {
        _context = context;
        _transactionService = transactionService;
        _exchangeRateService = exchangeRateService;
    }

    /// <summary>
    /// Returns the currencies this company actually uses, derived from real
    /// activity across cash accounts, bank accounts, transactions (both legs),
    /// and client balances (KES/USD columns + the ClientCurrencyBalances table).
    /// A currency appears only once it's genuinely in use — so a Kenyan bureau
    /// that has never touched UGX will never see a UGX column.
    /// </summary>
    public async Task<ApiResponse<CompanyCurrenciesDto>> GetCompanyCurrenciesAsync(Guid companyId)
    {
        var used = new HashSet<Currency>();

        // Cash & bank accounts
        used.UnionWith(await _context.CashAccounts
            .Where(c => c.CompanyId == companyId && !c.IsDeleted)
            .Select(c => c.Currency).Distinct().ToListAsync());
        used.UnionWith(await _context.BankAccounts
            .Where(b => b.CompanyId == companyId && !b.IsDeleted)
            .Select(b => b.Currency).Distinct().ToListAsync());

        // Transactions — both the primary currency and the counter currency
        used.UnionWith(await _context.Transactions.AsNoTracking()
            .Where(t => t.CompanyId == companyId && !t.IsDeleted)
            .Select(t => t.Currency).Distinct().ToListAsync());
        used.UnionWith(await _context.Transactions.AsNoTracking()
            .Where(t => t.CompanyId == companyId && !t.IsDeleted && t.CounterCurrency != null)
            .Select(t => t.CounterCurrency!.Value).Distinct().ToListAsync());

        // Client balances beyond KES/USD (UGX, EUR, ...)
        used.UnionWith(await _context.ClientCurrencyBalances
            .Where(b => b.CompanyId == companyId && !b.IsDeleted)
            .Select(b => b.Currency).Distinct().ToListAsync());

        // Mobile money wallets in their own currency (an M-Pesa KES wallet in Uganda)
        used.UnionWith(await _context.MpesaAgents
            .Where(m => m.CompanyId == companyId && !m.IsDeleted && m.Currency != null)
            .Select(m => m.Currency!.Value).Distinct().ToListAsync());

        // KES/USD client columns: count them only if any client holds a non-zero
        // balance in them (so a UGX/USD-only bureau doesn't get a phantom KES).
        if (await _context.Users.AnyAsync(u => u.CompanyId == companyId && !u.IsDeleted &&
                u.Role == UserRole.Client && u.BalanceKES != 0))
            used.Add(Currency.KES);
        if (await _context.Users.AnyAsync(u => u.CompanyId == companyId && !u.IsDeleted &&
                u.Role == UserRole.Client && u.BalanceUSD != 0))
            used.Add(Currency.USD);

        // The home currency is always "in use": rates and profit are in it.
        var brandNew = used.Count == 0;
        var baseCurrency = await _context.BaseCurrencyAsync(companyId);
        used.Add(baseCurrency);

        // A brand-new company with zero activity also gets USD (universal in the target markets).
        if (brandNew)
            used.Add(Currency.USD);

        // Ugandan bureaus deal in Kenyan shillings every day — always show KES.
        if (baseCurrency == Currency.UGX)
            used.Add(Currency.KES);

        // A currency the country doesn't use (UGX at a Kenyan bureau) stays visible
        // ONLY while money still sits in it, so nothing silently drops out of the
        // totals. Once it's cleared to zero it disappears.
        foreach (var c in used.Where(c => !CurrencyInfo.IsAllowed(baseCurrency, c)).ToList())
        {
            var held =
                await _context.CashAccounts.AnyAsync(a => a.CompanyId == companyId && !a.IsDeleted && a.Currency == c && a.Balance != 0) ||
                await _context.BankAccounts.AnyAsync(a => a.CompanyId == companyId && !a.IsDeleted && a.Currency == c && a.Balance != 0) ||
                await _context.ClientCurrencyBalances.AnyAsync(b => b.CompanyId == companyId && !b.IsDeleted && b.Currency == c && b.Balance != 0) ||
                await _context.ExchangeFloatBalances.AnyAsync(b => b.CompanyId == companyId && b.Currency == c && b.Balance != 0) ||
                (c == Currency.KES && await _context.Users.AnyAsync(u => u.CompanyId == companyId && !u.IsDeleted && u.Role == UserRole.Client && u.BalanceKES != 0)) ||
                (c == Currency.USD && await _context.Users.AnyAsync(u => u.CompanyId == companyId && !u.IsDeleted && u.Role == UserRole.Client && u.BalanceUSD != 0));
            if (!held) used.Remove(c);
        }

        // Home currency first, then the rest in enum order.
        var currencies = used
            .OrderBy(c => c == baseCurrency ? -1 : (int)c)
            .Select(c => new CurrencyOptionDto(c, c.ToString(), (int)c))
            .ToList();

        // What pickers may offer for new accounts, trades, rates and invoices.
        var allowed = CurrencyInfo.AllowedFor(baseCurrency)
            .Select(c => new CurrencyOptionDto(c, c.ToString(), (int)c))
            .ToList();

        return new ApiResponse<CompanyCurrenciesDto>(true, "Success",
            new CompanyCurrenciesDto(currencies, baseCurrency, baseCurrency.ToString(), allowed));
    }

    public async Task<ApiResponse<DashboardStatsDto>> GetOfficeUserDashboardAsync(Guid companyId)
    {
        // (Soft-deleted rows are also filtered globally; explicit here for clarity.)
        var cash = await _context.CashAccounts.Where(c => c.CompanyId == companyId && !c.IsDeleted).ToListAsync();
        var banks = await _context.BankAccounts.Where(b => b.CompanyId == companyId && !b.IsDeleted).ToListAsync();
        var mpesa = await _context.MpesaAgents.Where(m => m.CompanyId == companyId && !m.IsDeleted).ToListAsync();
        var homeCur = await _context.BaseCurrencyAsync(companyId);

        var todaySummary = await _transactionService.GetTodaySummaryAsync(companyId);
        var recentTxns = await _transactionService.GetRecentAsync(companyId, 10);
        var currentRate = await _exchangeRateService.GetCurrentRateAsync(companyId);

        return new ApiResponse<DashboardStatsDto>(true, "Success", new DashboardStatsDto(
            cash.FirstOrDefault(c => c.Currency == Currency.KES)?.Balance ?? 0,
            cash.FirstOrDefault(c => c.Currency == Currency.USD)?.Balance ?? 0,
            CurrencyRollup.HomeWallets(mpesa, homeCur, opening: false),
            banks.Where(b => b.Currency == Currency.KES).Sum(b => b.Balance),
            banks.Where(b => b.Currency == Currency.USD).Sum(b => b.Balance),
            todaySummary.Data!,
            currentRate.Data,
            recentTxns.Data ?? new List<TransactionResponseDto>(),
            CurrencyRollup.CashBank(cash, banks, opening: false),
            CurrencyRollup.Wallets(mpesa, homeCur, opening: false)));
    }

    public async Task<ApiResponse<SuperAdminDashboardDto>> GetSuperAdminDashboardAsync()
    {
        var companies = await _context.Companies.ToListAsync();
        var today = BureauClock.TodayStartUtc;
        var todayTxns = await _context.Transactions.CountAsync(t => t.TransactionDate >= today && t.TransactionDate < today.AddDays(1));
        var recentErrors = await _context.SystemLogs.AsNoTracking().Where(l => l.Level == "Error" && l.ResolvedAt == null).OrderByDescending(l => l.CreatedAt).Take(10).ToListAsync();

        // PERF: aggregate counts in two grouped queries instead of 2 per company (was N+1)
        var clientCounts = await _context.Users
            .Where(u => u.Role == UserRole.Client && u.CompanyId != null)
            .GroupBy(u => u.CompanyId!.Value)
            .Select(g => new { CompanyId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.CompanyId, x => x.Count);

        var txnCounts = await _context.Transactions
            .GroupBy(t => t.CompanyId)
            .Select(g => new { CompanyId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.CompanyId, x => x.Count);

        var summaries = new List<CompanySummaryDto>();
        foreach (var c in companies)
        {
            var clientCount = clientCounts.TryGetValue(c.Id, out var cc) ? cc : 0;
            var txnCount = txnCounts.TryGetValue(c.Id, out var tc) ? tc : 0;
            summaries.Add(new CompanySummaryDto(c.Id, c.Code, c.Name, c.OwnerName, clientCount, txnCount, 0, 0, c.IsActive));
        }

        return new ApiResponse<SuperAdminDashboardDto>(true, "Success", new SuperAdminDashboardDto(
            companies.Count,
            companies.Count(c => c.IsActive),
            companies.Count(c => !c.IsActive),
            todayTxns,
            recentErrors.Select(e => new SystemLogResponseDto(e.Id, e.Level, e.Source, e.Message, e.CompanyId, e.CreatedAt, e.ResolvedAt)).ToList(),
            summaries));
    }
}