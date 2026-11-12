"use client";

import { Banknote, Edit3, FileText, Plus, Trash2, Wallet } from "lucide-react";
import { StatementModal } from "../../StatementModal";
import { currencyCode } from "@/lib/api";
import { motion } from "framer-motion";
import { type CashAtHandVM } from "../useCashAtHand";

export function CashSection({ vm }: { vm: CashAtHandVM }) {
  const { allCurrenciesAdded, cashAccounts, getCurrencyName, getCurrencySymbol, missingCurrencies, openAddModal, openDeleteModal, openEditModal, setStatementCurrency, statementCurrency } = vm;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {statementCurrency !== null && (
            <StatementModal
              kind="cash"
              cashCurrency={statementCurrency}
              currency={statementCurrency}
              title={`Cash ${currencyCode(statementCurrency)}`}
              subtitle={`CASH-${currencyCode(statementCurrency)} · Physical cash in the office`}
              onClose={() => setStatementCurrency(null)}
            />
          )}
          {cashAccounts.map((account, index) => (
            <motion.div
              key={account.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`rounded-xl bg-white border   transition-all duration-300 ${
                account.currency === 0
                  ? "border-emerald-200 hover:border-emerald-400"
                  : "border-blue-200 hover:border-blue-400"
              }`}
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 flex items-center justify-center border rounded-lg ${
                        account.currency === 0
                          ? "bg-emerald-100 border-emerald-200"
                          : "bg-blue-100 border-blue-200"
                      }`}
                    >
                      <Banknote
                        className={`w-6 h-6 ${
                          account.currency === 0
                            ? "text-emerald-700"
                            : "text-blue-600"
                        }`}
                      />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        Cash {getCurrencyName(account.currency)}
                      </h3>
                      <p className="text-xs text-slate-500">
                        CASH-{getCurrencyName(account.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStatementCurrency(account.currency as number)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      title="Statement"
                    >
                      <FileText className="h-3.5 w-3.5" /> Statement
                    </button>
                    <button
                      onClick={() => openEditModal(account)}
                      className="rounded-lg p-2 bg-slate-100 hover:bg-slate-200 transition-colors"
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4 text-slate-600" />
                    </button>
                    <button
                      onClick={() => openDeleteModal(account)}
                      className="rounded-lg p-2 bg-red-50 hover:bg-red-100 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>

                {/* Balance */}
                <div
                  className={`p-4 mb-4 border-l-4 ${
                    account.currency === 0
                      ? "bg-emerald-50 border-emerald-500"
                      : "bg-blue-50 border-blue-500"
                  }`}
                >
                  <p className="text-xs text-slate-600 font-semibold mb-1">
                    Current Balance
                  </p>
                  <p
                    className={`text-2xl font-semibold tracking-tight ${
                      account.currency === 0
                        ? "text-emerald-600"
                        : "text-blue-600"
                    }`}
                  >
                    {getCurrencySymbol(account.currency)}{" "}
                    {account.balance.toLocaleString()}
                  </p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-3 border border-slate-200 rounded-lg">
                    <p className="text-xs text-slate-500 font-semibold">
                      Opening Balance
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      {getCurrencySymbol(account.currency)}{" "}
                      {account.openingBalance.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 border border-slate-200 rounded-lg">
                    <p className="text-xs text-slate-500 font-semibold">
                      Net Movement
                    </p>
                    <p
                      className={`text-sm font-semibold ${
                        account.netMovement >= 0
                          ? "text-emerald-700"
                          : "text-red-600"
                      }`}
                    >
                      {account.netMovement >= 0 ? "+" : ""}
                      {getCurrencySymbol(account.currency)}{" "}
                      {account.netMovement.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-emerald-50 p-3 border border-emerald-200 rounded-lg">
                    <p className="text-xs text-emerald-700 font-semibold">
                      Total Debit (In)
                    </p>
                    <p className="text-sm font-semibold text-emerald-700">
                      +{getCurrencySymbol(account.currency)}{" "}
                      {account.totalDebit.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-red-50 p-3 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-700 font-semibold">
                      Total Credit (Out)
                    </p>
                    <p className="text-sm font-semibold text-red-700">
                      -{getCurrencySymbol(account.currency)}{" "}
                      {account.totalCredit.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Created: {new Date(account.createdAt).toLocaleDateString()}
                  </span>
                  <span
                    className={`px-2 py-1 font-semibold ${
                      account.currency === 0
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {getCurrencyName(account.currency)}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}

          {/* Empty State - Show when no accounts exist */}
          {cashAccounts.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl col-span-full bg-white border border-dashed border-slate-300 p-12 text-center"
            >
              <Wallet className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-700 mb-2">
                No Cash Accounts
              </h3>
              <p className="text-slate-500 mb-6">
                Create your first cash account to start tracking physical cash.
              </p>
              <button
                onClick={openAddModal}
                className="rounded-lg inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all"
              >
                <Plus className="w-5 h-5" />
                Add Cash Account
              </button>
            </motion.div>
          )}

          {/* Prompt to add missing currency */}
          {cashAccounts.length > 0 && !allCurrenciesAdded && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className=" bg-slate-50 border border-dashed border-slate-300 p-8 flex flex-col items-center justify-center rounded-xl"
            >
              <div className="w-16 h-16 bg-slate-200 flex items-center justify-center mb-4">
                <Plus className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 mb-2">
                Add another currency
              </h3>
              <p className="text-sm text-slate-500 mb-4 text-center">
                Not yet added: {missingCurrencies.map((c) => c.code).join(", ")}
              </p>
              <button
                onClick={openAddModal}
                className="rounded-lg inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add account
              </button>
            </motion.div>
          )}
        </div>
  );
}
