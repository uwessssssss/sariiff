"use client";

import { ArrowDownCircle, ArrowUpCircle, Calendar, ChevronLeft, ChevronRight, Eye, FileText, Loader2 } from "lucide-react";
import { getAccountTypeLabel } from "@/lib/api";
import { motion } from "framer-motion";
import { type CashAtHandVM } from "../useCashAtHand";

export function TransactionsTable({ vm }: { vm: CashAtHandVM }) {
  const { currentTransactions, filteredTransactions, getCurrencySymbol, indexOfFirstTransaction, indexOfLastTransaction, isLoadingTransactions, setSelectedTransaction, setTransactionsCurrentPage, totalTransactionPages, transactionsCurrentPage } = vm;
  return (
    <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-xl bg-white  border border-slate-200  overflow-hidden"
        >
          {isLoadingTransactions ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
              <span className="text-slate-600">Loading transactions...</span>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto max-w-full">
                <table className="w-full">
                  <thead className="bg-[#E9EEF6]">
                    <tr>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Date
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Reference
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Description
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Action
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Debit (In)
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Credit (Out)
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Balance
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Related Account
                      </th>
                      <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {currentTransactions.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-8 text-center text-slate-500"
                        >
                          No transactions found.
                        </td>
                      </tr>
                    ) : (
                      currentTransactions.map((txn, index) => (
                        <motion.tr
                          key={txn.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.02 }}
                          className="hover:bg-blue-50/50 transition-colors"
                        >
                          <td className="px-4 py-4 text-sm text-slate-600 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-500" />
                              {new Date(txn.date).toLocaleString()}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-slate-500" />
                              <span className="text-sm font-semibold text-slate-700">
                                {txn.reference || txn.code}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-900 font-semibold max-w-sm">
                            {txn.description}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1 border-l-4 text-xs font-semibold ${
                                txn.thisAccountAction === "Debit"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-500"
                                  : "bg-red-50 text-red-700 border-red-500"
                              }`}
                            >
                              {/* Down = money in, up = money out (same as the statement and the app) */}
                              {txn.thisAccountAction === "Debit" ? (
                                <ArrowDownCircle className="w-3.5 h-3.5" />
                              ) : (
                                <ArrowUpCircle className="w-3.5 h-3.5" />
                              )}
                              {txn.thisAccountAction}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right">
                            {txn.debit !== null ? (
                              <span className="text-base font-semibold text-emerald-700">
                                +{getCurrencySymbol(txn.currency)}{" "}
                                {txn.debit.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right">
                            {txn.credit !== null ? (
                              <span className="text-base font-semibold text-red-600">
                                -{getCurrencySymbol(txn.currency)}{" "}
                                {txn.credit.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-base font-semibold text-slate-900 whitespace-nowrap text-right">
                            {getCurrencySymbol(txn.currency)}{" "}
                            {txn.balanceAfter.toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                            {txn.relatedAccount && (
                              <div className="text-xs">
                                <div className="font-semibold text-slate-900">
                                  {txn.relatedAccount.accountName}
                                </div>
                                <div className="text-slate-600">
                                  {getAccountTypeLabel(
                                    txn.relatedAccount
                                      .accountType as import("@/lib/api").AccountType,
                                  )}{" "}
                                  • {txn.relatedAccount.action}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center">
                            <button
                              onClick={() => setSelectedTransaction(txn)}
                              className="rounded-lg inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-all font-semibold text-sm"
                            >
                              <Eye className="w-4 h-4" />
                              View
                            </button>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalTransactionPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
                  <div className="text-sm text-slate-600">
                    Showing {indexOfFirstTransaction + 1} to{" "}
                    {Math.min(
                      indexOfLastTransaction,
                      filteredTransactions.length,
                    )}{" "}
                    of {filteredTransactions.length} transactions
                  </div>
                  <div className="flex gap-2">
                    <button aria-label="Previous"
                      onClick={() =>
                        setTransactionsCurrentPage((prev) =>
                          Math.max(1, prev - 1),
                        )
                      }
                      disabled={transactionsCurrentPage === 1}
                      className="rounded-lg p-2 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-600" />
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from(
                        { length: Math.min(5, totalTransactionPages) },
                        (_, i) => {
                          let pageNum;
                          if (totalTransactionPages <= 5) {
                            pageNum = i + 1;
                          } else if (transactionsCurrentPage <= 3) {
                            pageNum = i + 1;
                          } else if (
                            transactionsCurrentPage >=
                            totalTransactionPages - 2
                          ) {
                            pageNum = totalTransactionPages - 4 + i;
                          } else {
                            pageNum = transactionsCurrentPage - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              onClick={() =>
                                setTransactionsCurrentPage(pageNum)
                              }
                              className={`rounded-lg px-4 py-2 border transition-all font-semibold text-sm ${
                                transactionsCurrentPage === pageNum
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        },
                      )}
                    </div>
                    <button aria-label="Next"
                      onClick={() =>
                        setTransactionsCurrentPage((prev) =>
                          Math.min(totalTransactionPages, prev + 1),
                        )
                      }
                      disabled={
                        transactionsCurrentPage === totalTransactionPages
                      }
                      className="rounded-lg p-2 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
  );
}
