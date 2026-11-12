"use client";

import { AlertCircle, Clock, Hash, Loader2, Mail, Phone, Trash2, UserCheck, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ClientType, currencyCode, formatMoney } from "@/lib/api";
import { type ClientManagementVM } from "../useClientManagement";

export function DeleteConfirmPanel({ vm }: { vm: ClientManagementVM }) {
  const { handleDeleteClient, isSubmitting, selectedClient, setShowDeleteConfirm, showDeleteConfirm } = vm;
  return (
    <AnimatePresence>
        {showDeleteConfirm && selectedClient && (
          <div className="fixed inset-0 bg-black/70  flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="rounded-xl bg-white shadow-2xl max-w-md w-full overflow-hidden border border-red-200"
            >
              {/* Header */}
              <div className="relative  bg-red-600   px-6 py-5 overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 80%, white 1px, transparent 1px)`,
                      backgroundSize: "30px 30px",
                    }}
                  ></div>
                </div>
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl hidden"></div>
                <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/10 rounded-full blur-xl hidden"></div>

                <div className="relative z-10 flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <div className="w-14 h-14 bg-white/20 flex items-center justify-center border border-white/30 rounded-lg ">
                        <Trash2 className="w-7 h-7 text-white" />
                      </div>
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center border border-white">
                        <span className="text-xs font-semibold text-amber-900">
                          !
                        </span>
                      </div>
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-1 tracking-tight">
                        Delete Client
                      </h2>
                      <p className="text-white text-xs font-medium">
                        This action is permanent and cannot be undone
                      </p>
                      <div className="flex items-center gap-2 mt-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-800 border border-white/30 text-xs font-semibold text-white rounded-lg">
                          <Hash className="w-3 h-3" />
                          {selectedClient.code}
                        </span>
                        {selectedClient.clientType === ClientType.Permanent ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-700 border border-emerald-400/40 text-xs font-semibold text-white rounded-lg">
                            <UserCheck className="w-3 h-3" />
                            Permanent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-700 border border-amber-400/40 text-xs font-semibold text-white rounded-lg">
                            <Clock className="w-3 h-3" />
                            Temporary
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="rounded-lg p-2 bg-white/10 hover:bg-white/20 transition-all  border border-white/20 hover:border-white/40"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              {/* Client Info Card */}
              <div className="px-6 py-4  bg-slate-50  border-b border-slate-200">
                <div className="rounded-xl flex items-center gap-4 p-4 bg-white border border-slate-200 shadow-sm">
                  <div className="w-12 h-12 bg-red-600 flex items-center justify-center text-white font-semibold text-lg  ">
                    {selectedClient.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 text-base">
                      {selectedClient.fullName}
                    </h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Phone className="w-3 h-3" />
                        {selectedClient.whatsAppNumber}
                      </span>
                      {selectedClient.email && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Mail className="w-3 h-3" />
                          {selectedClient.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Account Balances */}
              <div className="px-6 py-4 bg-white border-b border-slate-200">
                <p className="text-xs font-semibold text-slate-500 mb-3">
                  Account Balances to be Deleted
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { currency: 0, balance: selectedClient.balanceKES ?? 0 },
                    { currency: 1, balance: selectedClient.balanceUSD ?? 0 },
                    ...(selectedClient.otherBalances || []).map((b: any) => ({
                      currency: b.currency,
                      balance: b.balance ?? 0,
                    })),
                  ]
                    .filter((b, i) => i < 2 || b.balance !== 0)
                    .map((b) => (
                      <div key={b.currency} className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                        <p className="text-xs font-semibold text-slate-600 mb-1.5">
                          {currencyCode(b.currency)} balance
                        </p>
                        <p
                          className={`text-lg font-semibold tabular-nums ${
                            b.balance >= 0 ? "text-emerald-700" : "text-red-600"
                          }`}
                        >
                          {formatMoney(b.balance, b.currency)}
                        </p>
                      </div>
                    ))}
                </div>
              </div>

              {/* Warning Section */}
              <div className="px-6 py-4 bg-white">
                <div className="relative overflow-hidden bg-red-50 border border-red-200 p-4 rounded-xl">
                  <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-red-100 rounded-full opacity-50"></div>

                  <div className="relative z-10 flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 bg-red-100 flex items-center justify-center border border-red-200 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-red-800 mb-1">
                        Warning: Permanent Deletion
                      </h4>
                      <p className="text-xs text-red-700 leading-relaxed">
                        You are about to permanently delete{" "}
                        <span className="font-semibold text-red-900">
                          {selectedClient.fullName}
                        </span>
                        . This will remove:
                      </p>
                      <ul className="mt-2 space-y-1">
                        <li className="flex items-center gap-2 text-xs text-red-700">
                          <X className="w-3 h-3 text-red-500" />
                          All account information
                        </li>
                        <li className="flex items-center gap-2 text-xs text-red-700">
                          <X className="w-3 h-3 text-red-500" />
                          Transaction history
                        </li>
                        <li className="flex items-center gap-2 text-xs text-red-700">
                          <X className="w-3 h-3 text-red-500" />
                          Balance records
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4  bg-slate-50  border-t border-slate-200 flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-lg flex-1 px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 shadow-sm "
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteClient}
                  disabled={isSubmitting}
                  className="rounded-lg flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete Permanently
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
  );
}
