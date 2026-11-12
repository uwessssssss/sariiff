
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

        var query = GetClientTransactionsQuery(companyId, clientId)
            .Where(t => t.TransactionDate >= startDate && t.TransactionDate < endExclusive)
            .Where(t => t.Currency == statementCurrency);  // FIX #12: Only match primary currency

        // Sort chronologically (oldest first) for running balance computation
        var transactions = await query
            .OrderBy(t => t.TransactionDate)
            .ThenBy(t => t.CreatedAt)
            .ToListAsync();
        var items = transactions.Select(t => MapToClientTransactionDto(t, clientId)).ToList();
        // no start picked: the statement begins at the client's first entry (not year 0001)
        if (noStart) periodStartLocal = transactions.Count > 0 ? BureauClock.ToLocal(transactions[0].TransactionDate).Date : endDate;

        // Opening balances for the statement currency. KES/USD live on the
        // client's columns; other currencies (UGX, EUR, ...) live in
        // ClientCurrencyBalances. Everything is tracked per-currency so any
        // currency produces a correct running balance and totals.
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

        // Sum transactions BEFORE the start date to get the period opening balance
        // for the statement currency only.
        var priorTransactions = await GetClientTransactionsQuery(companyId, clientId)
            .Where(t => t.TransactionDate < startDate && t.Currency == statementCurrency)
            .ToListAsync();
        var priorItems = priorTransactions.Select(t => MapToClientTransactionDto(t, clientId)).ToList();
        var periodOpeningBalance = baseOpening;
        foreach (var item in priorItems)
            periodOpeningBalance += item.Type == "Credit" ? item.Amount : -item.Amount;

        // Running balance + totals for the statement currency.
        decimal totalCredits = 0, totalDebits = 0;
        var running = periodOpeningBalance;
        foreach (var item in items)
        {
            if (item.Currency != statementCurrency) continue;
            item.BalanceBefore = running;
            if (item.Type == "Credit")
            {
                running += item.Amount;
                totalCredits += item.Amount;
            }
            else
            {
                running -= item.Amount;
                totalDebits += item.Amount;
            }
            item.BalanceAfter = running;
        }

        var closingBalance = running;

        // Reverse to show newest first for display
        items.Reverse();

        return new ApiResponse<ClientStatementDto>(true, "Success", new ClientStatementDto
        {
            AccountName = client.FullName,
            AccountCode = client.Code,
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

        var query = GetClientTransactionsQuery(companyId, clientId);

        if (fromUtc.HasValue)
            query = query.Where(t => t.TransactionDate >= fromUtc.Value);

        if (toExclusive.HasValue)
            query = query.Where(t => t.TransactionDate < toExclusive.Value);

        if (currency.HasValue)
            query = query.Where(t => t.Currency == currency.Value);  // FIX #12: Only match primary currency

        var transactions = await query
            .OrderByDescending(t => t.TransactionDate)
            .ToListAsync();

        var sb = new StringBuilder();
        sb.AppendLine("Code,Date,Time,Type,Description,Amount,Currency,Balance Before,Balance After,Reference,Status");

        foreach (var txn in transactions)
        {
            var dto = MapToClientTransactionDto(txn, clientId);
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
