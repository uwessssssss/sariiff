"use client";

import { AlertCircle, CheckCircle, Download, Loader2, RefreshCw, Search, UserCheck, UserPlus, Users } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { EditTransactionDialog } from "../EditTransactionDialog";
import { RelatedAccountDialog, ReverseTransactionDialog, TransactionDetailsDialog } from "../TransactionDialogs";
import { StatementModal, refreshOpenStatement } from "../StatementModal";
import { SuccessShareModal } from "@/components/ui/SuccessShareModal";
import { useClientManagement } from "./useClientManagement";
import { AllClientsCardSection } from "./sections/AllClientsCardSection";
import { NoClientsFoundSection } from "./sections/NoClientsFoundSection";
import { AddClientPanel } from "./sections/AddClientPanel";
import { EditModal } from "./sections/EditModal";
import { DeleteConfirmPanel } from "./sections/DeleteConfirmPanel";

export function ClientManagement() {
  const vm = useClientManagement();
  const { activeCurrencies, activeTab, confirmDeleteTransaction, convertPassword, currencyOk, fetchClients, handleConvertToPermanent, handleDeleteTransaction, handleEditTransaction, handleExportClientsPDF, handleViewTransaction, homeCurrency, isLoading, isSubmitting, mapTransactionToDisplay, searchTerm, selectedClient, selectedTransaction, setActiveTab, setConvertPassword, setSearchTerm, setSelectedTransaction, setShareModal, setShowAddClient, setShowConvertModal, setShowDeleteTransaction, setShowEditTransaction, setShowRelatedAccount, setShowStatement, setShowTransactionDetail, shareModal, showConvertModal, showDeleteTransaction, showEditTransaction, showRelatedAccount, showStatement, showTransactionDetail, stats } = vm;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Clients
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {stats.permanentClients} permanent · {stats.temporaryClients}{" "}
            temporary
          </p>
        </div>
        <button
          onClick={() => setShowAddClient(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UserPlus className="w-4 h-4" />
          Add client
        </button>
      </div>

      {/* Summary Cards */}
      <AllClientsCardSection vm={vm} />

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
          <Users className="w-5 h-5" />
          All Clients
          <span
            className={`px-2 py-0.5 text-xs font-semibold ${
              activeTab === "all" ? "bg-white/20" : "bg-blue-100 text-blue-700"
            }`}
          >
            {stats.totalClients}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("debit")}
          className={`rounded-lg flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-300 ${
            activeTab === "debit"
              ? " bg-emerald-700  text-white  "
              : "bg-white text-slate-600 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg"
          }`}
        >
          <CheckCircle className="w-5 h-5" />
          With Credit
          <span
            className={`px-2 py-0.5 text-xs font-semibold ${
              activeTab === "debit"
                ? "bg-white/20"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {stats.clientsWithDebit}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("credit")}
          className={`rounded-lg flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-300 ${
            activeTab === "credit"
              ? " bg-red-600  text-white  "
              : "bg-white text-slate-600 hover:bg-red-50 border border-slate-200 hover:border-red-300 rounded-lg"
          }`}
        >
          <AlertCircle className="w-5 h-5" />
          With Debit
          <span
            className={`px-2 py-0.5 text-xs font-semibold ${
              activeTab === "credit" ? "bg-white/20" : "bg-red-100 text-red-700"
            }`}
          >
            {stats.clientsWithCredit}
          </span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="rounded-xl bg-white border border-slate-200 p-6 ">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by name, phone, code..."
              value={searchTerm}
              onChange={(e: any) => setSearchTerm(e.target.value.toLowerCase())}
              className="rounded-lg w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 text-sm font-medium focus:outline-none text-slate-600
               focus:border-blue-500 focus:bg-white   transition-all duration-300 placeholder:text-slate-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchClients()}
              className="rounded-lg flex items-center gap-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 transition-all font-medium text-slate-700"
            >
              <RefreshCw
                className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={handleExportClientsPDF}
              className="rounded-lg flex items-center gap-2 px-5 py-3 transition-all font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
            >
              <Download className="w-5 h-5" />
              <span className="hidden sm:inline">Export PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Clients Table */}
      <NoClientsFoundSection vm={vm} />

      {/* ============================================== */}
      {/* CLIENT STATEMENT MODAL  */}
      {/* ============================================== */}
      <AnimatePresence>
        {showStatement && selectedClient && (
          <StatementModal
            kind="client"
            accountId={selectedClient.id}
            title={selectedClient.fullName}
            subtitle={[selectedClient.code, selectedClient.whatsAppNumber].filter(Boolean).join(" · ")}
            currency={homeCurrency}
            currencies={Array.from(
              new Set<number>([
                homeCurrency,
                ...activeCurrencies.filter((c) => currencyOk(c)),
                ...((selectedClient.balanceKES ?? 0) !== 0 ? [0] : []),
                ...((selectedClient.balanceUSD ?? 0) !== 0 ? [1] : []),
                ...((selectedClient as any).otherBalances || [])
                  .filter((b: any) => (b.balance ?? 0) !== 0 || currencyOk(b.currency))
                  .map((b: any) => b.currency as number),
              ]),
            )}
            whatsApp={selectedClient.whatsAppNumber || undefined}
                        onView={(raw) => handleViewTransaction(mapTransactionToDisplay(raw))}
            onEdit={(raw) => handleEditTransaction(mapTransactionToDisplay(raw))}
            onDelete={(raw) => handleDeleteTransaction(mapTransactionToDisplay(raw))}
            onRelated={(raw) => {
              setSelectedTransaction(mapTransactionToDisplay(raw));
              setShowRelatedAccount(true);
            }}
            onClose={() => {
              setShowStatement(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* ============================================== */}
      {/* Transaction pop-ups — shared with the other ledger screens (TransactionDialogs.tsx) */}
      {showTransactionDetail && selectedTransaction && (
        <TransactionDetailsDialog
          txn={selectedTransaction}
          kind="client"
          accountName={selectedClient?.fullName}
          onClose={() => {
            setShowTransactionDetail(false);
            setSelectedTransaction(null);
          }}
          onRelated={() => {
            setShowTransactionDetail(false);
            setShowRelatedAccount(true);
          }}
        />
      )}

      {/* ============================================== */}
      {showEditTransaction && selectedTransaction && (
        <EditTransactionDialog
          txn={selectedTransaction}
          onClose={() => {
            setShowEditTransaction(false);
            setSelectedTransaction(null);
          }}
          onSaved={async () => {
            refreshOpenStatement();
          }}
        />
      )}

      {/* ============================================== */}
      {showDeleteTransaction && selectedTransaction && (
        <ReverseTransactionDialog
          txn={selectedTransaction}
          kind="client"
          busy={isSubmitting}
          onClose={() => setShowDeleteTransaction(false)}
          onConfirm={(reason) => confirmDeleteTransaction(reason)}
        />
      )}

      {/* ============================================== */}
      {showRelatedAccount && selectedTransaction?.relatedAccount && (
        <RelatedAccountDialog
          txn={selectedTransaction}
          kind="client"
          onClose={() => setShowRelatedAccount(false)}
          onBack={() => {
            setShowRelatedAccount(false);
            setShowTransactionDetail(true);
          }}
        />
      )}

      {/* ============================================== */}
      {/* ADD CLIENT MODAL */}
      {/* ============================================== */}
      <AnimatePresence>
        <AddClientPanel vm={vm} />
      </AnimatePresence>

      {/* ============================================== */}
      {/* EDIT CLIENT MODAL */}
      {/* ============================================== */}
      <EditModal vm={vm} />

      {/* ============================================== */}
      {/* DELETE CLIENT CONFIRMATION MODAL */}
      {/* ============================================== */}
      <DeleteConfirmPanel vm={vm} />

      {/* ============================================== */}
      {/* CONVERT TO PERMANENT MODAL */}
      {/* ============================================== */}
      <AnimatePresence>
        {showConvertModal && selectedClient && (
          <div className="fixed inset-0 bg-black/60  flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
                  <UserCheck className="w-7 h-7 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">
                    Convert to Permanent
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Set a password for client login
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={convertPassword}
                  onChange={(e: any) => setConvertPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                  placeholder="Enter password for client"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConvertModal(false);
                    setConvertPassword("");
                  }}
                  className="flex-1 px-6 py-3 border border-slate-300 rounded-xl hover:bg-slate-50 transition-all font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConvertToPermanent}
                  disabled={isSubmitting || !convertPassword}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                  {isSubmitting ? "Converting..." : "Convert"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <SuccessShareModal
        isOpen={shareModal.show}
        onClose={() => setShareModal((s) => ({ ...s, show: false }))}
        title={shareModal.title}
        details={shareModal.details}
        whatsappPhone={shareModal.phone}
        whatsappMessage={shareModal.message}
      />
    </motion.div>
  );
}
