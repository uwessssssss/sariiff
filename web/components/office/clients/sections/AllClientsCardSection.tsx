"use client";

import { AlertCircle, CheckCircle, Users } from "lucide-react";
import { currencyCode, formatMoney } from "@/lib/api";
import { motion } from "framer-motion";
import { type ClientManagementVM } from "../useClientManagement";

export function AllClientsCardSection({ vm }: { vm: ClientManagementVM }) {
  const { setActiveTab, stats } = vm;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* All Clients Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.02 }}
        className="relative rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white   overflow-hidden cursor-pointer   transition-all duration-300"
        onClick={() => setActiveTab("all")}
      >
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40"></div>
        <div className="relative p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-white/10 flex items-center justify-center border border-white/20 rounded-lg">
              <Users className="w-6 h-6" />
            </div>
            <div className="bg-white/20 px-3 py-1 border border-white/30 rounded-lg">
              <span className="text-xs font-semibold  ">
                Total
              </span>
            </div>
          </div>
          <p className="text-xs opacity-90 mb-1   font-semibold">
            Total Clients
          </p>
          <p className="text-2xl font-semibold tracking-tight mb-4">
            {stats.totalClients}
          </p>
          <div className="pt-3 border-t border-white/20 space-y-1">
            {(stats.byCurrency && stats.byCurrency.length > 0
              ? stats.byCurrency.map((b) => ({ currency: b.currency, total: b.totalBalance }))
              : [
                  { currency: 0, total: stats.totalBalanceKES },
                  { currency: 1, total: stats.totalBalanceUSD },
                ]
            ).map((b) => (
              <div key={b.currency} className="flex items-center justify-between">
                <span className="text-xs">{currencyCode(b.currency)} balance</span>
                <span className="text-sm font-semibold tabular-nums">{formatMoney(b.total, b.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Clients with Credit Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        whileHover={{ scale: 1.02 }}
        className="rounded-xl bg-white border border-slate-200   hover:border-emerald-300 transition-all duration-300 cursor-pointer group"
        onClick={() => setActiveTab("debit")}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-emerald-100 flex items-center justify-center border border-emerald-200 group-hover:bg-emerald-200 transition-colors rounded-lg">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="bg-emerald-100 px-3 py-1 border border-emerald-200 rounded-lg">
              <span className="text-xs font-semibold text-emerald-700  ">
                Credit
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-1 font-semibold">
            Clients With Credit
          </p>
          <p className="text-2xl font-semibold text-emerald-600 tracking-tight mb-4">
            {stats.clientsWithDebit}
          </p>
          <div className="pt-3 border-t border-slate-100 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold">
                Positive Balances
              </span>
              <span className="text-sm font-semibold text-emerald-700">
                {stats.clientsWithDebit} clients
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Clients with Debit Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        whileHover={{ scale: 1.02 }}
        className="rounded-xl bg-white border border-slate-200   hover:border-red-300 transition-all duration-300 cursor-pointer group"
        onClick={() => setActiveTab("credit")}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-red-100 flex items-center justify-center border border-red-200 group-hover:bg-red-200 transition-colors rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <div className="bg-red-100 px-3 py-1 border border-red-200 rounded-lg">
              <span className="text-xs font-semibold text-red-700  ">
                Debit
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-1 font-semibold">
            Clients With Debit
          </p>
          <p className="text-2xl font-semibold text-red-600 tracking-tight mb-4">
            {stats.clientsWithCredit}
          </p>
          <div className="pt-3 border-t border-slate-100 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold">
                Negative Balances
              </span>
              <span className="text-sm font-semibold text-red-600">
                {stats.clientsWithCredit} clients
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
