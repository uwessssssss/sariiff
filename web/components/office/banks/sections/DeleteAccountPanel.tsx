"use client";

import { AlertCircle, Loader2, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { type BankAccountsVM } from "../useBankAccounts";

export function DeleteAccountPanel({ vm }: { vm: BankAccountsVM }) {
  const { accountToDelete, getCurrencySymbol, handleDeleteAccount, isSubmitting, setAccountToDelete, setShowDeleteAccount, showDeleteAccount } = vm;
  return (
    <AnimatePresence>
      {showDeleteAccount && accountToDelete && (
        <div className="fixed inset-0 bg-black/60  flex items-center justify-center p-4 z-[60]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white shadow-2xl max-w-md w-full overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="relative  bg-red-600   px-6 py-4">
              <div className="relative flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-white/20 flex items-center justify-center border border-white/30 rounded-lg ">
                    <Trash2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white mb-0.5">
                      Delete Account
                    </h2>
                    <p className="text-white text-xs font-medium">
                      This action cannot be undone
                    </p>
                  </div>
                </div>
                <button aria-label="Close"
                  onClick={() => {
                    setShowDeleteAccount(false);
                    setAccountToDelete(null);
                  }}
                  className="rounded-lg p-1.5 bg-white/10 hover:bg-white/20 transition-all "
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
              </div>

              <h4 className="text-lg font-semibold text-slate-900 text-center mb-2">
                Are you sure you want to delete this bank account?
              </h4>
              <p className="text-sm text-slate-600 text-center mb-4">
                This will permanently remove the account and all associated
                data.
              </p>

              <div className="bg-red-50 border border-red-200 p-4 space-y-2 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-600 ">
                    Code:
                  </span>
                  <span className="text-xs font-mono font-semibold text-slate-900">
                    {accountToDelete.code}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-600 ">
                    Bank:
                  </span>
                  <span className="text-xs font-semibold text-slate-900">
                    {accountToDelete.bankName}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-600 ">
                    Account:
                  </span>
                  <span className="text-xs font-semibold text-slate-900">
                    {accountToDelete.accountName}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-red-300">
                  <span className="text-xs font-semibold text-slate-600 ">
                    Balance:
                  </span>
                  <span className="text-sm font-semibold text-red-700">
                    {getCurrencySymbol(accountToDelete.currency)}
                    {accountToDelete.balance.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4  bg-slate-50  border-t border-slate-200 flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteAccount(false);
                  setAccountToDelete(null);
                }}
                className="rounded-lg flex-1 px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 shadow-sm "
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isSubmitting}
                className="rounded-lg flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </span>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
