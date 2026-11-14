"use client";

import { AlertCircle, CreditCard, Download, Filter, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { CurrencyTotals, rowsFromStats } from "../CurrencyTotals";
import { EditTransactionDialog } from "../EditTransactionDialog";
import { RelatedAccountDialog, ReverseTransactionDialog, TransactionDetailsDialog } from "../TransactionDialogs";
import { StatementModal, refreshOpenStatement } from "../StatementModal";
import { toast } from "sonner";
import { useBankAccounts } from "./useBankAccounts";
import { AccountsTable } from "./sections/AccountsTable";
import { AddAccountPanel } from "./sections/AddAccountPanel";
import { EditAccountPanel } from "./sections/EditAccountPanel";
import { DeleteAccountPanel } from "./sections/DeleteAccountPanel";

export function BankAccounts() {
  const vm = useBankAccounts();
  const { accountsWithOutstanding, activeTab, allAccounts, confirmDeleteTransaction, fetchAccounts, fetchStats, handleDeleteTransaction, handleEditTransaction, handleViewTransaction, isLoading, isSubmitting, mapTransactionToDisplay, searchTerm, selectedAccount, selectedTransaction, setActiveTab, setSearchTerm, setSelectedAccount, setSelectedTransaction, setShowAddAccount, setShowDeleteTransaction, setShowEditTransaction, setShowRelatedAccount, setShowViewTransaction, showDeleteTransaction, showEditAccount, showEditTransaction, showRelatedAccount, showViewTransaction, stats } = vm;
  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading bank accounts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Bank accounts
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Balances and movements for each bank account
          </p>
        </div>
        <button
          onClick={() => setShowAddAccount(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Add bank account
        </button>
      </div>

      {/* Per-currency summary (KES, USD, UGX, EUR) */}
      <CurrencyTotals
        rows={rowsFromStats(stats)}
        title={`Summary by currency · ${stats.totalAccounts} ${stats.totalAccounts === 1 ? "account" : "accounts"}`}
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setActiveTab("all")}
          className={`rounded-lg flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-300 ${
            activeTab === "all"
              ? " bg-[#0F172A]  text-white  "
              : "bg-white text-slate-600 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg"
          }`}
        >
          <CreditCard className="w-5 h-5" />
          All Accounts
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              activeTab === "all" ? "bg-white/20" : "bg-blue-100 text-blue-700"
            }`}
          >
            {allAccounts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("outstanding")}
          className={`rounded-lg flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-300 ${
            activeTab === "outstanding"
              ? " bg-red-600  text-white  "
              : "bg-white text-slate-600 hover:bg-red-50 border border-slate-200 hover:border-red-300 rounded-lg"
          }`}
        >
          <AlertCircle className="w-5 h-5" />
          With Balance
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              activeTab === "outstanding"
                ? "bg-white/20"
                : "bg-red-100 text-red-700"
            }`}
          >
            {accountsWithOutstanding.length}
          </span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 ">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by bank name, account number, or ID..."
              value={searchTerm}
              onChange={(e: any) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border text-slate-500 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-500 focus:bg-white   transition-all duration-300 placeholder:text-slate-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => toast.info("Opening filter options...")}
              className="flex items-center gap-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all font-medium text-slate-700"
            >
              <Filter className="w-5 h-5" />
              <span className="hidden sm:inline">Filters</span>
            </button>
            <button
              onClick={() => {
                fetchAccounts();
                fetchStats();
                toast.success("Data refreshed!");
              }}
              className="flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
            >
              <RefreshCw className="w-5 h-5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => toast.success("Exporting bank accounts list...")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
            >
              <Download className="w-5 h-5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bank Accounts Table */}
      <AccountsTable vm={vm} />

      {/* Account Statement Modal */}
      <AnimatePresence>
        {selectedAccount && !showEditAccount && (
          <StatementModal
            kind="bank"
            accountId={selectedAccount.id}
            title={`${selectedAccount.bankName} – ${selectedAccount.accountNumber}`}
            subtitle={[selectedAccount.code, selectedAccount.accountName].filter(Boolean).join(" · ")}
            currency={Number(selectedAccount.currency ?? 0)}
                        onView={(raw) => handleViewTransaction(mapTransactionToDisplay(raw))}
            onEdit={(raw) => handleEditTransaction(mapTransactionToDisplay(raw))}
            onDelete={(raw) => handleDeleteTransaction(mapTransactionToDisplay(raw))}
            onRelated={(raw) => {
              setSelectedTransaction(mapTransactionToDisplay(raw));
              setShowRelatedAccount(true);
            }}
            onClose={() => setSelectedAccount(null)}
          />
        )}
      </AnimatePresence>

      {/* Add Bank Account Modal */}
      <AddAccountPanel vm={vm} />

      {/* Edit Bank Account Modal */}
      <EditAccountPanel vm={vm} />

      {/* Delete Bank Account Confirmation Modal */}
      <DeleteAccountPanel vm={vm} />

      {/* Transaction pop-ups — shared with the other ledger screens (TransactionDialogs.tsx) */}
      {showViewTransaction && selectedTransaction && (
        <TransactionDetailsDialog
          txn={selectedTransaction}
          kind="bank"
          accountName={selectedAccount ? `${selectedAccount.bankName} – ${selectedAccount.accountNumber}` : undefined}
          onClose={() => {
            setShowViewTransaction(false);
            setSelectedTransaction(null);
          }}
          onRelated={() => {
            setShowViewTransaction(false);
            setShowRelatedAccount(true);
          }}
        />
      )}

      {showRelatedAccount && selectedTransaction?.relatedAccount && (
        <RelatedAccountDialog
          txn={selectedTransaction}
          kind="bank"
          onClose={() => setShowRelatedAccount(false)}
          onBack={() => {
            setShowRelatedAccount(false);
            setShowViewTransaction(true);
          }}
        />
      )}

      {/* Edit Transaction Modal */}
      <AnimatePresence>
        {showEditTransaction && selectedTransaction && (
          <EditTransactionDialog
            txn={selectedTransaction}
            onClose={() => {
              setShowEditTransaction(false);
              setSelectedTransaction(null);
            }}
            onSaved={async () => {
              // reloads the open statement
              refreshOpenStatement();
            }}
          />
        )}
      </AnimatePresence>

      {showDeleteTransaction && selectedTransaction && (
        <ReverseTransactionDialog
          txn={selectedTransaction}
          kind="bank"
          busy={isSubmitting}
          onClose={() => setShowDeleteTransaction(false)}
          onConfirm={(reason) => confirmDeleteTransaction(reason)}
        />
      )}
    </div>
  );
}
