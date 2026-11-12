"use client";

import { AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, Edit, Printer, Receipt, Search, Trash2, X } from "lucide-react";
import { ModalWrapper, formatNumber } from "../helpers";
import { type ExpensesAccountVM } from "../useExpensesAccount";

export function HeaderSection2({ vm }: { vm: ExpensesAccountVM }) {
  const { currentTransactions, filteredTransactions, getCategoryExpenses, handleExportPDF, handlePrint, openDeleteModal, openEditModal, selectedCategory, setSelectedCategory, setTransactionSearch, setTransactionsCurrentPage, totalTransactionPages, totalsText, transactionSearch, transactionsCurrentPage } = vm;
  return (
    <AnimatePresence>
      {selectedCategory && (
        <ModalWrapper onClose={() => setSelectedCategory(null)}>
          <div className="bg-white w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-blue-600 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 flex items-center justify-center">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">
                    {selectedCategory.name}
                  </h3>
                  <p className="text-blue-50 text-sm">
                    {getCategoryExpenses(selectedCategory.id).length} Expense
                    Records
                  </p>
                </div>
              </div>
              <button aria-label="Close"
                onClick={() => setSelectedCategory(null)}
                className="p-2 hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 border-b border-gray-200">
              <div className="bg-white border border-gray-200 p-3 col-span-2 rounded-lg">
                <p className="text-xs text-gray-500 font-medium mb-1">Total spent</p>
                <p className="text-lg font-semibold text-gray-900 tabular-nums">
                  {totalsText(selectedCategory.totals)}
                </p>
              </div>
              <div className="bg-white border border-gray-200 p-3 rounded-lg">
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">
                  Total Count
                </p>
                <p className="text-lg font-semibold text-blue-600">
                  {filteredTransactions.length}
                </p>
              </div>
              <div className="bg-blue-600 p-3 text-white">
                <p className="text-xs text-blue-50 uppercase font-medium mb-1">
                  Category
                </p>
                <p className="text-lg font-semibold truncate">
                  {selectedCategory.name}
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search expenses..."
                  value={transactionSearch}
                  onChange={(e: any) => setTransactionSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                />
              </div>
            </div>

            {/* Transactions Table */}
            <div className="flex-1 overflow-auto">
              {currentTransactions.length === 0 ? (
                <div className="p-12 text-center">
                  <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">
                    No Expenses Found
                  </h3>
                  <p className="text-gray-500">Try adjusting your search</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-w-full">
                  <table className="w-full">
                    <thead className="border-gray-200 sticky top-0 bg-[#E9EEF6]">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                          Reference
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                          Description
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                          Vendor
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {currentTransactions.map((txn) => (
                        <tr
                          key={txn.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {txn.reference}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {txn.date}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 max-w-[200px] truncate">
                            {txn.description}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {txn.vendor !== "Unknown" ? txn.vendor : "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                            {txn.currency} {formatNumber(txn.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => openEditModal(txn)}
                                className="p-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => openDeleteModal(txn)}
                                className="p-1.5 bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalTransactionPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Page {transactionsCurrentPage} of {totalTransactionPages} (
                  {filteredTransactions.length} expenses)
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setTransactionsCurrentPage((p) => Math.max(1, p - 1))
                    }
                    disabled={transactionsCurrentPage === 1}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 rounded-lg"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <button
                    onClick={() =>
                      setTransactionsCurrentPage((p) =>
                        Math.min(totalTransactionPages, p + 1),
                      )
                    }
                    disabled={
                      transactionsCurrentPage === totalTransactionPages
                    }
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 rounded-lg"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-3 p-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={handleExportPDF}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
              <button
                onClick={handlePrint}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print Statement
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}
    </AnimatePresence>
  );
}
