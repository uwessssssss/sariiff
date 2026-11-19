using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// The bureau's income (commission, fees, interest, rent, other) and its summary.
///
/// Income is never a negative expense, and it is recorded GROSS:
///   payer pays G − W into a till/bank/wallet:  Dr destination G − W   Cr income G − W
///   tax the payer kept:                        Dr Withholding tax W   Cr income W
///   a fee charged to a client:                 Dr client (balance down) Cr fee income
/// Both postings are saved together or not at all. Cash-in / cash-out for customers only
/// swaps cash float for e-float (Dr cash, Cr wallet and back): no income, so not here.
/// </summary>
public class CommissionService : ICommissionService
{
    private readonly AppDbContext _context;
    private readonly ITransactionService _transactions;

    public CommissionService(AppDbContext context, ITransactionService transactions)
    {
        _context = context;
        _transactions = transactions;
    }

    public Task<ApiResponse<CommissionResultDto>> RecordAsync(Guid companyId, Guid userId, RecordCommissionDto dto) =>
        dto.DestAccountType == AccountType.Client
            ? Task.FromResult(Fail("Commission is paid into a mobile money wallet, a bank account or a cash till."))
            : RecordIncomeAsync(companyId, userId, new RecordIncomeDto(
                IncomeAccounts.Commission, dto.DestAccountType, dto.DestAccountId, dto.Currency,
                dto.GrossAmount, dto.WithholdingTax, dto.Date, null, dto.Reference, dto.Notes));

    public async Task<ApiResponse<CommissionResultDto>> RecordIncomeAsync(Guid companyId, Guid userId, RecordIncomeDto dto)
    {
        if (!IncomeAccounts.IsIncome(dto.IncomeAccountId))
            return Fail("Choose what kind of income this is.");
        var kind = IncomeAccounts.Name(AccountType.Income, dto.IncomeAccountId);
        if (dto.DestAccountType is not (AccountType.Mpesa or AccountType.Bank or AccountType.Cash or AccountType.Client))
            return Fail("Income is received into a cash till, a bank account, a mobile money wallet, or charged to a client.");
        var amount = ValidationHelper.ValidateAmount(dto.Amount, "Amount");
        if (!amount.IsValid) return Fail(amount.Error!);
        if (dto.WithholdingTax < 0)
            return Fail("Withholding tax can't be negative.");
        if (dto.WithholdingTax >= dto.Amount)
            return Fail("Withholding tax must be less than the income.");
        if (dto.DestAccountType == AccountType.Client && dto.WithholdingTax > 0)
            return Fail("A fee charged to a client has no withholding tax.");
        var description = ValidationHelper.ValidateText(dto.Description, "Description", 200);
        if (!description.IsValid) return Fail(description.Error!);
        var reference = ValidationHelper.ValidateText(dto.Reference, "Reference", 100);
        if (!reference.IsValid) return Fail(reference.Error!);
        var notes = ValidationHelper.ValidateText(dto.Notes, "Notes", 1000);
        if (!notes.IsValid) return Fail(notes.Error!);

        var net = dto.Amount - dto.WithholdingTax;
        var refText = string.IsNullOrWhiteSpace(dto.Reference) ? "" : $" (ref {dto.Reference.Trim()})";
        var what = string.IsNullOrWhiteSpace(dto.Description) ? kind : $"{kind}: {dto.Description.Trim()}";
        var text = dto.WithholdingTax > 0
            ? $"{what}{refText}: {dto.Currency} {dto.Amount:N2} earned, {dto.WithholdingTax:N2} tax withheld"
            : $"{what}{refText}";

        var own = _context.Database.CurrentTransaction == null ? await _context.Database.BeginTransactionAsync() : null;
        try
        {
            // Dr destination (net) / Cr income. For a client the posting lowers their balance.
            var netPosting = await _transactions.CreateAsync(companyId, userId, new CreateTransactionDto(
                TransactionType.Credit,
                AccountType.Income, dto.IncomeAccountId,
                dto.DestAccountType, dto.DestAccountId,
                net, dto.Currency, null, null,
                text, dto.Notes?.Trim(), null,
                dto.DestAccountType == AccountType.Mpesa ? PaymentMethod.Mpesa
                    : dto.DestAccountType == AccountType.Bank ? PaymentMethod.Bank
                    : dto.DestAccountType == AccountType.Client ? PaymentMethod.AccountTransfer : PaymentMethod.Cash,
                dto.Date));
            if (!netPosting.Success || netPosting.Data == null)
            {
                await RollbackAsync(own);
                return Fail(netPosting.Message);
            }

            ApiResponse<TransactionResponseDto>? taxPosting = null;
            if (dto.WithholdingTax > 0)
            {
                // Dr withholding tax / Cr income: income stays gross, the tax is a credit to claim.
                taxPosting = await _transactions.CreateAsync(companyId, userId, new CreateTransactionDto(
                    TransactionType.Credit,
                    AccountType.Income, dto.IncomeAccountId,
                    AccountType.TaxRecoverable, IncomeAccounts.WithholdingTax,
                    dto.WithholdingTax, dto.Currency, null, null,
                    $"Withholding tax on {kind.ToLowerInvariant()}{refText}",
                    $"Kept by the payer from {netPosting.Data.Code}. A credit against income tax.",
                    null, PaymentMethod.Cash, dto.Date));
                if (!taxPosting.Success || taxPosting.Data == null)
                {
                    await RollbackAsync(own);
                    return Fail(taxPosting.Message);
                }
            }

            if (own != null) await own.CommitAsync();
            return new ApiResponse<CommissionResultDto>(true, $"{kind} recorded",
                new CommissionResultDto(dto.Amount, dto.WithholdingTax, net, dto.Currency, netPosting.Data, taxPosting?.Data));
        }
        catch
        {
            await RollbackAsync(own);
            throw;
        }
        finally
        {
            if (own != null) await own.DisposeAsync();
        }
    }

    public async Task<ApiResponse<IncomeSummaryDto>> SummaryAsync(Guid companyId, DateTime? from, DateTime? to)
    {
        var (f, t) = BureauClock.Range(from, to);
        var fromUtc = f ?? BureauClock.MonthStartUtc(BureauClock.TodayLocal);   // default: this month
        var toUtc = t ?? DateTime.UtcNow.AddSeconds(1);
        var home = await _context.BaseCurrencyAsync(companyId);

        var postings = await _context.Transactions.AsNoTracking()
            .Where(x => x.CompanyId == companyId &&
                (x.SourceAccountType == AccountType.Income || x.DestAccountType == AccountType.Income ||
                 x.SourceAccountType == AccountType.TaxRecoverable || x.DestAccountType == AccountType.TaxRecoverable))
            .ToListAsync();

        // Every posting touching these accounts, as (account, currency, signed amount, date).
        // A reversal posts the same accounts with the type flipped, so it nets out by itself.
        var moves = new List<(AccountType Type, Guid Id, Currency Cur, decimal Amount, DateTime When)>();
        foreach (var p in postings)
        {
            if (p.SourceAccountType is AccountType.Income or AccountType.TaxRecoverable)
                moves.Add((p.SourceAccountType, p.SourceAccountId, p.Currency, Signed(p.SourceAccountType, isSource: true, p.TransactionType, p.Amount), p.TransactionDate));
            if (p.DestAccountType is AccountType.Income or AccountType.TaxRecoverable)
                moves.Add((p.DestAccountType, p.DestAccountId, p.CounterCurrency ?? p.Currency, Signed(p.DestAccountType, isSource: false, p.TransactionType, p.CounterAmount ?? p.Amount), p.TransactionDate));
        }

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

        bool InP(DateTime w) => w >= fromUtc && w < toUtc;
        decimal InPeriod(Currency c, AccountType type, Guid id) =>
            moves.Where(m => m.Cur == c && m.Type == type && m.Id == id && InP(m.When)).Sum(m => m.Amount);
        // Tax withheld on one kind of income: the tax postings whose other side is that income account.
        decimal TaxOn(Currency c, Guid incomeId) => postings
            .Where(p => InP(p.TransactionDate) &&
                ((p.SourceAccountType == AccountType.Income && p.SourceAccountId == incomeId && p.DestAccountType == AccountType.TaxRecoverable && (p.CounterCurrency ?? p.Currency) == c) ||
                 (p.DestAccountType == AccountType.Income && p.DestAccountId == incomeId && p.SourceAccountType == AccountType.TaxRecoverable && p.Currency == c)))
            .Sum(p => p.DestAccountType == AccountType.TaxRecoverable
                ? Signed(AccountType.TaxRecoverable, isSource: false, p.TransactionType, p.CounterAmount ?? p.Amount)
                : Signed(AccountType.TaxRecoverable, isSource: true, p.TransactionType, p.Amount));

        var rows = new List<IncomeCurrencyDto>();
        foreach (var c in currencies)
        {
            var lines = IncomeAccounts.Income
                .Select(i => { var g = InPeriod(c, AccountType.Income, i.Id); var tx = TaxOn(c, i.Id); return new IncomeLineDto(i.Id, i.Name, g, tx, g - tx); })
                .Where(l => l.Gross != 0 || l.WithholdingTax != 0)
                .ToList();
            decimal Gross(Guid id) => lines.FirstOrDefault(l => l.Id == id)?.Gross ?? 0m;
            var commission = Gross(IncomeAccounts.Commission);
            var commissionTax = lines.FirstOrDefault(l => l.Id == IncomeAccounts.Commission)?.WithholdingTax ?? 0m;
            var tax = InPeriod(c, AccountType.TaxRecoverable, IncomeAccounts.WithholdingTax);
            var total = lines.Sum(l => l.Gross);
            var fees = Gross(IncomeAccounts.Fees);
            var recoverable = moves.Where(m => m.Cur == c && m.Type == AccountType.TaxRecoverable).Sum(m => m.Amount);
            var eFloat = wallets.Where(w => (w.Currency ?? home) == c).Sum(w => w.Balance);
            var cash = tills.Where(x => x.Currency == c).Sum(x => x.Balance);
            if (c != home && total == 0 && tax == 0 && recoverable == 0 && eFloat == 0 && cash == 0)
                continue;
            rows.Add(new IncomeCurrencyDto(c, commission, tax, commission - commissionTax, fees, total - commission - fees, total,
                recoverable, eFloat, cash, total - tax, lines));
        }

        return new ApiResponse<IncomeSummaryDto>(true, "Success", new IncomeSummaryDto(fromUtc, toUtc, rows));
    }

    /// <summary>
    /// How a posting moves an account, in that account's normal direction.
    /// The source side takes the posting's type; the destination takes the opposite.
    /// Income grows on a credit; withholding tax (an asset) grows on a debit.
    /// </summary>
    private static decimal Signed(AccountType type, bool isSource, TransactionType postingType, decimal amount)
    {
        var sideType = isSource ? postingType : (postingType == TransactionType.Debit ? TransactionType.Credit : TransactionType.Debit);
        var grows = type == AccountType.Income ? TransactionType.Credit : TransactionType.Debit;
        return sideType == grows ? amount : -amount;
    }

    private async Task RollbackAsync(Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction? own)
    {
        if (own != null)
        {
            try { await own.RollbackAsync(); } catch { /* already gone */ }
            _context.ChangeTracker.Clear();   // nothing half-done may be saved later
        }
    }

    private static ApiResponse<CommissionResultDto> Fail(string message) => new(false, message, null);
}
