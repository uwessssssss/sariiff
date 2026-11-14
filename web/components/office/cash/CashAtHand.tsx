"use client";

import { CurrencyTotals, rowsFromStats } from "../CurrencyTotals";
import { Download, Filter, Loader2, Plus, Printer, RefreshCw, Search } from "lucide-react";
import { currencyCode } from "@/lib/api";
import { motion } from "framer-motion";
import { useCashAtHand } from "./useCashAtHand";
import { CashSection } from "./sections/CashSection";
import { TransactionsTable } from "./sections/TransactionsTable";
import { AddCashAccountSection } from "./sections/AddCashAccountSection";
import { EditCashAccountSection } from "./sections/EditCashAccountSection";
import { DeleteCashAccountSection } from "./sections/DeleteCashAccountSection";
import { TransactionDetailsSection } from "./sections/TransactionDetailsSection";

export function CashAtHand() {
  const vm = useCashAtHand();
  const { allCurrenciesAdded, cashAccounts, currencyFilter, dateFilter, handleExport, handlePrint, handleRefresh, isLoading, openAddModal, searchTerm, setCurrencyFilter, setDateFilter, setSearchTerm, setTypeFilter, stats, typeFilter } = vm;
  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading cash accounts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="min-w-0 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Cash at hand
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Physical cash available in the office • Main Office
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={openAddModal}
              disabled={allCurrenciesAdded}
              title={allCurrenciesAdded ? "Every currency already has a cash account" : undefined}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add account
            </button>
            <button
              onClick={handleRefresh}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={handleExport}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          </div>
        </motion.div>

        {/* Cash Account Cards */}
        <CashSection vm={vm} />

        {/* Per-currency summary (KES, USD, UGX, EUR) */}
        <CurrencyTotals rows={rowsFromStats(stats)} />

        {/* Filters and Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl bg-white  border border-slate-200  p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <Filter className="w-5 h-5 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-700 ">
              Transaction Filters
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1">
              <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 border border-slate-200 rounded-lg">
                <Search className="w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e: any) => setSearchTerm(e.target.value)}
                  className="rounded-lg flex-1 outline-none text-slate-700 placeholder:text-slate-500 bg-transparent"
                />
              </div>
            </div>

            <div>
              <select
                value={dateFilter}
                onChange={(e: any) => setDateFilter(e.target.value)}
                className="rounded-lg w-full px-4 py-3 border border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>
            </div>

            <div>
              <select
                value={typeFilter}
                onChange={(e: any) => setTypeFilter(e.target.value)}
                className="rounded-lg w-full px-4 py-3 border border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="debit">Debit (In)</option>
                <option value="credit">Credit (Out)</option>
              </select>
            </div>

            <div>
              <select
                value={currencyFilter}
                onChange={(e: any) => setCurrencyFilter(e.target.value)}
                className="rounded-lg w-full px-4 py-3 border border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All currencies</option>
                {cashAccounts.map((a) => (
                  <option key={a.currency} value={currencyCode(a.currency)}>
                    {currencyCode(a.currency)} only
                  </option>
                ))}
              </select>
            </div>
          </div>
        </motion.div>

        {/* Transactions Table */}
        <TransactionsTable vm={vm} />
      </div>

      {/* ==================== MODALS ==================== */}

      {/* Add Cash Account Modal */}
      <AddCashAccountSection vm={vm} />

      {/* Edit Cash Account Modal */}
      <EditCashAccountSection vm={vm} />

      {/* Delete Confirmation Modal */}
      <DeleteCashAccountSection vm={vm} />

      {/* Transaction Detail Modal */}
      <TransactionDetailsSection vm={vm} />
    </div>
  );
}
