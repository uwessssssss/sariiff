"use client";

import { ArrowDown, ArrowUp, FileText } from "lucide-react";
import { CURRENCY_CODES } from "../helpers";
import { bureauFlow, flowLabel } from "@/lib/moneyflow";
import { type ReportsVM } from "../useReports";

export function DailyTransactions({ vm }: { vm: ReportsVM }) {
  const { dailyReport, dailyShown, loading, reportType, setDailyShown } = vm;
  if (loading) return null;
  return (
    <>
{reportType === "daily" && dailyReport && (
              <div className="overflow-x-auto max-w-full">
                <table className="w-full">
                  <thead className="bg-[#E9EEF6]">
                    <tr className="">
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Time
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
                    {dailyReport.transactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center">
                          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <p className="text-slate-600">
                            No transactions for this date
                          </p>
                        </td>
                      </tr>
                    ) : (
                      dailyReport.transactions.slice(0, dailyShown).map(
                        (txn: any, index: number) => {
                          const flow = bureauFlow(txn);

                          const isMoneyIn = flow.kind === "in";
                          return (
                            <tr
                              key={txn.id || index}
                              className="hover:bg-slate-50 transition-colors"
                            >
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                                {new Date(
                                  txn.transactionDate || txn.createdAt,
                                ).toLocaleTimeString("en-GB", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })}
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-900">
                                <div>{txn.description || txn.notes || ""}</div>
                                {(txn.reference || txn.code) && (
                                  <div className="text-xs text-blue-600 font-mono mt-0.5">
                                    {txn.reference || txn.code}
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
                                    isMoneyIn
                                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                      : flow.kind === "out"
                                        ? "bg-red-100 text-red-700 border-red-200"
                                        : "bg-slate-100 text-slate-600 border-slate-200"
                                  }`}
                                >
                                  {isMoneyIn ? (
                                    <ArrowDown className="w-3 h-3" />
                                  ) : flow.kind === "out" ? (
                                    <ArrowUp className="w-3 h-3" />
                                  ) : null}
                                  {flowLabel[flow.kind]}
                                </span>
                              </td>
                              <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-semibold tabular-nums ${
                                isMoneyIn ? "text-emerald-700" : flow.kind === "out" ? "text-red-700" : "text-slate-700"
                              }`}>
                                {isMoneyIn ? "+" : flow.kind === "out" ? "−" : ""}
                                {flow.amount.toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-semibold">
                                {CURRENCY_CODES[flow.currency] || "KES"}
                              </td>
                            </tr>
                          );
                        },
                      )
                    )}
                  </tbody>
                </table>
                {dailyReport.transactions.length > dailyShown && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-3">
                    <p className="text-sm text-slate-600">
                      Showing {dailyShown.toLocaleString()} of {dailyReport.transactions.length.toLocaleString()} transactions. Exports include all of them.
                    </p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setDailyShown((n) => n + 100)} className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Show 100 more
                      </button>
                      <button type="button" onClick={() => setDailyShown(dailyReport.transactions.length)} className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Show all
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
    </>
  );
}
