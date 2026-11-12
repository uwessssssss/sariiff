"use client";

import { ArrowDownRight, ArrowUpRight, CheckCircle, Users } from "lucide-react";
import { CURRENCY_CODES, money } from "../helpers";
import { type ReportsVM } from "../useReports";

export function ClientsView({ vm }: { vm: ReportsVM }) {
  const { clientBalances, clientCurrencies, loading, reportType } = vm;
  if (loading) return null;
  return (
    <>
{reportType === "clients" && (
              <div className="overflow-x-auto max-w-full">
                <table className="w-full">
                  <thead className="bg-[#E9EEF6]">
                    <tr className="">
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Code
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Client Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Contact
                      </th>
                      {clientCurrencies.map((c) => (
                        <th key={c} className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                          Balance {CURRENCY_CODES[c]}
                        </th>
                      ))}
                      <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {clientBalances.length === 0 ? (
                      <tr>
                        <td colSpan={4 + clientCurrencies.length} className="px-6 py-12 text-center">
                          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <p className="text-slate-600 font-medium">
                            No clients found
                          </p>
                          <p className="text-slate-500 text-sm mt-1">
                            Client data will appear here once loaded
                          </p>
                        </td>
                      </tr>
                    ) : (
                      clientBalances.map((client) => (
                        <tr
                          key={client.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-mono font-semibold text-blue-600 bg-[#E9EEF6] px-2 py-1">
                              {client.code ||
                                client.id.slice(0, 8).toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">
                            {client.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                            {client.whatsAppNumber || "-"}
                          </td>
                          {clientCurrencies.map((c) => {
                            const v = client.balances[c] || 0;
                            return (
                              <td
                                key={c}
                                className={`px-6 py-4 whitespace-nowrap text-right text-sm font-semibold tabular-nums ${
                                  v > 0 ? "text-emerald-700" : v < 0 ? "text-red-600" : "text-slate-500"
                                }`}
                              >
                                {v > 0 ? "+" : ""}
                                {money(v, c)}
                              </td>
                            );
                          })}
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold uppercase ${
                                // colour follows the balance like everywhere else: holding the
                                // client's money (positive) green, client in debt (negative) red
                                client.balanceType === "Owes Us"
                                  ? "bg-red-100 text-red-700 border border-red-200 rounded-lg"
                                  : client.balanceType === "We Owe"
                                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg"
                                    : "bg-slate-100 text-slate-600 border border-slate-200 rounded-lg"
                              }`}
                            >
                              {client.balanceType === "Owes Us" ? (
                                <ArrowUpRight className="w-3 h-3" />
                              ) : client.balanceType === "We Owe" ? (
                                <ArrowDownRight className="w-3 h-3" />
                              ) : (
                                <CheckCircle className="w-3 h-3" />
                              )}
                              {client.balanceType}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {clientBalances.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-4 font-semibold text-slate-900 text-right"
                        >
                          TOTALS:
                        </td>
                        {clientCurrencies.map((c) => {
                          const total = clientBalances.reduce((sum, cl) => sum + (cl.balances[c] || 0), 0);
                          return (
                            <td key={c} className="px-6 py-4 text-right">
                              <span className={`font-semibold tabular-nums ${total >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                                {money(total, c)}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm font-medium text-slate-600">
                            {clientBalances.length} clients
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
    </>
  );
}
