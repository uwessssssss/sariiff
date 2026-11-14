"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Building2, CreditCard, DollarSign, Hash, Loader2, Plus, Wallet, X } from "lucide-react";
import { type BankAccountsVM } from "../useBankAccounts";

export function AddAccountPanel({ vm }: { vm: BankAccountsVM }) {
  const { baseCode, currencyOk, formData, handleCreateAccount, isSubmitting, resetFormData, setFormData, setShowAddAccount, showAddAccount } = vm;
  return (
    <AnimatePresence>
      {showAddAccount && (
        <div className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e: any) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 z-10  bg-blue-600   px-6 py-4 border-b-4 border-blue-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                    <Plus className="w-6 h-6" />
                    Add New Bank Account
                  </h3>
                  <p className="text-xs text-blue-50 mt-1">
                    Create a new bank account record
                  </p>
                </div>
                <button aria-label="Close"
                  onClick={() => {
                    setShowAddAccount(false);
                    resetFormData();
                  }}
                  className="rounded-lg p-2 hover:bg-white/20 transition-all"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateAccount} className="p-6">
              <div className="space-y-4">
                {/* Bank Details Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Bank Name */}
                  <div className="group">
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-500" />
                      Bank Name
                      <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.bankName}
                      onChange={(e: any) =>
                        setFormData({ ...formData, bankName: e.target.value })
                      }
                      placeholder="e.g., Equity Bank"
                      className="rounded-lg w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      required
                    />
                  </div>

                  {/* Account Number */}
                  <div className="group">
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <Hash className="w-4 h-4 text-slate-500" />
                      Account Number
                      <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.accountNumber}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          accountNumber: e.target.value,
                        })
                      }
                      placeholder="0123456789"
                      className="rounded-lg w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      required
                    />
                  </div>

                  {/* Branch Code */}
                  <div className="group">
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <Hash className="w-4 h-4 text-slate-500" />
                      Branch Code
                    </label>
                    <input
                      type="text"
                      value={formData.branchCode}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          branchCode: e.target.value,
                        })
                      }
                      placeholder="068"
                      className="rounded-lg w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    />
                  </div>

                  {/* Account Type/Currency */}
                  <div className="group">
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-slate-500" />
                      Currency
                      <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={formData.currency}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          currency: e.target.value as "KES" | "USD" | "UGX" | "EUR",
                        })
                      }
                      className="rounded-lg w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none cursor-pointer"
                    >
                      <option value="KES">KES - Kenya Shillings</option>
                      <option value="USD">USD - US Dollar</option>
                      {currencyOk("UGX") && <option value="UGX">UGX - Uganda Shillings</option>}
                      <option value="EUR">EUR - Euro</option>
                    </select>
                  </div>
                </div>

                {/* Account Name */}
                <div className="group">
                  <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-slate-500" />
                    Account Name
                    <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.accountName}
                    onChange={(e: any) =>
                      setFormData({
                        ...formData,
                        accountName: e.target.value,
                      })
                    }
                    placeholder={`e.g. Main account - ${baseCode}`}
                    className="rounded-lg w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    required
                  />
                </div>

                {/* Opening Balance Section */}
                <div className=" bg-blue-50 p-4 border border-blue-200 rounded-xl">
                  <p className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <Wallet className="w-4 h-4" />
                    Opening Balance
                  </p>

                  <div className="group">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Opening Balance ({formData.currency})
                    </label>
                    <input
                      type="number"
                      value={formData.openingBalance}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          openingBalance: parseFloat(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                      min="0"
                      step="0.01"
                      className="rounded-lg w-full px-4 py-3 border text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none bg-white border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    />
                  </div>

                  <div className="mt-3 p-3 bg-blue-100/50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-800 font-semibold">
                      💡 Opening balance represents the initial balance when
                      the account is created
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="mt-6 pt-4 border-t border-slate-200 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddAccount(false);
                    resetFormData();
                  }}
                  className="rounded-lg flex-1 px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 shadow-sm "
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Adding...
                    </span>
                  ) : (
                    "Add Bank Account"
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
