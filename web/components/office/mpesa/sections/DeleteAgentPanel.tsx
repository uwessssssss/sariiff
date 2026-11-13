"use client";

import { AlertCircle, Loader2, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { currencyCode } from "@/lib/api";
import { type MPesaAccountsVM } from "../useMPesaAccounts";

export function DeleteAgentPanel({ vm }: { vm: MPesaAccountsVM }) {
  const { handleDeleteAgent, isSubmitting, selectedAgent, setSelectedAgent, setShowDeleteAgent, showDeleteAgent } = vm;
  return (
    <AnimatePresence>
      {showDeleteAgent && selectedAgent && (
        <div className="fixed inset-0 bg-black/60  flex items-center justify-center p-4 z-[60]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white shadow-2xl max-w-md w-full overflow-hidden flex flex-col"
          >
            {/* Premium Header with Gradient Background */}
            <div className="relative  bg-red-600   px-6 py-4">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>

              <div className="relative flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-white/20 flex items-center justify-center border border-white/30 rounded-lg ">
                    <Trash2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white mb-0.5">
                      Delete mobile money agent
                    </h2>
                    <p className="text-white text-xs font-medium">
                      This action cannot be undone
                    </p>
                  </div>
                </div>
                <button aria-label="Close"
                  onClick={() => {
                    setShowDeleteAgent(false);
                    setSelectedAgent(null);
                  }}
                  className="rounded-lg p-1.5 bg-white/10 hover:bg-white/20 transition-all "
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              {/* Warning Icon */}
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
              </div>

              <h4 className="text-lg font-semibold text-slate-900 text-center mb-2">
                Are you sure you want to delete this agent?
              </h4>
              <p className="text-sm text-slate-600 text-center mb-4">
                Only an agent with no transactions can be deleted. To stop
                using an agent with history, set it to Inactive instead.
              </p>

              {/* Agent Details */}
              <div className="bg-red-50 border border-red-200 p-4 space-y-2 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-600 ">
                    Agent Code:
                  </span>
                  <span className="text-xs font-mono font-semibold text-slate-900">
                    {selectedAgent.code}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-600 ">
                    Agent Name:
                  </span>
                  <span className="text-xs font-semibold text-slate-900">
                    {selectedAgent.agentName}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-600 ">
                    Phone:
                  </span>
                  <span className="text-xs font-semibold text-slate-900">
                    {selectedAgent.phoneNumber}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-red-300">
                  <span className="text-xs font-semibold text-slate-600 ">
                    Balance:
                  </span>
                  <span className="text-sm font-semibold text-red-700">
                    {currencyCode(selectedAgent.currency)} {selectedAgent.balance.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Fixed Footer with Action Buttons */}
            <div className="px-6 py-4  bg-slate-50  border-t border-slate-200 flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteAgent(false);
                  setSelectedAgent(null);
                }}
                className="rounded-lg flex-1 px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 shadow-sm "
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAgent}
                disabled={isSubmitting}
                className="rounded-lg flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                {isSubmitting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
