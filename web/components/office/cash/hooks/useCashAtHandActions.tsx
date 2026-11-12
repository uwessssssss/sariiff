"use client";

import { CURRENCY_META, currencyCode, formatMoney, getStoredAuth } from "@/lib/api";
import autoTable from "jspdf-autotable";
import { escapeHtml, printHtml } from "@/lib/print";
import jsPDF from "jspdf";
import { localDate } from "@/lib/dates";
import { rowsFromStats } from "../../CurrencyTotals";
import { toast } from "sonner";
import { useEffect } from "react";
import { type useCashAtHandData } from "./useCashAtHandData";

/** CashAtHand: actions (part 2 of 2 of useCashAtHand). */
export function useCashAtHandActions(prev: ReturnType<typeof useCashAtHandData>) {
  const { fetchCashAccounts, fetchStats, fetchTransactions, filteredTransactions, getCurrencyName, setIsLoading, stats } = prev;
  const handleExport = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Get company info from auth
      const auth = getStoredAuth();
      const companyName = auth?.user?.companyName || "Money Exchange";
      const companyPhone = auth?.user?.whatsAppNumber || "";

      // ========== CORPORATE HEADER ==========
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, pageWidth, 4, "F");

      doc.setFillColor(250, 250, 250);
      doc.rect(0, 4, pageWidth, 36, "F");

      doc.setFillColor(37, 99, 235);
      doc.rect(14, 10, 24, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
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
      doc.text("Cash at Hand Report", 44, 26);

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

      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(14, 42, pageWidth - 14, 42);

      // ========== CASH BALANCES ==========
      let yPos = 50;
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("CASH PORTFOLIO", 14, yPos);

      yPos += 6;
      const cardWidth = (pageWidth - 32) / 2;

      // One card per currency held (KES, USD, UGX, EUR), two per row
      const summaryRows = rowsFromStats(stats);
      summaryRows.forEach((r, i) => {
        const x = i % 2 === 0 ? 14 : 18 + cardWidth;
        if (i > 0 && i % 2 === 0) yPos += 32;
        const code = currencyCode(r.currency);
        doc.setDrawColor(229, 231, 235);
        doc.rect(x, yPos, cardWidth, 28, "S");
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.setFont("helvetica", "normal");
        doc.text(`${CURRENCY_META[r.currency]?.label ?? code} (${code})`, x + 4, yPos + 8);
        const positive = r.balance >= 0;
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(positive ? 22 : 185, positive ? 163 : 28, positive ? 74 : 28);
        doc.text(`${positive ? "" : "-"}${formatMoney(Math.abs(r.balance), r.currency)}`, x + 4, yPos + 18);
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.text(`In: ${r.moneyIn.toLocaleString()} | Out: ${r.moneyOut.toLocaleString()}`, x + 4, yPos + 24);
      });

      // ========== TRANSACTION HISTORY ==========
      if (filteredTransactions.length > 0) {
        yPos += 38;
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("TRANSACTION HISTORY", 14, yPos);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(9);
        doc.text(
          `${filteredTransactions.length} transactions`,
          pageWidth - 14,
          yPos,
          { align: "right" },
        );

        const txnTableData = filteredTransactions.map((txn) => {
          const isCredit = txn.thisAccountAction === "Credit";
          const currencyLabel = getCurrencyName(txn.currency);
          return [
            new Date(txn.date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "2-digit",
            }),
            txn.reference || txn.code,
            txn.description.substring(0, 28) +
              (txn.description.length > 28 ? "..." : ""),
            isCredit ? "CR" : "DR",
            currencyLabel,
            txn.amount.toLocaleString(),
            `${txn.balanceAfter >= 0 ? "" : "-"}${Math.abs(
              txn.balanceAfter,
            ).toLocaleString()}`,
          ];
        });

        autoTable(doc, {
          startY: yPos + 4,
          head: [
            [
              "Date",
              "Reference",
              "Description",
              "Type",
              "Curr",
              "Amount",
              "Balance",
            ],
          ],
          body: txnTableData,
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
            2: { cellWidth: 46 },
            3: { cellWidth: 12, halign: "center" },
            4: { cellWidth: 14, halign: "center" },
            5: { cellWidth: 26, halign: "right" },
            6: { cellWidth: 28, halign: "right" },
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          margin: { left: 14, right: 14 },
          didParseCell: (data: any) => {
            if (data.section === "body" && data.column.index === 3) {
              // Asset account: DR = money IN (green), CR = money OUT (red)
              data.cell.styles.textColor =
                data.cell.raw === "DR" ? [22, 163, 74] : [220, 38, 38];
              data.cell.styles.fontStyle = "bold";
            }
            if (data.section === "body" && data.column.index === 6) {
              const isNegative = (data.cell.raw as string).startsWith("-");
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
            doc.text(
              "Computer-generated report",
              pageWidth - 14,
              pageHeight - 12,
              { align: "right" },
            );
          },
        });
      }

      const fileName = `${companyName.replace(/\s+/g, "_")}_Cash_Report_${
        localDate()
      }.pdf`;
      doc.save(fileName);
      toast.success("Cash report exported successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };
  const handlePrint = () => {
    const auth = getStoredAuth();
    const companyName = auth?.user?.companyName || "Money Exchange";

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cash at Hand Report - ${escapeHtml(companyName)}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #111827; font-size: 12px; }
          .header { border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 20px; }
          .company-name { font-size: 24px; font-weight: bold; }
          .doc-title { color: #6b7280; font-size: 14px; margin-top: 4px; }
          .summary-row { display: flex; gap: 20px; margin-bottom: 20px; }
          .summary-card { flex: 1; border: 1px solid #e5e7eb; padding: 16px; }
          .summary-card label { color: #6b7280; font-size: 10px; display: block; margin-bottom: 8px; }
          .summary-card .value { font-size: 20px; font-weight: bold; }
          .positive { color: #16a34a; }
          .negative { color: #dc2626; }
          .meta { color: #6b7280; font-size: 10px; margin-top: 8px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f9fafb; color: #4b5563; font-weight: 600; text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e7eb; }
          td { padding: 10px 8px; border-bottom: 1px solid #f3f4f6; }
          tr:nth-child(even) { background: #f9fafb; }
          .cr { color: #dc2626; font-weight: 600; }
          .dr { color: #16a34a; font-weight: 600; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">${escapeHtml(companyName)}</div>
          <div class="doc-title">Cash at Hand Report • ${escapeHtml(new Date().toLocaleDateString(
            "en-GB",
            { day: "2-digit", month: "long", year: "numeric" },
          ))}</div>
        </div>

        <div class="summary-row">
          ${rowsFromStats(stats)
            .map(
              (r) => `<div class="summary-card">
            <label>${escapeHtml(CURRENCY_META[r.currency]?.label ?? currencyCode(r.currency))} (${escapeHtml(currencyCode(r.currency))})</label>
            <div class="value ${escapeHtml(r.balance >= 0 ? "positive" : "negative")}">${escapeHtml(r.balance >= 0 ? "" : "-")}${escapeHtml(formatMoney(Math.abs(r.balance), r.currency))}</div>
            <div class="meta">In: ${escapeHtml(r.moneyIn.toLocaleString())} | Out: ${escapeHtml(r.moneyOut.toLocaleString())}</div>
          </div>`,
            )
            .join("")}
        </div>

        <h3 style="margin-bottom: 10px;">Transaction History (${escapeHtml(
          filteredTransactions.length
        )})</h3>
        <table>
          <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th class="text-center">Type</th><th class="text-center">Curr</th><th class="text-right">Amount</th><th class="text-right">Balance</th></tr></thead>
          <tbody>
            ${filteredTransactions
              .map(
                (txn) => `
              <tr>
                <td>${escapeHtml(new Date(txn.date).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "2-digit",
                }))}</td>
                <td>${escapeHtml(txn.reference || txn.code)}</td>
                <td>${escapeHtml(txn.description.substring(0, 35))}${escapeHtml(
                  txn.description.length > 35 ? "..." : ""
                )}</td>
                <td class="text-center ${escapeHtml(
                  txn.thisAccountAction === "Credit" ? "cr" : "dr"
                )}">${escapeHtml(txn.thisAccountAction === "Credit" ? "CR" : "DR")}</td>
                <td class="text-center">${escapeHtml(
                  getCurrencyName(txn.currency)
                )}</td>
                <td class="text-right">${escapeHtml(txn.amount.toLocaleString())}</td>
                <td class="text-right ${escapeHtml(
                  txn.balanceAfter >= 0 ? "positive" : "negative"
                )}">${escapeHtml(txn.balanceAfter >= 0 ? "" : "-")}${escapeHtml(Math.abs(
                  txn.balanceAfter,
                ).toLocaleString())}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>

        <div class="footer">
          <p>This is a computer-generated report. ${escapeHtml(companyName)} • ${escapeHtml(new Date().toLocaleString())}</p>
        </div>
      </body>
      </html>
    `;

    // Sandboxed, script-free print (lib/print.ts); values above are escaped.
    if (!printHtml(printContent)) {
      toast.error("Couldn't open the print view");
      return;
    }
    toast.success("Print preview opened!");
  };
  // Initial data fetch
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchCashAccounts(),
        fetchStats(),
        fetchTransactions(),
      ]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchCashAccounts, fetchStats, fetchTransactions]);

  return {
    handleExport,
    handlePrint,
  };
}
