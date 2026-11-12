"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Copy, Download, X } from "lucide-react";
import { type ReactNode } from "react";
import { currencyCode } from "@/lib/api";
import { formatCurrency, formatDate, formatTime } from "../helpers";
import { toast } from "sonner";
import { type ClientUserDashboardVM } from "../useClientUserDashboard";

export function TransactionDetailModal({ vm }: { vm: ClientUserDashboardVM }) {
  const { handleDownloadReceipt, selectedTransaction, setSelectedTransaction } = vm;
  return (
    <AnimatePresence>
      {selectedTransaction && (() => {
        const t = selectedTransaction;
        const isIn = t.type !== "Debit";
        const code = currencyCode(t.currency);
        const rows: [string, ReactNode][] = [
          ["Date", `${formatDate(t.date)}, ${formatTime(t.date)}`],
          ["Type", isIn ? "Money in (credit)" : "Money out (debit)"],
          ["Currency", code],
        ];
        if (t.counterAccountName) rows.push([isIn ? "From" : "To", t.counterAccountName]);
        if (t.exchangeRate && t.counterAmount != null && t.counterCurrency != null)
          rows.push([
            "Exchange",
            `${formatCurrency(t.counterAmount, t.counterCurrency)} at ${t.exchangeRate.toLocaleString(undefined, { maximumFractionDigits: 6 })}`,
          ]);
        rows.push(["Balance before", formatCurrency(t.balanceBefore, t.currency)]);
        rows.push(["Balance after", formatCurrency(t.balanceAfter, t.currency)]);
        const details = [
          `${t.description}`,
          `${isIn ? "Money in" : "Money out"}: ${formatCurrency(t.amount, t.currency)}`,
          `Date: ${formatDate(t.date)}, ${formatTime(t.date)}`,
          `Transaction: ${t.code}`,
          t.reference && t.reference !== t.code ? `Reference: ${t.reference}` : "",
        ].filter(Boolean).join("\n");
        return (
          <>
            <motion.div
              key="txn-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 bg-slate-900/40"
              onClick={() => setSelectedTransaction(null)}
            />
            <motion.div
              key="txn-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="txn-title"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              onKeyDown={(e: any) => e.key === "Escape" && setSelectedTransaction(null)}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border sm:border-slate-200"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div className="min-w-0">
                  <h2 id="txn-title" className="truncate text-base font-semibold text-slate-900">{t.description}</h2>
                  <p className="mt-0.5 text-sm text-slate-600">{t.code}</p>
                </div>
                <button
                  autoFocus
                  aria-label="Close"
                  onClick={() => setSelectedTransaction(null)}
                  className="-mr-1.5 rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Amount */}
              <div className="px-5 pb-2 pt-5">
                <p className="text-sm text-slate-600">{isIn ? "Money in" : "Money out"}</p>
                <p className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums ${isIn ? "text-emerald-700" : "text-slate-900"}`}>
                  {isIn ? "+" : "−"}
                  {formatCurrency(t.amount, t.currency)}
                </p>
              </div>

              {/* Details */}
              <dl className="divide-y divide-slate-100 px-5">
                {rows.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-6 py-2.5 text-sm">
                    <dt className="shrink-0 text-slate-600">{label}</dt>
                    <dd className="text-right tabular-nums text-slate-900">{value}</dd>
                  </div>
                ))}
                {t.reference && t.reference !== t.code && (
                  <div className="flex items-baseline justify-between gap-6 py-2.5 text-sm">
                    <dt className="shrink-0 text-slate-600">Reference</dt>
                    <dd className="flex min-w-0 items-center gap-2 text-slate-900">
                      <span className="truncate font-mono text-sm">{t.reference}</span>
                      <button
                        aria-label="Copy reference"
                        onClick={() => {
                          navigator.clipboard.writeText(t.reference);
                          toast.success("Reference copied");
                        }}
                        className="rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </dd>
                  </div>
                )}
                {t.notes && (
                  <div className="py-2.5 text-sm">
                    <dt className="text-slate-600">Notes</dt>
                    <dd className="mt-1 whitespace-pre-line text-slate-900">{t.notes}</dd>
                  </div>
                )}
              </dl>

              {/* Actions */}
              <div className="flex gap-2 border-t border-slate-200 px-5 py-4">
                <button
                  onClick={() => handleDownloadReceipt(t.id, t.code)}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" />
                  Download receipt
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(details);
                    toast.success("Details copied");
                  }}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-4 w-4" />
                  Copy details
                </button>
              </div>
            </motion.div>
          </>
        );
      })()}
    </AnimatePresence>
  );
}
