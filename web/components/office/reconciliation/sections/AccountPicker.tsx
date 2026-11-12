"use client";

import { Building2, CheckCircle2, ChevronDown } from "lucide-react";
import { formatCurrency, getAccountTypeIcon, getCurrencySymbol } from "../helpers";
import { getAccountTypeLabel } from "@/lib/api";
import { motion } from "framer-motion";
import { type ReconciliationVM } from "../useReconciliation";

export function AccountPicker({ vm }: { vm: ReconciliationVM }) {
  const { filteredAccounts, handleAccountSelect, selectedAccount, selectedAccountId, selectedAccountType } = vm;
  return (
    <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white border border-slate-200 shadow-sm p-4 lg:p-6 rounded-xl"
        >
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Select {getAccountTypeLabel(selectedAccountType)} Account
              </label>
              <div className="relative">
                <select
                  value={selectedAccountId}
                  onChange={(e: any) => handleAccountSelect(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 focus:border-blue-500 focus:outline-none text-lg font-semibold appearance-none bg-white cursor-pointer transition-all hover:border-slate-400 rounded-lg"
                >
                  <option value="">-- Choose an account to reconcile --</option>
                  {filteredAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({getCurrencySymbol(account.currency)}
                      {account.balance.toLocaleString()})
                      {account.pendingCount > 0
                        ? ` • ${account.pendingCount} pending`
                        : " • ✓ All matched"}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 pointer-events-none" />
              </div>
            </div>

            {selectedAccount && (
              <div className="flex gap-3">
                <div className="bg-blue-50 border border-blue-200 px-4 py-3 text-center min-w-[120px] rounded-lg">
                  <p className="text-xs font-semibold text-blue-600 uppercase">
                    Balance
                  </p>
                  <p className="text-lg font-semibold text-blue-700">
                    {formatCurrency(
                      selectedAccount.balance,
                      selectedAccount.currency,
                    )}
                  </p>
                </div>
                <div
                  className={`px-4 py-3 text-center min-w-[100px] border rounded-lg ${
                    selectedAccount.pendingCount === 0
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-amber-50 border-amber-200"
                  }`}
                >
                  <p
                    className={`text-xs font-semibold uppercase ${
                      selectedAccount.pendingCount === 0
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }`}
                  >
                    Status
                  </p>
                  <p
                    className={`text-lg font-semibold ${
                      selectedAccount.pendingCount === 0
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }`}
                  >
                    {selectedAccount.pendingCount === 0
                      ? "✓ Done"
                      : `${selectedAccount.pendingCount} Pending`}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Account Cards Preview */}
          {filteredAccounts.length > 0 && !selectedAccountId && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredAccounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => handleAccountSelect(account.id)}
                  className={`p-4 border text-left transition-all hover:shadow-md rounded-xl ${
                    account.pendingCount === 0
                      ? "bg-emerald-50 border-emerald-200 hover:border-emerald-400"
                      : "bg-white border-slate-200 hover:border-blue-400"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getAccountTypeIcon(account.accountType)}
                      <span className="font-semibold text-slate-900 truncate">
                        {account.name}
                      </span>
                    </div>
                    {account.pendingCount === 0 && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    )}
                  </div>
                  <p className="text-xl font-semibold text-slate-800">
                    {formatCurrency(account.balance, account.currency)}
                  </p>
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span className="text-slate-500">
                      {account.matchedCount} matched
                    </span>
                    {account.pendingCount > 0 ? (
                      <span className="text-amber-700 font-semibold">
                        {account.pendingCount} pending
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-semibold">
                        ✓ Complete
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {filteredAccounts.length === 0 && (
            <div className="mt-4 text-center py-8 text-slate-500">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">
                No {getAccountTypeLabel(selectedAccountType).toLowerCase()}{" "}
                accounts found
              </p>
            </div>
          )}
        </motion.div>
  );
}
