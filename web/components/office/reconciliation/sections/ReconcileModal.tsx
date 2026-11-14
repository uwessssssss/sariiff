"use client";

import { AlertTriangle, CheckCircle2, Loader2, Save, Scale, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ReconciliationStatus } from "@/lib/api";
import { getCurrencySymbol } from "../helpers";
import { type ReconciliationVM } from "../useReconciliation";

export function ReconcileModal({ vm }: { vm: ReconciliationVM }) {
  const { handleReconcileTransaction, isSubmitting, reconcileForm, selectedTransaction, setReconcileForm, setShowReconcileModal, showReconcileModal } = vm;
  return (
    <AnimatePresence>
        {showReconcileModal && selectedTransaction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowReconcileModal(false)}
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
                      <Scale className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">
                        Reconcile Transaction
                      </h3>
                      <p className="text-blue-50 text-sm">
                        {selectedTransaction.code}
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowReconcileModal(false)}
                    className="p-2 hover:bg-white/20"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                    Description
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {selectedTransaction.description}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-blue-700 uppercase mb-1">
                      Expected
                    </p>
                    <p className="text-2xl font-semibold text-blue-700">
                      {getCurrencySymbol(selectedTransaction.currency)}
                      {selectedTransaction.amount.toLocaleString()}
                    </p>
                  </div>
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
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                    Actual Amount *
                  </label>
                  <input
                    type="number"
                    value={reconcileForm.actualAmount || ""}
                    onChange={(e: any) =>
                      setReconcileForm({
                        ...reconcileForm,
                        actualAmount: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="Enter actual amount"
                    step="0.01"
                    className="w-full px-4 py-3 border border-slate-300 focus:border-blue-500 focus:outline-none text-lg font-semibold transition-all rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                    Status *
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer p-3 border rounded transition-all flex-1 justify-center hover:bg-emerald-50 hover:border-emerald-300">
                      <input
                        type="radio"
                        checked={
                          reconcileForm.status === ReconciliationStatus.Matched
                        }
                        onChange={() =>
                          setReconcileForm({
                            ...reconcileForm,
                            status: ReconciliationStatus.Matched,
                          })
                        }
                        className="w-4 h-4 text-emerald-700"
                      />
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-semibold">Matched</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer p-3 border rounded transition-all flex-1 justify-center hover:bg-red-50 hover:border-red-300">
                      <input
                        type="radio"
                        checked={
                          reconcileForm.status ===
                          ReconciliationStatus.Unmatched
                        }
                        onChange={() =>
                          setReconcileForm({
                            ...reconcileForm,
                            status: ReconciliationStatus.Unmatched,
                          })
                        }
                        className="w-4 h-4 text-red-600"
                      />
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span className="text-sm font-semibold">Unmatched</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                    Notes
                  </label>
                  <textarea
                    value={reconcileForm.notes}
                    onChange={(e: any) =>
                      setReconcileForm({
                        ...reconcileForm,
                        notes: e.target.value,
                      })
                    }
                    placeholder="Optional notes..."
                    rows={2}
                    className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all resize-none rounded-lg"
                  />
                </div>
                {reconcileForm.actualAmount > 0 && (
                  <div
                    className={`p-4 border rounded-xl ${
                      Math.abs(
                        reconcileForm.actualAmount - selectedTransaction.amount,
                      ) < 0.01
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-red-50 border-red-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">
                        Variance:
                      </span>
                      <span
                        className={`text-lg font-semibold ${
                          Math.abs(
                            reconcileForm.actualAmount -
                              selectedTransaction.amount,
                          ) < 0.01
                            ? "text-emerald-700"
                            : "text-red-700"
                        }`}
                      >
                        {Math.abs(
                          reconcileForm.actualAmount -
                            selectedTransaction.amount,
                        ) < 0.01
                          ? "✓ Matched"
                          : `${getCurrencySymbol(
                              selectedTransaction.currency,
                            )}${(
                              reconcileForm.actualAmount -
                              selectedTransaction.amount
                            ).toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex gap-3 pt-4 border-t-2 border-slate-200">
                  <button
                    onClick={() => setShowReconcileModal(false)}
                    className="flex-1 px-4 py-3 bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReconcileTransaction}
                    disabled={isSubmitting || reconcileForm.actualAmount <= 0}
                    className="flex-1 px-4 py-3 bg-blue-600 text-white font-semibold hover:shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
  );
}
