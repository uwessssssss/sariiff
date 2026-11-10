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

// =====================================================
// M-PESA AGENT SERVICE - FIXED
// =====================================================
public class MpesaAgentService : IMpesaAgentService
{
    private readonly AppDbContext _context;
    private readonly StatementHelper _statementHelper;

    public MpesaAgentService(AppDbContext context)
    {
        _context = context;
        _statementHelper = new StatementHelper(context);
    }

    public async Task<ApiResponse<MpesaAgentResponseDto>> CreateAsync(Guid companyId, CreateMpesaAgentDto dto)
    {
        // Input validation
        var validationError = ValidationHelper.FirstError(
            ValidationHelper.ValidateName(dto.AgentName, "Agent name"),
            ValidationHelper.ValidatePhone(dto.PhoneNumber, "Phone number"),
            ValidationHelper.ValidateText(dto.AgentNumber, "Agent number", 50, required: true),
            ValidationHelper.ValidateAmount(dto.OpeningBalance, "Opening balance", allowZero: true)
        );
        if (validationError != null)
            return new ApiResponse<MpesaAgentResponseDto>(false, validationError, null);

        if (await _context.MpesaAgents.AnyAsync(m => m.CompanyId == companyId && m.AgentNumber == dto.AgentNumber && !m.IsDeleted))
            return new ApiResponse<MpesaAgentResponseDto>(false, "Agent number already exists", null);

        var provider = dto.Provider is { } pv && Enum.IsDefined(typeof(MobileMoneyProvider), pv) ? pv : MobileMoneyProvider.MPesa;
        var home = await _context.BaseCurrencyAsync(companyId);
        var walletCurrency = MobileMoney.DefaultCurrency(provider, home);
        if (!CurrencyInfo.IsAllowed(home, walletCurrency))
            return new ApiResponse<MpesaAgentResponseDto>(false,
                $"{MobileMoney.Name(provider)} wallets hold {walletCurrency}, which this bureau doesn't use.", null);

        const int maxRetries = 3;
        for (int attempt = 0; attempt < maxRetries; attempt++)
        {
            var code = await CodeGenerator.GenerateMpesaAgentCodeAsync(_context, companyId);
            var agent = new MpesaAgent
            {
                CompanyId = companyId,
                Code = code,
                AgentName = dto.AgentName,
                PhoneNumber = dto.PhoneNumber,
                AgentNumber = dto.AgentNumber,
                StoreNumber = dto.StoreNumber,
                AgentType = dto.AgentType,
                Provider = provider,
                Currency = walletCurrency,   // M-Pesa = KES even in a Ugandan bureau
                Balance = dto.OpeningBalance,
                OpeningBalance = dto.OpeningBalance,
                IsActive = true
            };

            try
            {
                _context.MpesaAgents.Add(agent);
                await _context.SaveChangesAsync();
                return new ApiResponse<MpesaAgentResponseDto>(true, "Mobile money agent created", await MapToResponseAsync(companyId, agent));
            }
            catch (DbUpdateException) when (attempt < maxRetries - 1)
            {
                _context.Entry(agent).State = EntityState.Detached;
                await Task.Delay(50 * (attempt + 1));
            }
        }
        return new ApiResponse<MpesaAgentResponseDto>(false, "Failed to generate unique code. Please try again.", null);
    }

    public async Task<ApiResponse<MpesaAgentResponseDto>> GetByIdAsync(Guid companyId, Guid id)
    {
        var agent = await _context.MpesaAgents.FirstOrDefaultAsync(m => m.Id == id && m.CompanyId == companyId && !m.IsDeleted);
        if (agent == null) return new ApiResponse<MpesaAgentResponseDto>(false, "Mobile money agent not found", null);
        return new ApiResponse<MpesaAgentResponseDto>(true, "Success", await MapToResponseAsync(companyId, agent));
    }

    public async Task<ApiResponse<List<MpesaAgentResponseDto>>> GetAllAsync(Guid companyId)
    {
        var agents = await _context.MpesaAgents.Where(m => m.CompanyId == companyId && !m.IsDeleted).ToListAsync();
        var result = new List<MpesaAgentResponseDto>();
        foreach (var agent in agents)
        {
            result.Add(await MapToResponseAsync(companyId, agent));
        }
        return new ApiResponse<List<MpesaAgentResponseDto>>(true, "Success", result);
    }

    public async Task<ApiResponse<MpesaAgentResponseDto>> UpdateAsync(Guid companyId, Guid id, UpdateMpesaAgentDto dto)
    {
        var agent = await _context.MpesaAgents.FirstOrDefaultAsync(m => m.Id == id && m.CompanyId == companyId && !m.IsDeleted);
        if (agent == null) return new ApiResponse<MpesaAgentResponseDto>(false, "Mobile money agent not found", null);

        if (dto.AgentName != null)
        {
            var check = ValidationHelper.ValidateName(dto.AgentName, "Agent name");
            if (!check.IsValid) return new ApiResponse<MpesaAgentResponseDto>(false, check.Error!, null);
            agent.AgentName = dto.AgentName;
        }
        if (dto.StoreNumber != null) agent.StoreNumber = dto.StoreNumber;
        if (dto.AgentType.HasValue) agent.AgentType = dto.AgentType.Value;
        if (dto.IsActive.HasValue) agent.IsActive = dto.IsActive.Value;
        if (dto.Provider.HasValue && Enum.IsDefined(typeof(MobileMoneyProvider), dto.Provider.Value)
            && dto.Provider.Value != agent.Provider)
        {
            // A different network can mean a different currency. Moving a wallet's money
            // from KES to UGX by relabelling would silently change its value, so a network
            // change that changes the currency is only allowed before any money moved.
            var home = await _context.BaseCurrencyAsync(companyId);
            var newCurrency = MobileMoney.DefaultCurrency(dto.Provider.Value, home);
            if (newCurrency != MobileMoney.CurrencyOf(agent, home))
            {
                var used = agent.Balance != 0 || agent.OpeningBalance != 0 || await _context.Transactions.AnyAsync(t => !t.IsDeleted &&
                    ((t.SourceAccountType == AccountType.Mpesa && t.SourceAccountId == agent.Id) ||
                     (t.DestAccountType == AccountType.Mpesa && t.DestAccountId == agent.Id)));
                if (used)
                    return new ApiResponse<MpesaAgentResponseDto>(false,
                        $"{MobileMoney.Name(dto.Provider.Value)} holds {newCurrency}, but this wallet already has {MobileMoney.CurrencyOf(agent, home)} activity. Add a new agent instead.", null);
                if (!CurrencyInfo.IsAllowed(home, newCurrency))
                    return new ApiResponse<MpesaAgentResponseDto>(false,
                        $"{MobileMoney.Name(dto.Provider.Value)} wallets hold {newCurrency}, which this bureau doesn't use.", null);
                agent.Currency = newCurrency;
            }
            agent.Provider = dto.Provider.Value;
        }
        agent.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return new ApiResponse<MpesaAgentResponseDto>(true, "Mobile money agent updated", await MapToResponseAsync(companyId, agent));
    }

    public async Task<ApiResponse<bool>> DeleteAsync(Guid companyId, Guid id)
    {
        var agent = await _context.MpesaAgents.FirstOrDefaultAsync(m => m.Id == id && m.CompanyId == companyId && !m.IsDeleted);
        if (agent == null) return new ApiResponse<bool>(false, "Mobile money agent not found", false);

        // Check if there are any transactions using this agent
        var hasTransactions = await _context.Transactions
            .AnyAsync(t => t.CompanyId == companyId && !t.IsDeleted &&
                ((t.SourceAccountType == AccountType.Mpesa && t.SourceAccountId == id) ||
                 (t.DestAccountType == AccountType.Mpesa && t.DestAccountId == id)));

        if (hasTransactions)
            return new ApiResponse<bool>(false,
                "Cannot delete Mobile money agent with existing transactions. Please delete or reverse all transactions first.", false);

        agent.IsDeleted = true;
        agent.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return new ApiResponse<bool>(true, "Mobile money agent deleted", true);
    }

    public async Task<ApiResponse<MpesaAgentStatsDto>> GetStatsAsync(Guid companyId)
    {
        var agents = await _context.MpesaAgents.Where(m => m.CompanyId == companyId && !m.IsDeleted).ToListAsync();
        var agentIds = agents.Select(a => a.Id).ToList();
        
        var totalsByAgent = await _statementHelper.TotalsByAccountAsync(companyId, AccountType.Mpesa, agentIds);

        // Totals per WALLET currency: an M-Pesa (KES) wallet and an MTN (UGX) wallet in
        // the same bureau can't be added together.
        var home = await _context.BaseCurrencyAsync(companyId);
        var byCur = new Dictionary<Currency, (decimal Open, decimal Bal, decimal Dr, decimal Cr)>();
        foreach (var agent in agents)
        {
            var cur = MobileMoney.CurrencyOf(agent, home);
            var perCur = totalsByAgent.TryGetValue(agent.Id, out var pc) ? pc : new();
            var t = byCur.TryGetValue(cur, out var x) ? x : default;
            byCur[cur] = (t.Open + agent.OpeningBalance, t.Bal + agent.Balance,
                t.Dr + perCur.Values.Sum(v => v.Debit), t.Cr + perCur.Values.Sum(v => v.Credit));
        }
        var rows = byCur.OrderBy(k => k.Key)
            .Select(k => new CurrencyAccountTotalsDto(k.Key, CurrencyInfo.Code(k.Key), k.Value.Bal, k.Value.Open,
                k.Value.Dr, k.Value.Cr, k.Value.Open + k.Value.Dr - k.Value.Cr))
            .ToList();
        var homeRow = byCur.TryGetValue(home, out var hr) ? hr : default;

        // NetMovement = OpeningBalance + Debits - Credits (asset account), home currency
        return new ApiResponse<MpesaAgentStatsDto>(true, "Success", new MpesaAgentStatsDto(
            agents.Count,
            homeRow.Bal,
            homeRow.Dr,
            homeRow.Cr,
            homeRow.Open + homeRow.Dr - homeRow.Cr,
            rows
        ));
    }

    public async Task<ApiResponse<StatementDto>> GetStatementAsync(Guid companyId, Guid id, StatementFilterDto filter)
    {
        var agent = await _context.MpesaAgents.FirstOrDefaultAsync(m => m.Id == id && m.CompanyId == companyId && !m.IsDeleted);
        if (agent == null) return new ApiResponse<StatementDto>(false, "Mobile money agent not found", null);

        var history = _context.Transactions.Where(t => t.CompanyId == companyId && !t.IsDeleted &&
            ((t.SourceAccountType == AccountType.Mpesa && t.SourceAccountId == id) ||
             (t.DestAccountType == AccountType.Mpesa && t.DestAccountId == id)));

        // A wallet holds its network's currency (M-Pesa = KES, MTN MoMo = UGX).
        var statement = await _statementHelper.BuildPeriodStatementAsync(
            history, AccountType.Mpesa, id, $"{agent.AgentName} - {agent.AgentNumber}", agent.Code,
            MobileMoney.CurrencyOf(agent, await _context.BaseCurrencyAsync(companyId)), agent.OpeningBalance, filter);
        return new ApiResponse<StatementDto>(true, "Success", statement);
    }

    private async Task<MpesaAgentResponseDto> MapToResponseAsync(Guid companyId, MpesaAgent agent)
    {
        var (totalDebit, totalCredit) = await _statementHelper.TotalsForAccountAsync(companyId, AccountType.Mpesa, agent.Id);

        // ✅ FIXED: NetMovement = OpeningBalance + Credits - Debits
        return new MpesaAgentResponseDto(
            agent.Id, agent.Code, agent.AgentName, agent.PhoneNumber, agent.AgentNumber, agent.StoreNumber,
            agent.AgentType, agent.Balance, agent.OpeningBalance,
            totalDebit, totalCredit, agent.OpeningBalance + totalDebit-totalCredit,
            agent.IsActive, agent.CreatedAt,
            agent.Provider, MobileMoney.CurrencyOf(agent, await _context.BaseCurrencyAsync(companyId))
        );
    }
}

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

public class ExchangeRateService : IExchangeRateService
{
    private readonly AppDbContext _context;
    private readonly ITransactionService _transactionService;
    private readonly ISystemLogService _systemLog;

    public ExchangeRateService(
        AppDbContext context, 
        ITransactionService transactionService,
        ISystemLogService systemLog)
    {
        _context = context;
        _transactionService = transactionService;
        _systemLog = systemLog;
    }

    public async Task<ApiResponse<ExchangeRateResponseDto>> SetRateAsync(Guid companyId, Guid userId, SetExchangeRateDto dto)
    {
        // Country rule: no NEW holdings in a currency the bureau's country doesn't use (UGX in Kenya).
        var currencyBlock = await _context.CurrencyNotAllowedAsync(companyId, dto.ForeignCurrency ?? Currency.USD);
        if (currencyBlock != null)
            return new ApiResponse<ExchangeRateResponseDto>(false, currencyBlock, null);

        var baseCur = await _context.BaseCurrencyAsync(companyId);
        // Validate rates
        if (dto.BuyRate <= 0 || dto.SellRate <= 0)
            return new ApiResponse<ExchangeRateResponseDto>(false, "Exchange rates must be positive", null);

        if (dto.BuyRate >= dto.SellRate)
            return new ApiResponse<ExchangeRateResponseDto>(false, "Buy rate must be less than sell rate", null);

        // Rates are per foreign currency (the company base currency is the base). Only replace the
        // active rate for THIS currency — never another currency's rate.
        var foreign = dto.ForeignCurrency ?? Currency.USD;
        if (foreign == baseCur)
            return new ApiResponse<ExchangeRateResponseDto>(false, $"{baseCur} is your base currency — pick the foreign currency to quote", null);

        var currentRate = await _context.ExchangeRates
            .FirstOrDefaultAsync(r => r.CompanyId == companyId && r.IsActive && r.ForeignCurrency == foreign);
            
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

        return new ApiResponse<ExchangeRateResponseDto>(true, "Exchange rate set", MapToResponse(newRate));
    }

    public async Task<ApiResponse<ExchangeRateResponseDto>> GetCurrentRateAsync(Guid companyId, Currency foreignCurrency = Currency.USD)
    {
        var rate = await _context.ExchangeRates
            .FirstOrDefaultAsync(r => r.CompanyId == companyId && r.IsActive && r.ForeignCurrency == foreignCurrency);
            
        if (rate == null) 
            return new ApiResponse<ExchangeRateResponseDto>(false, "No active exchange rate", null);
            
        return new ApiResponse<ExchangeRateResponseDto>(true, "Success", MapToResponse(rate));
    }

    public async Task<ApiResponse<List<ExchangeRateResponseDto>>> GetHistoryAsync(Guid companyId)
    {
        var rates = await _context.ExchangeRates
            .Where(r => r.CompanyId == companyId)
            .OrderByDescending(r => r.EffectiveFrom)
            .ToListAsync();
            
        return new ApiResponse<List<ExchangeRateResponseDto>>(true, "Success", rates.Select(MapToResponse).ToList());
    }

    public async Task<ApiResponse<CurrencyConvertResultDto>> ConvertAsync(Guid companyId, CurrencyConvertDto dto)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        // The company base is the base: exactly one side must be it, the other picks the rate.
        if (dto.From == dto.To)
            return new ApiResponse<CurrencyConvertResultDto>(true, "Success",
                new CurrencyConvertResultDto(dto.Amount, dto.From, dto.Amount, dto.To, 1));
        if (dto.From != baseCur && dto.To != baseCur)
            return new ApiResponse<CurrencyConvertResultDto>(false, $"One side of the conversion must be {baseCur}", null);
        var foreign = dto.From == baseCur ? dto.To : dto.From;

        var rate = await _context.ExchangeRates
            .Where(r => r.CompanyId == companyId && r.IsActive && r.ForeignCurrency == foreign)
            .OrderByDescending(r => r.EffectiveFrom)
            .FirstOrDefaultAsync();
            
        if (rate == null) 
            return new ApiResponse<CurrencyConvertResultDto>(false, $"No active {foreign} exchange rate", null);

        if (rate.BuyRate <= 0 || rate.SellRate <= 0)
            return new ApiResponse<CurrencyConvertResultDto>(false, "Exchange rate is invalid (zero or negative)", null);

        decimal converted;
        decimal usedRate;

        if (dto.From == baseCur)
        {
            usedRate = rate.SellRate;  // Bureau SELLS the foreign currency at SellRate
            converted = dto.Amount / usedRate;
        }
        else
        {
            usedRate = rate.BuyRate;  // Bureau BUYS the foreign currency at BuyRate
            converted = dto.Amount * usedRate;
        }

        return new ApiResponse<CurrencyConvertResultDto>(true, "Success", 
            new CurrencyConvertResultDto(dto.Amount, dto.From, converted, dto.To, usedRate));
    }

    /// <summary>
    /// FIXED: Create exchange transaction with proper rollback
    /// 
    /// Exchange creates 2 transactions:
    /// 1. Receive FROM client (client gives currency A)
    /// 2. Give TO client (client receives currency B)
    /// 
    /// If transaction 2 fails, transaction 1 is now rolled back properly.
    /// </summary>
    public async Task<ApiResponse<TransactionResponseDto>> CreateExchangeTransactionAsync(
        Guid companyId, Guid userId, ExchangeTransactionDto dto)
    {
        var baseCur = await _context.BaseCurrencyAsync(companyId);
        // Use database transaction for atomicity
        using var dbTransaction = await _context.Database.BeginTransactionAsync();
        
        try
        {
            // Multi-currency: any KES↔X pair (X = USD, UGX, EUR, ...).
            // KES is the base — exactly one side of the pair must be KES.
            if (dto.CurrencyFrom == dto.CurrencyTo)
                return new ApiResponse<TransactionResponseDto>(false, "Currencies must differ for an exchange", null);
            if (dto.CurrencyFrom != baseCur && dto.CurrencyTo != baseCur)
                return new ApiResponse<TransactionResponseDto>(false,
                    $"One side of the exchange must be {baseCur} (cross-currency pairs are not supported yet)", null);
            var foreign = dto.CurrencyFrom == baseCur ? dto.CurrencyTo : dto.CurrencyFrom;

            // Validate client exists
            var client = await _context.Users
                .FirstOrDefaultAsync(u => u.Id == dto.ClientId && u.CompanyId == companyId && !u.IsDeleted);
                
            if (client == null)
                return new ApiResponse<TransactionResponseDto>(false, "Client not found", null);

            // Get cash accounts
            var cashKES = await _context.CashAccounts
                .FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Currency == baseCur && !c.IsDeleted);
            var cashForeign = await _context.CashAccounts
                .FirstOrDefaultAsync(c => c.CompanyId == companyId && c.Currency == foreign && !c.IsDeleted);

            if (cashKES == null || cashForeign == null)
                return new ApiResponse<TransactionResponseDto>(false, 
                    $"Cash accounts not found. Please create both {baseCur} and {foreign} cash accounts.", null);

            // Validate exchange rate
            if (dto.ExchangeRate <= 0)
                return new ApiResponse<TransactionResponseDto>(false, "Invalid exchange rate", null);

            // Calculate the amount to give to client
            // Rate is always base per 1 unit of the foreign currency.
            decimal amountTo;
            if (dto.CurrencyFrom == baseCur)
            {
                // Client gives KES, receives the foreign currency
                amountTo = dto.AmountFrom / dto.ExchangeRate;
                
                if (cashForeign.Balance < amountTo)
                    return new ApiResponse<TransactionResponseDto>(false, 
                        $"Insufficient {foreign} balance. Available: {foreign} {cashForeign.Balance:N2}, Required: {foreign} {amountTo:N2}", null);
            }
            else
            {
                // Client gives the foreign currency, receives KES
                amountTo = dto.AmountFrom * dto.ExchangeRate;
                
                if (cashKES.Balance < amountTo)
                    return new ApiResponse<TransactionResponseDto>(false, 
                        $"Insufficient {baseCur} balance. Available: {baseCur} {cashKES.Balance:N2}, Required: {baseCur} {amountTo:N2}", null);
            }

            // Determine currency to give
            var currencyTo = dto.CurrencyFrom == baseCur ? foreign : baseCur;

            // ==================== TRANSACTION 1 ====================
            // Receive FROM client - Client's account is DEBITED (money out from client)
            var txn1 = new CreateTransactionDto(
                TransactionType: TransactionType.Debit,
                SourceAccountType: AccountType.Client,
                SourceAccountId: dto.ClientId,
                DestAccountType: AccountType.Cash,
                DestAccountId: dto.CurrencyFrom == baseCur ? cashKES.Id : cashForeign.Id,
                Amount: dto.AmountFrom,
                Currency: dto.CurrencyFrom,
                CounterAmount: null,
                CounterCurrency: null,
                Description: $"Exchange: Client gives {dto.CurrencyFrom} {dto.AmountFrom:N2}",
                Notes: $"Exchange rate: {dto.ExchangeRate:N4}",
                ExchangeRate: dto.ExchangeRate,
                PaymentMethod: PaymentMethod.Cash
            );

            var result1 = await _transactionService.CreateAsync(companyId, userId, txn1);
            if (!result1.Success)
            {
                await dbTransaction.RollbackAsync();
                return new ApiResponse<TransactionResponseDto>(false, 
                    $"Failed to create receive transaction: {result1.Message}", null);
            }

            // ==================== TRANSACTION 2 ====================
            // Give TO client - Client's account is CREDITED (money in to client)
            var txn2 = new CreateTransactionDto(
                TransactionType: TransactionType.Credit,
                SourceAccountType: AccountType.Client,
                SourceAccountId: dto.ClientId,
                DestAccountType: AccountType.Cash,
                DestAccountId: currencyTo == baseCur ? cashKES.Id : cashForeign.Id,
                Amount: amountTo,
                Currency: currencyTo,
                CounterAmount: null,
                CounterCurrency: null,
                Description: $"Exchange: Client receives {currencyTo} {amountTo:N2}",
                Notes: $"Exchange rate: {dto.ExchangeRate:N4} | Original: {dto.CurrencyFrom} {dto.AmountFrom:N2}",
                ExchangeRate: dto.ExchangeRate,
                PaymentMethod: PaymentMethod.Cash
            );

            var result2 = await _transactionService.CreateAsync(companyId, userId, txn2);
            if (!result2.Success)
            {
                // FIXED: Rollback the entire database transaction
                // This will undo transaction 1 as well
                await dbTransaction.RollbackAsync();
                
                await _systemLog.LogErrorAsync("ExchangeRateService", 
                    $"Exchange failed on second transaction. Rolled back first transaction. Error: {result2.Message}",
                    null, companyId, userId);
                
                return new ApiResponse<TransactionResponseDto>(false, 
                    $"Exchange failed. All changes rolled back. Error: {result2.Message}", null);
            }

            // Both transactions successful - commit
            await dbTransaction.CommitAsync();
            
            await _systemLog.LogInfoAsync("ExchangeRateService", 
                $"Exchange completed: {dto.CurrencyFrom} {dto.AmountFrom:N2} -> {currencyTo} {amountTo:N2}", 
                companyId, userId);

            return result2;
        }
        catch (Exception ex)
        {
            await dbTransaction.RollbackAsync();
            
            await _systemLog.LogErrorAsync("ExchangeRateService", 
                $"Exchange transaction failed: {ex.Message}", ex.StackTrace, companyId, userId);
            
            return new ApiResponse<TransactionResponseDto>(false,
                "Exchange failed and nothing was saved. Please try again.", null);
        }
    }

    private static ExchangeRateResponseDto MapToResponse(ExchangeRate r) => new(
        r.Id, r.BuyRate, r.SellRate, r.EffectiveFrom, r.EffectiveTo, r.IsActive);
}