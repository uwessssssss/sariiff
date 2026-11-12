"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Calculator, Check, Info, X } from "lucide-react";
import { formatCurrency } from "../helpers";
import { type ReconciliationVM } from "../useReconciliation";

export function AdjustmentFormPanel({ vm }: { vm: ReconciliationVM }) {
  const { adjustmentNote, currentVariance, handleCreateAdjustment, selectedAccount, setAdjustmentNote, setShowAdjustmentForm, showAdjustmentForm } = vm;
  return (
    <AnimatePresence>
      {showAdjustmentForm && selectedAccount && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setShowAdjustmentForm(false)}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={(e: any) => e.stopPropagation()}
            className="bg-white shadow-2xl max-w-md w-full overflow-hidden rounded-lg"
          >
            <div className="bg-amber-700 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 flex items-center justify-center rounded-lg">
                    <Calculator className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">
                      Create Adjustment Entry
                    </h3>
                    <p className="text-amber-100 text-sm">
                      Balance the variance
                    </p>
                  </div>
                </div>
                <button aria-label="Close"
                  onClick={() => setShowAdjustmentForm(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-amber-700">
                    Variance to adjust:
                  </span>
                  <span className="text-xl font-semibold text-amber-700">
                    {currentVariance >= 0 ? "+" : ""}
                    {formatCurrency(
                      currentVariance,
                      selectedAccount.currency,
                    )}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                  Adjustment Description *
                </label>
                <textarea
                  value={adjustmentNote}
                  onChange={(e: any) => setAdjustmentNote(e.target.value)}
                  placeholder="e.g., Bank charges not recorded, Interest income, etc."
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 focus:border-amber-500 focus:outline-none rounded-lg transition-all resize-none"
                />
              </div>
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 mt-0.5" />
                  <p className="text-sm text-blue-700">
                    This will create a{" "}
                    {currentVariance > 0 ? "credit" : "debit"} entry of{" "}
                    <strong>
                      {formatCurrency(
                        Math.abs(currentVariance),
                        selectedAccount.currency,
                      )}
                    </strong>{" "}
                    to balance your account.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t-2 border-slate-100">
                <button
                  onClick={() => setShowAdjustmentForm(false)}
                  className="flex-1 px-4 py-3 bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-colors rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (adjustmentNote.trim())
                      handleCreateAdjustment(currentVariance, adjustmentNote);
                  }}
                  disabled={!adjustmentNote.trim()}
                  className="flex-1 px-4 py-3 bg-amber-700 text-white font-semibold hover:shadow-md transition-all rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Create Adjustment
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
