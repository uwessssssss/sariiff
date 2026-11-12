"use client";

import { ChevronLeft, ChevronRight, Eye, Plus, Receipt, RefreshCw, Search, Tag } from "lucide-react";
import { formatMoney } from "@/lib/api";
import { type ExpensesAccountVM } from "../useExpensesAccount";

export function HeaderSection1({ vm }: { vm: ExpensesAccountVM }) {
  const { allCategories, allExpenses, categoriesCurrentPage, currentCategories, getCategoryExpenses, handleRefresh, searchTerm, setCategoriesCurrentPage, setSearchTerm, setSelectedCategory, setShowAddExpense, setTransactionsCurrentPage, spendByCurrency, stats, totalCategoryPages } = vm;
  return (
    <div className="min-w-0 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Expenses
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Track and manage all business expenses by category
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium rounded-lg"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowAddExpense(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Record Expense
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Spend per currency (KES, USD, UGX, EUR) — the page's lead figure, blue */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white shadow-sm sm:col-span-2">
          <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-white/10 blur-3xl" />
          <div className="relative mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-50">Total spent</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
              <Receipt className="h-4 w-4 text-white" />
            </div>
          </div>
          {spendByCurrency.length === 0 ? (
            <p className="relative text-3xl font-semibold">0</p>
          ) : (
            <div className="relative space-y-1.5">
              {spendByCurrency.map((r, i) => (
                <div key={r.currency} className="flex items-baseline justify-between gap-4">
                  <span className={`font-semibold tabular-nums ${i === 0 ? "text-3xl" : "text-lg"}`}>
                    {formatMoney(r.total, r.currency)}
                  </span>
                  <span className="text-xs tabular-nums text-blue-50">
                    {formatMoney(r.thisMonth, r.currency)} this month
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {[
          { label: "Categories", value: stats.activeCategories || allCategories.length, note: "In use", Icon: Tag },
          { label: "Expenses recorded", value: allExpenses.length, note: "All time", Icon: Receipt },
        ].map(({ label, value, note, Icon }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E9EEF6]">
                <Icon className="h-4 w-4 text-[#0F172A]" />
              </div>
            </div>
            <p className="text-xl font-semibold tabular-nums text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{note}</p>
          </div>
        ))}
      </div>

      {/* Categories Table */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Expense Categories
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search categories..."
                value={searchTerm}
                onChange={(e: any) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-200 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-lg"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-w-full">
          <table className="w-full">
            <thead className="border-gray-200 bg-[#E9EEF6]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Name
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Total spent
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Expenses
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {currentCategories.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-12 text-center text-gray-500"
                  >
                    No categories found
                  </td>
                </tr>
              ) : (
                currentCategories.map((cat) => (
                  <tr
                    key={cat.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-900">
                        <Tag className="w-4 h-4 text-gray-500" />
                        {cat.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 tabular-nums">
                      {cat.totals.filter((t) => t.amount).length === 0
                        ? "-"
                        : cat.totals
                            .filter((t) => t.amount)
                            .map((t) => (
                              <div key={t.currency} className="whitespace-nowrap">
                                {formatMoney(t.amount, t.currency)}
                              </div>
                            ))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-sm font-medium">
                        {cat.transactionCount ||
                          getCategoryExpenses(cat.id).length}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => {
                          setSelectedCategory(cat);
                          setTransactionsCurrentPage(1);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCategoryPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Page {categoriesCurrentPage} of {totalCategoryPages}
            </p>
            <div className="flex gap-2">
              <button aria-label="Previous"
                onClick={() =>
                  setCategoriesCurrentPage((p) => Math.max(1, p - 1))
                }
                disabled={categoriesCurrentPage === 1}
                className="p-2 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 rounded-lg"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button aria-label="Next"
                onClick={() =>
                  setCategoriesCurrentPage((p) =>
                    Math.min(totalCategoryPages, p + 1),
                  )
                }
                disabled={categoriesCurrentPage === totalCategoryPages}
                className="p-2 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 rounded-lg"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
