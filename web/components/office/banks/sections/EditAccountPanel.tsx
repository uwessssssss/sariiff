"use client";

import { Activity, Building2, CreditCard, Edit3, Hash, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { type BankAccountsVM } from "../useBankAccounts";

export function EditAccountPanel({ vm }: { vm: BankAccountsVM }) {
  const { baseCode, editFormData, getCurrencyName, getCurrencySymbol, handleUpdateAccount, isSubmitting, selectedAccount, setEditFormData, setSelectedAccount, setShowEditAccount, showEditAccount } = vm;
  return (
    <AnimatePresence>
      {showEditAccount && selectedAccount && (
        <div className="fixed inset-0 bg-black/60  flex items-center justify-center p-4 z-[60]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white shadow-2xl max-w-xl w-full max-h-[85vh] overflow-hidden flex flex-col"
          >
            {/* Premium Header with Gradient Background */}
            <div className="relative  bg-blue-600   px-6 py-4">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>

              <div className="relative flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-white/20  rounded-xl flex items-center justify-center border border-white/30 ">
                    <Edit3 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white mb-0.5">
                      Edit Bank Account
                    </h2>
                    <p className="text-blue-50 text-xs font-medium">
                      Update bank account information
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-800 border border-white/30 rounded-lg text-xs font-semibold text-white">
                        <Hash className="w-3 h-3" />
                        {selectedAccount.code}
                      </span>
                    </div>
                  </div>
                </div>
                <button aria-label="Close"
                  onClick={() => {
                    setShowEditAccount(false);
                    setSelectedAccount(null);
                  }}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all "
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Scrollable Form Content */}
            <form
              onSubmit={handleUpdateAccount}
              className="px-6 py-5 overflow-y-auto flex-1"
            >
              <div className="space-y-4">
                {/* Bank Name */}
                <div className="group">
                  <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-500" />
                    Bank Name
                    <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={editFormData.bankName}
                    onChange={(e: any) =>
                      setEditFormData({
                        ...editFormData,
                        bankName: e.target.value,
                      })
                    }
                    placeholder="Enter bank name"
                    className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    required
                  />
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
                    value={editFormData.accountName}
                    onChange={(e: any) =>
                      setEditFormData({
                        ...editFormData,
                        accountName: e.target.value,
                      })
                    }
                    placeholder={`e.g. Main account - ${baseCode}`}
                    className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
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
                    value={editFormData.branchCode}
                    onChange={(e: any) =>
                      setEditFormData({
                        ...editFormData,
                        branchCode: e.target.value,
                      })
                    }
                    placeholder="068"
                    className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                  />
                </div>

                {/* Account Status */}
                <div className="group">
                  <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-slate-500" />
                    Account Status
                  </label>
                  <select
                    value={editFormData.isActive ? "active" : "inactive"}
                    onChange={(e: any) =>
                      setEditFormData({
                        ...editFormData,
                        isActive: e.target.value === "active",
                      })
                    }
                    className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none cursor-pointer"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                {/* Read-only fields */}
                <div className="bg-slate-50 p-4 border border-slate-200 rounded-lg">
                  <p className="text-xs font-semibold text-slate-500 mb-3">
                    Read-only Information
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">Account Number</p>
                      <p className="font-semibold text-slate-900 font-mono">
                        {selectedAccount.accountNumber}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Currency</p>
                      <p className="font-semibold text-slate-900">
                        {getCurrencyName(selectedAccount.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Current Balance</p>
                      <p className="font-semibold text-slate-900">
                        {getCurrencySymbol(selectedAccount.currency)}
                        {selectedAccount.balance.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Opening Balance</p>
                      <p className="font-semibold text-slate-900">
                        {getCurrencySymbol(selectedAccount.currency)}
                        {selectedAccount.openingBalance.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fixed Footer with Action Buttons */}
              <div className="mt-6 pt-4 border-t border-slate-200 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditAccount(false);
                    setSelectedAccount(null);
                  }}
                  className="rounded-lg flex-1 px-6 py-3.5 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 shadow-sm "
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg flex-1 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    "Save Changes"
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
