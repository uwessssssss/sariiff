"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, Loader2, Plus, X } from "lucide-react";
import { Currency } from "@/lib/api";
import { type CashAtHandVM } from "../useCashAtHand";

export function AddCashAccountSection({ vm }: { vm: CashAtHandVM }) {
  const { CASH_CURRENCIES, closeModal, existingCurrencies, formData, handleCreateAccount, isSubmitting, modalType, setFormData } = vm;
  return (
    <AnimatePresence>
        {modalType === "add" && (
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
              <div className=" bg-[#0F172A]  p-4 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20  flex items-center justify-center">
                      <Plus className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Add Cash Account</h3>
                      <p className="text-xs opacity-80">
                        Create a new cash drawer
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
                {/* Currency Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Currency *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {CASH_CURRENCIES.map((c) => {
                      const exists = existingCurrencies.has(c.value);
                      const selected = formData.currency === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              currency: c.value as import("@/lib/api").Currency,
                            })
                          }
                          disabled={exists}
                          className={`rounded-lg border p-3 text-left transition-colors ${
                            selected ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                          } ${exists ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <p className={`text-sm font-semibold ${selected ? "text-blue-700" : "text-slate-800"}`}>{c.code}</p>
                          <p className="text-xs text-slate-600">{exists ? "Already added" : c.name}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Opening Balance */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Opening Balance *
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">
                      {formData.currency === 0 ? "KES" : formData.currency === 2 ? "UGX" : formData.currency === 3 ? "EUR" : "$"}
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
                    Enter the starting cash amount in the drawer
                  </p>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                  <div className="flex gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-semibold mb-1">What happens next?</p>
                      <p className="text-xs">
                        The cash account will be created with the opening
                        balance you specify. All transactions will be tracked
                        from this starting point.
                      </p>
                    </div>
                  </div>
                </div>
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
                  onClick={handleCreateAccount}
                  disabled={
                    isSubmitting ||
                    existingCurrencies.has(formData.currency as number)
                  }
                  className="rounded-lg flex-1 px-4 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create Account
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
