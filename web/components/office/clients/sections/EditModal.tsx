"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ClientType, currencyCode, unlinkClientPhoneLogin } from "@/lib/api";
import { Clock, Edit3, Hash, Loader2, Mail, Phone, RefreshCw, Trash2, User, UserCheck, Wallet, X } from "lucide-react";
import { clientCurrencyLines } from "../helpers";
import { toast } from "sonner";
import { type ClientManagementVM } from "../useClientManagement";

export function EditModal({ vm }: { vm: ClientManagementVM }) {
  const { editFormData, fetchClients, handleUpdateClient, homeCurrency, isSubmitting, samples, selectedClient, setEditFormData, setSelectedClient, setShowConvertModal, setShowDeleteConfirm, setShowEditModal, showEditModal } = vm;
  return (
    <AnimatePresence>
      {showEditModal && selectedClient && (
        <div className="fixed inset-0 bg-black/60  flex items-center justify-center p-4 z-[60]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white shadow-2xl max-w-xl w-full max-h-[85vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="relative  bg-blue-600   px-6 py-4">
              <div className="relative flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-white/20  rounded-xl flex items-center justify-center border border-white/30 ">
                    <Edit3 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white mb-0.5">
                      Edit Client
                    </h2>
                    <p className="text-blue-50 text-xs font-medium">
                      Update client information
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-800 border border-white/30 rounded-lg text-xs font-semibold text-white">
                        <Hash className="w-3 h-3" />
                        {selectedClient.code}
                      </span>
                      {selectedClient.clientType === ClientType.Permanent ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-700 border border-emerald-400/40 rounded-lg text-xs font-semibold text-white">
                          <UserCheck className="w-3 h-3" />
                          Permanent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-700 border border-amber-400/40 rounded-lg text-xs font-semibold text-white">
                          <Clock className="w-3 h-3" />
                          Temporary
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button aria-label="Close"
                  onClick={() => setShowEditModal(false)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all "
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Account Balance Preview — the bureau's home currency first (UGX in Uganda),
                then every other currency this client holds. It used to show KES and USD only,
                so a Ugandan client's real balance never appeared here. */}
            <div className="px-6 py-3  bg-slate-50  border-b border-slate-200">
              {(() => {
                const lines = clientCurrencyLines(selectedClient);
                if (!lines.some((l) => l.currency === homeCurrency))
                  lines.unshift({ currency: homeCurrency, code: currencyCode(homeCurrency), moneyIn: 0, moneyOut: 0, balance: 0 });
                lines.sort((a, b) => (a.currency === homeCurrency ? -1 : b.currency === homeCurrency ? 1 : a.currency - b.currency));
                return (
                  <div className={`grid gap-3 ${lines.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                    {lines.map((l) => (
                      <div key={l.currency} className={`rounded-xl bg-white p-3 border shadow-sm ${l.currency === homeCurrency ? "border-blue-200" : "border-slate-200"}`}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Wallet className="w-3.5 h-3.5 text-blue-600" />
                          <span className="text-xs font-semibold text-slate-600">
                            {l.code}{l.currency === homeCurrency ? " · home" : ""}
                          </span>
                        </div>
                        <p className={`text-lg font-semibold tabular-nums ${l.balance >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {l.code} {l.balance.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Form Content */}
            <form
              onSubmit={handleUpdateClient}
              className="px-6 py-5 overflow-y-auto flex-1"
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-500" />
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={editFormData.fullName}
                      onChange={(e: any) =>
                        setEditFormData({
                          ...editFormData,
                          fullName: e.target.value,
                        })
                      }
                      className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-500" />
                      WhatsApp Number
                    </label>
                    <input
                      type="tel"
                      value={editFormData.whatsAppNumber}
                      onChange={(e: any) =>
                        setEditFormData({
                          ...editFormData,
                          whatsAppNumber: e.target.value,
                        })
                      }
                      className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      placeholder={samples.phoneCompact}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-500" />
                      Email
                    </label>
                    <input
                      type="email"
                      value={editFormData.email}
                      onChange={(e: any) =>
                        setEditFormData({
                          ...editFormData,
                          email: e.target.value,
                        })
                      }
                      className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <Hash className="w-4 h-4 text-slate-500" />
                      ID / Passport
                    </label>
                    <input
                      type="text"
                      value={editFormData.idPassport}
                      onChange={(e: any) =>
                        setEditFormData({
                          ...editFormData,
                          idPassport: e.target.value,
                        })
                      }
                      className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    />
                  </div>
                </div>

                {/* Phone login (one login, several bureaus): the office can cut the link, e.g. a lost phone */}
                {selectedClient.phoneLoginLinked && (
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">Phone login: linked</h4>
                      <p className="mt-0.5 text-xs text-slate-600">
                        This client can open this account with a code sent to {selectedClient.whatsAppNumber}.
                        Unlink if the phone is lost or changed hands. Balances and history stay.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Unlink phone login for ${selectedClient.fullName}? They can still sign in with code and password.`)) return;
                        const r = await unlinkClientPhoneLogin(selectedClient.id);
                        if (!r.success) {
                          toast.error(r.message || "Couldn't unlink");
                          return;
                        }
                        toast.success("Phone login unlinked");
                        setSelectedClient({ ...selectedClient, phoneLoginLinked: false });
                        fetchClients();
                      }}
                      className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Unlink
                    </button>
                  </div>
                )}

                {/* Convert to Permanent (for Temporary clients) */}
                {selectedClient.clientType === ClientType.Temporary && (
                  <div className=" bg-blue-50 border border-blue-200 p-4 rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10  bg-blue-500  flex items-center justify-center flex-shrink-0  ">
                        <RefreshCw className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-slate-900 mb-1">
                          Convert to Permanent Client
                        </h4>
                        <p className="text-xs text-slate-600 mb-3">
                          This client is currently{" "}
                          <span className="font-semibold text-amber-700">
                            temporary
                          </span>
                          . Convert to permanent status for full access.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setShowEditModal(false);
                            setShowConvertModal(true);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-all"
                        >
                          <UserCheck className="w-4 h-4" />
                          Convert to Permanent
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </form>

            {/* Footer */}
            <div className="px-6 py-4  bg-slate-50  border-t border-slate-200 flex gap-3">
              <button aria-label="Delete"
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setShowDeleteConfirm(true);
                }}
                className="rounded-lg px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold transition-all flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="rounded-lg flex-1 px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 shadow-sm "
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleUpdateClient}
                disabled={isSubmitting}
                className="rounded-lg flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
