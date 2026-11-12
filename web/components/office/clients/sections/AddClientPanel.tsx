"use client";

import { ClientType, Currency, currencyCode } from "@/lib/api";
import { Clock, DollarSign, Hash, Key, Loader2, Mail, Phone, User, UserCheck, UserPlus, Wallet, X } from "lucide-react";
import { motion } from "framer-motion";
import { type ClientManagementVM } from "../useClientManagement";

export function AddClientPanel({ vm }: { vm: ClientManagementVM }) {
  const { currencyOk, formData, handleCreateClient, homeCurrency, isSubmitting, resetForm, samples, setFormData, setShowAddClient, showAddClient } = vm;
  return (
    <>
      {showAddClient && (
        <div className="fixed inset-0 bg-black/80  flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 20 }}
            className="rounded-xl bg-white shadow-2xl max-w-2xl w-full overflow-hidden border border-blue-600"
          >
            {/* Header */}
            <div className="relative  bg-blue-600   p-4">
              <div className="absolute inset-0 opacity-10 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.15)_25%,rgba(255,255,255,.15)_50%,transparent_50%,transparent_75%,rgba(255,255,255,.15)_75%,rgba(255,255,255,.15))] bg-[length:20px_20px]"></div>
              <button aria-label="Close"
                onClick={() => {
                  setShowAddClient(false);
                  resetForm();
                }}
                className="rounded-lg absolute top-3 right-3 p-1.5 bg-white/10 hover:bg-white/20 transition-all duration-200 border border-white/20 hover:border-white/40 group"
              >
                <X className="w-4 h-4 text-white  transition-transform duration-300" />
              </button>
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 bg-white/15 flex items-center justify-center border border-white/30 rounded-lg ">
                  <UserPlus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-white tracking-tight">
                    Add New Client
                  </h2>
                  <p className="text-blue-50 text-xs font-medium">
                    Complete client registration
                  </p>
                </div>
              </div>
            </div>

            {/* Form Content */}
            <form
              onSubmit={handleCreateClient}
              className="p-4 max-h-[calc(100vh-180px)] overflow-y-auto  bg-slate-50 "
            >
              <div className="space-y-4">
                {/* Personal Information */}
                <div>
                  <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-blue-500">
                    <div className="w-6 h-6  bg-blue-600  flex items-center justify-center shadow-sm">
                      <User className="w-3.5 h-3.5 text-white" />
                    </div>
                    <h3 className="text-xs font-semibold text-slate-900  ">
                      Personal Information
                    </h3>
                  </div>
                  <div className="rounded-xl grid grid-cols-2 gap-3 bg-white p-3.5 border border-slate-200 shadow-sm">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                        <User className="w-3 h-3 text-blue-600" />
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.fullName}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            fullName: e.target.value,
                          })
                        }
                        className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                        placeholder={samples.name}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                        <Phone className="w-3 h-3 text-blue-600" />
                        WhatsApp Number *
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.whatsAppNumber}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            whatsAppNumber: e.target.value,
                          })
                        }
                        className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                        placeholder={samples.phoneCompact}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                        <Mail className="w-3 h-3 text-blue-600" />
                        Email
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e: any) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                        placeholder="john@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                        <Hash className="w-3 h-3 text-blue-600" />
                        ID / Passport
                      </label>
                      <input
                        type="text"
                        value={formData.idPassport}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            idPassport: e.target.value,
                          })
                        }
                        className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                        placeholder="12345678"
                      />
                    </div>
                  </div>
                </div>

                {/* Account Type */}
                <div>
                  <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-amber-500">
                    <div className="w-6 h-6  bg-amber-600  flex items-center justify-center shadow-sm">
                      <UserCheck className="w-3.5 h-3.5 text-white" />
                    </div>
                    <h3 className="text-xs font-semibold text-slate-900  ">
                      Account Type
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="group cursor-pointer">
                      <input
                        type="radio"
                        name="clientType"
                        checked={formData.clientType === ClientType.Permanent}
                        onChange={() =>
                          setFormData({
                            ...formData,
                            clientType: ClientType.Permanent,
                          })
                        }
                        className="peer sr-only"
                      />
                      <div className="p-3 bg-blue-50 border border-blue-200 peer-checked:border-blue-600 peer-checked:shadow-md transition-all hover:border-blue-400 relative overflow-hidden duration-200 rounded-lg">
                        <div className="relative flex items-center gap-2 mb-1.5">
                          <div className="w-7 h-7 bg-blue-600 flex items-center justify-center shadow-sm">
                            <UserCheck className="w-3.5 h-3.5 text-white" />
                          </div>
                          <div>
                            <span className="font-semibold text-xs text-slate-900 block leading-tight">
                              PERMANENT
                            </span>
                            <span className="text-xs text-blue-600 font-semibold">
                              Standard
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 font-medium leading-snug">
                          No expiry • Full access
                        </p>
                      </div>
                    </label>

                    <label className="group cursor-pointer">
                      <input
                        type="radio"
                        name="clientType"
                        checked={formData.clientType === ClientType.Temporary}
                        onChange={() =>
                          setFormData({
                            ...formData,
                            clientType: ClientType.Temporary,
                          })
                        }
                        className="peer sr-only"
                      />
                      <div className="p-3 bg-amber-50 border border-amber-200 peer-checked:border-amber-600 peer-checked:shadow-md transition-all hover:border-amber-400 relative overflow-hidden duration-200 rounded-lg">
                        <div className="relative flex items-center gap-2 mb-1.5">
                          <div className="w-7 h-7 bg-amber-600 flex items-center justify-center shadow-sm">
                            <Clock className="w-3.5 h-3.5 text-white" />
                          </div>
                          <div>
                            <span className="font-semibold text-xs text-slate-900 block leading-tight">
                              TEMPORARY
                            </span>
                            <span className="text-xs text-amber-700 font-semibold">
                              Walk-In
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 font-medium leading-snug">
                          Limited • Restricted
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Password (for Permanent clients) */}
                {formData.clientType === ClientType.Permanent && (
                  <div>
                    <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-blue-500">
                      <div className="w-6 h-6 bg-blue-600 flex items-center justify-center shadow-sm">
                        <Key className="w-3.5 h-3.5 text-white" />
                      </div>
                      <h3 className="text-xs font-semibold text-slate-900  ">
                        Login Credentials
                      </h3>
                    </div>
                    <div className="rounded-xl bg-white p-3.5 border border-slate-200 shadow-sm">
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                        <Key className="w-3 h-3 text-blue-600" />
                        Password
                      </label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            password: e.target.value,
                          })
                        }
                        className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                        placeholder="Enter password for client login"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Optional: Set a password for client portal access
                      </p>
                    </div>
                  </div>
                )}

                {/* Opening Balance */}
                <div>
                  <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-emerald-500">
                    <div className="w-6 h-6  bg-emerald-600  flex items-center justify-center shadow-sm">
                      <DollarSign className="w-3.5 h-3.5 text-white" />
                    </div>
                    <h3 className="text-xs font-semibold text-slate-900  ">
                      Opening Balance
                    </h3>
                  </div>
                  {(() => {
                    // The bureau's own currency first (UGX for a Ugandan bureau), then
                    // KES if this bureau uses it, then USD.
                    const homeIsOther = homeCurrency !== Currency.KES && homeCurrency !== Currency.USD;
                    const fields: { key: "openingBalanceHome" | "openingBalanceKES" | "openingBalanceUSD"; code: string }[] = [
                      ...(homeIsOther ? [{ key: "openingBalanceHome" as const, code: currencyCode(homeCurrency) }] : []),
                      ...(currencyOk(Currency.KES) ? [{ key: "openingBalanceKES" as const, code: "KES" }] : []),
                      { key: "openingBalanceUSD" as const, code: "USD" },
                    ];
                    return (
                      <div className={`rounded-xl grid gap-3 bg-white p-3.5 border border-slate-200 shadow-sm ${fields.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                        {fields.map((f) => (
                          <div key={f.key}>
                            <label htmlFor={`ob-${f.key}`} className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                              <Wallet className="w-3 h-3 text-emerald-600" />
                              {f.code}
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-700 font-semibold text-xs">
                                {f.code}
                              </span>
                              <input
                                id={`ob-${f.key}`}
                                type="number"
                                step="0.01"
                                min="0"
                                value={formData[f.key] ?? 0}
                                onChange={(e: any) =>
                                  setFormData({ ...formData, [f.key]: parseFloat(e.target.value) || 0 })
                                }
                                className="rounded-lg w-full pl-12 pr-3 py-2 bg-emerald-50 border border-emerald-300 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 focus:bg-white transition-all font-semibold text-slate-900 text-sm placeholder:text-slate-500/60"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </form>

            {/* Footer */}
            <div className="border-t border-slate-200 p-4  bg-slate-50 ">
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddClient(false);
                    resetForm();
                  }}
                  className="rounded-lg flex-1 px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 text-sm  shadow-sm "
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  onClick={handleCreateClient}
                  disabled={isSubmitting}
                  className="rounded-lg flex-1 px-5 py-2.5  bg-blue-600 hover:bg-blue-700   text-white font-semibold     transition-all flex items-center justify-center gap-2 text-sm  border border-blue-700/50   disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  {isSubmitting ? "Creating..." : "Create Client"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
