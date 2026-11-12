"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Eye, RefreshCw, Search } from "lucide-react";
import { ExchangeType, formatCurrency } from "@/lib/api";
import { formatDateTime } from "../helpers";
import { type ExchangeSectionVM } from "../useExchangeSection";

export function TableHeaderSection({ vm }: { vm: ExchangeSectionVM }) {
  const { dateFilter, loadTransactions, page, pageSize, searchTerm, setDateFilter, setPage, setSearchTerm, setSelectedTransaction, setShowTransactionModal, totalCount, totalPages, transactions } = vm;
  return (
    <div className="rounded-xl bg-white border border-gray-200">
        {/* Table Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Exchange Transactions
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e: any) => setSearchTerm(e.target.value)}
                  className="rounded-lg pl-9 pr-4 py-2 border border-gray-200 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {/* Date Filter */}
              <select
                value={dateFilter}
                onChange={(e: any) => setDateFilter(e.target.value as any)}
                className="rounded-lg px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="all">All Time</option>
              </select>
              {/* Refresh */}
              <button aria-label="Refresh"
                onClick={loadTransactions}
                className="rounded-lg p-2 hover:bg-gray-100 transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-w-full">
          <table className="w-full">
            <thead className="border-gray-200 bg-[#E9EEF6]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Client
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Given
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Received
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Rate
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Profit
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-gray-600"
                  >
                    No transactions found
                  </td>
                </tr>
              ) : (
                transactions.map((txn) => (
                  <tr
                    key={txn.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      txn.isLargeTransaction ? "bg-amber-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {txn.isLargeTransaction && (
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                        )}
                        {txn.code}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {formatDateTime(txn.date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {txn.clientName}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 text-xs font-medium ${
                          txn.exchangeType === ExchangeType.Cash
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {txn.exchangeType === ExchangeType.Cash
                          ? "Cash"
                          : "Account"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-sm text-right text-emerald-700 font-medium">
                      +{formatCurrency(txn.amountGiven, txn.currencyGiven)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-sm text-right text-red-600 font-medium">
                      -
                      {formatCurrency(txn.amountReceived, txn.currencyReceived)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-sm text-right text-gray-900">
                      {txn.exchangeRate.toFixed(2)}
                    </td>
                    {/* Buys book no profit (average cost): show a dash, not "KES 0". A sale
                        below cost is a loss and shows red. */}
                    <td className={`px-4 py-3 whitespace-nowrap tabular-nums text-sm text-right font-medium ${
                      txn.profit > 0 ? "text-emerald-700" : txn.profit < 0 ? "text-red-600" : "text-slate-500"
                    }`}>
                      {txn.profit ? `${txn.profit > 0 ? "+" : "−"}${formatCurrency(Math.abs(txn.profit), txn.profitCurrency)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button aria-label="View details"
                        onClick={() => {
                          setSelectedTransaction(txn);
                          setShowTransactionModal(true);
                        }}
                        className="rounded-lg p-1 hover:bg-gray-200 transition-colors"
                      >
                        <Eye className="w-4 h-4 text-gray-600" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Showing {(page - 1) * pageSize + 1} to{" "}
              {Math.min(page * pageSize, totalCount)} of {totalCount}{" "}
              transactions
            </p>
            <div className="flex items-center gap-2">
              <button aria-label="Previous"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg p-2 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button aria-label="Next"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg p-2 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
  );
}
