
using Microsoft.EntityFrameworkCore;
using SARIFF.Core.DTOs;
using SARIFF.Core.Entities;
using SARIFF.Core.Enums;
using SARIFF.Core.Interfaces;
using SARIFF.Infrastructure.Data;
using System.Globalization;
using System.Text;

namespace SARIFF.Infrastructure.Services;

public partial class ClientPortalService
{
    // ==================== STATEMENT ====================

    public async Task<ApiResponse<ClientStatementDto>> GetStatementAsync(
        Guid companyId, Guid clientId, DateTime startDate, DateTime endDate, Currency? currency)
    {
        // Bureau-local days as UTC bounds; the end day is included in full.
        var (fromUtcBound, toExclusiveBound) = BureauClock.Range(startDate, endDate);
        var periodStartLocal = startDate;   // shown on the statement as picked
        // A missing date means "no limit" (Range returns null for it): everything up to now.
        var noStart = !fromUtcBound.HasValue;
        if (!toExclusiveBound.HasValue) endDate = BureauClock.ToLocal(DateTime.UtcNow).Date;
        startDate = fromUtcBound ?? DateTime.SpecifyKind(DateTime.MinValue, DateTimeKind.Utc);

        var client = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == clientId && u.CompanyId == companyId && 
                                      u.Role == UserRole.Client && !u.IsDeleted);

        if (client == null)
            return new ApiResponse<ClientStatementDto>(false, "Client not found", null);

        // One statement = one currency (home currency by default) — never a mix.
        var statementCurrency = currency ?? await _context.BaseCurrencyAsync(companyId);
        var endExclusive = toExclusiveBound ?? DateTime.SpecifyKind(DateTime.MaxValue, DateTimeKind.Utc);

        // The client's side of every posting in the statement currency, oldest first, with
        // real running balances. (Before Nov 2026 the statement picked rows by the posting's
        // FIRST currency: money the client received on the second side of a cross-currency
        // posting was missing from its own statement, and the closing balance was short.)
        var ledger = (await LedgerAsync(companyId, clientId)).Where(l => l.Currency == statementCurrency).ToList();
        var items = ledger.Where(l => l.Date >= startDate && l.Date < endExclusive).ToList();
        // no start picked: the statement begins at the client's first entry (not year 0001)
        if (noStart) periodStartLocal = items.Count > 0 ? BureauClock.ToLocal(items[0].Date).Date : endDate;

        // Opening balance of the period: where the last line before it ended, or the
        // account's opening balance in this currency when nothing came before. KES/USD
        // openings live on the client's columns; other currencies in ClientCurrencyBalances.
        decimal baseOpening;
        if (statementCurrency == Currency.KES)
            baseOpening = client.OpeningBalanceKES;
        else if (statementCurrency == Currency.USD)
            baseOpening = client.OpeningBalanceUSD;
        else
        {
            var ccb = await _context.ClientCurrencyBalances
                .FirstOrDefaultAsync(b => b.ClientId == clientId && b.CompanyId == companyId
                                          && b.Currency == statementCurrency && !b.IsDeleted);
            baseOpening = ccb?.OpeningBalance ?? 0m;
        }
        var lastBefore = ledger.LastOrDefault(l => l.Date < startDate);
        var periodOpeningBalance = lastBefore?.BalanceAfter ?? baseOpening;

        var totalCredits = items.Where(l => l.Type == "Credit").Sum(l => l.Amount);
        var totalDebits = items.Where(l => l.Type != "Credit").Sum(l => l.Amount);
        var running = items.Count > 0 ? items[^1].BalanceAfter : periodOpeningBalance;

        var closingBalance = running;

        // Reverse to show newest first for display
        items.Reverse();

        return new ApiResponse<ClientStatementDto>(true, "Success", new ClientStatementDto
        {
            AccountName = client.FullName,
            AccountCode = client.Code,
            CompanyName = await BureauNameAsync(companyId),
            Currency = statementCurrency,
            PeriodStart = periodStartLocal, // the day as picked, not the UTC instant
            PeriodEnd = endDate,
            OpeningBalance = periodOpeningBalance,
            ClosingBalance = closingBalance,
            TotalCredits = totalCredits,
            TotalDebits = totalDebits,
            NetMovement = closingBalance - periodOpeningBalance,
            Transactions = items
        });
    }

    public async Task<byte[]> GenerateStatementPdfAsync(
        Guid companyId, Guid clientId, DateTime startDate, DateTime endDate, Currency? currency)
    {
        var result = await GetStatementAsync(companyId, clientId, startDate, endDate, currency);
        if (!result.Success || result.Data == null)
            throw new Exception(result.Message);

        var statement = result.Data;
        var sb = new StringBuilder();

        sb.AppendLine("=====================================");
        sb.AppendLine("         ACCOUNT STATEMENT");
        sb.AppendLine("=====================================");
        sb.AppendLine();
        sb.AppendLine($"Client: {statement.AccountName}");
        sb.AppendLine($"Client ID: {statement.AccountCode}");
        sb.AppendLine($"Currency: {statement.Currency}");
        sb.AppendLine($"Period: {statement.PeriodStart:yyyy-MM-dd} to {statement.PeriodEnd:yyyy-MM-dd}");
        sb.AppendLine();
        sb.AppendLine($"Opening Balance: {statement.Currency} {statement.OpeningBalance:N2}");
        sb.AppendLine();
        sb.AppendLine("TRANSACTIONS");
        sb.AppendLine("-------------------------------------");
        sb.AppendLine("Date       | Type   | Amount      | Balance     | Description");
        sb.AppendLine("-------------------------------------");

        foreach (var txn in statement.Transactions)
        {
            var typeStr = txn.Type == "Credit" ? "CR" : "DR";
            sb.AppendLine($"{BureauClock.ToLocal(txn.Date):dd/MM/yyyy} | {typeStr,-6} | {txn.Amount,11:N2} | {txn.BalanceAfter,11:N2} | {txn.Description}");
        }

        sb.AppendLine("-------------------------------------");
        sb.AppendLine();
        sb.AppendLine("SUMMARY");
        sb.AppendLine($"Total Credits: {statement.Currency} {statement.TotalCredits:N2}");
        sb.AppendLine($"Total Debits:  {statement.Currency} {statement.TotalDebits:N2}");
        sb.AppendLine($"Net Movement:  {statement.Currency} {statement.NetMovement:N2}");
        sb.AppendLine();
        sb.AppendLine($"Closing Balance: {statement.Currency} {statement.ClosingBalance:N2}");
        sb.AppendLine();
        sb.AppendLine($"Generated: {BureauClock.LocalNow:yyyy-MM-dd HH:mm} EAT");
        sb.AppendLine("=====================================");

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public async Task<byte[]> ExportTransactionsCsvAsync(
        Guid companyId, Guid clientId, DateTime? startDate, DateTime? endDate, Currency? currency)
    {
        var (fromUtc, toExclusive) = BureauClock.Range(startDate, endDate);

        // The client's own side of each posting, with real running balances (see GetTransactionsAsync).
        IEnumerable<ClientTransactionDto> lines = await LedgerAsync(companyId, clientId);
        if (fromUtc.HasValue) { var v = fromUtc.Value; lines = lines.Where(t => t.Date >= v); }
        if (toExclusive.HasValue) { var v = toExclusive.Value; lines = lines.Where(t => t.Date < v); }
        if (currency.HasValue) { var v = currency.Value; lines = lines.Where(t => t.Currency == v); }
        var rows = lines.Reverse().ToList();   // newest first

        var sb = new StringBuilder();
        sb.AppendLine("Code,Date,Time,Type,Description,Amount,Currency,Balance Before,Balance After,Reference,Status");

        foreach (var dto in rows)
        {
            sb.AppendLine(string.Join(",",
                CsvText.Cell(dto.Code), CsvText.Cell(BureauClock.ToLocal(dto.Date).ToString("yyyy-MM-dd")), CsvText.Cell(dto.Time), CsvText.Cell(dto.Type),
                CsvText.Cell(dto.Description), dto.Amount.ToString(System.Globalization.CultureInfo.InvariantCulture), dto.Currency,
                dto.BalanceBefore.ToString(System.Globalization.CultureInfo.InvariantCulture),
                dto.BalanceAfter.ToString(System.Globalization.CultureInfo.InvariantCulture),
                CsvText.Cell(dto.Reference), CsvText.Cell(dto.Status)));
        }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }
}
