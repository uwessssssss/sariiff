"use client";

import { ArrowDown, ArrowUp, FileText } from "lucide-react";
import { type FlowKind, flowLabel } from "@/lib/moneyflow";
import { computeCashflowByCurrency } from "../helpers";
import { formatMoney } from "@/lib/api";
import { type ReportsVM } from "../useReports";

export function TransactionsView({ vm }: { vm: ReportsVM }) {
  const { currentItems, filteredTransactions, loading, reportType } = vm;
  if (loading) return null;
  return (
    <>
{reportType === "transactions" && (
              <table className="w-full">
                <thead className="bg-[#E9EEF6]">
                  <tr className="">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Account
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Flow
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Currency
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {currentItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center">
                        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-600">No transactions found</p>
                      </td>
                    </tr>
                  ) : (
                    currentItems.map((txn) => (
                      <tr
                        key={txn.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-4 text-sm text-slate-900">
                          <div className="font-semibold">
                            {new Date(txn.date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {new Date(txn.date).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-900">
                          <div>{txn.description}</div>
                          {txn.reference && (
                            <div className="text-xs text-blue-600 font-mono mt-0.5">
                              {txn.reference}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700">
                          <div className="font-medium">
                            {txn.sourceAccountName || "—"}
                          </div>
                          {txn.destAccountName && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              → {txn.destAccountName}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold uppercase rounded-lg border ${
                              txn.type === "debit"
                                ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                : txn.type === "credit"
                                  ? "bg-red-100 text-red-700 border-red-200"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {txn.type === "debit" ? (
                              <ArrowDown className="w-3 h-3" />
                            ) : txn.type === "credit" ? (
                              <ArrowUp className="w-3 h-3" />
                            ) : null}
                            {flowLabel[(txn.flowKind as FlowKind) || (txn.type === "debit" ? "in" : "out")]}
                          </span>
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-semibold tabular-nums ${
                          txn.type === "debit" ? "text-emerald-700" : txn.type === "credit" ? "text-red-700" : "text-slate-700"
                        }`}>
                          {txn.type === "debit" ? "+" : txn.type === "credit" ? "−" : ""}
                          {txn.amount.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-semibold">
                          {txn.currency}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {currentItems.length > 0 && (
                  <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-4 text-right font-semibold text-slate-900"
                      >
                        TOTALS:
                      </td>
                      <td className="px-6 py-4 text-right">
                        {/* Per currency: KES and USD are never added together. */}
                        {computeCashflowByCurrency(filteredTransactions).map((b) => (
                          <div key={b.currency} className="text-sm font-semibold tabular-nums">
                            <span className="text-emerald-700">In {formatMoney(b.in, b.currency)}</span>
                            <span className="mx-1 text-slate-500">·</span>
                            <span className="text-red-600">Out {formatMoney(b.out, b.currency)}</span>
                          </div>
                        ))}
                      </td>
                      <td colSpan={1}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
    </>
  );
}
