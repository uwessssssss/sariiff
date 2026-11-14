"use client";

import { BulkReconcileDto, CreateReconciliationDto, ReconcileTransactionDto, ReconciliationStatus, TransactionReconciliationDto, TransactionType, bulkReconcileTransactions, createReconciliationRecord, getAccountTypeLabel, getCurrencyLabel, getReconciliationStatusLabel, getStoredAuth, reconcileTransaction } from "@/lib/api";
import autoTable from "jspdf-autotable";
import jsPDF from "jspdf";
import { localDate } from "@/lib/dates";
import { toast } from "sonner";
import { type useReconciliationState } from "./useReconciliationState";

/** Reconciliation: actions (part 2 of 3 of useReconciliation). */
export function useReconciliationActions(prev: ReturnType<typeof useReconciliationState>) {
  const { actualBalanceInput, balanceSummary, effectiveActualBalance, fetchAccounts, fetchBalanceSummary, fetchReconciliationHistoryData, fetchTransactions, filteredTransactions, matchSuggestions, reconcileForm, selectedAccount, selectedAccountId, selectedAccountType, selectedTransaction, selectedTransactions, setAdjustmentNote, setIsLoading, setIsSubmitting, setMatchSuggestions, setReconcileForm, setSelectedTransaction, setSelectedTransactions, setShowAdjustmentForm, setShowBulkModal, setShowCompleteModal, setShowReconcileModal, setStatementEntries, transactions } = prev;
  const handleAcceptAllSuggestions = async () => {
    // One statement line pays one transaction: take the strongest pair first and never use a
    // transaction or a statement line twice (two transactions of the same amount on the same
    // day were both "matched" to one bank line).
    const usedTxn = new Set<string>();
    const usedEntry = new Set<string>();
    const highConfidence = matchSuggestions
      .filter((s) => s.confidence >= 80)
      .sort((a, b) => b.confidence - a.confidence)
      .filter((s) => {
        if (usedTxn.has(s.transactionId) || usedEntry.has(s.statementEntryId)) return false;
        usedTxn.add(s.transactionId);
        usedEntry.add(s.statementEntryId);
        return true;
      });
    if (highConfidence.length === 0) {
      toast.info("No high-confidence matches to accept");
      return;
    }

    setIsSubmitting(true);
    let successCount = 0;

    for (const suggestion of highConfidence) {
      try {
        const dto: ReconcileTransactionDto = {
          actualAmount: suggestion.statementEntry.amount,
          status: ReconciliationStatus.Matched,
          notes: `Auto-matched: ${suggestion.statementEntry.description} (${suggestion.confidence}% confidence)`,
        };

        const response = await reconcileTransaction(
          suggestion.transactionId,
          dto,
        );
        if (response.success) {
          successCount++;
          setStatementEntries((prev) =>
            prev.map((e) =>
              e.id === suggestion.statementEntryId
                ? {
                    ...e,
                    matched: true,
                    matchedTransactionId: suggestion.transactionId,
                  }
                : e,
            ),
          );
        }
      } catch (error) {
        console.error("Error auto-matching:", error);
      }
    }

    setMatchSuggestions((prev) => prev.filter((s) => !usedTxn.has(s.transactionId) && !usedEntry.has(s.statementEntryId)));
    await Promise.all([
      fetchTransactions(),
      fetchBalanceSummary(),
      fetchAccounts(),
    ]);
    if (successCount === highConfidence.length) toast.success(`✓ Matched ${successCount} transactions`);
    else toast.warning(`Matched ${successCount} of ${highConfidence.length}; the rest could not be saved. Refresh and check them.`);
    setIsSubmitting(false);
  };
  // ==================== HANDLERS ====================

  const handleSelectTransaction = (id: string) => {
    setSelectedTransactions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };
  const handleSelectAll = () => {
    const pendingTransactions = filteredTransactions.filter(
      (t) => t.reconciliationStatus === ReconciliationStatus.Pending,
    );
    if (selectedTransactions.size === pendingTransactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(pendingTransactions.map((t) => t.id)));
    }
  };
  const handleReconcileTransaction = async () => {
    if (!selectedTransaction) return;

    setIsSubmitting(true);
    try {
      const dto: ReconcileTransactionDto = {
        actualAmount: reconcileForm.actualAmount,
        status: reconcileForm.status,
        notes: reconcileForm.notes || undefined,
      };

      const response = await reconcileTransaction(selectedTransaction.id, dto);

      if (response.success) {
        toast.success(
          reconcileForm.status === ReconciliationStatus.Matched
            ? "✓ Transaction matched successfully"
            : "⚠ Transaction marked as unmatched",
        );
        setShowReconcileModal(false);
        setSelectedTransaction(null);
        setReconcileForm({
          actualAmount: 0,
          status: ReconciliationStatus.Matched,
          notes: "",
        });
        await Promise.all([
          fetchTransactions(),
          fetchBalanceSummary(),
          fetchAccounts(),
        ]);
      } else {
        toast.error(response.message || "Failed to reconcile transaction");
      }
    } catch (error) {
      console.error("Error reconciling transaction:", error);
      toast.error("Failed to reconcile transaction");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleQuickMatch = async (
    transaction: TransactionReconciliationDto,
  ) => {
    setIsSubmitting(true);
    try {
      const dto: ReconcileTransactionDto = {
        actualAmount: transaction.amount,
        status: ReconciliationStatus.Matched,
        notes: "Quick matched - amounts equal",
      };

      const response = await reconcileTransaction(transaction.id, dto);

      if (response.success) {
        toast.success("✓ Transaction matched");
        await Promise.all([
          fetchTransactions(),
          fetchBalanceSummary(),
          fetchAccounts(),
        ]);
      } else {
        toast.error(response.message || "Failed to match transaction");
      }
    } catch (error) {
      console.error("Error matching transaction:", error);
      toast.error("Failed to match transaction");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleBulkReconcile = async (status: ReconciliationStatus) => {
    if (selectedTransactions.size === 0) {
      toast.error("Please select transactions to reconcile");
      return;
    }

    setIsSubmitting(true);
    try {
      const dto: BulkReconcileDto = {
        transactionIds: Array.from(selectedTransactions),
        status,
        notes: `Bulk reconciled as ${
          status === ReconciliationStatus.Matched ? "Matched" : "Unmatched"
        }`,
      };

      const response = await bulkReconcileTransactions(dto);

      if (response.success) {
        toast.success(
          `✓ ${response.data} transactions ${
            status === ReconciliationStatus.Matched
              ? "matched"
              : "marked as unmatched"
          }`,
        );
        setSelectedTransactions(new Set());
        setShowBulkModal(false);
        await Promise.all([
          fetchTransactions(),
          fetchBalanceSummary(),
          fetchAccounts(),
        ]);
      } else {
        toast.error(
          response.message || "Failed to bulk reconcile transactions",
        );
      }
    } catch (error) {
      console.error("Error bulk reconciling:", error);
      toast.error("Failed to bulk reconcile transactions");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleAutoReconcile = async () => {
    const pendingTransactions = transactions.filter(
      (t) => t.reconciliationStatus === ReconciliationStatus.Pending,
    );

    if (pendingTransactions.length === 0) {
      toast.info("No pending transactions to reconcile");
      return;
    }
    // One button (or the "a" key) marked every pending transaction matched without comparing
    // anything. Say exactly that and ask first.
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Mark all ${pendingTransactions.length} pending transactions as matched without comparing them to a statement?`,
      )
    )
      return;

    setIsSubmitting(true);
    try {
      const dto: BulkReconcileDto = {
        transactionIds: pendingTransactions.map((t) => t.id),
        status: ReconciliationStatus.Matched,
        notes: "Auto reconciled - all pending transactions",
      };

      const response = await bulkReconcileTransactions(dto);

      if (response.success) {
        toast.success(`✓ ${response.data} transactions auto-reconciled`);
        await Promise.all([
          fetchTransactions(),
          fetchBalanceSummary(),
          fetchAccounts(),
        ]);
      } else {
        toast.error(response.message || "Failed to auto-reconcile");
      }
    } catch (error) {
      console.error("Error auto reconciling:", error);
      toast.error("Failed to auto-reconcile transactions");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleCompleteReconciliation = async () => {
    if (balanceSummary.pendingCount > 0) {
      toast.error(
        `❌ Cannot complete reconciliation. ${balanceSummary.pendingCount} transactions are still pending.`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const dto: CreateReconciliationDto = {
        accountType: selectedAccountType,
        accountId: selectedAccountId,
        actualBalance: effectiveActualBalance,
        notes:
          balanceSummary.unmatchedCount > 0
            ? `Completed with ${balanceSummary.unmatchedCount} unmatched transactions`
            : "All transactions matched",
      };

      const response = await createReconciliationRecord(dto);

      if (response.success) {
        if (balanceSummary.unmatchedCount > 0) {
          toast.warning(
            `⚠ Reconciliation completed with ${balanceSummary.unmatchedCount} unmatched transactions.`,
          );
        } else {
          toast.success(
            "✓ Reconciliation completed successfully! All transactions matched.",
          );
        }
        setShowCompleteModal(false);
        await fetchReconciliationHistoryData();
      } else {
        toast.error(response.message || "Failed to complete reconciliation");
      }
    } catch (error) {
      console.error("Error completing reconciliation:", error);
      toast.error("Failed to complete reconciliation");
    } finally {
      setIsSubmitting(false);
    }
  };
  // This said "✓ Adjustment entry created" and created nothing: the books were unchanged.
  // There is no adjustment posting in the API, so say what to do instead.
  const handleCreateAdjustment = (_amount: number, _description: string) => {
    toast.info("No entry was made. Record the difference as an expense (e.g. bank charges) or as a transaction, then reconcile again.", { duration: 8000 });
    setShowAdjustmentForm(false);
    setAdjustmentNote("");
  };
  const handleExportReport = () => {
    if (!selectedAccount) {
      toast.error("Please select an account first");
      return;
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Get company info from auth
      const auth = getStoredAuth();
      const companyName = auth?.user?.companyName || "Money Exchange";

      // ========== CORPORATE HEADER ==========
      doc.setFillColor(139, 92, 246); // Violet for reconciliation
      doc.rect(0, 0, pageWidth, 4, "F");

      doc.setFillColor(250, 250, 250);
      doc.rect(0, 4, pageWidth, 36, "F");

      doc.setFillColor(139, 92, 246);
      doc.rect(14, 10, 24, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("R", 26, 26, { align: "center" });

      doc.setTextColor(17, 24, 39);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(companyName, 44, 18);

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Reconciliation Report", 44, 26);

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
      doc.text("Account", pageWidth - 14, 28, { align: "right" });
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(selectedAccount.name, pageWidth - 14, 35, { align: "right" });

      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(14, 42, pageWidth - 14, 42);

      // ========== ACCOUNT INFORMATION ==========
      let yPos = 50;
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("ACCOUNT DETAILS", 14, yPos);

      yPos += 6;
      doc.setFillColor(249, 250, 251);
      doc.rect(14, yPos, pageWidth - 28, 24, "F");

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39);
      doc.text(selectedAccount.name, 18, yPos + 8);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      doc.text(
        `Type: ${getAccountTypeLabel(
          selectedAccount.accountType,
        )} | Currency: ${getCurrencyLabel(selectedAccount.currency)}`,
        18,
        yPos + 15,
      );

      // Balance comparison
      const variance = actualBalanceInput - (selectedAccount.balance || 0);
      const variancePositive = variance >= 0;
      doc.text(
        `System: ${getCurrencyLabel(selectedAccount.currency)} ${(
          selectedAccount.balance || 0
        ).toLocaleString()} | Actual: ${getCurrencyLabel(
          selectedAccount.currency,
        )} ${actualBalanceInput.toLocaleString()}`,
        18,
        yPos + 21,
      );

      // Variance badge
      doc.setFillColor(
        variancePositive ? 220 : 254,
        variancePositive ? 252 : 226,
        variancePositive ? 231 : 226,
      );
      doc.rect(pageWidth - 55, yPos + 6, 37, 8, "F");
      doc.setFontSize(7);
      doc.setTextColor(
        variancePositive ? 22 : 185,
        variancePositive ? 101 : 28,
        variancePositive ? 52 : 28,
      );
      doc.text(
        `VAR: ${variancePositive ? "+" : ""}${variance.toLocaleString()}`,
        pageWidth - 36.5,
        yPos + 11,
        { align: "center" },
      );

      // ========== RECONCILIATION SUMMARY ==========
      yPos += 32;
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("RECONCILIATION SUMMARY", 14, yPos);

      yPos += 6;
      const cardWidth = (pageWidth - 42) / 4;

      const matchedCount = filteredTransactions.filter(
        (t) => t.reconciliationStatus === ReconciliationStatus.Matched,
      ).length;
      const unmatchedCount = filteredTransactions.filter(
        (t) => t.reconciliationStatus === ReconciliationStatus.Unmatched,
      ).length;
      const pendingCount = filteredTransactions.filter(
        (t) => t.reconciliationStatus === ReconciliationStatus.Pending,
      ).length;
      const totalCount = filteredTransactions.length;

      // Total
      doc.setDrawColor(229, 231, 235);
      doc.rect(14, yPos, cardWidth, 20, "S");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.setFont("helvetica", "normal");
      doc.text("Total", 16, yPos + 6);
      doc.setFontSize(12);
      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "bold");
      doc.text(String(totalCount), 16, yPos + 14);

      // Matched
      doc.rect(14 + cardWidth + 4, yPos, cardWidth, 20, "S");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.setFont("helvetica", "normal");
      doc.text("Matched", 18 + cardWidth, yPos + 6);
      doc.setFontSize(12);
      doc.setTextColor(22, 163, 74);
      doc.setFont("helvetica", "bold");
      doc.text(String(matchedCount), 18 + cardWidth, yPos + 14);

      // Unmatched
      doc.rect(14 + (cardWidth + 4) * 2, yPos, cardWidth, 20, "S");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.setFont("helvetica", "normal");
      doc.text("Unmatched", 18 + (cardWidth + 4) * 2, yPos + 6);
      doc.setFontSize(12);
      doc.setTextColor(220, 38, 38);
      doc.setFont("helvetica", "bold");
      doc.text(String(unmatchedCount), 18 + (cardWidth + 4) * 2, yPos + 14);

      // Pending
      doc.rect(14 + (cardWidth + 4) * 3, yPos, cardWidth, 20, "S");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.setFont("helvetica", "normal");
      doc.text("Pending", 18 + (cardWidth + 4) * 3, yPos + 6);
      doc.setFontSize(12);
      doc.setTextColor(202, 138, 4);
      doc.setFont("helvetica", "bold");
      doc.text(String(pendingCount), 18 + (cardWidth + 4) * 3, yPos + 14);

      // ========== TRANSACTION TABLE ==========
      if (filteredTransactions.length > 0) {
        yPos += 30;
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("TRANSACTION DETAILS", 14, yPos);

        const txnTableData = filteredTransactions.map((txn) => {
          // Determine if the reconciled account is source or dest
          const isSource =
            txn.sourceAccountType === selectedAccountType &&
            txn.sourceAccountId === selectedAccountId;
          // Source uses transactionType directly; dest gets the opposite
          const isDebit = isSource
            ? txn.transactionType === TransactionType.Debit
            : txn.transactionType === TransactionType.Credit;

          return [
            txn.code,
            new Date(txn.transactionDate).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
            }),
            txn.description.substring(0, 28) +
              (txn.description.length > 28 ? "..." : ""),
            isDebit ? "DR" : "CR",
            txn.amount.toLocaleString(),
            getReconciliationStatusLabel(txn.reconciliationStatus),
          ];
        });

        autoTable(doc, {
          startY: yPos + 4,
          head: [["Code", "Date", "Description", "Type", "Amount", "Status"]],
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
            0: { cellWidth: 26 },
            1: { cellWidth: 22 },
            2: { cellWidth: 54 },
            3: { cellWidth: 14, halign: "center" },
            4: { cellWidth: 28, halign: "right" },
            5: { cellWidth: 28, halign: "center" },
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          margin: { left: 14, right: 14 },
          didParseCell: (data: any) => {
            if (data.section === "body" && data.column.index === 3) {
              // Reconciliation is asset accounts only: DR = money IN (green), CR = money OUT (red)
              data.cell.styles.textColor =
                data.cell.raw === "DR" ? [22, 163, 74] : [220, 38, 38];
              data.cell.styles.fontStyle = "bold";
            }
            if (data.section === "body" && data.column.index === 5) {
              const status = data.cell.raw as string;
              if (status === "Matched")
                data.cell.styles.textColor = [22, 163, 74];
              else if (status === "Unmatched")
                data.cell.styles.textColor = [185, 28, 28];
              else data.cell.styles.textColor = [161, 98, 7];
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
            doc.text("Reconciliation Report", pageWidth - 14, pageHeight - 12, {
              align: "right",
            });
          },
        });
      }

      const fileName = `${companyName.replace(
        /\s+/g,
        "_",
      )}_Reconciliation_${selectedAccount.name.replace(/\s+/g, "-")}_${
        localDate()
      }.pdf`;
      doc.save(fileName);
      toast.success("Reconciliation report exported successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };
  const handleRefresh = async () => {
    setIsLoading(true);
    await Promise.all([
      fetchAccounts(),
      fetchTransactions(),
      fetchBalanceSummary(),
      fetchReconciliationHistoryData(),
    ]);
    setIsLoading(false);
    toast.success("Data refreshed!");
  };

  return {
    handleAcceptAllSuggestions,
    handleSelectTransaction,
    handleSelectAll,
    handleReconcileTransaction,
    handleQuickMatch,
    handleBulkReconcile,
    handleAutoReconcile,
    handleCompleteReconciliation,
    handleCreateAdjustment,
    handleExportReport,
    handleRefresh,
  };
}
