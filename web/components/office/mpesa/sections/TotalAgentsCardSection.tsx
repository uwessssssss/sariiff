"use client";

import { Activity, Phone, TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { type MPesaAccountsVM } from "../useMPesaAccounts";

export function TotalAgentsCardSection({ vm }: { vm: MPesaAccountsVM }) {
  const { allAgents, baseCode, stats } = vm;
  return (
    <div className="grid md:grid-cols-4 gap-4">
        {/* Total Agents Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white   overflow-hidden group   transition-all duration-300"
        >
          {/* Background Pattern */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40"></div>

          <div className="relative p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-white/10 flex items-center justify-center border border-white/20 rounded-lg">
                <Phone className="w-6 h-6" />
              </div>
              <div className="bg-white/20 px-3 py-1 border border-white/30 rounded-lg">
                <span className="text-xs font-semibold  ">
                  Total
                </span>
              </div>
            </div>
            <p className="text-xs opacity-90 mb-1   font-semibold">
              Total Agents
            </p>
            <p className="text-2xl font-semibold tracking-tight">
              {stats.totalAgents || allAgents.length}
            </p>
            <div className="mt-3 pt-3 border-t border-white/20">
              <p className="text-xs">All mobile money agents</p>
            </div>
          </div>
        </motion.div>

        {/* Total Debit Card (Money IN for M-Pesa) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl bg-white border border-slate-200   hover:border-emerald-300 transition-all duration-300 group"
        >
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-emerald-100 flex items-center justify-center border border-emerald-200 group-hover:bg-emerald-200 transition-colors rounded-lg">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="bg-emerald-100 px-3 py-1 border border-emerald-200 rounded-lg">
                <span className="text-xs font-semibold text-emerald-700  ">
                  Debit - Money In
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-1 font-semibold">
              {baseCode} Total Debit
            </p>
            <p className="text-2xl font-semibold text-emerald-600 tracking-tight">
              {baseCode} {stats.totalDebit.toLocaleString()}
            </p>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 font-semibold">
                  Money In
                </p>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Total Credit Card (Money OUT for M-Pesa) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl bg-white border border-slate-200   hover:border-red-300 transition-all duration-300 group"
        >
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-red-100 flex items-center justify-center border border-red-200 group-hover:bg-red-200 transition-colors rounded-lg">
                <TrendingDown className="w-6 h-6 text-red-600" />
              </div>
              <div className="bg-red-100 px-3 py-1 border border-red-200 rounded-lg">
                <span className="text-xs font-semibold text-red-700  ">
                  Credit - Money Out
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-1 font-semibold">
              {baseCode} Total Credit
            </p>
            <p className="text-2xl font-semibold text-red-600 tracking-tight">
              {baseCode} {stats.totalCredit.toLocaleString()}
            </p>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 font-semibold">
                  Money Out
                </p>
                <TrendingDown className="w-4 h-4 text-red-500" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Net Movement Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl bg-white border border-slate-200 hover:border-slate-200 transition-all duration-300 group"
        >
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-[#E9EEF6] flex items-center justify-center border border-slate-200 group-hover:bg-blue-100 transition-colors rounded-lg">
                <Activity className="w-6 h-6 text-blue-600" />
              </div>
              <div className="bg-[#E9EEF6] px-3 py-1 border border-slate-200 rounded-lg">
                <span className="text-xs font-semibold text-[#0F172A]  ">
                  Net Movement
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-1 font-semibold">
              Net Movement
            </p>
            <p
              className={`text-2xl font-semibold tracking-tight ${
                stats.netMovement >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {stats.netMovement >= 0 ? "+" : ""}{baseCode}{" "}
              {stats.netMovement.toLocaleString()}
            </p>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">
                  Opening + money in − money out
                </span>
                <Activity className="w-4 h-4 text-blue-600" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
  );
}
