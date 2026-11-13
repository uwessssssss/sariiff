"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { formatCurrency } from "../helpers";
import { motion } from "framer-motion";
import { type ReconciliationVM } from "../useReconciliation";

export function VisualComparison({ vm }: { vm: ReconciliationVM }) {
  const { actualBalanceInput, currentVariance, hasLargeVariance, isBalanced, isReconciliationComplete, selectedAccount, variancePercentage } = vm;
  if (!(selectedAccount)) return null;
  return (
    <>
{!isReconciliationComplete && actualBalanceInput > 0 && (
                  <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-slate-700">
                        Visual Comparison
                      </p>
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-blue-500 rounded" />
                          <span className="text-slate-600">Expected</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-blue-600 rounded" />
                          <span className="text-slate-600">Actual</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-600">Expected</span>
                          <span className="font-semibold text-blue-600">
                            {formatCurrency(
                              selectedAccount.balance,
                              selectedAccount.currency,
                            )}
                          </span>
                        </div>
                        <div className="h-8 bg-slate-200 rounded-lg overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 0.5 }}
                            className="h-full bg-blue-600 rounded-lg"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-600">Actual</span>
                          <span className="font-semibold text-blue-600">
                            {formatCurrency(
                              actualBalanceInput,
                              selectedAccount.currency,
                            )}
                          </span>
                        </div>
                        <div className="h-8 bg-slate-200 rounded-lg overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${selectedAccount.balance > 0 ? Math.min(100, (actualBalanceInput / selectedAccount.balance) * 100) : 100}%`,
                            }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                            className={`h-full rounded-lg ${
                              isBalanced
                                ? "bg-emerald-600"
                                : actualBalanceInput > selectedAccount.balance
                                  ? "bg-blue-600"
                                  : "bg-blue-600"
                            }`}
                          />
                        </div>
                      </div>
                    </div>

                    {!isBalanced && (
                      <div
                        className={`mt-4 p-3 rounded-lg flex items-center justify-between ${
                          hasLargeVariance ? "bg-red-100" : "bg-amber-100"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {currentVariance > 0 ? (
                            <>
                              <TrendingUp
                                className={`w-5 h-5 ${
                                  hasLargeVariance
                                    ? "text-red-600"
                                    : "text-amber-700"
                                }`}
                              />
                              <span
                                className={`text-sm font-medium ${
                                  hasLargeVariance
                                    ? "text-red-700"
                                    : "text-amber-800"
                                }`}
                              >
                                Actual is{" "}
                                <strong>
                                  {formatCurrency(
                                    currentVariance,
                                    selectedAccount.currency,
                                  )}
                                </strong>{" "}
                                MORE than expected
                              </span>
                            </>
                          ) : (
                            <>
                              <TrendingDown
                                className={`w-5 h-5 ${
                                  hasLargeVariance
                                    ? "text-red-600"
                                    : "text-amber-700"
                                }`}
                              />
                              <span
                                className={`text-sm font-medium ${
                                  hasLargeVariance
                                    ? "text-red-700"
                                    : "text-amber-800"
                                }`}
                              >
                                Actual is{" "}
                                <strong>
                                  {formatCurrency(
                                    Math.abs(currentVariance),
                                    selectedAccount.currency,
                                  )}
                                </strong>{" "}
                                LESS than expected
                              </span>
                            </>
                          )}
                        </div>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            hasLargeVariance
                              ? "bg-red-200 text-red-800"
                              : "bg-amber-200 text-amber-800"
                          }`}
                        >
                          {variancePercentage}%
                        </span>
                      </div>
                    )}
                  </div>
                )}
    </>
  );
}
