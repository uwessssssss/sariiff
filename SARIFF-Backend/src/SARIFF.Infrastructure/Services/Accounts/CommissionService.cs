using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;

namespace SARIFF.Infrastructure.Services;

/// <summary>
/// Mobile money commission and the bureau's income summary.
///
/// Commission is income, never a negative expense, and it is recorded GROSS:
///   network pays G − W into a wallet:  Dr wallet G − W        Cr Commission income G − W
///   tax the network kept:              Dr Withholding tax W    Cr Commission income W
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

    public async Task<ApiResponse<CommissionResultDto>> RecordAsync(Guid companyId, Guid userId, RecordCommissionDto dto)
    {
        if (dto.DestAccountType is not (AccountType.Mpesa or AccountType.Bank or AccountType.Cash))
            return Fail("Commission is paid into a mobile money wallet, a bank account or a cash till.");
        var gross = ValidationHelper.ValidateAmount(dto.GrossAmount, "Commission earned");
        if (!gross.IsValid) return Fail(gross.Error!);
        if (dto.WithholdingTax < 0)
            return Fail("Withholding tax can't be negative.");
        if (dto.WithholdingTax >= dto.GrossAmount)
            return Fail("Withholding tax must be less than the commission earned.");
        var reference = ValidationHelper.ValidateText(dto.Reference, "Network reference", 100);
        if (!reference.IsValid) return Fail(reference.Error!);
        var notes = ValidationHelper.ValidateText(dto.Notes, "Notes", 1000);
        if (!notes.IsValid) return Fail(notes.Error!);

        var net = dto.GrossAmount - dto.WithholdingTax;
        var refText = string.IsNullOrWhiteSpace(dto.Reference) ? "" : $" (ref {dto.Reference.Trim()})";

        var own = _context.Database.CurrentTransaction == null ? await _context.Database.BeginTransactionAsync() : null;
        try
        {
            var netPosting = await _transactions.CreateAsync(companyId, userId, new CreateTransactionDto(
                TransactionType.Credit,
                AccountType.Income, IncomeAccounts.Commission,
                dto.DestAccountType, dto.DestAccountId,
                net, dto.Currency, null, null,
                $"Mobile money commission{refText}: {dto.Currency} {dto.GrossAmount:N2} earned, {dto.WithholdingTax:N2} tax withheld",
                dto.Notes?.Trim(), null, PaymentMethod.Mpesa, dto.Date));
            if (!netPosting.Success || netPosting.Data == null)
            {
                await RollbackAsync(own);
                return Fail(netPosting.Message);
            }

            ApiResponse<TransactionResponseDto>? taxPosting = null;
            if (dto.WithholdingTax > 0)
            {
                taxPosting = await _transactions.CreateAsync(companyId, userId, new CreateTransactionDto(
                    TransactionType.Credit,
                    AccountType.Income, IncomeAccounts.Commission,
                    AccountType.TaxRecoverable, IncomeAccounts.WithholdingTax,
                    dto.WithholdingTax, dto.Currency, null, null,
                    $"Withholding tax on mobile money commission{refText}",
                    $"Kept by the network from {netPosting.Data.Code}. A credit against income tax.",
                    null, PaymentMethod.Mpesa, dto.Date));
                if (!taxPosting.Success || taxPosting.Data == null)
                {
                    await RollbackAsync(own);
                    return Fail(taxPosting.Message);
                }
            }

            if (own != null) await own.CommitAsync();
            return new ApiResponse<CommissionResultDto>(true, "Commission recorded",
                new CommissionResultDto(dto.GrossAmount, dto.WithholdingTax, net, dto.Currency, netPosting.Data, taxPosting?.Data));
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

        decimal InPeriod(Currency c, AccountType type, Guid id) =>
            moves.Where(m => m.Cur == c && m.Type == type && m.Id == id && m.When >= fromUtc && m.When < toUtc).Sum(m => m.Amount);

        var rows = new List<IncomeCurrencyDto>();
        foreach (var c in currencies)
        {
            var commission = InPeriod(c, AccountType.Income, IncomeAccounts.Commission);
            var tax = InPeriod(c, AccountType.TaxRecoverable, IncomeAccounts.WithholdingTax);
            var fees = InPeriod(c, AccountType.Income, IncomeAccounts.Fees);
            var other = InPeriod(c, AccountType.Income, IncomeAccounts.Other);
            var recoverable = moves.Where(m => m.Cur == c && m.Type == AccountType.TaxRecoverable).Sum(m => m.Amount);
            var eFloat = wallets.Where(w => (w.Currency ?? home) == c).Sum(w => w.Balance);
            var cash = tills.Where(x => x.Currency == c).Sum(x => x.Balance);
            if (c != home && commission == 0 && tax == 0 && fees == 0 && other == 0 && recoverable == 0 && eFloat == 0 && cash == 0)
                continue;
            rows.Add(new IncomeCurrencyDto(c, commission, tax, commission - tax, fees, other, commission + fees + other, recoverable, eFloat, cash));
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
