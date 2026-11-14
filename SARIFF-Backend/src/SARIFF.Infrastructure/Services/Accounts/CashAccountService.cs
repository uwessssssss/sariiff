using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

public class CashAccountService : ICashAccountService
{
    private readonly AppDbContext _context;
    private readonly StatementHelper _statementHelper;

    public CashAccountService(AppDbContext context)
    {
        _context = context;
        _statementHelper = new StatementHelper(context);
    }

    /// <summary>
    /// NEW: Create a cash account with opening balance
    /// </summary>
    public async Task<ApiResponse<CashAccountResponseDto>> CreateAsync(Guid companyId, CreateCashAccountDto dto)
    {
        // A drawer can't open holding less than nothing.
        var openingCheck = ValidationHelper.ValidateAmount(dto.OpeningBalance, "Opening balance", allowZero: true);
        if (!openingCheck.IsValid)
            return new ApiResponse<CashAccountResponseDto>(false, openingCheck.Error!, null);

        // Country rule: no NEW holdings in a currency the bureau's country doesn't use (UGX in Kenya).
        var currencyBlock = await _context.CurrencyNotAllowedAsync(companyId, dto.Currency);
        if (currencyBlock != null)
            return new ApiResponse<CashAccountResponseDto>(false, currencyBlock, null);

        // Check if cash account for this currency already exists
        var existing = await _context.CashAccounts
            .FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Currency == dto.Currency && !c.IsDeleted);

        if (existing != null)
        {
            return new ApiResponse<CashAccountResponseDto>(false, 
                $"Cash account for {dto.Currency} already exists. Use update to change opening balance.", null);
        }

        var account = new CashAccount
        {
            CompanyId = companyId,
            Currency = dto.Currency,
            Balance = dto.OpeningBalance,
            OpeningBalance = dto.OpeningBalance,
            Code = $"CASH-{dto.Currency}",  // FIX #5: Set Code to avoid NULL constraint
            IsActive = true                  // FIX #4: Now correctly typed as bool
        };

        _context.CashAccounts.Add(account);
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Another request created it a moment ago (unique company+currency index).
            _context.Entry(account).State = EntityState.Detached;
            return new ApiResponse<CashAccountResponseDto>(false,
                $"Cash account for {dto.Currency} already exists. Use update to change opening balance.", null);
        }

        return new ApiResponse<CashAccountResponseDto>(true, "Cash account created", 
            await MapToResponseAsync(companyId, account));
    }

    /// <summary>
    /// NEW: Get a specific cash account by ID
    /// </summary>
    public async Task<ApiResponse<CashAccountResponseDto>> GetByIdAsync(Guid companyId, Guid id)
    {
        var account = await _context.CashAccounts
            .FirstOrDefaultAsync(c => c.Id == id && c.CompanyId == companyId && !c.IsDeleted);

        if (account == null)
            return new ApiResponse<CashAccountResponseDto>(false, "Cash account not found", null);

        return new ApiResponse<CashAccountResponseDto>(true, "Success", 
            await MapToResponseAsync(companyId, account));
    }

    /// <summary>
    /// NEW: Get cash account by currency
    /// </summary>
    public async Task<ApiResponse<CashAccountResponseDto>> GetByCurrencyAsync(Guid companyId, Currency currency)
    {
        var account = await _context.CashAccounts
            .FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Currency == currency && !c.IsDeleted);

        if (account == null)
            return new ApiResponse<CashAccountResponseDto>(false, $"Cash account for {currency} not found", null);

        return new ApiResponse<CashAccountResponseDto>(true, "Success", 
            await MapToResponseAsync(companyId, account));
    }

    public async Task<ApiResponse<List<CashAccountResponseDto>>> GetAllAsync(Guid companyId)
    {
        var accounts = await _context.CashAccounts
            .Where(c => c.CompanyId == companyId && !c.IsDeleted)
            .ToListAsync();

        var result = new List<CashAccountResponseDto>();

        foreach (var account in accounts)
        {
            result.Add(await MapToResponseAsync(companyId, account));
        }

        return new ApiResponse<List<CashAccountResponseDto>>(true, "Success", result);
    }

    /// <summary>
    /// NEW: Update cash account opening balance
    /// 
    /// IMPORTANT: This recalculates the current balance based on:
    /// NewBalance = NewOpeningBalance + TotalDebits - TotalCredits
    /// </summary>
    public async Task<ApiResponse<CashAccountResponseDto>> UpdateAsync(Guid companyId, Guid id, UpdateCashAccountDto dto)
    {
        var account = await _context.CashAccounts
            .FirstOrDefaultAsync(c => c.Id == id && c.CompanyId == companyId && !c.IsDeleted);

        if (account == null)
            return new ApiResponse<CashAccountResponseDto>(false, "Cash account not found", null);

        if (dto.OpeningBalance.HasValue)
        {
            var check = ValidationHelper.ValidateAmount(dto.OpeningBalance.Value, "Opening balance", allowZero: true);
            if (!check.IsValid)
                return new ApiResponse<CashAccountResponseDto>(false, check.Error!, null);

            var oldOpeningBalance = account.OpeningBalance;
            var newOpeningBalance = dto.OpeningBalance.Value;
            var difference = newOpeningBalance - oldOpeningBalance;

            // Lowering the opening balance can't leave the drawer holding less than nothing.
            if (account.Balance + difference < 0)
                return new ApiResponse<CashAccountResponseDto>(false,
                    $"Can't set the opening balance to {newOpeningBalance:N2}: cash on hand would go below zero ({account.Balance + difference:N2}).", null);

            // Adjust current balance by the same difference. The statement starts from the
            // opening balance, so it stays consistent; the change itself is recorded in the
            // audit log because it restates every balance shown since the account opened.
            var oldBalance = account.Balance;
            account.OpeningBalance = newOpeningBalance;
            account.Balance += difference;
            account.UpdatedAt = DateTime.UtcNow;

            if (difference != 0)
                _context.AuditLogs.Add(new AuditLog
                {
                    CompanyId = companyId,
                    Action = AuditAction.Update,
                    EntityType = "CashAccount.OpeningBalance",
                    EntityId = account.Id,
                    OldValues = $"{{\"currency\":\"{account.Currency}\",\"openingBalance\":{oldOpeningBalance},\"balance\":{oldBalance}}}",
                    NewValues = $"{{\"currency\":\"{account.Currency}\",\"openingBalance\":{newOpeningBalance},\"balance\":{account.Balance}}}",
                });
        }

        await _context.SaveChangesAsync();

        return new ApiResponse<CashAccountResponseDto>(true, "Cash account updated", 
            await MapToResponseAsync(companyId, account));
    }

    /// <summary>
    /// NEW: Soft delete cash account
    /// </summary>
    public async Task<ApiResponse<bool>> DeleteAsync(Guid companyId, Guid id)
    {
        var account = await _context.CashAccounts
            .FirstOrDefaultAsync(c => c.Id == id && c.CompanyId == companyId && !c.IsDeleted);

        if (account == null)
            return new ApiResponse<bool>(false, "Cash account not found", false);

        // Check if there are any transactions using this account
        var hasTransactions = await _context.Transactions
            .AnyAsync(t => t.CompanyId == companyId && !t.IsDeleted &&
                ((t.SourceAccountType == AccountType.Cash && t.Currency == account.Currency) ||
                 (t.DestAccountType == AccountType.Cash && (t.CounterCurrency ?? t.Currency) == account.Currency)));

        if (hasTransactions)
        {
            return new ApiResponse<bool>(false, 
                "Cannot delete cash account with existing transactions. Please delete or reverse all transactions first.", false);
        }

        account.IsDeleted = true;
        account.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return new ApiResponse<bool>(true, "Cash account deleted", true);
    }

    public async Task<ApiResponse<CashStatsDto>> GetStatsAsync(Guid companyId)
    {
        var accounts = await _context.CashAccounts
            .Where(c => c.CompanyId == companyId && !c.IsDeleted)
            .ToListAsync();

        var kesAccount = accounts.FirstOrDefault(a => a.Currency == Currency.KES);
        var usdAccount = accounts.FirstOrDefault(a => a.Currency == Currency.USD);

        var (debitKES, creditKES) = await CalculateCashTotalsAsync(companyId, Currency.KES);
        var (debitUSD, creditUSD) = await CalculateCashTotalsAsync(companyId, Currency.USD);

        var openingKES = kesAccount?.OpeningBalance ?? 0;
        var openingUSD = usdAccount?.OpeningBalance ?? 0;

        // Every cash currency the company holds (KES, USD, UGX, EUR, ...)
        var byCurrency = new List<CurrencyAccountTotalsDto>();
        foreach (var acc in accounts.OrderBy(a => a.Currency))
        {
            var (d, c) = acc.Currency == Currency.KES ? (debitKES, creditKES)
                : acc.Currency == Currency.USD ? (debitUSD, creditUSD)
                : await CalculateCashTotalsAsync(companyId, acc.Currency);
            byCurrency.Add(new CurrencyAccountTotalsDto(acc.Currency, CurrencyInfo.Code(acc.Currency),
                acc.Balance, acc.OpeningBalance, d, c, acc.OpeningBalance + d - c));
        }

        // FIXED: Consistent NetMovement calculation
        // For ASSET accounts: NetMovement = OpeningBalance + Debits - Credits
        return new ApiResponse<CashStatsDto>(true, "Success", new CashStatsDto(
            BalanceKES: kesAccount?.Balance ?? 0,
            OpeningBalanceKES: openingKES,
            TotalDebitKES: debitKES,
            TotalCreditKES: creditKES,
            NetMovementKES: openingKES + debitKES - creditKES,
            BalanceUSD: usdAccount?.Balance ?? 0,
            OpeningBalanceUSD: openingUSD,
            TotalDebitUSD: debitUSD,
            TotalCreditUSD: creditUSD,
            NetMovementUSD: openingUSD + debitUSD - creditUSD,
            ByCurrency: byCurrency
        ));
    }

    public async Task<ApiResponse<StatementDto>> GetStatementAsync(Guid companyId, Currency currency, StatementFilterDto filter)
    {
        var account = await _context.CashAccounts
            .FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Currency == currency && !c.IsDeleted);

        if (account == null)
            return new ApiResponse<StatementDto>(false, "Cash account not found", null);

        var history = _context.Transactions.Where(t => t.CompanyId == companyId && !t.IsDeleted &&
            ((t.SourceAccountType == AccountType.Cash && t.Currency == currency) ||
             (t.DestAccountType == AccountType.Cash && (t.CounterCurrency ?? t.Currency) == currency)));

        var statement = await _statementHelper.BuildPeriodStatementAsync(
            history, AccountType.Cash, account.Id, $"Cash {currency}", $"CASH-{currency}",
            currency, account.OpeningBalance, filter);
        return new ApiResponse<StatementDto>(true, "Success", statement);
    }

    private async Task<(decimal debit, decimal credit)> CalculateCashTotalsAsync(Guid companyId, Currency currency)
    {
        return await _statementHelper.CashTotalsAsync(companyId, currency);
    }

    private async Task<CashAccountResponseDto> MapToResponseAsync(Guid companyId, CashAccount account)
    {
        var (totalDebit, totalCredit) = await CalculateCashTotalsAsync(companyId, account.Currency);

        return new CashAccountResponseDto(
            account.Id,
            account.Currency,
            account.Balance,
            account.OpeningBalance,
            totalDebit,
            totalCredit,
            account.OpeningBalance + totalDebit - totalCredit,
            account.CreatedAt
        );
    }
}
