using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

// =====================================================
// BANK ACCOUNT SERVICE - FIXED
// Change: NetMovement = OpeningBalance + Credits - Debits
// =====================================================
public class BankAccountService : IBankAccountService
{
    private readonly AppDbContext _context;
    private readonly StatementHelper _statementHelper;

    public BankAccountService(AppDbContext context)
    {
        _context = context;
        _statementHelper = new StatementHelper(context);
    }

    public async Task<ApiResponse<BankAccountResponseDto>> CreateAsync(Guid companyId, CreateBankAccountDto dto)
    {
        // Country rule: no NEW holdings in a currency the bureau's country doesn't use (UGX in Kenya).
        var currencyBlock = await _context.CurrencyNotAllowedAsync(companyId, dto.Currency);
        if (currencyBlock != null)
            return new ApiResponse<BankAccountResponseDto>(false, currencyBlock, null);

        // Input validation
        var validationError = ValidationHelper.FirstError(
            ValidationHelper.ValidateName(dto.BankName, "Bank name"),
            ValidationHelper.ValidateAccountNumber(dto.AccountNumber, "Account number"),
            ValidationHelper.ValidateName(dto.AccountName, "Account name"),
            ValidationHelper.ValidateAmount(dto.OpeningBalance, "Opening balance", allowZero: true)
        );
        if (validationError != null)
            return new ApiResponse<BankAccountResponseDto>(false, validationError, null);

        if (await _context.BankAccounts.AnyAsync(b => b.CompanyId == companyId && b.AccountNumber == dto.AccountNumber && !b.IsDeleted))
            return new ApiResponse<BankAccountResponseDto>(false, "Account number already exists", null);

        const int maxRetries = 3;
        for (int attempt = 0; attempt < maxRetries; attempt++)
        {
            var code = await CodeGenerator.GenerateBankAccountCodeAsync(_context, companyId);
            var account = new BankAccount
            {
                CompanyId = companyId,
                Code = code,
                BankName = dto.BankName,
                AccountNumber = dto.AccountNumber,
                AccountName = dto.AccountName,
                BranchCode = dto.BranchCode,
                Currency = dto.Currency,
                Balance = dto.OpeningBalance,
                OpeningBalance = dto.OpeningBalance,
                IsActive = true
            };

            try
            {
                _context.BankAccounts.Add(account);
                await _context.SaveChangesAsync();
                return new ApiResponse<BankAccountResponseDto>(true, "Bank account created", await MapToResponseAsync(companyId, account));
            }
            catch (DbUpdateException) when (attempt < maxRetries - 1)
            {
                _context.Entry(account).State = EntityState.Detached;
                await Task.Delay(50 * (attempt + 1));
            }
        }
        return new ApiResponse<BankAccountResponseDto>(false, "Failed to generate unique code. Please try again.", null);
    }

    public async Task<ApiResponse<BankAccountResponseDto>> GetByIdAsync(Guid companyId, Guid id)
    {
        var account = await _context.BankAccounts.FirstOrDefaultAsync(b => b.Id == id && b.CompanyId == companyId && !b.IsDeleted);
        if (account == null)
            return new ApiResponse<BankAccountResponseDto>(false, "Bank account not found", null);
        return new ApiResponse<BankAccountResponseDto>(true, "Success", await MapToResponseAsync(companyId, account));
    }

    public async Task<ApiResponse<List<BankAccountResponseDto>>> GetAllAsync(Guid companyId)
    {
        var accounts = await _context.BankAccounts.Where(b => b.CompanyId == companyId && !b.IsDeleted).ToListAsync();
        var result = new List<BankAccountResponseDto>();
        foreach (var account in accounts)
        {
            result.Add(await MapToResponseAsync(companyId, account));
        }
        return new ApiResponse<List<BankAccountResponseDto>>(true, "Success", result);
    }

    public async Task<ApiResponse<BankAccountResponseDto>> UpdateAsync(Guid companyId, Guid id, UpdateBankAccountDto dto)
    {
        var account = await _context.BankAccounts.FirstOrDefaultAsync(b => b.Id == id && b.CompanyId == companyId && !b.IsDeleted);
        if (account == null)
            return new ApiResponse<BankAccountResponseDto>(false, "Bank account not found", null);

        if (dto.BankName != null)
        {
            var check = ValidationHelper.ValidateName(dto.BankName, "Bank name");
            if (!check.IsValid) return new ApiResponse<BankAccountResponseDto>(false, check.Error!, null);
            account.BankName = dto.BankName;
        }
        if (dto.AccountName != null)
        {
            var check = ValidationHelper.ValidateName(dto.AccountName, "Account name");
            if (!check.IsValid) return new ApiResponse<BankAccountResponseDto>(false, check.Error!, null);
            account.AccountName = dto.AccountName;
        }
        if (dto.BranchCode != null) account.BranchCode = dto.BranchCode;
        if (dto.IsActive.HasValue) account.IsActive = dto.IsActive.Value;
        account.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return new ApiResponse<BankAccountResponseDto>(true, "Bank account updated", await MapToResponseAsync(companyId, account));
    }

    public async Task<ApiResponse<bool>> DeleteAsync(Guid companyId, Guid id)
    {
        var account = await _context.BankAccounts.FirstOrDefaultAsync(b => b.Id == id && b.CompanyId == companyId && !b.IsDeleted);
        if (account == null)
            return new ApiResponse<bool>(false, "Bank account not found", false);

        // Check if there are any transactions using this account
        var hasTransactions = await _context.Transactions
            .AnyAsync(t => t.CompanyId == companyId && !t.IsDeleted &&
                ((t.SourceAccountType == AccountType.Bank && t.SourceAccountId == id) ||
                 (t.DestAccountType == AccountType.Bank && t.DestAccountId == id)));

        if (hasTransactions)
            return new ApiResponse<bool>(false,
                "Cannot delete bank account with existing transactions. Please delete or reverse all transactions first.", false);

        account.IsDeleted = true;
        account.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return new ApiResponse<bool>(true, "Bank account deleted", true);
    }

    public async Task<ApiResponse<BankAccountStatsDto>> GetStatsAsync(Guid companyId)
    {
        var accounts = await _context.BankAccounts.Where(b => b.CompanyId == companyId && !b.IsDeleted).ToListAsync();
        var accountIds = accounts.Select(a => a.Id).ToList();
        
        // Debit/credit per account computed in SQL (never loads the transaction rows).
        var totalsByAccount = await _statementHelper.TotalsByAccountAsync(companyId, AccountType.Bank, accountIds);

        // Totals per account currency. Each bank account holds ONE currency;
        // UGX/EUR accounts get their own bucket (they used to be added to USD).
        var perCurrency = new Dictionary<Currency, (decimal Debit, decimal Credit, decimal Opening, decimal Balance)>();

        foreach (var account in accounts)
        {
            var perCur = totalsByAccount.TryGetValue(account.Id, out var pc) ? pc : new();
            var debit = perCur.Values.Sum(v => v.Debit);
            var credit = perCur.Values.Sum(v => v.Credit);

            perCurrency.TryGetValue(account.Currency, out var t);
            perCurrency[account.Currency] = (t.Debit + debit, t.Credit + credit, t.Opening + account.OpeningBalance, t.Balance + account.Balance);
        }

        perCurrency.TryGetValue(Currency.KES, out var kes);
        perCurrency.TryGetValue(Currency.USD, out var usd);
        decimal totalDebitKES = kes.Debit, totalCreditKES = kes.Credit, openingBalanceKES = kes.Opening;
        decimal totalDebitUSD = usd.Debit, totalCreditUSD = usd.Credit, openingBalanceUSD = usd.Opening;

        var byCurrency = perCurrency.OrderBy(p => p.Key)
            .Select(p => new CurrencyAccountTotalsDto(p.Key, CurrencyInfo.Code(p.Key),
                p.Value.Balance, p.Value.Opening, p.Value.Debit, p.Value.Credit,
                p.Value.Opening + p.Value.Debit - p.Value.Credit))
            .ToList();

        // ✅ FIXED: NetMovement = OpeningBalance + Credits - Debits
        var stats = new BankAccountStatsDto(
            TotalAccounts: accounts.Count,
            TotalBalanceKES: accounts.Where(a => a.Currency == Currency.KES).Sum(a => a.Balance),
            TotalBalanceUSD: accounts.Where(a => a.Currency == Currency.USD).Sum(a => a.Balance),
            TotalDebitKES: totalDebitKES,
            TotalCreditKES: totalCreditKES,
            NetMovementKES: openingBalanceKES + totalDebitKES - totalCreditKES,
            TotalDebitUSD: totalDebitUSD,
            TotalCreditUSD: totalCreditUSD,
            NetMovementUSD: openingBalanceUSD + totalDebitUSD - totalCreditUSD,
            ByCurrency: byCurrency
        );

        return new ApiResponse<BankAccountStatsDto>(true, "Success", stats);
    }

    public async Task<ApiResponse<StatementDto>> GetStatementAsync(Guid companyId, Guid id, StatementFilterDto filter)
    {
        var account = await _context.BankAccounts.FirstOrDefaultAsync(b => b.Id == id && b.CompanyId == companyId && !b.IsDeleted);
        if (account == null)
            return new ApiResponse<StatementDto>(false, "Bank account not found", null);

        var history = _context.Transactions.Where(t => t.CompanyId == companyId && !t.IsDeleted &&
            ((t.SourceAccountType == AccountType.Bank && t.SourceAccountId == id) ||
             (t.DestAccountType == AccountType.Bank && t.DestAccountId == id)));

        var statement = await _statementHelper.BuildPeriodStatementAsync(
            history, AccountType.Bank, id, $"{account.BankName} - {account.AccountNumber}", account.Code,
            account.Currency, account.OpeningBalance, filter);
        return new ApiResponse<StatementDto>(true, "Success", statement);
    }

    private async Task<BankAccountResponseDto> MapToResponseAsync(Guid companyId, BankAccount account)
    {
        var (totalDebit, totalCredit) = await _statementHelper.TotalsForAccountAsync(companyId, AccountType.Bank, account.Id);

        // ✅ FIXED: NetMovement = OpeningBalance + Credits - Debits
        return new BankAccountResponseDto(
            account.Id, account.Code, account.BankName, account.AccountNumber, account.AccountName, account.BranchCode,
            account.Currency, account.Balance, account.OpeningBalance,
            totalDebit, totalCredit, account.OpeningBalance + totalDebit-totalCredit,
            account.IsActive, account.CreatedAt
        );
    }
}
