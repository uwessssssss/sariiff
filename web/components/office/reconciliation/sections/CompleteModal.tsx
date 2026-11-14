"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, ShieldCheck, X } from "lucide-react";
import { getCurrencySymbol } from "../helpers";
import { type ReconciliationVM } from "../useReconciliation";

export function CompleteModal({ vm }: { vm: ReconciliationVM }) {
  const { balanceSummary, currentVariance, effectiveActualBalance, handleCompleteReconciliation, isBalanced, isReconciliationComplete, isSubmitting, selectedAccount, setShowCompleteModal, showCompleteModal } = vm;
  return (
    <AnimatePresence>
        {showCompleteModal && selectedAccount && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowCompleteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-lg w-full overflow-hidden"
            >
              <div className="bg-blue-600 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">
                        Complete Reconciliation
                      </h3>
                      <p className="text-blue-50 text-sm">
                        {selectedAccount.name}
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowCompleteModal(false)}
                    className="p-2 hover:bg-white/20"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-blue-700 uppercase mb-1">
                      Expected
                    </p>
                    <p className="text-xl font-semibold text-blue-700">
                      {getCurrencySymbol(selectedAccount.currency)}
                      {selectedAccount.balance.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-[#E9EEF6] border border-slate-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-[#0F172A] uppercase mb-1">
                      Actual
                    </p>
                    <p className="text-xl font-semibold text-[#0F172A]">
                      {getCurrencySymbol(selectedAccount.currency)}
                      {effectiveActualBalance.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div
                  className={`p-4 border rounded-xl ${
                    isBalanced || isReconciliationComplete
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">
                      Variance:
                    </span>
                    <span
                      className={`text-xl font-semibold ${
                        isBalanced || isReconciliationComplete
                          ? "text-emerald-700"
                          : "text-red-700"
                      }`}
                    >
                      {isBalanced || isReconciliationComplete
                        ? "✓ Balanced"
                        : `${getCurrencySymbol(
                            selectedAccount.currency,
                          )}${currentVariance.toLocaleString()}`}
                    </span>
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4 space-y-2 rounded-xl">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Matched:</span>
                    <span className="text-sm font-semibold text-emerald-700">
                      {balanceSummary.matchedCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Unmatched:</span>
                    <span className="text-sm font-semibold text-red-600">
                      {balanceSummary.unmatchedCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Pending:</span>
                    <span className="text-sm font-semibold text-amber-700">
                      {balanceSummary.pendingCount}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t-2 border-slate-200">
                  <button
                    onClick={() => setShowCompleteModal(false)}
                    className="flex-1 px-4 py-3 bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCompleteReconciliation}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-3 bg-blue-600 text-white font-semibold hover:shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Complete
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
  );
}
