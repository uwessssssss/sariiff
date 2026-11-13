"use client";

import { Key, Lock, RefreshCw, Search, User } from "lucide-react";
import { type OfficeSettingsVM } from "../useOfficeSettings";
import { formatMoney } from "@/lib/api";

export function ClientPasswordManagementSection({ vm }: { vm: OfficeSettingsVM }) {
  const { filteredClients, getClientName, handleSetPassword, loading, searchTerm, setSearchTerm } = vm;
  return (
    <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-emerald-600 flex items-center justify-center">
          <Key className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Client Password Management
          </h3>
          <p className="text-sm text-slate-600">
            Set or reset passwords for client portal access
          </p>
        </div>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e: any) => setSearchTerm(e.target.value)}
            placeholder="Search clients by name, code, or phone..."
            className="w-full pl-10 pr-4 py-3 border border-emerald-200 focus:border-emerald-500 outline-none bg-white rounded-lg"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="text-center py-12 bg-white border border-emerald-200 rounded-lg">
          <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No clients found</p>
        </div>
      ) : (
        <div className="bg-white border border-emerald-200 overflow-hidden rounded-lg">
          <div className="overflow-x-auto max-w-full max-h-96">
            <table className="w-full">
              <thead className="bg-[#E9EEF6]">
                <tr className="border-emerald-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                    Balances
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono text-slate-600">
                        {client.code || "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">
                      {getClientName(client)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                      {client.whatsAppNumber || "-"}
                    </td>
                    {/* Every currency held (it showed KES and USD only: a Ugandan client's UGX was missing) */}
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-slate-800">
                      {(() => {
                        const held = [
                          { c: 0, v: client.balanceKES ?? 0 },
                          { c: 1, v: client.balanceUSD ?? 0 },
                          ...(((client as any).otherBalances || []) as any[]).map((b) => ({ c: b.currency, v: b.balance ?? 0 })),
                        ].filter((x) => x.v);
                        return held.length ? held.map((x) => formatMoney(x.v, x.c)).join(" · ") : "—";
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => handleSetPassword(client)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white text-sm font-semibold hover:shadow-md transition-all"
                      >
                        <Lock className="w-4 h-4" />
                        Set Password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
