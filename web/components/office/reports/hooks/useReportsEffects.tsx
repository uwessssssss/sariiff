"use client";

import { CURRENCY_CODES, ExportFormat, computeCashflowByCurrency, loadKesRates, money, resetRatesLoaded, totalsLine } from "../helpers";
import autoTable from "jspdf-autotable";
import { getStoredAuth } from "@/lib/api";
import jsPDF from "jspdf";
import { localDate } from "@/lib/dates";
import { toast } from "sonner";
import { useEffect } from "react";
import { type useReportsState } from "./useReportsState";
import { type useReportsData } from "./useReportsData";

/** Reports: effects (part 3 of 3 of useReports). */
export function useReportsEffects(prev: ReturnType<typeof useReportsState> & ReturnType<typeof useReportsData>) {
  const { accountSummary, base, baseCode, clientBalances, clientCurrencies, currencyFilter, dateFrom, dateRange, dateTo, dailyReport, exchangeSummary, fetchReportData, profitLossData, reportType, searchTerm, selectedDate, setCurrentPage, setDailyShown, setRatesLoaded, transactionTypeFilter, transactions } = prev;
  const COLORS = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
  ];
  const handleExport = (format: ExportFormat) => {
    if (format === "pdf") {
      try {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Get company info from auth
        const auth = getStoredAuth();
        const companyName = auth?.user?.companyName || "Money Exchange";

        // Report title based on type
        const reportTitle =
          reportType === "transactions"
            ? "Transaction Report"
            : reportType === "clients"
              ? "Client Balances Report"
              : reportType === "exchange"
                ? "Exchange Summary Report"
                : reportType === "cashflow"
                  ? "Cash Flow Report"
                  : reportType === "accounts"
                    ? "Accounts Summary Report"
                    : reportType === "daily"
                      ? "Daily Report"
                      : reportType === "profit"
                        ? "Profit & Loss Report"
                        : "Report";

        // ========== CORPORATE HEADER ==========
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, pageWidth, 4, "F");

        doc.setFillColor(250, 250, 250);
        doc.rect(0, 4, pageWidth, 36, "F");

        doc.setFillColor(37, 99, 235);
        doc.rect(14, 10, 24, 24, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(companyName.charAt(0).toUpperCase(), 26, 26, {
          align: "center",
        });

        doc.setTextColor(17, 24, 39);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text(companyName, 44, 18);

        doc.setTextColor(107, 114, 128);
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.text(reportTitle, 44, 26);

        doc.setTextColor(107, 114, 128);
        doc.setFontSize(8);
        doc.text("Report Date", pageWidth - 14, 14, { align: "right" });
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(
          new Date().toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
          pageWidth - 14,
          21,
          { align: "right" },
        );

        doc.setTextColor(107, 114, 128);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("Period", pageWidth - 14, 28, { align: "right" });
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(selectedDate || "Today", pageWidth - 14, 35, {
          align: "right",
        });

        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.5);
        doc.line(14, 42, pageWidth - 14, 42);

        // ========== OVERVIEW STATISTICS ==========
        let yPos = 50;
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("OVERVIEW", 14, yPos);

        yPos += 6;
        const cardWidth = (pageWidth - 42) / 4;

        // Per-currency cash flow rows (only currencies with activity), so a
        // UGX/USD bureau's PDF shows real UGX/USD figures, not a KES-only line.
        const pdfByCurrency = computeCashflowByCurrency(
          dailyReport?.transactions || [],
        );
        const pdfCurrencies =
          pdfByCurrency.length > 0
            ? pdfByCurrency
            : [{ code: "USD", currency: 1, in: 0, out: 0 }];

        pdfCurrencies.forEach((c) => {
          const net = c.in - c.out;
          const netPositive = net >= 0;

          // Money In
          doc.setDrawColor(229, 231, 235);
          doc.rect(14, yPos, cardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text(`Money In (${c.code})`, 16, yPos + 6);
          doc.setFontSize(11);
          doc.setTextColor(22, 163, 74);
          doc.setFont("helvetica", "bold");
          doc.text(`${c.code} ${c.in.toLocaleString()}`, 16, yPos + 14);

          // Money Out
          doc.setDrawColor(229, 231, 235);
          doc.rect(14 + cardWidth + 4, yPos, cardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text(`Money Out (${c.code})`, 18 + cardWidth, yPos + 6);
          doc.setFontSize(11);
          doc.setTextColor(220, 38, 38);
          doc.setFont("helvetica", "bold");
          doc.text(
            `${c.code} ${c.out.toLocaleString()}`,
            18 + cardWidth,
            yPos + 14,
          );

          // Net Position
          doc.setDrawColor(229, 231, 235);
          doc.rect(14 + (cardWidth + 4) * 2, yPos, cardWidth * 2 + 4, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text(`Net Position (${c.code})`, 18 + (cardWidth + 4) * 2, yPos + 6);
          doc.setFontSize(11);
          doc.setTextColor(
            netPositive ? 22 : 185,
            netPositive ? 163 : 28,
            netPositive ? 74 : 28,
          );
          doc.setFont("helvetica", "bold");
          doc.text(
            `${netPositive ? "+" : ""}${c.code} ${net.toLocaleString()}`,
            18 + (cardWidth + 4) * 2,
            yPos + 14,
          );

          yPos += 24;
        });

        // Transactions (currency-agnostic)
        doc.setDrawColor(229, 231, 235);
        doc.rect(14, yPos, cardWidth, 20, "S");
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.setFont("helvetica", "normal");
        doc.text("Transactions", 16, yPos + 6);
        doc.setFontSize(11);
        doc.setTextColor(17, 24, 39);
        doc.setFont("helvetica", "bold");
        doc.text(
          String(
            dailyReport?.transactionSummary?.transactionCount ||
              (dailyReport?.transactions || []).length ||
              0,
          ),
          16,
          yPos + 14,
        );
        yPos += 24;

        // ========== BALANCES TABLE ==========
        yPos += 30;
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("ACCOUNT BALANCES", 14, yPos);

        // Cash & bank for every currency (KES, USD, UGX, EUR), then M-Pesa (KES)
        const balanceData: string[][] = [
          ...(dailyReport?.byCurrency || []).flatMap((r) => {
            const code = CURRENCY_CODES[r.currency];
            const always = r.currency === 0 || r.currency === 1;
            const rows: string[][] = [];
            if (always || r.openingCash || r.closingCash)
              rows.push([`Cash (${code})`, money(r.openingCash, r.currency), money(r.closingCash, r.currency)]);
            if (always || r.openingBank || r.closingBank)
              rows.push([`Bank (${code})`, money(r.openingBank, r.currency), money(r.closingBank, r.currency)]);
            return rows;
          }),
          // Was always printed as KES; each wallet currency now gets its own row.
          ...(dailyReport?.mobileMoney || []).map((w) => [
            `Mobile money (${CURRENCY_CODES[w.currency] || w.currency})`,
            money(w.opening, w.currency),
            money(w.closing, w.currency),
          ]),
        ];

        autoTable(doc, {
          startY: yPos + 4,
          head: [["Account", "Opening Balance", "Closing Balance"]],
          body: balanceData,
          theme: "plain",
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: {
            fillColor: [249, 250, 251],
            textColor: [75, 85, 99],
            fontStyle: "bold",
            lineWidth: 0.1,
            lineColor: [229, 231, 235],
          },
          bodyStyles: { lineWidth: 0.1, lineColor: [243, 244, 246] },
          columnStyles: {
            0: { cellWidth: 50, fontStyle: "bold" },
            1: { cellWidth: 55, halign: "right" },
            2: { cellWidth: 55, halign: "right" },
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          margin: { left: 14, right: 14 },
        });

        // ========== EXCHANGE SUMMARY (if applicable) ==========
        if (
          exchangeSummary &&
          (reportType === "exchange" || reportType === "daily")
        ) {
          const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
          yPos = finalY + 12;

          doc.setTextColor(17, 24, 39);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("EXCHANGE SUMMARY", 14, yPos);

          yPos += 6;
          const exchCardWidth = (pageWidth - 38) / 3;

          // USD Bought
          doc.setDrawColor(229, 231, 235);
          doc.rect(14, yPos, exchCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Foreign bought", 16, yPos + 6);
          doc.setFontSize(11);
          doc.setTextColor(37, 99, 235);
          doc.setFont("helvetica", "bold");
          doc.text(
            Object.entries(exchangeSummary.volumeByCurrency)
              .map(([c, v]) => money(v.bought, Number(c)))
              .join(" · ") || "0",
            16,
            yPos + 14,
          );

          // USD Sold
          doc.rect(14 + exchCardWidth + 5, yPos, exchCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Foreign sold", 18 + exchCardWidth + 5, yPos + 6);
          doc.setFontSize(11);
          doc.setTextColor(202, 138, 4);
          doc.setFont("helvetica", "bold");
          doc.text(
            Object.entries(exchangeSummary.volumeByCurrency)
              .map(([c, v]) => money(v.sold, Number(c)))
              .join(" · ") || "0",
            18 + exchCardWidth + 5,
            yPos + 14,
          );

          // Profit
          const profitPositive = (exchangeSummary.totalProfit || 0) >= 0;
          doc.rect(14 + (exchCardWidth + 5) * 2, yPos, exchCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Total Profit", 18 + (exchCardWidth + 5) * 2, yPos + 6);
          doc.setFontSize(11);
          doc.setTextColor(
            profitPositive ? 22 : 185,
            profitPositive ? 163 : 28,
            profitPositive ? 74 : 28,
          );
          doc.setFont("helvetica", "bold");
          doc.text(
            `${baseCode} ${(exchangeSummary.totalProfit || 0).toLocaleString()}`,
            18 + (exchCardWidth + 5) * 2,
            yPos + 14,
          );
        }

        // ========== CLIENT BALANCES (if applicable) ==========
        if (clientBalances.length > 0 && reportType === "clients") {
          const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
          yPos = finalY + 12;

          doc.setTextColor(17, 24, 39);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("CLIENT BALANCES", 14, yPos);

          const clientData = clientBalances.map((client) => [
            client.code,
            client.name,
            client.whatsAppNumber,
            ...clientCurrencies.map((c) => money(client.balances[c] || 0, c)),
          ]);

          autoTable(doc, {
            startY: yPos + 4,
            head: [["Code", "Name", "Phone", ...clientCurrencies.map((c) => `${CURRENCY_CODES[c]} Balance`)]],
            body: clientData,
            theme: "plain",
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: {
              fillColor: [249, 250, 251],
              textColor: [75, 85, 99],
              fontStyle: "bold",
              lineWidth: 0.1,
              lineColor: [229, 231, 235],
            },
            bodyStyles: { lineWidth: 0.1, lineColor: [243, 244, 246] },
            columnStyles: {
              0: { cellWidth: 22 },
              1: { cellWidth: clientCurrencies.length > 2 ? 34 : 45 },
              2: { cellWidth: clientCurrencies.length > 2 ? 28 : 35 },
              // one right-aligned column per currency (KES, USD, UGX, EUR)
              ...Object.fromEntries(clientCurrencies.map((_, i) => [3 + i, { halign: "right" as const }])),
            },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            margin: { left: 14, right: 14 },
            didParseCell: (data: any) => {
              if (
                data.section === "body" &&
                data.column.index >= 3
              ) {
                // "KES -82,000" — the sign follows the currency code
                const isNegative = /(^|\s)-/.test(String(data.cell.raw));
                data.cell.styles.textColor = isNegative
                  ? [185, 28, 28]
                  : [22, 163, 74];
                data.cell.styles.fontStyle = "bold";
              }
            },
            didDrawPage: (data: any) => {
              doc.setDrawColor(229, 231, 235);
              doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20);
              doc.setFontSize(7);
              doc.setTextColor(156, 163, 175);
              doc.text(companyName, 14, pageHeight - 12);
              doc.text(
                `Page ${data.pageNumber}`,
                pageWidth / 2,
                pageHeight - 12,
                { align: "center" },
              );
              doc.text("Confidential", pageWidth - 14, pageHeight - 12, {
                align: "right",
              });
            },
          });
        }

        // ========== TRANSACTIONS TABLE (if applicable) ==========
        // The rows on screen (search, currency, type and date range applied), all of them: the
        // PDF listed the first 50 of every transaction ever, whatever the filters said.
        const shownTxns: any[] = prev.filteredTransactions ?? transactions;
        if (shownTxns.length > 0 && reportType === "transactions") {
          const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
          yPos = finalY + 12;

          doc.setTextColor(17, 24, 39);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("TRANSACTIONS", 14, yPos);

          const txnData = shownTxns
            .map((txn: any) => [
              new Date(txn.transactionDate || txn.date).toLocaleDateString(
                "en-GB",
                { day: "2-digit", month: "short" },
              ),
              txn.code || txn.reference || "-",
              (txn.description || "").substring(0, 25) +
                ((txn.description?.length || 0) > 25 ? "..." : ""),
              // Mapped rows: type "debit" = money in, "credit" = money out (the raw
              // transactionType isn't on them, so this always printed "CR" before).
              txn.type === "debit" ? "IN" : txn.type === "credit" ? "OUT" : "TRF",
              typeof txn.currency === "string" ? txn.currency : CURRENCY_CODES[txn.currency] || "KES",
              `${txn.type === "debit" ? "+" : txn.type === "credit" ? "-" : ""}${(txn.amount || 0).toLocaleString()}`,
            ]);

          autoTable(doc, {
            startY: yPos + 4,
            head: [["Date", "Code", "Description", "Type", "Curr", "Amount"]],
            body: txnData,
            theme: "plain",
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: {
              fillColor: [249, 250, 251],
              textColor: [75, 85, 99],
              fontStyle: "bold",
              lineWidth: 0.1,
              lineColor: [229, 231, 235],
            },
            bodyStyles: { lineWidth: 0.1, lineColor: [243, 244, 246] },
            columnStyles: {
              0: { cellWidth: 22 },
              1: { cellWidth: 26 },
              2: { cellWidth: 55 },
              3: { cellWidth: 14, halign: "center" },
              4: { cellWidth: 14, halign: "center" },
              5: { cellWidth: 28, halign: "right" },
            },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            margin: { left: 14, right: 14 },
            didParseCell: (data: any) => {
              if (data.section === "body" && data.column.index === 3) {
                data.cell.styles.textColor =
                  data.cell.raw === "CR" ? [22, 163, 74] : [220, 38, 38];
                data.cell.styles.fontStyle = "bold";
              }
            },
            didDrawPage: (data: any) => {
              doc.setDrawColor(229, 231, 235);
              doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20);
              doc.setFontSize(7);
              doc.setTextColor(156, 163, 175);
              doc.text(companyName, 14, pageHeight - 12);
              doc.text(
                `Page ${data.pageNumber}`,
                pageWidth / 2,
                pageHeight - 12,
                { align: "center" },
              );
              doc.text(
                "Computer-generated report",
                pageWidth - 14,
                pageHeight - 12,
                { align: "right" },
              );
            },
          });
        }

        // ========== ACCOUNTS SUMMARY (if applicable) ==========
        if (accountSummary && reportType === "accounts") {
          const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
          yPos = finalY + 12;

          doc.setTextColor(17, 24, 39);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("ACCOUNTS SUMMARY", 14, yPos);

          yPos += 6;
          const acctCardWidth = (pageWidth - 38) / 3;

          // Total Cash
          doc.setDrawColor(229, 231, 235);
          doc.rect(14, yPos, acctCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Total Cash", 16, yPos + 6);
          doc.setFontSize(10);
          doc.setTextColor(17, 24, 39);
          doc.setFont("helvetica", "bold");
          doc.text(totalsLine(accountSummary.cashByCurrency), 16, yPos + 14);

          // Total Bank
          doc.rect(14 + acctCardWidth + 5, yPos, acctCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Total Bank", 18 + acctCardWidth + 5, yPos + 6);
          doc.setFontSize(10);
          doc.setTextColor(17, 24, 39);
          doc.setFont("helvetica", "bold");
          doc.text(totalsLine(accountSummary.bankByCurrency), 18 + acctCardWidth + 5, yPos + 14);

          // Total M-Pesa
          doc.rect(14 + (acctCardWidth + 5) * 2, yPos, acctCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Total mobile money", 18 + (acctCardWidth + 5) * 2, yPos + 6);
          doc.setFontSize(10);
          doc.setTextColor(17, 24, 39);
          doc.setFont("helvetica", "bold");
          doc.text(
            totalsLine(accountSummary.mpesaByCurrency || { [base]: accountSummary.totalMpesa || 0 }),
            18 + (acctCardWidth + 5) * 2,
            yPos + 14,
          );
        }

        // ========== PROFIT & LOSS (if applicable) ==========
        if (profitLossData && reportType === "profit") {
          const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
          yPos = finalY + 12;

          doc.setTextColor(17, 24, 39);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("PROFIT & LOSS SUMMARY", 14, yPos);

          yPos += 6;
          const plCardWidth = (pageWidth - 42) / 4;

          // Exchange Profit
          const exchProfitPositive = (profitLossData.exchangeProfit || 0) >= 0;
          doc.setDrawColor(229, 231, 235);
          doc.rect(14, yPos, plCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Exchange Profit", 16, yPos + 6);
          doc.setFontSize(10);
          doc.setTextColor(
            exchProfitPositive ? 22 : 185,
            exchProfitPositive ? 163 : 28,
            exchProfitPositive ? 74 : 28,
          );
          doc.setFont("helvetica", "bold");
          doc.text(
            `${baseCode} ${(profitLossData.exchangeProfit || 0).toLocaleString()}`,
            16,
            yPos + 14,
          );

          // Total Income
          doc.rect(14 + plCardWidth + 4, yPos, plCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Total Income", 18 + plCardWidth, yPos + 6);
          doc.setFontSize(10);
          doc.setTextColor(22, 163, 74);
          doc.setFont("helvetica", "bold");
          doc.text(
            `${baseCode} ${(profitLossData.totalIncome || 0).toLocaleString()}`,
            18 + plCardWidth,
            yPos + 14,
          );

          // Total Expenses
          doc.rect(14 + (plCardWidth + 4) * 2, yPos, plCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Total Expenses", 18 + (plCardWidth + 4) * 2, yPos + 6);
          doc.setFontSize(10);
          doc.setTextColor(220, 38, 38);
          doc.setFont("helvetica", "bold");
          doc.text(
            `${baseCode} ${(profitLossData.totalExpenses || 0).toLocaleString()}`,
            18 + (plCardWidth + 4) * 2,
            yPos + 14,
          );

          // Net Profit
          const netProfitPositive = (profitLossData.netProfit || 0) >= 0;
          doc.rect(14 + (plCardWidth + 4) * 3, yPos, plCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Net Profit", 18 + (plCardWidth + 4) * 3, yPos + 6);
          doc.setFontSize(10);
          doc.setTextColor(
            netProfitPositive ? 22 : 185,
            netProfitPositive ? 163 : 28,
            netProfitPositive ? 74 : 28,
          );
          doc.setFont("helvetica", "bold");
          doc.text(
            `${baseCode} ${(profitLossData.netProfit || 0).toLocaleString()}`,
            18 + (plCardWidth + 4) * 3,
            yPos + 14,
          );
        }

        // ========== FOOTER ==========
        const lastY = (doc as any).lastAutoTable?.finalY || yPos + 30;
        if (lastY < pageHeight - 40) {
          doc.setDrawColor(229, 231, 235);
          doc.line(14, lastY + 12, pageWidth - 14, lastY + 12);

          doc.setFontSize(7);
          doc.setTextColor(156, 163, 175);
          doc.text(
            "This is a computer-generated report and does not require a signature.",
            pageWidth / 2,
            lastY + 20,
            { align: "center" },
          );
          doc.text(
            `${companyName} • Generated on ${new Date().toLocaleString()}`,
            pageWidth / 2,
            lastY + 26,
            { align: "center" },
          );
        }

        const fileName = `${companyName.replace(
          /\s+/g,
          "_",
        )}_${reportTitle.replace(/\s+/g, "_")}_${
          localDate()
        }.pdf`;
        doc.save(fileName);
        toast.success("Report exported successfully!");
      } catch (error) {
        console.error("Error generating PDF:", error);
        toast.error("Failed to generate PDF");
      }
    } else if (format === "csv" || format === "excel") {
      // CSV/Excel export
      let csvData: string[][] = [];

      if (reportType === "clients" && clientBalances.length > 0) {
        csvData = [
          [
            "Code",
            "Name",
            "Phone",
            ...clientCurrencies.map((c) => `${CURRENCY_CODES[c]} Balance`),
            "Balance Type",
          ],
          ...clientBalances.map((client) => [
            client.code,
            client.name,
            client.whatsAppNumber,
            ...clientCurrencies.map((c) => String(client.balances[c] || 0)),
            client.balanceType,
          ]),
        ];
      } else if (reportType === "transactions") {
        // The transactions report exported the DAILY summary as its CSV. Now: the rows on screen.
        const rows: any[] = prev.filteredTransactions ?? transactions;
        csvData = [
          ["Date", "Code", "Description", "Direction", "Currency", "Amount"],
          ...rows.map((t: any) => [
            t.date ? new Date(t.date).toLocaleString("en-GB") : "",
            t.code || t.reference || t.id || "",
            t.description || "",
            t.type === "debit" ? "IN" : t.type === "credit" ? "OUT" : "TRANSFER",
            typeof t.currency === "string" ? t.currency : CURRENCY_CODES[t.currency] || "",
            String(t.amount ?? 0),
          ]),
        ];
      } else if (dailyReport) {
        // Per-currency Money In/Out rows (only currencies with activity).
        const csvByCurrency = computeCashflowByCurrency(
          dailyReport.transactions || [],
        );
        const cashflowRows: string[][] = csvByCurrency.flatMap((c) => [
          [`Money In (${c.code})`, c.in.toString()],
          [`Money Out (${c.code})`, c.out.toString()],
          [`Net Flow (${c.code})`, (c.in - c.out).toString()],
        ]);
        csvData = [
          ["Metric", "Value"],
          ["Report Date", dailyReport.date || new Date().toLocaleDateString()],
          ...cashflowRows,
          [
            "Transaction Count",
            dailyReport.transactionSummary?.transactionCount?.toString() ||
              (dailyReport.transactions || []).length.toString(),
          ],
          // Cash & bank, opening and closing, for every currency held
          ...(dailyReport.byCurrency || []).flatMap((r) => {
            const code = CURRENCY_CODES[r.currency];
            return [
              [`Cash ${code} (Opening)`, String(r.openingCash)],
              [`Cash ${code} (Closing)`, String(r.closingCash)],
              [`Bank ${code} (Opening)`, String(r.openingBank)],
              [`Bank ${code} (Closing)`, String(r.closingBank)],
            ];
          }),
          ...(dailyReport.mobileMoney || []).flatMap((w) => [
            [`Mobile money ${CURRENCY_CODES[w.currency]} (Opening)`, String(w.opening)],
            [`Mobile money ${CURRENCY_CODES[w.currency]} (Closing)`, String(w.closing)],
          ]),
        ];
      }

      if (csvData.length > 0) {
        const csv = csvData
          // Quotes doubled (a description with " broke the row) and text that Excel would run as
          // a formula ("=…", "+…", "@…") prefixed with ' so it opens as text.
          .map((row) =>
            row
              .map((cell) => {
                let v = String(cell ?? "");
                if (/^[=+@]/.test(v) || /^-[^0-9.]/.test(v)) v = "'" + v;
                return `"${v.replace(/"/g, '""')}"`;
              })
              .join(","),
          )
          .join("\n");
        const blob = new Blob([csv], {
          type: format === "csv" ? "text/csv" : "application/vnd.ms-excel",
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `report_${reportType}_${
          localDate()
        }.${format === "csv" ? "csv" : "xls"}`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success(`Report exported as ${format.toUpperCase()}!`);
      } else {
        toast.error("No data to export");
      }
    }
  };
  const handlePrint = () => {
    window.print();
  };
  useEffect(() => { setDailyShown(50); }, [dailyReport]);
  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);
  useEffect(() => {
    resetRatesLoaded();
    loadKesRates(base).then(() => setRatesLoaded((n) => n + 1)).catch(() => {});
  }, [base]);
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, currencyFilter, transactionTypeFilter, reportType, dateRange, dateFrom, dateTo]);

  return {
    COLORS,
    handleExport,
    handlePrint,
  };
}
