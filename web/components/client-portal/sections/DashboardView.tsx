"use client";

import { Download, FileText, RefreshCw } from "lucide-react";
import { formatCurrency, formatDate, formatTime } from "../helpers";
import { motion } from "framer-motion";
import { type ClientUserDashboardVM } from "../useClientUserDashboard";

export function DashboardView({ vm }: { vm: ClientUserDashboardVM }) {
  const { activeView, alerts, balanceRows, firstName, handleDownloadStatement, handleExportCsv, handleRefresh, monthRows, profile, recentTransactions, sectionHead, setActiveView, setSelectedAlert, setSelectedTransaction, th } = vm;
  return (
    <>
      {activeView === "dashboard" && (
        <motion.div key="dashboard" className="space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Hello, {firstName}</h1>
              <p className="mt-1 text-sm text-slate-600">
                Account {profile?.code}
                {profile?.lastLoginAt && (
                  <>
                    <span className="mx-2 text-slate-600">/</span>
                    Last signed in {formatDate(profile.lastLoginAt)}
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleRefresh}
                aria-label="Refresh"
                title="Refresh"
                className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                onClick={handleExportCsv}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button
                onClick={handleDownloadStatement}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <FileText className="h-4 w-4" />
                Print statement
              </button>
            </div>
          </div>

          {/* Balances */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className={sectionHead}>
              <h2 className="text-base font-semibold text-slate-900">Your balances</h2>
              <span className="hidden text-sm text-slate-600 sm:inline">Totals since your account opened</span>
            </div>
            {balanceRows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-600">
                No balances yet. They'll appear here once your bureau records a transaction for you.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100 sm:hidden">
                  {balanceRows.map((b) => (
                    <li key={b.code} className="px-5 py-4">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-medium text-slate-700">{b.code}</span>
                        <span className={`text-lg font-semibold tabular-nums ${b.balance < 0 ? "text-red-700" : "text-slate-900"}`}>
                          {formatCurrency(b.balance, b.code)}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between text-sm tabular-nums text-slate-600">
                        <span>In {formatCurrency(b.totalIn, b.code)}</span>
                        <span>Out {formatCurrency(b.totalOut, b.code)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <table className="hidden w-full tabular-nums sm:table">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className={`${th} pl-5`}>Currency</th>
                      <th className={`${th} text-right`}>Balance</th>
                      <th className={`${th} text-right`}>Total in</th>
                      <th className={`${th} pr-5 text-right`}>Total out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balanceRows.map((b) => (
                      <tr key={b.code} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3.5 pl-5 text-sm font-medium text-slate-900">{b.code}</td>
                        <td className={`px-4 py-3.5 text-right text-lg font-semibold ${b.balance < 0 ? "text-red-700" : "text-slate-900"}`}>
                          {formatCurrency(b.balance, b.code)}
                        </td>
                        <td className="px-4 py-3.5 text-right text-sm text-emerald-700">{formatCurrency(b.totalIn, b.code)}</td>
                        <td className="px-4 py-3.5 pr-5 text-right text-sm text-red-700">{formatCurrency(b.totalOut, b.code)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {monthRows.length > 0 ? (
              <div className="flex flex-wrap gap-x-8 gap-y-1 border-t border-slate-200 bg-slate-50 px-5 py-3 text-sm tabular-nums text-slate-600">
                <span className="font-medium text-slate-700">This month</span>
                {monthRows.map((r) => (
                  <span key={r.code}>
                    {r.code} in {formatCurrency(r.in, r.code).replace(`${r.code} `, "")}, out{" "}
                    {formatCurrency(r.out, r.code).replace(`${r.code} `, "")}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {/* Recent transactions */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className={sectionHead}>
                <h2 className="text-base font-semibold text-slate-900">Recent transactions</h2>
                <button onClick={() => setActiveView("statements")} className="rounded-lg text-sm font-medium text-blue-700 hover:underline">
                  See all
                </button>
              </div>
              {recentTransactions.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-600">No transactions yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recentTransactions.slice(0, 6).map((txn) => {
                    const isOut = txn.type === "Debit";
                    return (
                      <li key={txn.id}>
                        <button
                          onClick={() => setSelectedTransaction(txn)}
                          className="rounded-lg flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-slate-50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-900">{txn.description}</div>
                            <div className="mt-0.5 truncate text-sm text-slate-600">
                              {formatDate(txn.date)}, {formatTime(txn.date)}
                              {txn.reference && <span className="ml-3">{txn.reference}</span>}
                            </div>
                          </div>
                          <div className="shrink-0 text-right tabular-nums">
                            <div className={`text-sm font-semibold ${isOut ? "text-red-700" : "text-emerald-700"}`}>
                              {isOut ? "−" : "+"}
                              {formatCurrency(txn.amount, txn.currency)}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-600">
                              Balance {formatCurrency(txn.balanceAfter, txn.currency)}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Alerts */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className={sectionHead}>
                <h2 className="text-base font-semibold text-slate-900">Alerts</h2>
                <button onClick={() => setActiveView("alerts")} className="rounded-lg text-sm font-medium text-blue-700 hover:underline">
                  See all
                </button>
              </div>
              {alerts.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-600">No alerts.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {alerts.slice(0, 4).map((alert) => (
                    <li key={alert.id}>
                      <button onClick={() => setSelectedAlert(alert)} className="rounded-lg flex w-full gap-3 px-5 py-3.5 text-left hover:bg-slate-50">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${alert.isRead ? "bg-transparent" : "bg-blue-600"}`}
                          aria-label={alert.isRead ? undefined : "Unread"}
                        />
                        <div className="min-w-0">
                          <div className={`text-sm ${alert.isRead ? "text-slate-700" : "font-semibold text-slate-900"}`}>{alert.title}</div>
                          <div className="mt-0.5 line-clamp-2 text-sm text-slate-600">{alert.message}</div>
                          <div className="mt-1 text-xs text-slate-600">{formatDate(alert.createdAt)}</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </motion.div>
      )}
    </>
  );
}
