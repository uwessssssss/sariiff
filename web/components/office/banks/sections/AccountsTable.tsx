"use client";

import { Building2, Edit3, FileText, Hash, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { type BankAccountsVM } from "../useBankAccounts";

export function AccountsTable({ vm }: { vm: BankAccountsVM }) {
  const { accountsCurrentPage, currentAccounts, filteredAccounts, getCurrencyName, getCurrencySymbol, handleEditAccount, indexOfFirstAccount, indexOfLastAccount, setAccountToDelete, setAccountsCurrentPage, setSelectedAccount, setShowDeleteAccount, totalAccountPages } = vm;
  return (
    <div className="bg-white rounded-2xl border border-slate-200  overflow-hidden">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full">
            <thead className="bg-[#E9EEF6]">
              <tr>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Account Code
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Bank Details
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Currency
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Balance
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Net Movement
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Status
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {currentAccounts.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No bank accounts found. Add your first bank account to get
                    started.
                  </td>
                </tr>
              ) : (
                currentAccounts.map((account, index) => (
                  <motion.tr
                    key={account.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="hover:bg-blue-50/50 transition-all duration-200 cursor-pointer group"
                  >
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-blue-600 group-hover:text-blue-700">
                        {account.code}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <div className="font-semibold text-slate-900 text-sm whitespace-nowrap">
                          {account.bankName}
                        </div>
                        <div className="flex flex-col gap-0.5 mt-1">
                          <span className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Building2 className="w-3 h-3" />
                            {account.accountName}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                            <Hash className="w-3 h-3" />
                            {account.accountNumber}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          account.currency === 0
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {getCurrencyName(account.currency)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`text-sm font-semibold ${
                          account.balance >= 0
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {getCurrencySymbol(account.currency)}
                        {account.balance.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`text-sm font-semibold ${
                          account.netMovement >= 0
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {account.netMovement >= 0 ? "+" : ""}
                        {getCurrencySymbol(account.currency)}
                        {account.netMovement.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          account.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {account.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedAccount(account)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-all text-xs font-medium rounded-lg"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Statement
                        </button>
                        <button
                          onClick={() => handleEditAccount(account)}
                          className="flex items-center gap-1.5 px-3 py-2 transition-all text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button aria-label="Delete"
                          onClick={() => {
                            setAccountToDelete(account);
                            setShowDeleteAccount(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 transition-all text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-red-50 text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalAccountPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <p className="text-sm text-slate-600">
              Showing {indexOfFirstAccount + 1} to{" "}
              {Math.min(indexOfLastAccount, filteredAccounts.length)} of{" "}
              {filteredAccounts.length} accounts
            </p>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setAccountsCurrentPage((prev) => Math.max(prev - 1, 1))
                }
                disabled={accountsCurrentPage === 1}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Previous
              </button>
              <button
                onClick={() =>
                  setAccountsCurrentPage((prev) =>
                    Math.min(prev + 1, totalAccountPages),
                  )
                }
                disabled={accountsCurrentPage === totalAccountPages}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
  );
}
