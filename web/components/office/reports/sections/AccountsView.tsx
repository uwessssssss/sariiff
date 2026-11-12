"use client";

import { Building2, Smartphone, Wallet } from "lucide-react";
import { TotalsByCurrency, money, totalsLine } from "../helpers";
import { currencyCode, formatMoney } from "@/lib/api";
import { type ReportsVM } from "../useReports";

export function AccountsView({ vm }: { vm: ReportsVM }) {
  const { accountSummary, base, baseCode, loading, reportType } = vm;
  if (loading) return null;
  return (
    <>
      {reportType === "accounts" && accountSummary && (
        <div className="p-6 space-y-6">
          {/* Cash Accounts */}
          <div>
            <h4 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600" />
              Cash Accounts
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accountSummary.cashAccounts.map((account: any) => (
                <div
                  key={account.id}
                  className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-700">
                      {account.currency === 0 ? "KES" : account.currency === 2 ? "UGX" : account.currency === 3 ? "EUR" : "USD"} Account
                    </span>
                    <span className="text-lg font-semibold text-emerald-700">
                      {money(account.balance, account.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 p-3 bg-emerald-100 border border-emerald-300 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-900">
                  Total Cash
                </span>
                <div className="text-right">
                  <TotalsByCurrency totals={accountSummary.cashByCurrency} />
                </div>
              </div>
            </div>
          </div>

          {/* Bank Accounts */}
          <div>
            <h4 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              Bank Accounts
            </h4>
            <div className="overflow-x-auto max-w-full">
              <table className="w-full border border-slate-200 rounded-lg">
                <thead className="bg-[#E9EEF6]">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Bank
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Account
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Currency
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accountSummary.bankAccounts.map((account: any) => (
                    <tr key={account.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                        {account.bankName}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {account.accountNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {account.currency === 0 ? "KES" : account.currency === 2 ? "UGX" : account.currency === 3 ? "EUR" : "USD"}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-right text-blue-700">
                        {currencyCode(account.currency)}{" "}
                        {account.balance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-3 font-semibold text-slate-900"
                    >
                      Total Bank
                    </td>
                    <td className="px-4 py-3 text-right">
                      <TotalsByCurrency totals={accountSummary.bankByCurrency} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* M-Pesa Agents */}
          <div>
            <h4 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-blue-600" />
              Mobile money agents
            </h4>
            <div className="overflow-x-auto max-w-full">
              <table className="w-full border border-slate-200 rounded-lg">
                <thead className="bg-[#E9EEF6]">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Agent Name
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Phone
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Balance ({baseCode})
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accountSummary.mpesaAgents.map((agent: any) => (
                    <tr key={agent.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                        {agent.agentName}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {agent.phoneNumber}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-right text-[#0F172A]">
                        {formatMoney(agent.balance || 0, agent.currency ?? base)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#E9EEF6] border-t-2 border-slate-200">
                  <tr>
                    <td
                      colSpan={2}
                      className="px-4 py-3 font-semibold text-slate-900"
                    >
                      Total mobile money
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[#0F172A]">
                      {totalsLine(accountSummary.mpesaByCurrency || { [base]: accountSummary.totalMpesa })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
