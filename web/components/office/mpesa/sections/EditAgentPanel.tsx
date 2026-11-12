"use client";

import { Activity, Calendar, Edit3, Hash, Loader2, Phone, Smartphone, Wallet, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { MOBILE_MONEY_PROVIDERS, currencyCode } from "@/lib/api";
import { type MPesaAccountsVM } from "../useMPesaAccounts";

export function EditAgentPanel({ vm }: { vm: MPesaAccountsVM }) {
  const { editFormData, handleUpdateAgent, isSubmitting, selectedAgent, setEditFormData, setSelectedAgent, setShowEditAgent, showEditAgent } = vm;
  return (
    <AnimatePresence>
        {showEditAgent && selectedAgent && (
          <div className="fixed inset-0 bg-black/60  flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white shadow-2xl max-w-xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            >
              {/* Premium Header with Gradient Background */}
              <div className="relative bg-blue-600 px-6 py-4">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>

                <div className="relative flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-white/20  rounded-xl flex items-center justify-center border border-white/30 ">
                      <Edit3 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-0.5">
                        Edit mobile money agent
                      </h2>
                      <p className="text-blue-50 text-xs font-medium">
                        Update agent information and settings
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-800 border border-white/30 rounded-lg text-xs font-semibold text-white">
                          <Hash className="w-3 h-3" />
                          {selectedAgent.code}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 border rounded-lg text-xs font-semibold ${
                            selectedAgent.isActive
                              ? "bg-emerald-700 border-emerald-400/40 text-white"
                              : "bg-red-700 border-red-400/40 text-white"
                          }`}
                        >
                          <Zap className="w-3 h-3" />
                          {selectedAgent.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => {
                      setShowEditAgent(false);
                      setSelectedAgent(null);
                    }}
                    className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all "
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              {/* Account Balance Preview */}
              <div className="px-6 py-3  bg-slate-50  border-b border-slate-200">
                <div className="grid grid-cols-1 gap-3">
                  {/* KES Balance */}
                  <div className="rounded-xl bg-white p-3 border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Wallet className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-xs font-semibold text-slate-600  ">
                        {currencyCode(selectedAgent.currency)} mobile money account
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 text-xs">
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">
                          Opening Balance
                        </p>
                        <p className="text-xs font-semibold text-emerald-700">
                          {selectedAgent.openingBalance.toLocaleString()}
                        </p>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-xs text-slate-500 mb-0.5">
                          Current Balance
                        </p>
                        <p className="text-sm font-semibold text-blue-600">
                          {currencyCode(selectedAgent.currency)} {selectedAgent.balance.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrollable Form Content */}
              <form
                onSubmit={handleUpdateAgent}
                className="flex flex-col flex-1 overflow-hidden"
              >
                <div className="px-6 py-5 overflow-y-auto flex-1">
                  <div className="space-y-6">
                    {/* Agent Information Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-6 bg-blue-600 rounded-full"></div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          Agent Information
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Agent Name */}
                        <div className="md:col-span-2">
                          <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <Smartphone className="w-4 h-4 text-slate-500" />
                            Agent Name
                            <span className="text-red-600">*</span>
                          </label>
                          <input
                            type="text"
                            value={editFormData.agentName}
                            onChange={(e: any) =>
                              setEditFormData({
                                ...editFormData,
                                agentName: e.target.value,
                              })
                            }
                            placeholder="Enter agent name"
                            className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                          />
                        </div>

                        {/* Phone Number - Read Only */}
                        <div className="group">
                          <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <Phone className="w-4 h-4 text-slate-500" />
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            value={selectedAgent.phoneNumber}
                            disabled
                            className="rounded-lg w-full px-4 py-3.5 bg-slate-50 border border-slate-200 text-slate-500 font-medium cursor-not-allowed"
                          />
                        </div>

                        {/* Agent Number - Read Only */}
                        <div className="group">
                          <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <Hash className="w-4 h-4 text-slate-500" />
                            Agent Number
                          </label>
                          <input
                            type="text"
                            value={selectedAgent.agentNumber}
                            disabled
                            className="rounded-lg w-full px-4 py-3.5 bg-slate-50 border border-slate-200 text-slate-500 font-medium cursor-not-allowed"
                          />
                        </div>
                      </div>

                      {/* Store Number and Status */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="group">
                          <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <Hash className="w-4 h-4 text-slate-500" />
                            Store Number
                          </label>
                          <input
                            type="text"
                            value={editFormData.storeNumber}
                            onChange={(e: any) =>
                              setEditFormData({
                                ...editFormData,
                                storeNumber: e.target.value,
                              })
                            }
                            placeholder="567890"
                            className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                          />
                        </div>

                        <div className="group">
                          <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-slate-500" />
                            Account Status
                          </label>
                          <select
                            value={
                              editFormData.isActive ? "active" : "inactive"
                            }
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
                      </div>

                      {/* Network */}
                      <div className="group">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Network</label>
                        <select
                          value={editFormData.provider}
                          onChange={(e: any) => setEditFormData({ ...editFormData, provider: parseInt(e.target.value) })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          {MOBILE_MONEY_PROVIDERS.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Agent Type */}
                      <div className="group">
                        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                          <Zap className="w-4 h-4 text-slate-500" />
                          Agent Type
                        </label>
                        <select
                          value={editFormData.agentType}
                          onChange={(e: any) =>
                            setEditFormData({
                              ...editFormData,
                              agentType: parseInt(e.target.value),
                            })
                          }
                          className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none cursor-pointer"
                        >
                          <option value="0">Standard Agent</option>
                          <option value="1">Super Agent</option>
                        </select>
                      </div>

                      {/* Registered Date */}
                      <div className="group">
                        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-500" />
                          Registered Since
                        </label>
                        <input
                          type="text"
                          value={new Date(
                            selectedAgent.createdAt,
                          ).toLocaleDateString()}
                          disabled
                          className="rounded-lg w-full px-4 py-3.5 bg-slate-50 border border-slate-200 text-slate-500 font-medium cursor-not-allowed"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fixed Footer with Action Buttons */}
                <div className="px-6 py-4  bg-slate-50  border-t border-slate-200 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditAgent(false);
                      setSelectedAgent(null);
                    }}
                    className="rounded-lg flex-1 px-6 py-3.5 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 shadow-sm "
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-lg flex-1 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    {isSubmitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
  );
}
