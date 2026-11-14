"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownCircle, ArrowUpCircle, Banknote, X } from "lucide-react";
import { ReconciliationStatus, TransactionType } from "@/lib/api";
import { getCurrencySymbol } from "../helpers";
import { type ReconciliationVM } from "../useReconciliation";

export function DetailModal({ vm }: { vm: ReconciliationVM }) {
  const { StatusBadge, selectedAccountId, selectedAccountType, selectedTransaction, setShowDetailModal, showDetailModal } = vm;
  return (
    <AnimatePresence>
        {showDetailModal && selectedTransaction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowDetailModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div
                className={`p-6 text-white ${
                  selectedTransaction.reconciliationStatus ===
                  ReconciliationStatus.Matched
                    ? "bg-emerald-700"
                    : selectedTransaction.reconciliationStatus ===
                        ReconciliationStatus.Unmatched
                      ? "bg-red-600"
                      : "bg-amber-700"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 flex items-center justify-center">
                      <Banknote className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-semibold">
                        Transaction Details
                      </h3>
                      <p className="text-white text-sm font-mono">
                        {selectedTransaction.code}
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowDetailModal(false)}
                    className="p-2 hover:bg-white/20"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                      Date
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
                      {new Date(
                        selectedTransaction.transactionDate,
                      ).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                      Reference
                    </p>
                    <p className="text-lg font-semibold text-blue-600 font-mono">
                      {selectedTransaction.reference ||
                        selectedTransaction.code}
                    </p>
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                    Description
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {selectedTransaction.description}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-blue-700 uppercase mb-1">
                      Expected
                    </p>
                    <p className="text-2xl font-semibold text-blue-700">
                      {getCurrencySymbol(selectedTransaction.currency)}
                      {selectedTransaction.amount.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-[#E9EEF6] border border-slate-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-[#0F172A] uppercase mb-1">
                      Actual
                    </p>
                    <p
                      className={`text-2xl font-semibold ${
                        selectedTransaction.actualAmount !== null
                          ? "text-[#0F172A]"
                          : "text-slate-500"
                      }`}
                    >
                      {selectedTransaction.actualAmount !== null
                        ? `${getCurrencySymbol(
                            selectedTransaction.currency,
                          )}${selectedTransaction.actualAmount.toLocaleString()}`
                        : "Not Set"}
                    </p>
                  </div>
                  <div
                    className={`p-4 border rounded-xl ${
                      selectedTransaction.actualAmount === null
                        ? "bg-slate-50 border-slate-200"
                        : selectedTransaction.variance !== null &&
                            Math.abs(selectedTransaction.variance) < 0.01
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-red-50 border-red-200"
                    }`}
                  >
                    <p className="text-xs font-semibold text-slate-700 uppercase mb-1">
                      Variance
                    </p>
                    <p
                      className={`text-2xl font-semibold ${
                        selectedTransaction.actualAmount === null
                          ? "text-slate-500"
                          : selectedTransaction.variance !== null &&
                              Math.abs(selectedTransaction.variance) < 0.01
                            ? "text-emerald-600"
                            : "text-red-600"
                      }`}
                    >
                      {selectedTransaction.actualAmount !== null
                        ? selectedTransaction.variance !== null &&
                          Math.abs(selectedTransaction.variance) < 0.01
                          ? "✓ Match"
                          : `${getCurrencySymbol(
                              selectedTransaction.currency,
                            )}${(
                              selectedTransaction.variance || 0
                            ).toLocaleString()}`
                        : "-"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                      Type
                    </p>
                    {(
                      selectedTransaction.sourceAccountType ===
                        selectedAccountType &&
                      selectedTransaction.sourceAccountId === selectedAccountId
                        ? selectedTransaction.transactionType ===
                          TransactionType.Debit
                        : selectedTransaction.transactionType ===
                          TransactionType.Credit
                    ) ? (
                      <span className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 font-semibold">
                        <ArrowUpCircle className="w-5 h-5" />
                        DEBIT
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 font-semibold">
                        <ArrowDownCircle className="w-5 h-5" />
                        CREDIT
                      </span>
                    )}
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                      Status
                    </p>
                    <StatusBadge
                      status={selectedTransaction.reconciliationStatus}
                    />
                  </div>
                </div>
                {selectedTransaction.reconciliationNotes && (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-amber-700 uppercase mb-1">
                      Notes
                    </p>
                    <p className="text-sm text-amber-900">
                      {selectedTransaction.reconciliationNotes}
                    </p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t-2 border-slate-200 bg-slate-50">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="w-full px-4 py-3 bg-slate-700 text-white font-semibold hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
  );
}
