"use client";

import { AlertTriangle, Banknote, Loader2, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { type CashAtHandVM } from "../useCashAtHand";

export function DeleteCashAccountSection({ vm }: { vm: CashAtHandVM }) {
  const { closeModal, getCurrencyName, getCurrencySymbol, handleDeleteAccount, isSubmitting, modalType, selectedAccount } = vm;
  return (
    <AnimatePresence>
        {modalType === "delete" && selectedAccount && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white w-full max-w-md shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className=" bg-red-600  p-4 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20  flex items-center justify-center">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Delete Cash Account</h3>
                      <p className="text-xs">
                        This action cannot be undone
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={closeModal}
                    className="rounded-lg p-2 hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                {/* Account Info */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className={`w-10 h-10 flex items-center justify-center ${
                        selectedAccount.currency === 0
                          ? "bg-emerald-100"
                          : "bg-blue-100"
                      }`}
                    >
                      <Banknote
                        className={`w-5 h-5 ${
                          selectedAccount.currency === 0
                            ? "text-emerald-700"
                            : "text-blue-600"
                        }`}
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">
                        Cash {getCurrencyName(selectedAccount.currency)}
                      </p>
                      <p className="text-xs text-slate-500">
                        CASH-{getCurrencyName(selectedAccount.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Current Balance</p>
                      <p className="font-semibold text-slate-900">
                        {getCurrencySymbol(selectedAccount.currency)}{" "}
                        {selectedAccount.balance.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Opening Balance</p>
                      <p className="font-semibold text-slate-900">
                        {getCurrencySymbol(selectedAccount.currency)}{" "}
                        {selectedAccount.openingBalance.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Warning */}
                <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-red-800">
                      <p className="font-semibold mb-1">Warning</p>
                      <p className="text-xs">
                        You can only delete a cash account if it has no
                        transactions. All existing transactions must be deleted
                        or reversed first.
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-slate-600 text-center">
                  Are you sure you want to delete this cash account?
                </p>
              </div>

              {/* Footer */}
              <div className="border-t border-slate-200 bg-slate-50 p-4 flex gap-3">
                <button
                  onClick={closeModal}
                  className="rounded-lg flex-1 px-4 py-3 border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isSubmitting}
                  className="rounded-lg flex-1 px-4 py-3 bg-red-600 text-white font-semibold hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete Account
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
  );
}
