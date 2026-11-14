"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownCircle, ArrowUpCircle, X } from "lucide-react";
import { getAccountTypeLabel } from "@/lib/api";
import { relatedIn } from "../helpers";
import { type CashAtHandVM } from "../useCashAtHand";

export function TransactionDetailsSection({ vm }: { vm: CashAtHandVM }) {
  const { getCurrencyName, getCurrencySymbol, selectedTransaction, setSelectedTransaction } = vm;
  return (
    <AnimatePresence>
        {selectedTransaction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-2 sm:p-4"
            onClick={() => setSelectedTransaction(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Card Header */}
              <div
                className={`p-3 sm:p-4 text-white flex-shrink-0 ${
                  selectedTransaction.thisAccountAction === "Debit"
                    ? " bg-[#0F172A] "
                    : " bg-[#0F172A] "
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20  flex items-center justify-center rounded-lg">
                      {selectedTransaction.thisAccountAction === "Debit" ? (
                        <ArrowDownCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <ArrowUpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-semibold">
                        Transaction Details
                      </h3>
                      <p className="text-xs sm:text-xs opacity-80">
                        {selectedTransaction.reference ||
                          selectedTransaction.code}
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setSelectedTransaction(null)}
                    className="p-1.5 hover:bg-white/20 transition-colors rounded-lg"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              </div>

              {/* Card Body - Scrollable */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
                {/* Transaction Amount */}
                <div
                  className={`p-3 border-l-4 rounded-r-lg ${
                    selectedTransaction.thisAccountAction === "Debit"
                      ? "bg-emerald-50 border-emerald-500"
                      : "bg-red-50 border-red-500"
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-600 ">
                    Amount
                  </p>
                  <p
                    className={`text-xl sm:text-2xl font-semibold ${
                      selectedTransaction.thisAccountAction === "Debit"
                        ? "text-emerald-700"
                        : "text-red-700"
                    }`}
                  >
                    {selectedTransaction.thisAccountAction === "Debit"
                      ? "+"
                      : "-"}
                    {getCurrencySymbol(selectedTransaction.currency)}{" "}
                    {selectedTransaction.amount.toLocaleString()}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs sm:text-xs text-slate-600">
                    <span>
                      Before: {getCurrencySymbol(selectedTransaction.currency)}{" "}
                      {selectedTransaction.balanceBefore.toLocaleString()}
                    </span>
                    <span>→</span>
                    <span className="font-semibold">
                      After: {getCurrencySymbol(selectedTransaction.currency)}{" "}
                      {selectedTransaction.balanceAfter.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Debit/Credit */}
                <div className="grid grid-cols-2 gap-2">
                  <div
                    className={`p-2 sm:p-3 border rounded-lg ${
                      selectedTransaction.debit !== null
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <p className="text-xs sm:text-xs font-semibold text-slate-500 ">
                      Debit (In)
                    </p>
                    <p
                      className={`text-sm sm:text-base font-semibold ${
                        selectedTransaction.debit !== null
                          ? "text-emerald-700"
                          : "text-slate-500"
                      }`}
                    >
                      {selectedTransaction.debit !== null
                        ? `+${getCurrencySymbol(
                            selectedTransaction.currency,
                          )} ${selectedTransaction.debit.toLocaleString()}`
                        : "-"}
                    </p>
                  </div>
                  <div
                    className={`p-2 sm:p-3 border rounded-lg ${
                      selectedTransaction.credit !== null
                        ? "bg-red-50 border-red-200"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <p className="text-xs sm:text-xs font-semibold text-slate-600 ">
                      Credit (Out)
                    </p>
                    <p
                      className={`text-sm sm:text-base font-semibold ${
                        selectedTransaction.credit !== null
                          ? "text-red-700"
                          : "text-slate-600"
                      }`}
                    >
                      {selectedTransaction.credit !== null
                        ? `-${getCurrencySymbol(
                            selectedTransaction.currency,
                          )} ${selectedTransaction.credit.toLocaleString()}`
                        : "-"}
                    </p>
                  </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 p-2 border border-slate-200 rounded-lg">
                    <p className="text-xs sm:text-xs font-semibold text-slate-500 ">
                      Code
                    </p>
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 font-mono truncate">
                      {selectedTransaction.code}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-2 border border-slate-200 rounded-lg">
                    <p className="text-xs sm:text-xs font-semibold text-slate-500 ">
                      Date
                    </p>
                    <p className="text-xs sm:text-sm font-semibold text-slate-900">
                      {new Date(selectedTransaction.date).toLocaleDateString()}
                    </p>
                  </div>
                  <div
                    className={`p-2 border rounded-lg ${
                      selectedTransaction.thisAccountAction === "Debit"
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-red-50 border-red-200"
                    }`}
                  >
                    <p className="text-xs sm:text-xs font-semibold text-slate-600 ">
                      Action
                    </p>
                    <p
                      className={`text-xs sm:text-sm font-semibold ${
                        selectedTransaction.thisAccountAction === "Debit"
                          ? "text-emerald-700"
                          : "text-red-700"
                      }`}
                    >
                      {selectedTransaction.thisAccountAction}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-2 border border-slate-200 rounded-lg">
                    <p className="text-xs sm:text-xs font-semibold text-slate-500 ">
                      Currency
                    </p>
                    <p className="text-xs sm:text-sm font-semibold text-slate-900">
                      {getCurrencyName(selectedTransaction.currency)}
                    </p>
                  </div>
                </div>

                {/* Description */}
                <div className="bg-blue-50 p-2 sm:p-3 border border-blue-200 rounded-lg">
                  <p className="text-xs sm:text-xs font-semibold text-blue-700 ">
                    Description
                  </p>
                  <p className="text-xs sm:text-sm font-semibold text-slate-900">
                    {selectedTransaction.description}
                  </p>
                </div>

                {/* Notes */}
                {selectedTransaction.notes && (
                  <div className="bg-amber-50 p-2 sm:p-3 border border-amber-200 rounded-lg">
                    <p className="text-xs sm:text-xs font-semibold text-amber-700 ">
                      Notes
                    </p>
                    <p className="text-xs sm:text-sm text-slate-900">
                      {selectedTransaction.notes}
                    </p>
                  </div>
                )}

                {/* Related Account */}
                {selectedTransaction.relatedAccount && (
                  <div className="bg-blue-50 border border-blue-200 p-2 sm:p-3 rounded-lg">
                    <p className="text-xs sm:text-xs font-semibold text-blue-700 mb-2">
                      Related Account
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-xs sm:text-xs">
                      <div className="bg-white p-1.5 sm:p-2 border border-blue-100 rounded">
                        <p className="text-slate-500">Type</p>
                        <p className="font-semibold text-slate-900 truncate">
                          {getAccountTypeLabel(
                            selectedTransaction.relatedAccount
                              .accountType as import("@/lib/api").AccountType,
                          )}
                        </p>
                      </div>
                      <div className="bg-white p-1.5 sm:p-2 border border-blue-100 rounded">
                        <p className="text-slate-500">Name</p>
                        <p className="font-semibold text-slate-900 truncate">
                          {selectedTransaction.relatedAccount.accountName}
                        </p>
                      </div>
                      <div
                        className={`p-1.5 sm:p-2 border rounded ${
                          relatedIn(selectedTransaction.relatedAccount)
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-red-50 border-red-200"
                        }`}
                      >
                        <p className="text-slate-600">Action</p>
                        <p
                          className={`font-semibold ${
                            relatedIn(selectedTransaction.relatedAccount)
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}
                        >
                          {selectedTransaction.relatedAccount.action}
                        </p>
                      </div>
                      <div className="bg-white p-1.5 sm:p-2 border border-blue-100 rounded">
                        <p className="text-slate-500">Amount</p>
                        <p className="font-semibold text-slate-900">
                          {getCurrencySymbol(
                            selectedTransaction.relatedAccount.currency,
                          )}{" "}
                          {selectedTransaction.relatedAccount.amount.toLocaleString()}
                        </p>
                      </div>
                      {selectedTransaction.relatedAccount.clientCode && (
                        <div className="bg-white p-1.5 sm:p-2 border border-blue-100 rounded col-span-2">
                          <p className="text-slate-500">Client</p>
                          <p className="font-semibold text-slate-900 font-mono">
                            {selectedTransaction.relatedAccount.clientCode}{" "}
                            {selectedTransaction.relatedAccount.clientPhone &&
                              `• ${selectedTransaction.relatedAccount.clientPhone}`}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="border-t border-slate-200 bg-slate-50 p-3 flex-shrink-0">
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="rounded-lg w-full px-6 py-2 bg-slate-700 text-white hover:bg-slate-800 transition-all font-semibold text-sm "
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
  );
}
