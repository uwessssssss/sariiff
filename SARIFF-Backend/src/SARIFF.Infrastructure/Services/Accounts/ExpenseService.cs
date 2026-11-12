using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public class ExpenseService : IExpenseService
{
    private readonly AppDbContext _context;
    private readonly ISystemLogService _systemLog;

    public ExpenseService(AppDbContext context, ISystemLogService systemLog)
    {
        _context = context;
        _systemLog = systemLog;
    }

    public async Task<ApiResponse<ExpenseCategoryResponseDto>> CreateCategoryAsync(Guid companyId, CreateExpenseCategoryDto dto)
    {
        var nameCheck = ValidationHelper.ValidateName(dto.Name, "Category name");
        if (!nameCheck.IsValid)
            return new ApiResponse<ExpenseCategoryResponseDto>(false, nameCheck.Error!, null);

        var descCheck = ValidationHelper.ValidateText(dto.Description, "Description", 500);
        if (!descCheck.IsValid)
            return new ApiResponse<ExpenseCategoryResponseDto>(false, descCheck.Error!, null);

        if (await _context.ExpenseCategories.AnyAsync(c => c.CompanyId == companyId && c.Name == dto.Name && !c.IsDeleted))
            return new ApiResponse<ExpenseCategoryResponseDto>(false, "Category already exists", null);

        var category = new ExpenseCategory
        {
            CompanyId = companyId,
            Name = dto.Name,
            Description = dto.Description,
            IsActive = true
        };
        
        _context.ExpenseCategories.Add(category);
        await _context.SaveChangesAsync();

        return new ApiResponse<ExpenseCategoryResponseDto>(true, "Category created",
            new ExpenseCategoryResponseDto(category.Id, category.Name, category.Description, category.IsActive, 0, 0, 0));
    }

    public async Task<ApiResponse<List<ExpenseCategoryResponseDto>>> GetCategoriesAsync(Guid companyId)
    {
        var categories = await _context.ExpenseCategories
            .Where(c => c.CompanyId == companyId && !c.IsDeleted)
            .ToListAsync();
            
        var expenses = await _context.Expenses.AsNoTracking()
            .Where(e => e.CompanyId == companyId && !e.IsDeleted)
            .ToListAsync();

        var result = categories.Select(c => new ExpenseCategoryResponseDto(
            c.Id, c.Name, c.Description, c.IsActive,
            expenses.Where(e => e.CategoryId == c.Id && e.Currency == Currency.KES).Sum(e => e.Amount),
            expenses.Where(e => e.CategoryId == c.Id && e.Currency == Currency.USD).Sum(e => e.Amount),
            expenses.Count(e => e.CategoryId == c.Id),
            expenses.Where(e => e.CategoryId == c.Id)
                .GroupBy(e => e.Currency).OrderBy(g => g.Key)
                .Select(g => new CurrencyAmountDto(g.Key, CurrencyInfo.Code(g.Key), g.Sum(e => e.Amount)))
                .ToList())).ToList();

        return new ApiResponse<List<ExpenseCategoryResponseDto>>(true, "Success", result);
    }

    public async Task<ApiResponse<ExpenseCategoryResponseDto>> UpdateCategoryAsync(Guid companyId, Guid id, UpdateExpenseCategoryDto dto)
    {
        var category = await _context.ExpenseCategories
            .FirstOrDefaultAsync(c => c.Id == id && c.CompanyId == companyId && !c.IsDeleted);
            
        if (category == null) 
            return new ApiResponse<ExpenseCategoryResponseDto>(false, "Category not found", null);

        if (dto.Name != null) category.Name = dto.Name;
        if (dto.Description != null) category.Description = dto.Description;
        if (dto.IsActive.HasValue) category.IsActive = dto.IsActive.Value;
        category.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        
        return new ApiResponse<ExpenseCategoryResponseDto>(true, "Category updated",
            new ExpenseCategoryResponseDto(category.Id, category.Name, category.Description, category.IsActive, 0, 0, 0));
    }

    public async Task<ApiResponse<bool>> DeleteCategoryAsync(Guid companyId, Guid id)
    {
        var category = await _context.ExpenseCategories
            .FirstOrDefaultAsync(c => c.Id == id && c.CompanyId == companyId && !c.IsDeleted);
            
        if (category == null) 
            return new ApiResponse<bool>(false, "Category not found", false);

        // Check for existing expenses
        var hasExpenses = await _context.Expenses
            .AnyAsync(e => e.CategoryId == id && e.CompanyId == companyId && !e.IsDeleted);
            
        if (hasExpenses)
            return new ApiResponse<bool>(false, "Cannot delete category with existing expenses", false);

        category.IsDeleted = true;
        category.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        
        return new ApiResponse<bool>(true, "Category deleted", true);
    }

    /// <summary>
    /// FIXED: Create expense with proper transaction tracking
    /// </summary>
    public async Task<ApiResponse<ExpenseResponseDto>> CreateAsync(Guid companyId, Guid userId, CreateExpenseDto dto)
    {
        // Input validation
        var validationError = ValidationHelper.FirstError(
            ValidationHelper.ValidateAmount(dto.Amount, "Expense amount"),
            ValidationHelper.ValidateText(dto.Description, "Description", 500, required: true),
            ValidationHelper.ValidateText(dto.VendorPayee, "Vendor/Payee", 255),
            ValidationHelper.ValidateText(dto.Reference, "Reference", 50)
        );
        if (validationError != null)
            return new ApiResponse<ExpenseResponseDto>(false, validationError, null);

        using var dbTransaction = await _context.Database.BeginTransactionAsync();
        
        try
        {
            var code = await CodeGenerator.GenerateExpenseCodeAsync(_context, companyId);
            var expenseDate = DateTime.SpecifyKind(dto.ExpenseDate, DateTimeKind.Utc);

            // Get category name
            var category = await _context.ExpenseCategories.FindAsync(dto.CategoryId);
            if (category == null || category.CompanyId != companyId)
                return new ApiResponse<ExpenseResponseDto>(false, "Invalid category", null);

            var categoryName = category.Name;

            // Get payment account and validate
            decimal balanceBefore = 0;
            Guid paymentAccountId = dto.PaymentAccountId;

            switch (dto.PaymentAccountType)
            {
                case AccountType.Cash:
                    var cash = await _context.CashAccounts.FirstOrDefaultAsync(c =>
                        c.CompanyId == companyId && c.Currency == dto.Currency && !c.IsDeleted);
                    if (cash == null)
                        return new ApiResponse<ExpenseResponseDto>(false, $"No cash account found for {dto.Currency}", null);
                    balanceBefore = cash.Balance;
                    paymentAccountId = cash.Id;
                    
                    // Check sufficient balance
                    if (cash.Balance < dto.Amount)
                        return new ApiResponse<ExpenseResponseDto>(false, 
                            $"Insufficient balance. Available: {dto.Currency} {cash.Balance:N2}", null);
                    
                    cash.Balance -= dto.Amount;
                    break;

                case AccountType.Bank:
                    var bank = await _context.BankAccounts.FirstOrDefaultAsync(b =>
                        b.Id == dto.PaymentAccountId && b.CompanyId == companyId && !b.IsDeleted);
                    if (bank == null)
                        return new ApiResponse<ExpenseResponseDto>(false, "Bank account not found", null);
                    if (bank.Currency != dto.Currency)
                        return new ApiResponse<ExpenseResponseDto>(false, "Currency mismatch with bank account", null);
                    balanceBefore = bank.Balance;
                    
                    if (bank.Balance < dto.Amount)
                        return new ApiResponse<ExpenseResponseDto>(false, 
                            $"Insufficient balance. Available: {dto.Currency} {bank.Balance:N2}", null);
                    
                    bank.Balance -= dto.Amount;
                    break;

                case AccountType.Mpesa:
                    var mpesa = await _context.MpesaAgents.FirstOrDefaultAsync(m =>
                        m.Id == dto.PaymentAccountId && m.CompanyId == companyId && !m.IsDeleted);
                    if (mpesa == null)
                        return new ApiResponse<ExpenseResponseDto>(false, "Mobile money agent not found", null);
                    var mobileCurrency = MobileMoney.CurrencyOf(mpesa, await _context.BaseCurrencyAsync(companyId));
                    if (dto.Currency != mobileCurrency)
                        return new ApiResponse<ExpenseResponseDto>(false, $"{mpesa.AgentName} holds {mobileCurrency}, not {dto.Currency}", null);
                    balanceBefore = mpesa.Balance;
                    
                    if (mpesa.Balance < dto.Amount)
                        return new ApiResponse<ExpenseResponseDto>(false, 
                            $"Insufficient balance. Available: {mobileCurrency} {mpesa.Balance:N2}", null);
                    
                    mpesa.Balance -= dto.Amount;
                    break;

                default:
                    return new ApiResponse<ExpenseResponseDto>(false, "Invalid payment account type", null);
            }

            decimal balanceAfter = balanceBefore - dto.Amount;

            // Create transaction code
            var txnCode = await CodeGenerator.GenerateTransactionCodeAsync(_context, companyId);

            // Create transaction record (Credit = money going OUT of payment account)
            var transaction = new Transaction
            {
                CompanyId = companyId,
                Code = txnCode,
                Reference = $"EXP-{code}",
                TransactionType = TransactionType.Credit, // Credit = money out
                TransactionDate = expenseDate,
                Description = $"Expense: {categoryName} - {dto.Description}",
                Notes = $"Vendor: {dto.VendorPayee ?? "N/A"} | Expense Code: {code}",
                Currency = dto.Currency,
                Amount = dto.Amount,
                // Source = Payment Account (where money comes FROM)
                SourceAccountType = dto.PaymentAccountType,
                SourceAccountId = paymentAccountId,
                SourceBalanceBefore = balanceBefore,
                SourceBalanceAfter = balanceAfter,
                // FIX #2: Dest = Expense category (proper double-entry, NOT same as source)
                DestAccountType = AccountType.Expense,
                DestAccountId = dto.CategoryId, // Expense category is the logical destination
                DestBalanceBefore = 0,
                DestBalanceAfter = dto.Amount,
                CreatedByUserId = userId,
                ReconciliationStatus = ReconciliationStatus.Pending
            };

            _context.Transactions.Add(transaction);

            // Create expense record
            var expense = new Expense
            {
                CompanyId = companyId,
                Code = code,
                CategoryId = dto.CategoryId,
                Description = dto.Description,
                VendorPayee = dto.VendorPayee,
                Amount = dto.Amount,
                Currency = dto.Currency,
                PaymentMethod = dto.PaymentMethod,
                PaymentAccountType = dto.PaymentAccountType,
                PaymentAccountId = paymentAccountId,
                Reference = dto.Reference,
                ExpenseDate = expenseDate,
                CreatedByUserId = userId,
                TransactionId = transaction.Id // Link to transaction
            };

            _context.Expenses.Add(expense);
            await _context.SaveChangesAsync();
            await dbTransaction.CommitAsync();

            return new ApiResponse<ExpenseResponseDto>(true, "Expense recorded successfully", new ExpenseResponseDto(
                expense.Id, expense.Code, expense.CategoryId, categoryName, expense.Description, expense.VendorPayee,
                expense.Amount, expense.Currency, expense.PaymentMethod, dto.PaymentAccountType.ToString(),
                expense.Reference, expense.ExpenseDate, expense.CreatedAt));
        }
        catch (Exception ex)
        {
            await dbTransaction.RollbackAsync();
            await _systemLog.LogExpenseErrorAsync(companyId, $"Failed to create expense: {ex.Message}", userId);
            return new ApiResponse<ExpenseResponseDto>(false, "Failed to create expense. Please try again.", null);
        }
    }

    public async Task<ApiResponse<ExpenseResponseDto>> GetByIdAsync(Guid companyId, Guid id)
    {
        var expense = await _context.Expenses
            .FirstOrDefaultAsync(e => e.Id == id && e.CompanyId == companyId && !e.IsDeleted);
            
        if (expense == null) 
            return new ApiResponse<ExpenseResponseDto>(false, "Expense not found", null);

        var category = await _context.ExpenseCategories.FindAsync(expense.CategoryId);
        
        return new ApiResponse<ExpenseResponseDto>(true, "Success", new ExpenseResponseDto(
            expense.Id, expense.Code, expense.CategoryId, category?.Name ?? "Unknown", expense.Description,
            expense.VendorPayee, expense.Amount, expense.Currency, expense.PaymentMethod, 
            expense.PaymentAccountType.ToString(), expense.Reference, expense.ExpenseDate, expense.CreatedAt));
    }

    public async Task<ApiResponse<PagedResult<ExpenseResponseDto>>> GetAllAsync(Guid companyId, int page, int pageSize, ReportFilterDto? filter = null)
    {
        var query = _context.Expenses.Where(e => e.CompanyId == companyId && !e.IsDeleted);
        
        // Expense dates are calendar dates: compare whole days, end day included.
        if (filter?.StartDate.HasValue == true) { var from = filter.StartDate.Value.Date; query = query.Where(e => e.ExpenseDate >= from); }
        if (filter?.EndDate.HasValue == true) { var toEx = filter.EndDate.Value.Date.AddDays(1); query = query.Where(e => e.ExpenseDate < toEx); }
        if (filter?.Currency.HasValue == true) query = query.Where(e => e.Currency == filter.Currency.Value);

        var totalCount = await query.CountAsync();
        var expenses = await query
            .OrderByDescending(e => e.ExpenseDate)
            .ThenByDescending(e => e.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
            
        var categories = await _context.ExpenseCategories
            .Where(c => c.CompanyId == companyId)
            .ToDictionaryAsync(c => c.Id, c => c.Name);

        var items = expenses.Select(e => new ExpenseResponseDto(
            e.Id, e.Code, e.CategoryId, categories.GetValueOrDefault(e.CategoryId, "Unknown"), e.Description,
            e.VendorPayee, e.Amount, e.Currency, e.PaymentMethod, e.PaymentAccountType.ToString(), 
            e.Reference, e.ExpenseDate, e.CreatedAt)).ToList();

        return new ApiResponse<PagedResult<ExpenseResponseDto>>(true, "Success",
            new PagedResult<ExpenseResponseDto>(items, totalCount, page, pageSize));
    }

    public async Task<ApiResponse<ExpenseStatsDto>> GetStatsAsync(Guid companyId)
    {
        var expenses = await _context.Expenses.AsNoTracking()
            .Where(e => e.CompanyId == companyId && !e.IsDeleted)
            .ToListAsync();
            
        var categories = await _context.ExpenseCategories
            .CountAsync(c => c.CompanyId == companyId && c.IsActive && !c.IsDeleted);
            
        var thisMonth = BureauClock.TodayLocal.Month;
        var thisYear = BureauClock.TodayLocal.Year;

        return new ApiResponse<ExpenseStatsDto>(true, "Success", new ExpenseStatsDto(
            expenses.Where(e => e.Currency == Currency.KES).Sum(e => e.Amount),
            expenses.Where(e => e.Currency == Currency.USD).Sum(e => e.Amount),
            expenses.Where(e => e.Currency == Currency.KES && e.ExpenseDate.Month == thisMonth && e.ExpenseDate.Year == thisYear).Sum(e => e.Amount),
            expenses.Where(e => e.Currency == Currency.USD && e.ExpenseDate.Month == thisMonth && e.ExpenseDate.Year == thisYear).Sum(e => e.Amount),
            categories,
            expenses.GroupBy(e => e.Currency).OrderBy(g => g.Key)
                .Select(g => new CurrencyExpenseTotalsDto(g.Key, CurrencyInfo.Code(g.Key),
                    g.Sum(e => e.Amount),
                    g.Where(e => e.ExpenseDate.Month == thisMonth && e.ExpenseDate.Year == thisYear).Sum(e => e.Amount)))
                .ToList()));
    }

    /// <summary>
    /// FIXED: Update expense with proper transaction handling
    /// Note: Only description, vendor, and reference can be updated
    /// Amount changes require delete + recreate for proper audit trail
    /// </summary>
    public async Task<ApiResponse<ExpenseResponseDto>> UpdateAsync(Guid companyId, Guid id, UpdateExpenseDto dto)
    {
        var expense = await _context.Expenses
            .FirstOrDefaultAsync(e => e.Id == id && e.CompanyId == companyId && !e.IsDeleted);

        if (expense == null)
            return new ApiResponse<ExpenseResponseDto>(false, "Expense not found", null);

        // SECURITY: Do not allow amount changes through update
        // Amount changes would corrupt the transaction chain
        // User must delete and recreate expense for amount changes
        if (dto.Amount.HasValue && dto.Amount.Value != expense.Amount)
        {
            return new ApiResponse<ExpenseResponseDto>(false, 
                "Amount cannot be changed. Please delete and recreate the expense for amount changes.", null);
        }

        // Update allowed fields only
        if (dto.Description != null) expense.Description = dto.Description;
        if (dto.VendorPayee != null) expense.VendorPayee = dto.VendorPayee;
        if (dto.Reference != null) expense.Reference = dto.Reference;
        expense.UpdatedAt = DateTime.UtcNow;

        // Update linked transaction description
        if (expense.TransactionId.HasValue)
        {
            var transaction = await _context.Transactions.FindAsync(expense.TransactionId.Value);
            if (transaction != null)
            {
                var category = await _context.ExpenseCategories.FindAsync(expense.CategoryId);
                transaction.Description = $"Expense: {category?.Name ?? "Unknown"} - {expense.Description}";
                transaction.Notes = $"Vendor: {expense.VendorPayee ?? "N/A"} | Expense Code: {expense.Code}";
                transaction.UpdatedAt = DateTime.UtcNow;
            }
        }

        await _context.SaveChangesAsync();

        var cat = await _context.ExpenseCategories.FindAsync(expense.CategoryId);
        return new ApiResponse<ExpenseResponseDto>(true, "Expense updated", new ExpenseResponseDto(
            expense.Id, expense.Code, expense.CategoryId, cat?.Name ?? "Unknown", expense.Description,
            expense.VendorPayee, expense.Amount, expense.Currency, expense.PaymentMethod, 
            expense.PaymentAccountType.ToString(), expense.Reference, expense.ExpenseDate, expense.CreatedAt));
    }

    /// <summary>
    /// FIXED: Delete expense using proper accounting reversal
    /// Creates a reversal transaction instead of just restoring balance
    /// </summary>
    public async Task<ApiResponse<bool>> DeleteAsync(Guid companyId, Guid id, Guid userId)
    {
        using var dbTransaction = await _context.Database.BeginTransactionAsync();
        
        try
        {
            var expense = await _context.Expenses
                .FirstOrDefaultAsync(e => e.Id == id && e.CompanyId == companyId && !e.IsDeleted);

            if (expense == null)
                return new ApiResponse<bool>(false, "Expense not found", false);

            // Get current balance of payment account
            decimal currentBalance = 0;
            Guid paymentAccountId = expense.PaymentAccountId;

            switch (expense.PaymentAccountType)
            {
                case AccountType.Cash:
                    var cash = await _context.CashAccounts.FirstOrDefaultAsync(c =>
                        c.CompanyId == companyId && c.Currency == expense.Currency && !c.IsDeleted);
                    if (cash != null)
                    {
                        currentBalance = cash.Balance;
                        paymentAccountId = cash.Id;
                        cash.Balance += expense.Amount; // Reverse: add back
                    }
                    break;

                case AccountType.Bank:
                    var bank = await _context.BankAccounts.FirstOrDefaultAsync(b =>
                        b.Id == expense.PaymentAccountId && b.CompanyId == companyId && !b.IsDeleted);
                    if (bank != null)
                    {
                        currentBalance = bank.Balance;
                        bank.Balance += expense.Amount; // Reverse: add back
                    }
                    break;

                case AccountType.Mpesa:
                    var mpesa = await _context.MpesaAgents.FirstOrDefaultAsync(m =>
                        m.Id == expense.PaymentAccountId && m.CompanyId == companyId && !m.IsDeleted);
                    if (mpesa != null)
                    {
                        currentBalance = mpesa.Balance;
                        mpesa.Balance += expense.Amount; // Reverse: add back
                    }
                    break;
            }

            decimal newBalance = currentBalance + expense.Amount;

            // Create reversal transaction
            var reversalCode = await CodeGenerator.GenerateTransactionCodeAsync(_context, companyId);
            var category = await _context.ExpenseCategories.FindAsync(expense.CategoryId);

            var reversalTransaction = new Transaction
            {
                CompanyId = companyId,
                Code = reversalCode,
                Reference = $"REV-EXP-{expense.Code}",
                // FIXED: Reversal is the mirror of original.
                // Original: Source=Bank, Type=Credit (money OUT)
                // Reversal: Source=Bank, Type=Debit (money BACK IN)
                TransactionType = TransactionType.Debit,
                TransactionDate = DateTime.UtcNow,
                Description = $"REVERSAL: Expense {category?.Name ?? "Unknown"} - {expense.Description}",
                Notes = $"Reversal of expense {expense.Code}",
                Currency = expense.Currency,
                Amount = expense.Amount,
                SourceAccountType = expense.PaymentAccountType,
                SourceAccountId = paymentAccountId,
                SourceBalanceBefore = currentBalance,
                SourceBalanceAfter = newBalance,
                DestAccountType = AccountType.Expense,
                DestAccountId = expense.CategoryId,
                DestBalanceBefore = 0,
                DestBalanceAfter = 0,
                CreatedByUserId = userId,
                ReconciliationStatus = ReconciliationStatus.Matched
            };

            _context.Transactions.Add(reversalTransaction);

            // Soft delete the expense record (this is fine — expenses have their own list)
            expense.IsDeleted = true;
            expense.UpdatedAt = DateTime.UtcNow;

            // Mark original transaction as REVERSED — but keep it visible in statements
            // (same approach as TransactionService.DeleteAsync — Fix T)
            if (expense.TransactionId.HasValue)
            {
                var originalTransaction = await _context.Transactions.FindAsync(expense.TransactionId.Value);
                if (originalTransaction != null)
                {
                    // Do NOT set IsDeleted = true — that hides it from statements
                    originalTransaction.DeletedByUserId = userId;
                    originalTransaction.DeletedAt = DateTime.UtcNow;
                    originalTransaction.DeleteReason = "Expense deleted";
                    originalTransaction.Description = $"[REVERSED] {originalTransaction.Description}";
                    originalTransaction.Notes = (originalTransaction.Notes ?? "") + $" [Reversed by: {reversalCode}]";
                    originalTransaction.UpdatedAt = DateTime.UtcNow;
                }
            }

            await _context.SaveChangesAsync();
            await dbTransaction.CommitAsync();

            await _systemLog.LogInfoAsync("ExpenseService", 
                $"Expense {expense.Code} deleted and reversed. Reversal: {reversalCode}", companyId, userId);

            return new ApiResponse<bool>(true, $"Expense deleted and reversed. Reversal code: {reversalCode}", true);
        }
        catch (Exception ex)
        {
            await dbTransaction.RollbackAsync();
            await _systemLog.LogExpenseErrorAsync(companyId, $"Failed to delete expense: {ex.Message}", userId);
            return new ApiResponse<bool>(false, "Failed to delete expense. Please try again.", false);
        }
    }
}
