"use client";

import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Check, CheckCircle2, Edit3, FileSpreadsheet, History, Lock, Unlock } from "lucide-react";
import { formatCurrency, getCurrencySymbol } from "../helpers";
import { type ReconciliationVM } from "../useReconciliation";

export function BalanceCards({ vm }: { vm: ReconciliationVM }) {
  const { actualBalanceInput, autoPopulateFromStatement, currentVariance, hasLargeVariance, isBalanceLocked, isBalanced, isReconciliationComplete, reconciliationPeriod, selectedAccount, setActualBalanceInput, setIsBalanceLocked, setShowAdjustmentForm, statementEntries, transactionBreakdown, variancePercentage } = vm;
  if (!(selectedAccount)) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* 1. Opening Balance */}
                  <div className="bg-slate-50 border border-slate-200 p-4 relative group hover:border-slate-300 transition-all rounded-xl">
                    <div className="absolute top-2 right-2">
                      <div className="w-6 h-6 bg-slate-200 flex items-center justify-center rounded-full">
                        <History className="w-3 h-3 text-slate-500" />
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Opening Balance
                    </p>
                    <p className="text-2xl font-semibold text-slate-700">
                      {formatCurrency(
                        reconciliationPeriod.openingBalance,
                        selectedAccount.currency,
                      )}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      As of{" "}
                      {new Date(
                        reconciliationPeriod.startDate,
                      ).toLocaleDateString()}
                    </p>
                  </div>

                  {/* 2. System Balance (Expected) */}
                  <div className="bg-blue-600 text-white p-4 relative shadow-sm">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-50"></div>
                    <div className="relative">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold uppercase tracking-wider">
                          Expected (System)
                        </p>
                        <div className="bg-blue-800 px-2 py-0.5 rounded text-xs font-semibold">
                          CLOSING
                        </div>
                      </div>
                      <p className="text-3xl font-semibold tracking-tight">
                        {formatCurrency(
                          selectedAccount.balance,
                          selectedAccount.currency,
                        )}
                      </p>
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/20 text-xs">
                        <div className="flex items-center gap-1">
                          <ArrowUpCircle className="w-3 h-3" />
                          <span>
                            DR:{" "}
                            {formatCurrency(
                              transactionBreakdown.expectedDebits,
                              selectedAccount.currency,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ArrowDownCircle className="w-3 h-3" />
                          <span>
                            CR:{" "}
                            {formatCurrency(
                              transactionBreakdown.expectedCredits,
                              selectedAccount.currency,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. Actual Balance (Statement) - BUG FIX: Disabled when reconciliation complete */}
                  <div
                    className={`border p-4 relative transition-all rounded-xl ${
                      isReconciliationComplete
                        ? "bg-emerald-50 border-emerald-300"
                        : isBalanceLocked
                          ? "bg-[#E9EEF6] border-slate-200"
                          : "bg-white border-slate-200 hover:border-blue-500"
                    }`}
                  >
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      {/* BUG FIX: Hide controls when reconciliation is complete */}
                      {!isReconciliationComplete && (
                        <>
                          {statementEntries.length > 0 && (
                            <button
                              onClick={autoPopulateFromStatement}
                              className="p-1.5 bg-[#E9EEF6] text-blue-600 hover:bg-blue-100 transition-colors rounded"
                              title="Auto-fill from statement"
                            >
                              <FileSpreadsheet className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={() => setIsBalanceLocked(!isBalanceLocked)}
                            className={`p-1.5 rounded transition-colors ${
                              isBalanceLocked
                                ? "bg-blue-600 text-white"
                                : "bg-[#E9EEF6] text-blue-600 hover:bg-blue-100"
                            }`}
                            title={
                              isBalanceLocked
                                ? "Unlock to edit"
                                : "Lock balance"
                            }
                          >
                            {isBalanceLocked ? (
                              <Lock className="w-3 h-3" />
                            ) : (
                              <Unlock className="w-3 h-3" />
                            )}
                          </button>
                        </>
                      )}
                      {isReconciliationComplete && (
                        <div className="w-6 h-6 bg-emerald-600 flex items-center justify-center rounded-full">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>

                    <p
                      className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                        isReconciliationComplete
                          ? "text-emerald-700"
                          : "text-[#0F172A]"
                      }`}
                    >
                      Actual (Statement)
                    </p>

                    {/* BUG FIX: Show balanced value when reconciliation complete */}
                    {isReconciliationComplete ? (
                      <p className="text-3xl font-semibold text-emerald-700">
                        {formatCurrency(
                          selectedAccount.balance,
                          selectedAccount.currency,
                        )}
                      </p>
                    ) : isBalanceLocked ? (
                      <p className="text-3xl font-semibold text-[#0F172A]">
                        {formatCurrency(
                          actualBalanceInput,
                          selectedAccount.currency,
                        )}
                      </p>
                    ) : (
                      <div className="relative">
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-lg font-semibold text-blue-600">
                          {getCurrencySymbol(selectedAccount.currency)}
                        </span>
                        <input
                          type="number"
                          value={actualBalanceInput || ""}
                          onChange={(e: any) =>
                            setActualBalanceInput(
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          placeholder="0.00"
                          className="w-full pl-12 text-3xl font-semibold text-[#0F172A] bg-transparent border-b-2 border-slate-200 focus:border-blue-500 outline-none transition-colors"
                          step="0.01"
                        />
                      </div>
                    )}

                    <div
                      className={`flex items-center gap-2 mt-3 pt-3 border-t text-xs ${
                        isReconciliationComplete
                          ? "border-emerald-200 text-emerald-700"
                          : "border-slate-200 text-blue-600"
                      }`}
                    >
                      {isReconciliationComplete ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Auto-balanced (all transactions matched)</span>
                        </>
                      ) : statementEntries.length > 0 ? (
                        <>
                          <FileSpreadsheet className="w-3 h-3" />
                          <span>
                            {statementEntries.length} statement entries loaded
                          </span>
                        </>
                      ) : (
                        <>
                          <Edit3 className="w-3 h-3" />
                          <span>Enter from bank statement</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 4. Variance - BUG FIX: Always show balanced when reconciliation complete */}
                  <div
                    className={`border p-4 relative transition-all rounded-xl ${
                      isReconciliationComplete || isBalanced
                        ? "bg-emerald-50 border-emerald-300"
                        : hasLargeVariance
                          ? "bg-red-50 border-red-300"
                          : "bg-amber-50 border-amber-300"
                    }`}
                  >
                    <div className="absolute top-2 right-2">
                      {isReconciliationComplete || isBalanced ? (
                        <div className="w-8 h-8 bg-emerald-600 flex items-center justify-center rounded-full shadow-sm">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      ) : (
                        <div
                          className={`w-8 h-8 flex items-center justify-center rounded-full shadow-sm ${
                            hasLargeVariance ? "bg-red-500" : "bg-amber-600"
                          }`}
                        >
                          <AlertTriangle className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>

                    <p
                      className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                        isReconciliationComplete || isBalanced
                          ? "text-emerald-700"
                          : hasLargeVariance
                            ? "text-red-700"
                            : "text-amber-700"
                      }`}
                    >
                      Variance
                    </p>

                    <p
                      className={`text-3xl font-semibold ${
                        isReconciliationComplete || isBalanced
                          ? "text-emerald-600"
                          : hasLargeVariance
                            ? "text-red-600"
                            : "text-amber-700"
                      }`}
                    >
                      {isReconciliationComplete || isBalanced ? (
                        "✓ Balanced"
                      ) : (
                        <>
                          {currentVariance > 0 ? "+" : ""}
                          {formatCurrency(
                            currentVariance,
                            selectedAccount.currency,
                          )}
                        </>
                      )}
                    </p>

                    <div
                      className={`flex items-center justify-between mt-3 pt-3 border-t text-xs ${
                        isReconciliationComplete || isBalanced
                          ? "border-emerald-200 text-emerald-700"
                          : hasLargeVariance
                            ? "border-red-200 text-red-700"
                            : "border-amber-200 text-amber-700"
                      }`}
                    >
                      <span>
                        {isReconciliationComplete ? "0.00" : variancePercentage}
                        % difference
                      </span>
                      {!isReconciliationComplete && !isBalanced && (
                        <button
                          onClick={() => setShowAdjustmentForm(true)}
                          className={`px-2 py-1 rounded font-semibold transition-colors ${
                            hasLargeVariance
                              ? "bg-red-200 hover:bg-red-300 text-red-800"
                              : "bg-amber-200 hover:bg-amber-300 text-amber-800"
                          }`}
                        >
                          Adjust
                        </button>
                      )}
                    </div>
                  </div>
                </div>
  );
}
