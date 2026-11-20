using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Income other than from exchange, in income accounts the bureau names itself.
///
/// Income is never a negative expense:
///   received into a till / bank / wallet:  Dr that account      Cr the income account
///   a fee charged to a client:             Dr the client (their balance goes down)  Cr the income account
/// A reversal posts the same accounts with the type flipped, so totals and statements net it out.
/// </summary>
public class IncomeService : IIncomeService
{
    private readonly AppDbContext _context;
    private readonly ITransactionService _transactions;

    public IncomeService(AppDbContext context, ITransactionService transactions)
    {
        _context = context;
        _transactions = transactions;
    }

    // ---------------------------------------------------------------- accounts

    public async Task<ApiResponse<List<IncomeAccountResponseDto>>> GetAccountsAsync(Guid companyId)
    {
        var accounts = await _context.IncomeAccounts.AsNoTracking()
            .Where(a => a.CompanyId == companyId && !a.IsDeleted)
            .OrderBy(a => a.Name).ToListAsync();
        var postings = await IncomePostings(companyId).ToListAsync();
        var moves = Moves(postings).ToList();

        var result = accounts.Select(a => new IncomeAccountResponseDto(
            a.Id, a.Name, a.Description, a.IsActive,
            postings.Count(p => p.SourceAccountId == a.Id || p.DestAccountId == a.Id),
            moves.Where(m => m.Id == a.Id).GroupBy(m => m.Cur).OrderBy(g => g.Key)
                .Select(g => new CurrencyAmountDto(g.Key, CurrencyInfo.Code(g.Key), g.Sum(m => m.Amount))).ToList()))
            .ToList();
        return new ApiResponse<List<IncomeAccountResponseDto>>(true, "Success", result);
    }

    public async Task<ApiResponse<IncomeAccountResponseDto>> CreateAccountAsync(Guid companyId, CreateIncomeAccountDto dto)
    {
        var problem = await AccountProblemAsync(companyId, null, dto.Name, dto.Description);
        if (problem != null) return new ApiResponse<IncomeAccountResponseDto>(false, problem, null);

        var account = new IncomeAccount { CompanyId = companyId, Name = dto.Name.Trim(), Description = Clean(dto.Description), IsActive = true };
        _context.IncomeAccounts.Add(account);
        await _context.SaveChangesAsync();
        return new ApiResponse<IncomeAccountResponseDto>(true, "Income account created",
            new IncomeAccountResponseDto(account.Id, account.Name, account.Description, true, 0, new()));
    }

    public async Task<ApiResponse<IncomeAccountResponseDto>> UpdateAccountAsync(Guid companyId, Guid id, UpdateIncomeAccountDto dto)
    {
        var account = await _context.IncomeAccounts.FirstOrDefaultAsync(a => a.Id == id && a.CompanyId == companyId && !a.IsDeleted);
        if (account == null) return new ApiResponse<IncomeAccountResponseDto>(false, "Income account not found", null);

        var renamed = dto.Name != null && !string.Equals(dto.Name.Trim(), account.Name, StringComparison.OrdinalIgnoreCase);
        var problem = await AccountProblemAsync(companyId, account.Id, dto.Name ?? account.Name, dto.Description, checkDuplicate: renamed);
        if (problem != null) return new ApiResponse<IncomeAccountResponseDto>(false, problem, null);

        if (dto.Name != null) account.Name = dto.Name.Trim();
        if (dto.Description != null) account.Description = Clean(dto.Description);
        if (dto.IsActive.HasValue) account.IsActive = dto.IsActive.Value;
        account.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        var all = await GetAccountsAsync(companyId);
        return new ApiResponse<IncomeAccountResponseDto>(true, "Income account updated", all.Data!.First(a => a.Id == id));
    }

    public async Task<ApiResponse<bool>> DeleteAccountAsync(Guid companyId, Guid id)
    {
        var account = await _context.IncomeAccounts.FirstOrDefaultAsync(a => a.Id == id && a.CompanyId == companyId && !a.IsDeleted);
        if (account == null) return new ApiResponse<bool>(false, "Income account not found", false);
        // Its postings are part of the books: an account that has any is switched off, not deleted.
        if (await IncomePostings(companyId).AnyAsync(p => p.SourceAccountId == id || p.DestAccountId == id))
            return new ApiResponse<bool>(false, "This income account has postings. Switch it off instead; its statement stays.", false);
        account.IsDeleted = true;
        account.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return new ApiResponse<bool>(true, "Income account deleted", true);
    }

    private async Task<string?> AccountProblemAsync(Guid companyId, Guid? self, string? name, string? description, bool checkDuplicate = true)
    {
        var nameCheck = ValidationHelper.ValidateLabel(name, "Income account name", 100);
        if (!nameCheck.IsValid) return nameCheck.Error;
        var descCheck = ValidationHelper.ValidateText(description, "Description", 500);
        if (!descCheck.IsValid) return descCheck.Error;
        var lower = name!.Trim().ToLower();
        if (checkDuplicate && await _context.IncomeAccounts.AnyAsync(a => a.CompanyId == companyId && a.Id != self && !a.IsDeleted && a.Name.ToLower() == lower))
            return "An income account with that name already exists";
        return null;
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    // ---------------------------------------------------------------- recording

    public async Task<ApiResponse<TransactionResponseDto>> RecordAsync(Guid companyId, Guid userId, RecordIncomeDto dto)
    {
        var account = await _context.IncomeAccounts.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == dto.IncomeAccountId && a.CompanyId == companyId && !a.IsDeleted);
        if (account == null) return Fail("Choose one of your income accounts.");
        if (!account.IsActive) return Fail($"\"{account.Name}\" is switched off. Switch it on to record income into it.");
        if (dto.DestAccountType is not (AccountType.Mpesa or AccountType.Bank or AccountType.Cash or AccountType.Client))
            return Fail("Income is received into a cash till, a bank account, a mobile money wallet, or charged to a client.");
        var amount = ValidationHelper.ValidateAmount(dto.Amount, "Amount");
        if (!amount.IsValid) return Fail(amount.Error!);
        var description = ValidationHelper.ValidateText(dto.Description, "Description", 200);
        if (!description.IsValid) return Fail(description.Error!);
        var reference = ValidationHelper.ValidateText(dto.Reference, "Reference", 100);
        if (!reference.IsValid) return Fail(reference.Error!);
        var notes = ValidationHelper.ValidateText(dto.Notes, "Notes", 1000);
        if (!notes.IsValid) return Fail(notes.Error!);

        var refText = string.IsNullOrWhiteSpace(dto.Reference) ? "" : $" (ref {dto.Reference.Trim()})";
        var text = string.IsNullOrWhiteSpace(dto.Description) ? $"{account.Name}{refText}" : $"{account.Name}: {dto.Description.Trim()}{refText}";

        return await _transactions.CreateAsync(companyId, userId, new CreateTransactionDto(
            TransactionType.Credit,
            AccountType.Income, account.Id,
            dto.DestAccountType, dto.DestAccountId,
            dto.Amount, dto.Currency, null, null,
            text, dto.Notes?.Trim(), null,
            dto.DestAccountType switch
            {
                AccountType.Mpesa => PaymentMethod.Mpesa,
                AccountType.Bank => PaymentMethod.Bank,
                AccountType.Client => PaymentMethod.AccountTransfer,
                _ => PaymentMethod.Cash,
            },
            dto.Date));
    }

    // ---------------------------------------------------------------- summary

    public async Task<ApiResponse<IncomeSummaryDto>> SummaryAsync(Guid companyId, DateTime? from, DateTime? to)
    {
        var (f, t) = BureauClock.Range(from, to);
        var fromUtc = f ?? BureauClock.MonthStartUtc(BureauClock.TodayLocal);   // default: this month
        var toUtc = t ?? DateTime.UtcNow.AddSeconds(1);
        var home = await _context.BaseCurrencyAsync(companyId);

        var names = await _context.IncomeAccounts.IgnoreQueryFilters().AsNoTracking()
            .Where(a => a.CompanyId == companyId).ToDictionaryAsync(a => a.Id, a => a.Name);
        var moves = Moves(await IncomePostings(companyId).Where(p => p.TransactionDate >= fromUtc && p.TransactionDate < toUtc).ToListAsync()).ToList();

        var wallets = await _context.MpesaAgents.AsNoTracking()
            .Where(a => a.CompanyId == companyId && !a.IsDeleted && a.IsActive)
            .Select(a => new { a.Balance, a.Currency }).ToListAsync();
        var tills = await _context.CashAccounts.AsNoTracking()
            .Where(c => c.CompanyId == companyId && !c.IsDeleted)
            .Select(c => new { c.Balance, c.Currency }).ToListAsync();

        var currencies = new[] { home }
            .Concat(moves.Select(m => m.Cur))
            .Concat(wallets.Select(w => w.Currency ?? home))
            .Concat(tills.Where(c => c.Balance != 0).Select(c => c.Currency))
            .Distinct().ToList();

        var rows = new List<IncomeCurrencyDto>();
        foreach (var c in currencies)
        {
            var lines = moves.Where(m => m.Cur == c).GroupBy(m => m.Id)
                .Select(g => new IncomeLineDto(g.Key, names.GetValueOrDefault(g.Key, "Income"), g.Sum(m => m.Amount), g.Count()))
                .OrderBy(l => l.Name).ToList();
            var eFloat = wallets.Where(w => (w.Currency ?? home) == c).Sum(w => w.Balance);
            var cash = tills.Where(x => x.Currency == c).Sum(x => x.Balance);
            if (c != home && lines.Count == 0 && eFloat == 0 && cash == 0) continue;
            rows.Add(new IncomeCurrencyDto(c, lines.Sum(l => l.Amount), lines, eFloat, cash));
        }
        return new ApiResponse<IncomeSummaryDto>(true, "Success", new IncomeSummaryDto(fromUtc, toUtc, rows));
    }

    // ---------------------------------------------------------------- statement

    public async Task<ApiResponse<IncomeStatementDto>> StatementAsync(Guid companyId, Guid accountId, DateTime? from, DateTime? to)
    {
        var account = await _context.IncomeAccounts.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == accountId && a.CompanyId == companyId && !a.IsDeleted);
        if (account == null) return new ApiResponse<IncomeStatementDto>(false, "Income account not found", null);

        var (f, t) = BureauClock.Range(from, to);
        var toUtc = t ?? DateTime.UtcNow.AddSeconds(1);
        var postings = await IncomePostings(companyId)
            .Where(p => (p.SourceAccountType == AccountType.Income && p.SourceAccountId == accountId) ||
                        (p.DestAccountType == AccountType.Income && p.DestAccountId == accountId))
            .Where(p => p.TransactionDate < toUtc)
            .OrderBy(p => p.TransactionDate).ThenBy(p => p.CreatedAt)
            .ToListAsync();

        // Where each posting's money went (or came from), by name.
        var other = postings.Select(p => p.SourceAccountType == AccountType.Income && p.SourceAccountId == accountId
                ? (p.DestAccountType, p.DestAccountId) : (p.SourceAccountType, p.SourceAccountId)).Distinct().ToList();
        var names = new Dictionary<(AccountType, Guid), string>();
        List<Guid> Ids(AccountType k) => other.Where(o => o.Item1 == k).Select(o => o.Item2).ToList();
        var cashIds = Ids(AccountType.Cash); var bankIds = Ids(AccountType.Bank); var walletIds = Ids(AccountType.Mpesa); var clientIds = Ids(AccountType.Client);
        foreach (var x in await _context.CashAccounts.IgnoreQueryFilters().AsNoTracking().Where(a => cashIds.Contains(a.Id)).Select(a => new { a.Id, a.Currency }).ToListAsync())
            names[(AccountType.Cash, x.Id)] = $"Cash till ({CurrencyInfo.Code(x.Currency)})";
        foreach (var x in await _context.BankAccounts.IgnoreQueryFilters().AsNoTracking().Where(a => bankIds.Contains(a.Id)).Select(a => new { a.Id, a.BankName, a.AccountNumber }).ToListAsync())
            names[(AccountType.Bank, x.Id)] = $"{x.BankName} - {x.AccountNumber}";
        foreach (var x in await _context.MpesaAgents.IgnoreQueryFilters().AsNoTracking().Where(a => walletIds.Contains(a.Id)).Select(a => new { a.Id, a.AgentName, a.AgentNumber }).ToListAsync())
            names[(AccountType.Mpesa, x.Id)] = $"{x.AgentName} - {x.AgentNumber}";
        foreach (var x in await _context.Users.IgnoreQueryFilters().AsNoTracking().Where(a => clientIds.Contains(a.Id)).Select(a => new { a.Id, a.FullName, a.Code }).ToListAsync())
            names[(AccountType.Client, x.Id)] = $"{x.FullName} ({x.Code}), charged";

        var start = f ?? DateTime.MinValue;   // no start date: everything is "in the period", nothing before it
        var byCurrency = new List<IncomeStatementCurrencyDto>();
        foreach (var g in postings.Select(p => (P: p, M: Moves(new[] { p }).First(m => m.Id == accountId)))
                     .GroupBy(x => x.M.Cur).OrderBy(g => g.Key))
        {
            var opening = g.Where(x => x.P.TransactionDate < start).Sum(x => x.M.Amount);
            var running = opening;
            var lines = new List<IncomeStatementLineDto>();
            foreach (var x in g.Where(x => x.P.TransactionDate >= start))
            {
                running += x.M.Amount;
                var o = x.P.SourceAccountType == AccountType.Income && x.P.SourceAccountId == accountId
                    ? (x.P.DestAccountType, x.P.DestAccountId) : (x.P.SourceAccountType, x.P.SourceAccountId);
                lines.Add(new IncomeStatementLineDto(x.P.Id, x.P.Code, x.P.TransactionDate, x.P.Description, string.IsNullOrEmpty(x.P.Reference) ? null : x.P.Reference,
                    names.GetValueOrDefault(o, "Account"), x.M.Amount, running,
                    x.P.Reference.StartsWith("REV-"), x.P.DeletedAt.HasValue && !x.P.IsDeleted));
            }
            byCurrency.Add(new IncomeStatementCurrencyDto(g.Key, opening, running - opening, running, lines));
        }

        return new ApiResponse<IncomeStatementDto>(true, "Success",
            new IncomeStatementDto(account.Id, account.Name, account.Description, account.IsActive, f, toUtc, byCurrency));
    }

    // ---------------------------------------------------------------- helpers

    private IQueryable<Transaction> IncomePostings(Guid companyId) =>
        _context.Transactions.AsNoTracking()
            .Where(x => x.CompanyId == companyId && (x.SourceAccountType == AccountType.Income || x.DestAccountType == AccountType.Income));

    /// <summary>
    /// How each posting moves each income account it touches, signed so income is +.
    /// The source side takes the posting's type and the destination the opposite; income grows on a credit.
    /// </summary>
    private static IEnumerable<(Guid Id, Currency Cur, decimal Amount)> Moves(IEnumerable<Transaction> postings)
    {
        foreach (var p in postings)
        {
            if (p.SourceAccountType == AccountType.Income)
                yield return (p.SourceAccountId, p.Currency, p.TransactionType == TransactionType.Credit ? p.Amount : -p.Amount);
            if (p.DestAccountType == AccountType.Income)
                yield return (p.DestAccountId, p.CounterCurrency ?? p.Currency, p.TransactionType == TransactionType.Debit ? (p.CounterAmount ?? p.Amount) : -(p.CounterAmount ?? p.Amount));
        }
    }

    private static ApiResponse<TransactionResponseDto> Fail(string message) => new(false, message, null);
}
