"use client";

import { AlertTriangle, CheckCircle2, ListChecks, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ReconciliationStatus } from "@/lib/api";
import { type ReconciliationVM } from "../useReconciliation";

export function BulkModal({ vm }: { vm: ReconciliationVM }) {
  const { handleBulkReconcile, isSubmitting, selectedTransactions, setShowBulkModal, showBulkModal } = vm;
  return (
    <AnimatePresence>
      {showBulkModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setShowBulkModal(false)}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={(e: any) => e.stopPropagation()}
            className="bg-white shadow-2xl max-w-md w-full overflow-hidden"
          >
            <div className="bg-blue-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 flex items-center justify-center">
                    <ListChecks className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-semibold">Bulk Reconciliation</h3>
                </div>
                <button aria-label="Close"
                  onClick={() => setShowBulkModal(false)}
                  className="p-2 hover:bg-white/20"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-[#E9EEF6] border border-slate-200 p-4 rounded-xl">
                <p className="text-sm text-[#0F172A]">
                  <strong>{selectedTransactions.size}</strong> transactions
                  selected
                </p>
              </div>
              <div className="space-y-3">
                <button
                  onClick={() =>
                    handleBulkReconcile(ReconciliationStatus.Matched)
                  }
                  disabled={isSubmitting}
                  className="w-full px-4 py-4 bg-emerald-700 text-white font-semibold hover:bg-emerald-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5" />
                  )}
                  Mark All as Matched
                </button>
                <button
                  onClick={() =>
                    handleBulkReconcile(ReconciliationStatus.Unmatched)
                  }
                  disabled={isSubmitting}
                  className="w-full px-4 py-4 bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                  Mark All as Unmatched
                </button>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="w-full px-4 py-3 bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
