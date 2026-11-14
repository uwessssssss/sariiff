"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { ReconciliationStatus } from "@/lib/api";
import { useEffect } from "react";
import { type useReconciliationState } from "./useReconciliationState";
import { type useReconciliationActions } from "./useReconciliationActions";

/** Reconciliation: effects (part 3 of 3 of useReconciliation). */
export function useReconciliationEffects(prev: ReturnType<typeof useReconciliationState> & ReturnType<typeof useReconciliationActions>) {
  const { actualBalanceInput, autoPopulateFromStatement, fetchAccounts, fetchBalanceSummary, fetchReconciliationHistoryData, fetchTransactions, handleAutoReconcile, handleRefresh, isReconciliationComplete, selectedAccount, selectedAccountId, selectedAccountType, setActualBalanceInput, setCurrentPage, setDateFrom, setDateTo, setIsBalanceLocked, setMatchSuggestions, setSearchTerm, setSelectedAccountId, setSelectedTransactions, setShowAdjustmentForm, setShowBulkModal, setShowCompleteModal, setShowDetailModal, setShowHistoryModal, setShowKeyboardShortcuts, setShowReconcileModal, setShowStatementUpload, setStatementEntries, setStatusFilter, setTransactions, statementEntries } = prev;
  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  };
  // BUG FIX: Handle account selection from dropdown
  const handleAccountSelect = (accountId: string) => {
    setSelectedAccountId(accountId);
    setActualBalanceInput(0); // Reset actual balance for new account
    setSelectedTransactions(new Set());
    setStatementEntries([]);
    setMatchSuggestions([]);
    setIsBalanceLocked(false);
  };
  // ==================== STATUS BADGE COMPONENT ====================

  const StatusBadge = ({ status }: { status: ReconciliationStatus }) => {
    if (status === ReconciliationStatus.Matched) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 border-l-4 border-emerald-500 text-xs font-semibold uppercase tracking-wide">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Matched
        </span>
      );
    } else if (status === ReconciliationStatus.Unmatched) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 border-l-4 border-red-500 text-xs font-semibold uppercase tracking-wide">
          <AlertTriangle className="w-3.5 h-3.5" />
          Unmatched
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 border-l-4 border-amber-500 text-xs font-semibold uppercase tracking-wide">
          <Clock className="w-3.5 h-3.5" />
          Pending
        </span>
      );
    }
  };
  // ==================== KEYBOARD SHORTCUTS ====================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.key === "?" && e.shiftKey) {
        e.preventDefault();
        setShowKeyboardShortcuts(true);
      } else if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleRefresh();
      } else if (e.key === "u" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowStatementUpload(true);
      } else if (e.key === "a" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleAutoReconcile();
      } else if (e.key === "Escape") {
        setShowReconcileModal(false);
        setShowDetailModal(false);
        setShowBulkModal(false);
        setShowCompleteModal(false);
        setShowHistoryModal(false);
        setShowStatementUpload(false);
        setShowKeyboardShortcuts(false);
        setShowAdjustmentForm(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  // ==================== EFFECTS ====================

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);
  useEffect(() => {
    if (selectedAccountId) {
      fetchTransactions();
      fetchBalanceSummary();
      fetchReconciliationHistoryData();
    }
  }, [
    selectedAccountId,
    fetchTransactions,
    fetchBalanceSummary,
    fetchReconciliationHistoryData,
  ]);
  // BUG FIX: Reset state when switching account types - but don't auto-select
  useEffect(() => {
    setSelectedAccountId(""); // Reset to empty, require user selection
    setTransactions([]);
    setSelectedTransactions(new Set());
    setActualBalanceInput(0);
    setStatementEntries([]);
    setMatchSuggestions([]);
    setIsBalanceLocked(false);
  }, [selectedAccountType]);
  // BUG FIX: When reconciliation is complete, auto-lock the balance
  useEffect(() => {
    if (isReconciliationComplete) {
      setIsBalanceLocked(true);
      // Auto-set actual balance to match system when all reconciled
      if (selectedAccount) {
        setActualBalanceInput(selectedAccount.balance);
      }
    }
  }, [isReconciliationComplete, selectedAccount]);
  useEffect(() => {
    if (
      statementEntries.length > 0 &&
      actualBalanceInput === 0 &&
      !isReconciliationComplete
    ) {
      autoPopulateFromStatement();
    }
  }, [statementEntries, isReconciliationComplete]);

  return {
    clearFilters,
    handleAccountSelect,
    StatusBadge,
  };
}
