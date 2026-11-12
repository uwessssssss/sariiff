"use client";

import { AlertTriangle, CheckCircle, Edit3, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { type CashAtHandVM } from "../useCashAtHand";

export function EditCashAccountSection({ vm }: { vm: CashAtHandVM }) {
  const { closeModal, formData, getCurrencyName, getCurrencySymbol, handleUpdateAccount, isSubmitting, modalType, selectedAccount, setFormData } = vm;
  return (
    <AnimatePresence>
        {modalType === "edit" && selectedAccount && (
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
              <div
                className={`p-4 text-white ${
                  selectedAccount.currency === 0
                    ? " bg-emerald-700 "
                    : " bg-blue-600 "
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20  flex items-center justify-center">
                      <Edit3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Edit Cash Account</h3>
                      <p className="text-xs">
                        Cash {getCurrencyName(selectedAccount.currency)}
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
                {/* Current Balance Display */}
                <div
                  className={`p-4 border-l-4 ${
                    selectedAccount.currency === 0
                      ? "bg-emerald-50 border-emerald-500"
                      : "bg-blue-50 border-blue-500"
                  }`}
                >
                  <p className="text-xs text-slate-600 font-semibold">
                    Current Balance
                  </p>
                  <p
                    className={`text-2xl font-semibold ${
                      selectedAccount.currency === 0
                        ? "text-emerald-600"
                        : "text-blue-600"
                    }`}
                  >
                    {getCurrencySymbol(selectedAccount.currency)}{" "}
                    {selectedAccount.balance.toLocaleString()}
                  </p>
                </div>

                {/* Opening Balance */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Opening Balance *
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">
                      {selectedAccount.currency === 0 ? "KES" : selectedAccount.currency === 2 ? "UGX" : selectedAccount.currency === 3 ? "EUR" : "$"}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.openingBalance}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          openingBalance: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="rounded-lg w-full pl-14 pr-4 py-3 border border-slate-200 focus:border-blue-500 focus:outline-none text-lg font-semibold"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Changing the opening balance will adjust the current balance
                    accordingly
                  </p>
                </div>

                {/* Balance Adjustment Preview */}
                {formData.openingBalance !== selectedAccount.openingBalance && (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                    <div className="flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-800">
                        <p className="font-semibold mb-1">
                          Balance Adjustment Preview
                        </p>
                        <div className="text-xs space-y-1">
                          <p>
                            Opening:{" "}
                            {getCurrencySymbol(selectedAccount.currency)}{" "}
                            {selectedAccount.openingBalance.toLocaleString()} →{" "}
                            {getCurrencySymbol(selectedAccount.currency)}{" "}
                            {formData.openingBalance.toLocaleString()}
                          </p>
                          <p className="font-semibold">
                            New Balance:{" "}
                            {getCurrencySymbol(selectedAccount.currency)}{" "}
                            {(
                              selectedAccount.balance +
                              (formData.openingBalance -
                                selectedAccount.openingBalance)
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
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
                  onClick={handleUpdateAccount}
                  disabled={isSubmitting}
                  className="rounded-lg flex-1 px-4 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Save Changes
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
