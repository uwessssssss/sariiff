"use client";

import { AlertCircle, ArrowDownCircle, ArrowUpCircle, Banknote, Calendar, Check, CheckSquare, ChevronLeft, ChevronRight, Eye, FileText, Loader2, Square } from "lucide-react";
import { ReconciliationStatus, TransactionType } from "@/lib/api";
import { getCurrencySymbol } from "../helpers";
import { motion } from "framer-motion";
import { type ReconciliationVM } from "../useReconciliation";

export function TransactionsTable({ vm }: { vm: ReconciliationVM }) {
  const { StatusBadge, currentPage, filteredTransactions, handleQuickMatch, handleSelectAll, handleSelectTransaction, isLoadingTransactions, isSubmitting, itemsPerPage, selectedAccount, selectedAccountId, selectedAccountType, selectedTransactions, setCurrentPage, setReconcileForm, setSelectedTransaction, setShowDetailModal, setShowReconcileModal, totalPages, totalTransactions } = vm;
  return (
    <>
{selectedAccount && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-lg"
          >
            <div className="p-4 lg:p-6 border-b-2 border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-lg lg:text-xl font-semibold text-slate-900 flex items-center gap-2">
                  <Banknote className="w-5 h-5 lg:w-6 lg:h-6 text-blue-600" />
                  Transaction Details
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  {totalTransactions} transactions • {selectedAccount.name}
                </p>
              </div>
              <div className="text-sm text-slate-600">
                Page {currentPage} of {totalPages || 1}
              </div>
            </div>

            {isLoadingTransactions ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <span className="ml-3 text-slate-600">
                  Loading transactions...
                </span>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <FileText className="w-16 h-16 mb-4 text-slate-300" />
                <p className="text-lg font-medium">No transactions found</p>
                <p className="text-sm">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-w-full">
                <table className="w-full">
                  <thead className="bg-[#E9EEF6]">
                    <tr>
                      <th className="px-4 py-4 text-center w-12 uppercase tracking-wide text-[#334155] font-semibold text-xs">
                        <button
                          onClick={handleSelectAll}
                          className="p-1 hover:bg-white/20 transition rounded"
                        >
                          {selectedTransactions.size ===
                            filteredTransactions.filter(
                              (t) =>
                                t.reconciliationStatus ===
                                ReconciliationStatus.Pending,
                            ).length &&
                          filteredTransactions.filter(
                            (t) =>
                              t.reconciliationStatus ===
                              ReconciliationStatus.Pending,
                          ).length > 0 ? (
                            <CheckSquare className="w-5 h-5" />
                          ) : (
                            <Square className="w-5 h-5 opacity-60" />
                          )}
                        </button>
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Date
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Reference
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Description
                      </th>
                      <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Type
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Expected
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Actual
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Variance
                      </th>
                      <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Status
                      </th>
                      <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredTransactions.map((txn, index) => (
                      <motion.tr
                        key={txn.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className={`hover:bg-blue-50/50 transition-colors ${
                          selectedTransactions.has(txn.id) ? "bg-blue-50" : ""
                        }`}
                      >
                        <td className="px-4 py-4 text-center">
                          {txn.reconciliationStatus ===
                            ReconciliationStatus.Pending && (
                            <button
                              onClick={() => handleSelectTransaction(txn.id)}
                              className="p-1 hover:bg-slate-200 transition rounded"
                            >
                              {selectedTransactions.has(txn.id) ? (
                                <CheckSquare className="w-5 h-5 text-blue-600" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-500" />
                              )}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-500" />
                            <span className="text-sm font-medium text-slate-900">
                              {new Date(txn.transactionDate).toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric" },
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="text-sm font-mono text-blue-600 font-semibold">
                            {txn.reference || txn.code}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-slate-900 font-medium line-clamp-1 max-w-xs">
                            {txn.description}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {(
                            txn.sourceAccountType === selectedAccountType &&
                            txn.sourceAccountId === selectedAccountId
                              ? txn.transactionType === TransactionType.Debit
                              : txn.transactionType === TransactionType.Credit
                          ) ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold">
                              <ArrowUpCircle className="w-3 h-3" />
                              DR
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold">
                              <ArrowDownCircle className="w-3 h-3" />
                              CR
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          <span className="text-sm font-semibold text-slate-900">
                            {getCurrencySymbol(txn.currency)}
                            {txn.amount.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          {txn.actualAmount !== null ? (
                            <span className="text-sm font-semibold text-[#0F172A]">
                              {getCurrencySymbol(txn.currency)}
                              {txn.actualAmount.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          {txn.variance !== null ? (
                            Math.abs(txn.variance) < 0.01 ? (
                              <span className="text-sm font-semibold text-emerald-700">
                                ✓
                              </span>
                            ) : (
                              <span className="text-sm font-semibold text-red-700">
                                {txn.variance >= 0 ? "+" : ""}
                                {txn.variance.toLocaleString()}
                              </span>
                            )
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <StatusBadge status={txn.reconciliationStatus} />
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button aria-label="View details"
                              onClick={() => {
                                setSelectedTransaction(txn);
                                setShowDetailModal(true);
                              }}
                              className="p-2 bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {txn.reconciliationStatus ===
                              ReconciliationStatus.Pending && (
                              <>
                                <button
                                  aria-label="Mark as matched"
                                  onClick={() => handleQuickMatch(txn)}
                                  disabled={isSubmitting}
                                  className="p-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all disabled:opacity-50"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedTransaction(txn);
                                    setReconcileForm({
                                      actualAmount: txn.amount,
                                      status: ReconciliationStatus.Matched,
                                      notes: "",
                                    });
                                    setShowReconcileModal(true);
                                  }}
                                  aria-label="Review with a different amount"
                                  className="p-2 bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all"
                                >
                                  <AlertCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t-2 border-slate-200 bg-slate-50">
                <div className="text-sm text-slate-600 font-medium">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                  {Math.min(currentPage * itemsPerPage, totalTransactions)} of{" "}
                  {totalTransactions}
                </div>
                <div className="flex gap-2">
                  <button aria-label="Previous"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-lg"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button aria-label="Next"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="p-2 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-lg"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
    </>
  );
}
