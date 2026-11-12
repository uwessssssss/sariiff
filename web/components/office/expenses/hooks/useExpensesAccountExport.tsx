"use client";

import { ExpenseTransaction } from "../helpers";
import autoTable from "jspdf-autotable";
import { escapeHtml, printHtml } from "@/lib/print";
import { formatMoney, getStoredAuth } from "@/lib/api";
import jsPDF from "jspdf";
import { localDate } from "@/lib/dates";
import { toast } from "sonner";
import { useEffect } from "react";
import { type useExpensesAccountState } from "./useExpensesAccountState";

/** ExpensesAccount: export (part 2 of 2 of useExpensesAccount). */
export function useExpensesAccountExport(prev: ReturnType<typeof useExpensesAccountState>) {
  const { allCategories, allExpenses, bankAccounts, base, cashAccounts, categoriesCurrentPage, fetchCategories, fetchExpenses, fetchPaymentAccounts, fetchStats, formData, getAvailableAccounts, mpesaAgents, searchTerm, selectedCategory, setEditFormData, setExpenseToDelete, setFormData, setIsLoading, setSelectedExpense, setShowDeleteModal, setShowEditExpense, stats, transactionSearch, transactionsCurrentPage } = prev;
  const openEditModal = (expense: ExpenseTransaction) => {
    setSelectedExpense(expense);
    setEditFormData({
      description: expense.description,
      vendor: expense.vendor === "Unknown" ? "" : expense.vendor,
      amount: expense.amount,
      reference: expense.reference,
    });
    setShowEditExpense(true);
  };
  const openDeleteModal = (expense: ExpenseTransaction) => {
    setExpenseToDelete(expense);
    setShowDeleteModal(true);
  };
  // ==============================================
  // Export & Print Functions - Corporate Design
  // ==============================================

  const handleExportPDF = () => {
    if (!selectedCategory) {
      toast.error("Please select a category first");
      return;
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Get company info from auth - with safe defaults
      const auth = getStoredAuth();
      const companyName = auth?.user?.companyName || "Money Exchange";

      // Safe category data access
      const categoryName = selectedCategory.name || "Unknown Category";
      const kesTotal = selectedCategory.kesTotal ?? 0;
      const usdTotal = selectedCategory.usdTotal ?? 0;
      const transactionCount = selectedCategory.transactionCount ?? 0;
      const isActive = selectedCategory.isActive !== false;

      // ========== CORPORATE HEADER ==========
      doc.setFillColor(16, 185, 129); // Emerald for expenses
      doc.rect(0, 0, pageWidth, 4, "F");

      doc.setFillColor(250, 250, 250);
      doc.rect(0, 4, pageWidth, 36, "F");

      doc.setFillColor(16, 185, 129);
      doc.rect(14, 10, 24, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("E", 26, 26, { align: "center" });

      doc.setTextColor(17, 24, 39);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(companyName, 44, 18);

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Expense Category Report", 44, 26);

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
      doc.text("Category", pageWidth - 14, 28, { align: "right" });
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(categoryName, pageWidth - 14, 35, { align: "right" });

      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(14, 42, pageWidth - 14, 42);

      // ========== CATEGORY INFORMATION ==========
      let yPos = 50;
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("CATEGORY DETAILS", 14, yPos);

      yPos += 6;
      doc.setFillColor(249, 250, 251);
      doc.rect(14, yPos, pageWidth - 28, 20, "F");

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39);
      doc.text(categoryName, 18, yPos + 8);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      doc.text(`${transactionCount} transactions recorded`, 18, yPos + 15);

      // Status badge
      doc.setFillColor(
        isActive ? 220 : 254,
        isActive ? 252 : 226,
        isActive ? 231 : 226,
      );
      doc.rect(pageWidth - 40, yPos + 4, 22, 6, "F");
      doc.setFontSize(7);
      doc.setTextColor(
        isActive ? 22 : 153,
        isActive ? 101 : 27,
        isActive ? 52 : 27,
      );
      doc.text(isActive ? "ACTIVE" : "INACTIVE", pageWidth - 29, yPos + 8, {
        align: "center",
      });

      // ========== EXPENSE SUMMARY ==========
      yPos += 28;
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("EXPENSE SUMMARY", 14, yPos);

      yPos += 6;
      const cardWidth = (pageWidth - 38) / 3;

      // Total spent, every currency (KES, USD, UGX, EUR)
      doc.setDrawColor(229, 231, 235);
      doc.rect(14, yPos, cardWidth * 2 + 5, 20, "S");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.setFont("helvetica", "normal");
      doc.text("Total spent", 16, yPos + 6);
      doc.setFontSize(11);
      doc.setTextColor(220, 38, 38);
      doc.setFont("helvetica", "bold");
      doc.text(totalsText(selectedCategory.totals), 16, yPos + 14);

      // Transaction Count
      doc.rect(14 + (cardWidth + 5) * 2, yPos, cardWidth, 20, "S");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.setFont("helvetica", "normal");
      doc.text("Transactions", 18 + (cardWidth + 5) * 2, yPos + 6);
      doc.setFontSize(11);
      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "bold");
      doc.text(String(transactionCount), 18 + (cardWidth + 5) * 2, yPos + 14);

      // ========== TRANSACTION HISTORY ==========
      if (filteredTransactions && filteredTransactions.length > 0) {
        yPos += 30;
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("EXPENSE TRANSACTIONS", 14, yPos);

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
          const desc = txn.description || "";
          const vendor = txn.vendor || "";
          const dateStr = txn.date || new Date().toISOString();
          return [
            new Date(dateStr).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "2-digit",
            }),
            txn.code || "-",
            desc.substring(0, 25) + (desc.length > 25 ? "..." : ""),
            vendor.substring(0, 15) + (vendor.length > 15 ? "..." : ""),
            txn.paymentMethod || "-",
            txn.currency || "-",
            (txn.amount ?? 0).toLocaleString(),
          ];
        });

        autoTable(doc, {
          startY: yPos + 4,
          head: [
            [
              "Date",
              "Code",
              "Description",
              "Vendor",
              "Method",
              "Curr",
              "Amount",
            ],
          ],
          body: txnTableData,
          theme: "plain",
          styles: { fontSize: 7, cellPadding: 2.5 },
          headStyles: {
            fillColor: [249, 250, 251],
            textColor: [75, 85, 99],
            fontStyle: "bold",
            lineWidth: 0.1,
            lineColor: [229, 231, 235],
          },
          bodyStyles: { lineWidth: 0.1, lineColor: [243, 244, 246] },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 22 },
            2: { cellWidth: 40 },
            3: { cellWidth: 28 },
            4: { cellWidth: 20 },
            5: { cellWidth: 14, halign: "center" },
            6: { cellWidth: 26, halign: "right" },
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          margin: { left: 14, right: 14 },
          didParseCell: (data: any) => {
            if (data.section === "body" && data.column.index === 6) {
              data.cell.styles.textColor = [220, 38, 38];
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
            doc.text("Expense Report", pageWidth - 14, pageHeight - 12, {
              align: "right",
            });
          },
        });
      }

      const safeCategoryName = categoryName.replace(/[^a-zA-Z0-9]/g, "-");
      const fileName = `${companyName.replace(
        /\s+/g,
        "_",
      )}_Expenses_${safeCategoryName}_${
        localDate()
      }.pdf`;
      doc.save(fileName);
      toast.success("Expense report exported successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };
  const handlePrint = () => {
    if (!selectedCategory) {
      toast.error("Please select a category first");
      return;
    }

    const auth = getStoredAuth();
    const companyName = auth?.user?.companyName || "Money Exchange";

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Expense Report - ${escapeHtml(selectedCategory.name)}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #111827; font-size: 12px; }
          .header { border-bottom: 3px solid #10b981; padding-bottom: 20px; margin-bottom: 20px; }
          .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
          .company-name { font-size: 24px; font-weight: bold; color: #111827; }
          .doc-title { color: #6b7280; font-size: 14px; margin-top: 4px; }
          .doc-info { text-align: right; }
          .doc-info label { color: #6b7280; font-size: 10px; display: block; }
          .doc-info span { font-weight: bold; color: #111827; }
          .category-box { background: #f9fafb; padding: 16px; margin-bottom: 20px; }
          .category-name { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
          .category-details { color: #6b7280; }
          .summary-row { display: flex; gap: 16px; margin-bottom: 20px; }
          .summary-card { flex: 1; border: 1px solid #e5e7eb; padding: 12px; }
          .summary-card label { color: #6b7280; font-size: 10px; display: block; margin-bottom: 4px; }
          .summary-card .value { font-size: 16px; font-weight: bold; color: #dc2626; }
          .summary-card .value.neutral { color: #111827; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f9fafb; color: #4b5563; font-weight: 600; text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e7eb; }
          td { padding: 10px 8px; border-bottom: 1px solid #f3f4f6; }
          tr:nth-child(even) { background: #f9fafb; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .amount { color: #dc2626; font-weight: 600; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 10px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-top">
            <div>
              <div class="company-name">${escapeHtml(companyName)}</div>
              <div class="doc-title">Expense Category Report</div>
            </div>
            <div class="doc-info">
              <label>Report Date</label>
              <span>${escapeHtml(new Date().toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              }))}</span>
              <br/><br/>
              <label>Category</label>
              <span>${escapeHtml(selectedCategory.name)}</span>
            </div>
          </div>
        </div>

        <div class="category-box">
          <div class="category-name">${escapeHtml(selectedCategory.name)}</div>
          <div class="category-details">
            ${escapeHtml(selectedCategory.transactionCount)} transactions recorded
          </div>
        </div>

        <div class="summary-row">
          <div class="summary-card" style="flex:2">
            <label>Total spent</label>
            <div class="value">${escapeHtml(totalsText(selectedCategory.totals))}</div>
          </div>
          <div class="summary-card">
            <label>Transactions</label>
            <div class="value neutral">${escapeHtml(
              selectedCategory.transactionCount
            )}</div>
          </div>
        </div>

        <h3 style="margin-bottom: 10px;">Expense Transactions</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Code</th>
              <th>Description</th>
              <th>Vendor</th>
              <th>Method</th>
              <th class="text-center">Curr</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
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
                <td>${escapeHtml(txn.code)}</td>
                <td>${escapeHtml(txn.description.substring(0, 30))}${escapeHtml(
                  txn.description.length > 30 ? "..." : ""
                )}</td>
                <td>${escapeHtml(txn.vendor.substring(0, 18))}${escapeHtml(
                  txn.vendor.length > 18 ? "..." : ""
                )}</td>
                <td>${escapeHtml(txn.paymentMethod)}</td>
                <td class="text-center">${escapeHtml(txn.currency)}</td>
                <td class="text-right amount">${escapeHtml(txn.amount.toLocaleString())}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>

        <div class="footer">
          <p>This is a computer-generated report and does not require a signature.</p>
          <p>${escapeHtml(companyName)} • Generated on ${escapeHtml(new Date().toLocaleString())}</p>
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
  const getCategoryExpenses = (categoryId: string) =>
    allExpenses.filter((exp) => exp.categoryId === categoryId);
  const filteredCategories = allCategories.filter(
    (cat) =>
      cat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cat.id.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const categoriesPerPage = 10;
  const currentCategories = filteredCategories.slice(
    (categoriesCurrentPage - 1) * categoriesPerPage,
    categoriesCurrentPage * categoriesPerPage,
  );
  const totalCategoryPages = Math.ceil(
    filteredCategories.length / categoriesPerPage,
  );
  const totalKes =
    stats.totalKES || allCategories.reduce((sum, cat) => sum + cat.kesTotal, 0);
  const totalUsd =
    stats.totalUSD || allCategories.reduce((sum, cat) => sum + cat.usdTotal, 0);
  // Spend per currency for the summary card (KES, USD, UGX, EUR)
  const spendByCurrency: { currency: number; total: number; thisMonth: number }[] =
    stats.byCurrency && stats.byCurrency.length > 0
      ? stats.byCurrency
      : [
          { currency: 0, total: totalKes, thisMonth: stats.thisMonthKES },
          { currency: 1, total: totalUsd, thisMonth: stats.thisMonthUSD },
        ].filter((r) => r.total);
  const totalsText = (t: { currency: number; amount: number }[]) =>
    t.filter((x) => x.amount).map((x) => formatMoney(x.amount, x.currency)).join(" · ") || "-";
  const categoryTransactions = selectedCategory
    ? getCategoryExpenses(selectedCategory.id)
    : [];
  const filteredTransactions = categoryTransactions.filter(
    (txn) =>
      txn.description.toLowerCase().includes(transactionSearch.toLowerCase()) ||
      txn.reference.toLowerCase().includes(transactionSearch.toLowerCase()),
  );
  const transactionsPerPage = 10;
  const currentTransactions = filteredTransactions.slice(
    (transactionsCurrentPage - 1) * transactionsPerPage,
    transactionsCurrentPage * transactionsPerPage,
  );
  const totalTransactionPages = Math.ceil(
    filteredTransactions.length / transactionsPerPage,
  );
  const availableAccounts = getAvailableAccounts();
  // FIXED: Use !== false to handle undefined isActive (default to true)
  const hasCashAccounts = cashAccounts.some(
    (acc) => acc.currency === formData.currency && acc.isActive !== false,
  );
  const hasBankAccounts = bankAccounts.some(
    (acc) => acc.currency === formData.currency && acc.isActive !== false,
  );
  const hasMpesaAccounts = mpesaAgents.some(
    (acc) => acc.isActive !== false && ((acc as any).currency ?? base) === formData.currency,
  );
  // The home currency arrives after first render — apply it to an untouched form.
  useEffect(() => {
    setFormData((f) => (f.amount ? f : { ...f, currency: base }));
  }, [base]);
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchCategories(),
        fetchExpenses(),
        fetchStats(),
        fetchPaymentAccounts(),
      ]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchCategories, fetchExpenses, fetchStats, fetchPaymentAccounts]);
  useEffect(() => {
    const accounts = getAvailableAccounts();
    if (accounts.length > 0) {
      const valid = accounts.some(
        (acc) => acc.id === formData.paymentAccountId,
      );
      if (!formData.paymentAccountId || !valid) {
        setFormData((prev) => ({ ...prev, paymentAccountId: accounts[0].id }));
      }
    } else {
      setFormData((prev) => ({ ...prev, paymentAccountId: "" }));
    }
  }, [formData.paymentAccountType, formData.currency, getAvailableAccounts]);

  return {
    openEditModal,
    openDeleteModal,
    handleExportPDF,
    handlePrint,
    getCategoryExpenses,
    filteredCategories,
    categoriesPerPage,
    currentCategories,
    totalCategoryPages,
    totalKes,
    totalUsd,
    spendByCurrency,
    totalsText,
    categoryTransactions,
    filteredTransactions,
    transactionsPerPage,
    currentTransactions,
    totalTransactionPages,
    availableAccounts,
    hasCashAccounts,
    hasBankAccounts,
    hasMpesaAccounts,
  };
}
