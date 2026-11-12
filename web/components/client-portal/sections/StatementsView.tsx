"use client";

import { ChevronLeft, ChevronRight, Download, FileDown, Loader2, Printer, Search } from "lucide-react";
import { TransactionType } from "@/lib/api";
import { formatCurrency, formatDate, formatTime } from "../helpers";
import { motion } from "framer-motion";
import { type ClientUserDashboardVM } from "../useClientUserDashboard";

export function StatementsView({ vm }: { vm: ClientUserDashboardVM }) {
  const { activeView, currencyFilter, currentPage, filterPeriod, handleDownloadStatement, handleExportCsv, handlePrintStatement, loadingTransactions, pageSize, searchQuery, setCurrencyFilter, setCurrentPage, setFilterPeriod, setSearchQuery, setSelectedTransaction, setTypeFilter, statementCurrencies, totalCount, totalPages, transactions, typeFilter } = vm;
  return (
    <>
{activeView === "statements" && (
              <motion.div
                key="statements"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Statements</h1>
                    <p className="mt-1 text-sm text-slate-600">
                      {totalCount === 1 ? "1 transaction" : `${totalCount.toLocaleString()} transactions`}
                      {filterPeriod === "month" ? " in the last month" : filterPeriod === "week" ? " in the last 7 days" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDownloadStatement}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      <Download className="h-4 w-4" />
                      Download PDF
                    </button>
                    <button
                      onClick={handlePrintStatement}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Printer className="h-4 w-4" />
                      <span className="hidden sm:inline">Print</span>
                    </button>
                    <button
                      onClick={handleExportCsv}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <FileDown className="h-4 w-4" />
                      <span className="hidden sm:inline">CSV</span>
                    </button>
                  </div>
                </div>

                {/* Filters: one quiet row */}
                {(() => {
                  const seg = (on: boolean) =>
                    `h-8 rounded-md px-3 text-sm font-medium transition-colors ${
                      on ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`;
                  return (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                      <div className="relative lg:w-72">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                        <input
                          type="search"
                          aria-label="Search transactions"
                          placeholder="Search description or reference"
                          value={searchQuery}
                          onChange={(e: any) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <div role="group" aria-label="Period" className="inline-flex rounded-lg bg-slate-100 p-0.5">
                          {([
                            ["all", "All time"],
                            ["month", "Last month"],
                            ["week", "Last 7 days"],
                          ] as const).map(([v, label]) => (
                            <button key={v} aria-pressed={filterPeriod === v} onClick={() => { setFilterPeriod(v); setCurrentPage(1); }} className={seg(filterPeriod === v)}>
                              {label}
                            </button>
                          ))}
                        </div>
                        {statementCurrencies.length > 1 && (
                          <div role="group" aria-label="Currency" className="inline-flex rounded-lg bg-slate-100 p-0.5">
                            <button aria-pressed={currencyFilter === undefined} onClick={() => { setCurrencyFilter(undefined); setCurrentPage(1); }} className={seg(currencyFilter === undefined)}>
                              All
                            </button>
                            {statementCurrencies.map((c) => (
                              <button key={c.value} aria-pressed={currencyFilter === c.value} onClick={() => { setCurrencyFilter(c.value); setCurrentPage(1); }} className={seg(currencyFilter === c.value)}>
                                {c.code}
                              </button>
                            ))}
                          </div>
                        )}
                        <div role="group" aria-label="Direction" className="inline-flex rounded-lg bg-slate-100 p-0.5">
                          <button aria-pressed={typeFilter === undefined} onClick={() => { setTypeFilter(undefined); setCurrentPage(1); }} className={seg(typeFilter === undefined)}>
                            All
                          </button>
                          <button aria-pressed={typeFilter === TransactionType.Credit} onClick={() => { setTypeFilter(TransactionType.Credit); setCurrentPage(1); }} className={seg(typeFilter === TransactionType.Credit)}>
                            Money in
                          </button>
                          <button aria-pressed={typeFilter === TransactionType.Debit} onClick={() => { setTypeFilter(TransactionType.Debit); setCurrentPage(1); }} className={seg(typeFilter === TransactionType.Debit)}>
                            Money out
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Transactions */}
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {loadingTransactions ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading transactions
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="py-16 text-center">
                      <p className="text-sm font-medium text-slate-900">No transactions</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {searchQuery || filterPeriod !== "all" || currencyFilter !== undefined || typeFilter !== undefined
                          ? "Nothing matches these filters."
                          : "Transactions on your account will appear here."}
                      </p>
                      {(searchQuery || filterPeriod !== "all" || currencyFilter !== undefined || typeFilter !== undefined) && (
                        <button
                          onClick={() => {
                            setSearchQuery("");
                            setFilterPeriod("all");
                            setCurrencyFilter(undefined);
                            setTypeFilter(undefined);
                            setCurrentPage(1);
                          }}
                          className="mt-3 text-sm font-medium text-blue-700 hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Phone: one line per transaction, like the dashboard list */}
                      <ul className="divide-y divide-slate-100 lg:hidden">
                        {transactions.map((txn) => {
                          const isIn = txn.type !== "Debit";
                          return (
                            <li key={txn.id}>
                              <button
                                onClick={() => setSelectedTransaction(txn)}
                                className="flex w-full items-center gap-4 px-4 py-3.5 text-left hover:bg-slate-50"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium text-slate-900">{txn.description}</div>
                                  <div className="mt-0.5 truncate text-sm text-slate-600">
                                    {formatDate(txn.date)}, {formatTime(txn.date)} · {txn.code}
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <div className={`text-sm font-medium tabular-nums ${isIn ? "text-emerald-700" : "text-slate-900"}`}>
                                    {isIn ? "+" : "−"}
                                    {formatCurrency(txn.amount, txn.currency)}
                                  </div>
                                  <div className="mt-0.5 text-xs tabular-nums text-slate-600">
                                    Bal {formatCurrency(txn.balanceAfter, txn.currency)}
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>

                      {/* Desktop: a bank-statement table */}
                      <div className="hidden overflow-x-auto lg:block">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-600">
                              <th scope="col" className="px-5 py-3 font-medium">Date</th>
                              <th scope="col" className="px-5 py-3 font-medium">Description</th>
                              <th scope="col" className="px-5 py-3 text-right font-medium">Money in</th>
                              <th scope="col" className="px-5 py-3 text-right font-medium">Money out</th>
                              <th scope="col" className="px-5 py-3 text-right font-medium">Balance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {transactions.map((txn) => {
                              const isIn = txn.type !== "Debit";
                              const amount = formatCurrency(txn.amount, txn.currency);
                              return (
                                <tr
                                  key={txn.id}
                                  tabIndex={0}
                                  onClick={() => setSelectedTransaction(txn)}
                                  onKeyDown={(e: any) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelectedTransaction(txn))}
                                  className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                                >
                                  <td className="whitespace-nowrap px-5 py-3 align-top">
                                    <div className="text-slate-900">{formatDate(txn.date)}</div>
                                    <div className="text-xs text-slate-600">{formatTime(txn.date)}</div>
                                  </td>
                                  <td className="px-5 py-3 align-top">
                                    <div className="text-slate-900">{txn.description}</div>
                                    <div className="text-xs text-slate-600">{txn.code}</div>
                                  </td>
                                  <td className="whitespace-nowrap px-5 py-3 text-right align-top tabular-nums text-emerald-700">
                                    {isIn ? amount : ""}
                                  </td>
                                  <td className="whitespace-nowrap px-5 py-3 text-right align-top tabular-nums text-slate-900">
                                    {isIn ? "" : amount}
                                  </td>
                                  <td className="whitespace-nowrap px-5 py-3 text-right align-top font-medium tabular-nums text-slate-900">
                                    {formatCurrency(txn.balanceAfter, txn.currency)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
                          <p className="text-sm text-slate-600 tabular-nums">
                            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount.toLocaleString()}
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                              disabled={currentPage === 1}
                              aria-label="Previous page"
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <ChevronLeft className="h-4 w-4" />
                              Previous
                            </button>
                            <button
                              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                              disabled={currentPage === totalPages}
                              aria-label="Next page"
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Next
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </section>
              </motion.div>
            )}
    </>
  );
}
