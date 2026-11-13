using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

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
        dto = dto with { PhoneNumber = dto.PhoneNumber?.Trim()!, AgentNumber = dto.AgentNumber?.Trim()! };
        // Input validation
        var validationError = ValidationHelper.FirstError(
            ValidationHelper.ValidateLabel(dto.AgentName, "Agent name", 100),
            ValidationHelper.ValidateText(dto.StoreNumber, "Store number", 50),
            ValidationHelper.ValidatePhone(dto.PhoneNumber, "Phone number"),
            ValidationHelper.ValidateText(dto.AgentNumber, "Agent number", 50, required: true),
            ValidationHelper.ValidateAmount(dto.OpeningBalance, "Opening balance", allowZero: true)
        );
        if (validationError != null)
            return new ApiResponse<MpesaAgentResponseDto>(false, validationError, null);
        if (!Enum.IsDefined(dto.AgentType))
            return new ApiResponse<MpesaAgentResponseDto>(false, "Agent type must be Standard or Super", null);

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
                AgentName = dto.AgentName.Trim(),
                PhoneNumber = dto.PhoneNumber,
                AgentNumber = dto.AgentNumber,
                StoreNumber = string.IsNullOrWhiteSpace(dto.StoreNumber) ? null : dto.StoreNumber.Trim(),
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
            var check = ValidationHelper.ValidateLabel(dto.AgentName, "Agent name", 100);
            if (!check.IsValid) return new ApiResponse<MpesaAgentResponseDto>(false, check.Error!, null);
            agent.AgentName = dto.AgentName.Trim();
        }
        if (dto.StoreNumber != null)
        {
            var check = ValidationHelper.ValidateText(dto.StoreNumber, "Store number", 50);
            if (!check.IsValid) return new ApiResponse<MpesaAgentResponseDto>(false, check.Error!, null);
            agent.StoreNumber = string.IsNullOrWhiteSpace(dto.StoreNumber) ? null : dto.StoreNumber.Trim();
        }
        if (dto.AgentType.HasValue)
        {
            if (!Enum.IsDefined(dto.AgentType.Value))
                return new ApiResponse<MpesaAgentResponseDto>(false, "Agent type must be Standard or Super", null);
            agent.AgentType = dto.AgentType.Value;
        }
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

        // NetMovement = OpeningBalance + debits (money in) − credits (money out): this is an asset
        return new MpesaAgentResponseDto(
            agent.Id, agent.Code, agent.AgentName, agent.PhoneNumber, agent.AgentNumber, agent.StoreNumber,
            agent.AgentType, agent.Balance, agent.OpeningBalance,
            totalDebit, totalCredit, agent.OpeningBalance + totalDebit-totalCredit,
            agent.IsActive, agent.CreatedAt,
            agent.Provider, MobileMoney.CurrencyOf(agent, await _context.BaseCurrencyAsync(companyId))
        );
    }
}
