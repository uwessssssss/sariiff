"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownCircle, ArrowUpCircle, ChevronDown, ChevronUp, Layers } from "lucide-react";
import { formatCurrency } from "../helpers";
import { type ReconciliationVM } from "../useReconciliation";

export function BalanceBreakdown({ vm }: { vm: ReconciliationVM }) {
  const { balanceSummary, isReconciliationComplete, matchRate, selectedAccount, setShowBreakdown, showBreakdown, transactionBreakdown } = vm;
  if (!(selectedAccount)) return null;
  return (
    <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-lg">
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Layers className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-slate-900">
                    Transaction Breakdown
                  </span>
                </div>
                {showBreakdown ? (
                  <ChevronUp className="w-5 h-5 text-slate-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-500" />
                )}
              </button>

              <AnimatePresence>
                {showBreakdown && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t-2 border-slate-100"
                  >
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Debits */}
                        <div className="space-y-4">
                          <h4 className="text-sm font-semibold text-slate-700 uppercase flex items-center gap-2">
                            <ArrowUpCircle className="w-4 h-4 text-emerald-600" />
                            Debits (Money In)
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded">
                              <span className="text-sm text-slate-600">
                                Expected
                              </span>
                              <span className="font-semibold text-blue-700">
                                {formatCurrency(
                                  transactionBreakdown.expectedDebits,
                                  selectedAccount.currency,
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-[#E9EEF6] border border-slate-200 rounded">
                              <span className="text-sm text-slate-600">
                                Actual
                              </span>
                              <span className="font-semibold text-[#0F172A]">
                                {formatCurrency(
                                  transactionBreakdown.actualDebits,
                                  selectedAccount.currency,
                                )}
                              </span>
                            </div>
                            <div
                              className={`flex items-center justify-between p-3 rounded ${
                                Math.abs(
                                  transactionBreakdown.expectedDebits -
                                    transactionBreakdown.actualDebits,
                                ) < 0.01 || isReconciliationComplete
                                  ? "bg-emerald-50 border border-emerald-200 rounded-lg"
                                  : "bg-amber-50 border border-amber-200 rounded-lg"
                              }`}
                            >
                              <span className="text-sm text-slate-600">
                                Variance
                              </span>
                              <span
                                className={`font-semibold ${
                                  Math.abs(
                                    transactionBreakdown.expectedDebits -
                                      transactionBreakdown.actualDebits,
                                  ) < 0.01 || isReconciliationComplete
                                    ? "text-emerald-700"
                                    : "text-amber-700"
                                }`}
                              >
                                {Math.abs(
                                  transactionBreakdown.expectedDebits -
                                    transactionBreakdown.actualDebits,
                                ) < 0.01 || isReconciliationComplete
                                  ? "✓ Match"
                                  : formatCurrency(
                                      transactionBreakdown.actualDebits -
                                        transactionBreakdown.expectedDebits,
                                      selectedAccount.currency,
                                    )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Credits */}
                        <div className="space-y-4">
                          <h4 className="text-sm font-semibold text-slate-700 uppercase flex items-center gap-2">
                            <ArrowDownCircle className="w-4 h-4 text-red-600" />
                            Credits (Money Out)
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded">
                              <span className="text-sm text-slate-600">
                                Expected
                              </span>
                              <span className="font-semibold text-blue-700">
                                {formatCurrency(
                                  transactionBreakdown.expectedCredits,
                                  selectedAccount.currency,
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-[#E9EEF6] border border-slate-200 rounded">
                              <span className="text-sm text-slate-600">
                                Actual
                              </span>
                              <span className="font-semibold text-[#0F172A]">
                                {formatCurrency(
                                  transactionBreakdown.actualCredits,
                                  selectedAccount.currency,
                                )}
                              </span>
                            </div>
                            <div
                              className={`flex items-center justify-between p-3 rounded ${
                                Math.abs(
                                  transactionBreakdown.expectedCredits -
                                    transactionBreakdown.actualCredits,
                                ) < 0.01 || isReconciliationComplete
                                  ? "bg-emerald-50 border border-emerald-200 rounded-lg"
                                  : "bg-amber-50 border border-amber-200 rounded-lg"
                              }`}
                            >
                              <span className="text-sm text-slate-600">
                                Variance
                              </span>
                              <span
                                className={`font-semibold ${
                                  Math.abs(
                                    transactionBreakdown.expectedCredits -
                                      transactionBreakdown.actualCredits,
                                  ) < 0.01 || isReconciliationComplete
                                    ? "text-emerald-700"
                                    : "text-amber-700"
                                }`}
                              >
                                {Math.abs(
                                  transactionBreakdown.expectedCredits -
                                    transactionBreakdown.actualCredits,
                                ) < 0.01 || isReconciliationComplete
                                  ? "✓ Match"
                                  : formatCurrency(
                                      transactionBreakdown.actualCredits -
                                        transactionBreakdown.expectedCredits,
                                      selectedAccount.currency,
                                    )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Summary */}
                      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-xs text-slate-500 uppercase font-semibold mb-1">
                              Total Transactions
                            </p>
                            <p className="text-xl font-semibold text-slate-700">
                              {balanceSummary.matchedCount +
                                balanceSummary.pendingCount +
                                balanceSummary.unmatchedCount}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 uppercase font-semibold mb-1">
                              Reconciled
                            </p>
                            <p className="text-xl font-semibold text-emerald-700">
                              {balanceSummary.matchedCount}
                              <span className="text-sm font-normal text-slate-500 ml-1">
                                ({matchRate}%)
                              </span>
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 uppercase font-semibold mb-1">
                              Remaining
                            </p>
                            <p
                              className={`text-xl font-semibold ${
                                balanceSummary.pendingCount +
                                  balanceSummary.unmatchedCount ===
                                0
                                  ? "text-emerald-700"
                                  : "text-amber-700"
                              }`}
                            >
                              {balanceSummary.pendingCount +
                                balanceSummary.unmatchedCount ===
                              0
                                ? "✓ None"
                                : balanceSummary.pendingCount +
                                  balanceSummary.unmatchedCount}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
  );
}
