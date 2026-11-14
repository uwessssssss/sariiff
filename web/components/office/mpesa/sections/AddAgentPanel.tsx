"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Currency, currencyCode, walletCurrency } from "@/lib/api";
import { Hash, Loader2, Phone, Plus, Smartphone, User, Wallet, X, Zap } from "lucide-react";
import { type MPesaAccountsVM } from "../useMPesaAccounts";

export function AddAgentPanel({ vm }: { vm: MPesaAccountsVM }) {
  const { base, formData, handleCreateAgent, isSubmitting, networks, samples, setFormData, setShowAddAgent, showAddAgent } = vm;
  return (
    <AnimatePresence>
      {showAddAgent && (
        <div className="fixed inset-0 bg-black/80  flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 20 }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            className="rounded-xl bg-white shadow-2xl max-w-2xl w-full overflow-hidden border border-blue-500"
          >
            <div className="relative bg-blue-600 p-4">
              <div className="absolute inset-0 opacity-10 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.15)_25%,rgba(255,255,255,.15)_50%,transparent_50%,transparent_75%,rgba(255,255,255,.15)_75%,rgba(255,255,255,.15))] bg-[length:20px_20px]"></div>
              <button
                onClick={() => setShowAddAgent(false)}
                className="rounded-lg absolute top-3 right-3 p-1.5 bg-white/10 hover:bg-white/20 transition-all duration-200 border border-white/20 hover:border-white/40 group"
                title="Close"
              >
                <X className="w-4 h-4 text-white  transition-transform duration-300" />
              </button>
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 bg-white/15 flex items-center justify-center border border-white/30 rounded-lg ">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-white tracking-tight">
                    Add mobile money agent
                  </h2>
                  <p className="text-blue-50 text-xs font-medium">
                    Register new mobile money agent
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleCreateAgent}>
              <div className="p-4 max-h-[calc(100vh-180px)] overflow-y-auto  bg-slate-50 ">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-blue-500">
                      <div className="w-6 h-6 bg-blue-600 flex items-center justify-center shadow-sm">
                        <User className="w-3.5 h-3.5 text-white" />
                      </div>
                      <h3 className="text-xs font-semibold text-slate-900  ">
                        Agent Details
                      </h3>
                    </div>
                    <div className="rounded-xl grid grid-cols-2 gap-3 bg-white p-3.5 border border-slate-200 shadow-sm">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                          <User className="w-3 h-3 text-blue-600" />
                          Agent Name *
                        </label>
                        <input
                          type="text"
                          value={formData.agentName}
                          onChange={(e: any) =>
                            setFormData({
                              ...formData,
                              agentName: e.target.value,
                            })
                          }
                          className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                          placeholder="Sarif Exchange Agent - CBD"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                          <Phone className="w-3 h-3 text-blue-600" />
                          Phone Number *
                        </label>
                        <input
                          type="tel"
                          value={formData.phoneNumber}
                          onChange={(e: any) =>
                            setFormData({
                              ...formData,
                              phoneNumber: e.target.value,
                            })
                          }
                          className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                          placeholder={samples.phone}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                          <Hash className="w-3 h-3 text-blue-600" />
                          Agent Number *
                        </label>
                        <input
                          type="text"
                          value={formData.agentNumber}
                          onChange={(e: any) =>
                            setFormData({
                              ...formData,
                              agentNumber: e.target.value,
                            })
                          }
                          className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                          placeholder="AGT-001"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                          <Zap className="w-3 h-3 text-blue-600" />
                          Store Number
                        </label>
                        <input
                          type="text"
                          value={formData.storeNumber}
                          onChange={(e: any) =>
                            setFormData({
                              ...formData,
                              storeNumber: e.target.value,
                            })
                          }
                          className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                          placeholder="567890"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-900 mb-2">Network</label>
                    <select
                        value={formData.provider}
                        onChange={(e: any) => setFormData({ ...formData, provider: parseInt(e.target.value) })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        {networks.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label} ({currencyCode(walletCurrency(p.value, base))})
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-slate-500">
                        This wallet holds {currencyCode(walletCurrency(formData.provider, base))}.
                        {formData.provider === 0 && base !== Currency.KES && " M-Pesa is a Kenyan shilling wallet."}
                      </p>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-amber-500">
                      <div className="w-6 h-6  bg-amber-600  flex items-center justify-center shadow-sm">
                        <Wallet className="w-3.5 h-3.5 text-white" />
                      </div>
                      <h3 className="text-xs font-semibold text-slate-900  ">
                        Agent Type
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="group cursor-pointer">
                        <input
                          type="radio"
                          name="agentType"
                          value="0"
                          checked={formData.agentType === 0}
                          onChange={(e: any) =>
                            setFormData({
                              ...formData,
                              agentType: parseInt(e.target.value),
                            })
                          }
                          className="peer sr-only"
                        />
                        <div className="p-3 bg-[#E9EEF6] border border-slate-200 peer-checked:border-blue-500 peer-checked:shadow-md transition-all hover:border-blue-500 relative overflow-hidden duration-200 rounded-lg">
                          <div className="absolute inset-0 bg-blue-600/5 opacity-0 peer-checked:opacity-100 transition-opacity"></div>
                          <div className="relative flex items-center gap-2 mb-1.5">
                            <div className="w-7 h-7 bg-blue-600 flex items-center justify-center shadow-sm">
                              <Smartphone className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <span className="font-semibold text-xs text-slate-900 block leading-tight">
                                STANDARD AGENT
                              </span>
                              <span className="text-xs text-blue-600 font-semibold">
                                Regular
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 font-medium leading-snug relative">
                            Standard transactions
                          </p>
                        </div>
                      </label>

                      <label className="group cursor-pointer">
                        <input
                          type="radio"
                          name="agentType"
                          value="1"
                          checked={formData.agentType === 1}
                          onChange={(e: any) =>
                            setFormData({
                              ...formData,
                              agentType: parseInt(e.target.value),
                            })
                          }
                          className="peer sr-only"
                        />
                        <div className="p-3 bg-[#E9EEF6] border border-blue-200 peer-checked:border-blue-600 peer-checked:shadow-md transition-all hover:border-blue-400 relative overflow-hidden duration-200 rounded-lg">
                          <div className="absolute inset-0 bg-blue-600/5 opacity-0 peer-checked:opacity-100 transition-opacity"></div>
                          <div className="relative flex items-center gap-2 mb-1.5">
                            <div className="w-7 h-7 bg-blue-600 flex items-center justify-center shadow-sm">
                              <Zap className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <span className="font-semibold text-xs text-slate-900 block leading-tight">
                                SUPER AGENT
                              </span>
                              <span className="text-xs text-blue-600 font-semibold">
                                Premium
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 font-medium leading-snug relative">
                            High volume transactions
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-emerald-500">
                      <div className="w-6 h-6  bg-emerald-600  flex items-center justify-center shadow-sm">
                        <Wallet className="w-3.5 h-3.5 text-white" />
                      </div>
                      <h3 className="text-xs font-semibold text-slate-900  ">
                        Opening Balance ({currencyCode(walletCurrency(formData.provider, base))})
                      </h3>
                    </div>
                    <div className="rounded-xl bg-white p-3.5 border border-slate-200 shadow-sm">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                          <Wallet className="w-3 h-3 text-emerald-600" />
                          {currencyCode(walletCurrency(formData.provider, base))} Amount
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-700 font-semibold text-xs">
                            {currencyCode(walletCurrency(formData.provider, base))}
                          </span>
                          <input
                            type="number"
                            value={formData.openingBalance}
                            onChange={(e: any) =>
                              setFormData({
                                ...formData,
                                openingBalance:
                                  parseFloat(e.target.value) || 0,
                              })
                            }
                            className="rounded-lg w-full pl-12 pr-3 py-2 bg-emerald-50 border border-emerald-300 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 focus:bg-white transition-all font-semibold text-slate-900 text-sm placeholder:text-slate-500/60"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 p-4  bg-slate-50 ">
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowAddAgent(false)}
                    className="rounded-lg flex-1 px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 text-sm  shadow-sm "
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-lg flex-1 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all flex items-center justify-center gap-2 text-sm border border-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    {isSubmitting ? "Adding..." : "Add Agent"}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
