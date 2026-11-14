"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FileText, X } from "lucide-react";
import { ReconciliationStatus, getAccountTypeLabel } from "@/lib/api";
import { getCurrencySymbol } from "../helpers";
import { type ReconciliationVM } from "../useReconciliation";

export function HistoryModal({ vm }: { vm: ReconciliationVM }) {
  const { StatusBadge, reconciliationHistory, selectedAccountType, setShowHistoryModal, showHistoryModal } = vm;
  return (
    <AnimatePresence>
        {showHistoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowHistoryModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            >
              <div className="bg-[#0F172A] p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">
                        Reconciliation History
                      </h3>
                      <p className="text-slate-300 text-sm">
                        {getAccountTypeLabel(selectedAccountType)} accounts
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowHistoryModal(false)}
                    className="p-2 hover:bg-white/20"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                {reconciliationHistory?.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                    <p className="text-lg font-medium">
                      No reconciliation history
                    </p>
                    <p className="text-sm">
                      Complete a reconciliation to see records here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reconciliationHistory?.map((rec) => (
                      <div
                        key={rec.id}
                        className={`p-4 border rounded-xl ${
                          rec.status === ReconciliationStatus.Matched
                            ? "bg-emerald-50 border-emerald-200"
                            : rec.status === ReconciliationStatus.Unmatched
                              ? "bg-red-50 border-red-200"
                              : "bg-amber-50 border-amber-200"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {rec.accountName}
                            </p>
                            <p className="text-sm text-slate-600">
                              {new Date(rec.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <StatusBadge status={rec.status} />
                        </div>
                        <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                          <div>
                            <p className="text-slate-600">Expected</p>
                            <p className="font-semibold">
                              {getCurrencySymbol(rec.currency)}
                              {rec.expectedBalance.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-600">Actual</p>
                            <p className="font-semibold">
                              {getCurrencySymbol(rec.currency)}
                              {rec.actualBalance.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-600">Variance</p>
                            <p
                              className={`font-semibold ${
                                Math.abs(rec.variance) < 0.01
                                  ? "text-emerald-700"
                                  : "text-red-700"
                              }`}
                            >
                              {Math.abs(rec.variance) < 0.01
                                ? "✓ Balanced"
                                : `${getCurrencySymbol(
                                    rec.currency,
                                  )}${rec.variance.toLocaleString()}`}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-4 border-t-2 border-slate-200 bg-slate-50">
                <button
                  onClick={() => setShowHistoryModal(false)}
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
