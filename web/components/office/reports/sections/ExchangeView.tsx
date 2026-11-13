"use client";

import { ArrowLeftRight, Loader2, Scale, TrendingUp, Wallet } from "lucide-react";
import { CURRENCY_CODES, money } from "../helpers";
import { ExchangeDirection } from "@/lib/api";
import { type ReportsVM } from "../useReports";

export function ExchangeView({ vm }: { vm: ReportsVM }) {
  const { baseCode, exchangeSummary, loading, reportType } = vm;
  if (loading) return null;
  return (
    <>
{reportType === "exchange" && (
              <div className="p-6 space-y-6">
                {!exchangeSummary ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
                    <p className="text-slate-600">Loading exchange data...</p>
                  </div>
                ) : (
                  <>
                    {/* Exchange Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Current Rates Card */}
                      <div className="relative overflow-hidden bg-emerald-700 p-5 text-white">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-3">
                            <Scale className="w-5 h-5 text-emerald-100" />
                            <span className="text-sm font-medium text-emerald-100">
                              Current Rates ({baseCode} per USD)
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-emerald-100 text-sm">
                                Buy:
                              </span>
                              <span className="text-xl font-semibold">
                                {exchangeSummary.currentBuyRate.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-emerald-100 text-sm">
                                Sell:
                              </span>
                              <span className="text-xl font-semibold">
                                {exchangeSummary.currentSellRate.toFixed(2)}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t border-white/20">
                            <span className="text-xs text-emerald-100">
                              Spread:{" "}
                              {(
                                exchangeSummary.currentSellRate -
                                exchangeSummary.currentBuyRate
                              ).toFixed(2)}{" "}
                              {baseCode}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Float Balances Card */}
                      <div className="relative overflow-hidden bg-blue-600 p-5 text-white">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-3">
                            <Wallet className="w-5 h-5 text-blue-200" />
                            <span className="text-sm font-medium text-blue-50">
                              Float Balance
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-blue-50 text-sm">
                                {baseCode}:
                              </span>
                              <span className="text-xl font-semibold">
                                {exchangeSummary.floatKES.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-blue-50 text-sm">
                                USD:
                              </span>
                              <span className="text-xl font-semibold">
                                ${exchangeSummary.floatUSD.toLocaleString()}
                              </span>
                            </div>
                            {exchangeSummary.floatOther.map((f) => (
                              <div key={f.currency} className="flex justify-between items-center">
                                <span className="text-blue-50 text-sm">{CURRENCY_CODES[f.currency]}:</span>
                                <span className="text-xl font-semibold">{f.balance.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Total Volume Card */}
                      <div className="relative overflow-hidden bg-blue-600 p-5 text-white">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-3">
                            <ArrowLeftRight className="w-5 h-5 text-blue-200" />
                            <span className="text-sm font-medium text-blue-50">
                              Volume
                            </span>
                          </div>
                          <div className="space-y-2">
                            {Object.entries(exchangeSummary.volumeByCurrency).length === 0 && (
                              <span className="text-blue-50 text-sm">No exchanges</span>
                            )}
                            {Object.entries(exchangeSummary.volumeByCurrency)
                              .sort(([a], [b]) => Number(a) - Number(b))
                              .map(([c, v]) => (
                                <div key={c} className="space-y-1">
                                  <div className="flex justify-between items-center">
                                    <span className="text-blue-50 text-sm">{CURRENCY_CODES[Number(c)]} sold to clients:</span>
                                    <span className="text-lg font-semibold">{money(v.bought, Number(c))}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-blue-50 text-sm">{CURRENCY_CODES[Number(c)]} bought from clients:</span>
                                    <span className="text-lg font-semibold">{money(v.sold, Number(c))}</span>
                                  </div>
                                </div>
                              ))}
                          </div>
                          <div className="mt-3 pt-3 border-t border-white/20">
                            <span className="text-xs text-blue-50">
                              {exchangeSummary.totalExchanges} transactions
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Profit Card */}
                      <div className="relative overflow-hidden bg-amber-700 p-5 text-white">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-3">
                            <TrendingUp className="w-5 h-5 text-amber-50" />
                            <span className="text-sm font-medium text-amber-100">
                              Profit
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-amber-100 text-sm">
                                {baseCode}:
                              </span>
                              <span className="text-xl font-semibold">
                                {baseCode} {exchangeSummary.kesProfit.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-amber-100 text-sm">
                                USD:
                              </span>
                              <span className="text-xl font-semibold">
                                ${exchangeSummary.usdProfit.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Exchange Transactions Table */}
                    <div className="bg-white border border-slate-200 overflow-hidden rounded-lg">
                      <div className="px-6 py-4 bg-emerald-50 border-b-2 border-slate-200">
                        <h4 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                          <ArrowLeftRight className="w-5 h-5 text-emerald-600" />
                          Recent Exchange Transactions
                        </h4>
                      </div>
                      <div className="overflow-x-auto max-w-full">
                        <table className="w-full">
                          <thead className="bg-[#E9EEF6]">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                                Date
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                                Code
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                                Client
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                                Direction
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                                Given
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                                Received
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                                Rate
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                                Profit
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {exchangeSummary.transactions.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={8}
                                  className="px-6 py-12 text-center"
                                >
                                  <ArrowLeftRight className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                  <p className="text-slate-600">
                                    No exchange transactions found
                                  </p>
                                </td>
                              </tr>
                            ) : (
                              exchangeSummary.transactions
                                .slice(0, 20)
                                .map((txn: any, index: number) => (
                                  <tr
                                    key={txn.id || index}
                                    className="hover:bg-slate-50 transition-colors"
                                  >
                                    <td className="px-4 py-3 text-sm text-slate-600">
                                      {new Date(
                                        txn.date || txn.createdAt,
                                      ).toLocaleDateString("en-KE", {
                                        month: "short",
                                        day: "numeric",
                                      })}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className="text-sm font-mono text-slate-700">
                                        {txn.code}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                                      {txn.clientName || "Walk-in"}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span
                                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold ${
                                          txn.direction ===
                                            ExchangeDirection.UsdToKes ||
                                          txn.direction === 0
                                            ? "bg-emerald-100 text-emerald-700"
                                            : "bg-blue-100 text-blue-700"
                                        }`}
                                      >
                                        {CURRENCY_CODES[txn.currencyGiven] ?? txn.currencyGiven} →{" "}
                                        {CURRENCY_CODES[txn.currencyReceived] ?? txn.currencyReceived}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right font-medium text-emerald-700">
                                      +{money(txn.amountGiven || 0, txn.currencyGiven)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right font-medium text-red-600">
                                      -{money(txn.amountReceived || 0, txn.currencyReceived)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right text-slate-700 font-medium">
                                      {(txn.exchangeRate || 0) < 1
                                        ? (txn.exchangeRate || 0).toFixed(4)
                                        : (txn.exchangeRate || 0).toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right font-semibold text-emerald-700">
                                      {/* a purchase books no profit (average cost): a dash, not "KES 0" */}
                                      {txn.profit ? `${txn.profit < 0 ? "−" : ""}${baseCode} ${Math.abs(txn.profit).toLocaleString()}` : "—"}
                                    </td>
                                  </tr>
                                ))
                            )}
                          </tbody>
                          {exchangeSummary.transactions.length > 0 && (
                            <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                              <tr>
                                <td
                                  colSpan={7}
                                  className="px-4 py-3 text-right font-semibold text-slate-900"
                                >
                                  Total Profit:
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-emerald-700 text-lg">
                                  {baseCode}{" "}
                                  {exchangeSummary.transactions
                                    .reduce(
                                      (sum: number, t: any) =>
                                        sum + (t.profit || 0),
                                      0,
                                    )
                                    .toLocaleString()}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
    </>
  );
}
