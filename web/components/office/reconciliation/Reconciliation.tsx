"use client";

import { AccountType } from "@/lib/api";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, Calculator, Calendar, CheckCircle2, Download, FileText, Keyboard, Loader2, RefreshCw, Smartphone, Target, Upload, Wallet, X } from "lucide-react";
import { useReconciliation } from "./useReconciliation";
import { AccountPicker } from "./sections/AccountPicker";
import { InsightsPanel } from "./sections/InsightsPanel";
import { BalanceCards } from "./sections/BalanceCards";
import { VisualComparison } from "./sections/VisualComparison";
import { BalanceBreakdown } from "./sections/BalanceBreakdown";
import { MatchSuggestions } from "./sections/MatchSuggestions";
import { FiltersBar } from "./sections/FiltersBar";
import { TransactionsTable } from "./sections/TransactionsTable";
import { AdjustmentFormPanel } from "./sections/AdjustmentFormPanel";
import { StatementUploadPanel } from "./sections/StatementUploadPanel";
import { ReconcileModal } from "./sections/ReconcileModal";
import { BulkModal } from "./sections/BulkModal";
import { CompleteModal } from "./sections/CompleteModal";
import { DetailModal } from "./sections/DetailModal";
import { HistoryModal } from "./sections/HistoryModal";

// ==================== MAIN COMPONENT ====================

export function Reconciliation() {
  const vm = useReconciliation();
  const { accounts, balanceSummary, filteredAccounts, handleExportReport, handleRefresh, isLoading, isReconciliationComplete, reconciliationPeriod, selectedAccount, selectedAccountId, selectedAccountType, setSelectedAccountType, setShowHistoryModal, setShowKeyboardShortcuts, setShowStatementUpload, showKeyboardShortcuts, transactions } = vm;
  // ==================== LOADING STATE ====================

  if (isLoading && accounts.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">
            Loading reconciliation data...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {/* ==================== HEADER ==================== */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                  Account Reconciliation
                </h1>
                <p className="mt-1 text-sm text-slate-500 flex items-center gap-2">
                  Match and verify transactions with statements
                  <button
                    onClick={() => setShowKeyboardShortcuts(true)}
                    className="p-1 hover:bg-slate-200 rounded transition-colors"
                    title="Keyboard shortcuts (Shift + ?)"
                  >
                    <Keyboard className="w-4 h-4 text-slate-500" />
                  </button>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:gap-3">
            <button
              onClick={() => setShowStatementUpload(true)}
              disabled={!selectedAccountId}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload Statement</span>
            </button>

            <button
              onClick={() => setShowHistoryModal(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </button>

            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={handleExportReport}
              disabled={transactions.length === 0}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </motion.div>

        {/* ==================== ACCOUNT TYPE TABS ==================== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap gap-2 lg:gap-3"
        >
          {[
            {
              type: AccountType.Bank,
              label: "Bank Accounts",
              icon: Building2,
              gradient: "bg-blue-600",
            },
            {
              type: AccountType.Mpesa,
              label: "Mobile money",
              icon: Smartphone,
              gradient: "bg-emerald-700",
            },
            {
              type: AccountType.Cash,
              label: "Cash",
              icon: Wallet,
              gradient: "bg-blue-600",
            },
          ].map(({ type, label, icon: Icon, gradient }) => {
            const typeAccounts = accounts.filter((a) => a.accountType === type);
            const pendingCount = typeAccounts.reduce(
              (sum, a) => sum + a.pendingCount,
              0,
            );
            const isSelected = selectedAccountType === type;

            return (
              <button
                key={type}
                onClick={() => setSelectedAccountType(type)}
                className={`relative flex items-center gap-2 lg:gap-3 px-4 lg:px-6 py-3 lg:py-4 font-semibold transition-all duration-300 ${
                  isSelected
                    ? ` ${gradient} text-white shadow-sm`
                    : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="hidden sm:inline">{label}</span>
                <span
                  className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                    isSelected ? "bg-white/20" : "bg-slate-100"
                  }`}
                >
                  {typeAccounts.length}
                </span>
                {pendingCount > 0 && (
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-amber-700 text-white text-xs font-semibold rounded-full flex items-center justify-center shadow-sm animate-pulse">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </motion.div>

        {/* ==================== BUG FIX: ACCOUNT SELECTOR DROPDOWN ==================== */}
        <AccountPicker vm={vm} />

        {/* ==================== INSIGHTS PANEL ==================== */}
        <InsightsPanel vm={vm} />

        {/* ==================== ENHANCED BALANCE SECTION ==================== */}
        {selectedAccount && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="space-y-4"
          >
            {/* Main Balance Comparison Card */}
            <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-lg">
              {/* Header */}
              <div className="bg-[#0F172A] px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/10 flex items-center justify-center">
                      <Calculator className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        Balance Reconciliation
                      </h3>
                      <p className="text-slate-400 text-sm">
                        {selectedAccount.name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* BUG FIX: Show reconciliation complete badge */}
                    {isReconciliationComplete && (
                      <div className="bg-emerald-700 px-3 py-1.5 rounded flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-white" />
                        <span className="text-sm text-white font-semibold">
                          Reconciliation Complete
                        </span>
                      </div>
                    )}
                    <div className="bg-white/10 px-3 py-1.5 rounded flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-white font-medium">
                        {new Date(
                          reconciliationPeriod.startDate,
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                        {" - "}
                        {new Date(
                          reconciliationPeriod.endDate,
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Balance Cards Grid */}
              <div className="p-6">
                <BalanceCards vm={vm} />

                {/* Visual Balance Comparison Bar - Only show if not reconciliation complete */}
                <VisualComparison vm={vm} />

                {/* Reconciliation Complete Message */}
                {isReconciliationComplete && (
                  <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-emerald-700">
                          All Transactions Reconciled!
                        </p>
                        <p className="text-sm text-emerald-700">
                          {balanceSummary.matchedCount} transactions matched •
                          Expected and Actual balances are equal
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Transaction Breakdown */}
            <BalanceBreakdown vm={vm} />
          </motion.div>
        )}

        {/* ==================== SMART MATCH SUGGESTIONS ==================== */}
        <MatchSuggestions vm={vm} />

        {/* ==================== FILTERS AND ACTIONS BAR ==================== */}
        <FiltersBar vm={vm} />

        {/* ==================== TRANSACTIONS TABLE ==================== */}
        <TransactionsTable vm={vm} />

        {/* No Account Selected - Show prompt */}
        {!selectedAccount && filteredAccounts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-200 p-12 text-center shadow-sm rounded-xl"
          >
            <div className="w-20 h-20 bg-blue-100 flex items-center justify-center mx-auto mb-6">
              <Target className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              Select an Account to Reconcile
            </h3>
            <p className="text-slate-600 max-w-md mx-auto mb-6">
              Choose an account from the dropdown above or click on one of the
              account cards to view and reconcile its transactions.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => document.querySelector("select")?.focus()}
                className="px-6 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
              >
                Select Account
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* ==================== MODALS ==================== */}

      {/* Adjustment Modal */}
      <AdjustmentFormPanel vm={vm} />

      {/* Statement Upload Modal */}
      <StatementUploadPanel vm={vm} />

      {/* Keyboard Shortcuts Modal */}
      <AnimatePresence>
        {showKeyboardShortcuts && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowKeyboardShortcuts(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-slate-800 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Keyboard className="w-6 h-6" />
                    <h3 className="text-xl font-semibold">Keyboard Shortcuts</h3>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowKeyboardShortcuts(false)}
                    className="p-2 hover:bg-white/20"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-3">
                {[
                  { key: "R", action: "Refresh data" },
                  { key: "U", action: "Upload statement" },
                  { key: "A", action: "Auto-match all" },
                  { key: "Esc", action: "Close modals" },
                  { key: "Shift + ?", action: "Show shortcuts" },
                ].map(({ key, action }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-2 border-b border-slate-100"
                  >
                    <span className="text-slate-600">{action}</span>
                    <kbd className="px-3 py-1 bg-slate-100 border border-slate-300 text-sm font-mono rounded">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reconcile Transaction Modal */}
      <ReconcileModal vm={vm} />

      {/* Bulk Reconcile Modal */}
      <BulkModal vm={vm} />

      {/* Complete Reconciliation Modal */}
      <CompleteModal vm={vm} />

      {/* Detail Modal */}
      <DetailModal vm={vm} />

      {/* History Modal */}
      <HistoryModal vm={vm} />
    </div>
  );
}
