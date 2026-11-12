"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Columns, Filter, List, ListChecks, Loader2, RotateCcw, Search, Zap } from "lucide-react";
import { type ReconciliationVM } from "../useReconciliation";

export function FiltersBar({ vm }: { vm: ReconciliationVM }) {
  const { balanceSummary, clearFilters, dateFrom, dateTo, handleAutoReconcile, isSubmitting, searchTerm, selectedAccount, selectedTransactions, setCurrentPage, setDateFrom, setDateTo, setSearchTerm, setShowBulkModal, setShowCompleteModal, setShowFilters, setStatusFilter, setViewMode, showFilters, statusFilter, transactions, viewMode } = vm;
  return (
    <>
{selectedAccount && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white border border-slate-200 p-4 lg:p-6 shadow-sm rounded-xl"
          >
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex-1 min-w-[200px] max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e: any) => setSearchTerm(e.target.value)}
                    placeholder="Search transactions..."
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all rounded-lg"
                  />
                </div>
              </div>

              <div className="flex border border-slate-200 bg-slate-50 rounded-lg">
                <button
                  aria-label="Table view"
                  onClick={() => setViewMode("table")}
                  className={`p-2.5 transition-colors ${
                    viewMode === "table"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  aria-label="Split view"
                  onClick={() => setViewMode("split")}
                  className={`p-2.5 transition-colors ${
                    viewMode === "split"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Columns className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2.5 border font-semibold transition-all rounded-lg ${
                  showFilters
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <Filter className="w-4 h-4" />
                Filters
                {(statusFilter !== "all" || dateFrom || dateTo) && (
                  <span className="w-2 h-2 bg-blue-600 rounded-full" />
                )}
              </button>

              <button
                onClick={() => setShowBulkModal(true)}
                disabled={selectedTransactions.size === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold shadow-sm hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ListChecks className="w-4 h-4" />
                Bulk ({selectedTransactions.size})
              </button>

              <button
                onClick={handleAutoReconcile}
                disabled={balanceSummary.pendingCount === 0 || isSubmitting}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 text-white font-semibold shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                Auto Match All
              </button>

              <button
                onClick={() => setShowCompleteModal(true)}
                disabled={
                  balanceSummary.pendingCount > 0 || transactions.length === 0
                }
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4" />
                Complete
              </button>
            </div>

            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t-2 border-slate-100"
                >
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                      Status
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e: any) => {
                        setStatusFilter(e.target.value as typeof statusFilter);
                        setCurrentPage(1);
                      }}
                      className="w-full px-3 py-2.5 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all rounded-lg"
                    >
                      <option value="all">All Statuses</option>
                      <option value="pending">Pending</option>
                      <option value="matched">Matched</option>
                      <option value="unmatched">Unmatched</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                      From Date
                    </label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e: any) => {
                        setDateFrom(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full px-3 py-2.5 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                      To Date
                    </label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e: any) => {
                        setDateTo(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full px-3 py-2.5 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all rounded-lg"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={clearFilters}
                      className="w-full px-4 py-2.5 bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Clear Filters
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
    </>
  );
}
