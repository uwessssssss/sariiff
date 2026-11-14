"use client";

import { Activity, ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { computeCashflowByCurrency } from "../helpers";
import { type ReportsVM } from "../useReports";

export function CashFlowSummary({ vm }: { vm: ReportsVM }) {
  const { dailyReport, statistics } = vm;
  return (
    <>
      {(() => {
        const byCurrency = computeCashflowByCurrency(
          dailyReport?.transactions || [],
        );
        // Colors per currency for a little visual distinction.
        const tint: Record<
          number,
          { net: string; border: string; from: string }
        > = {
          0: {
            net: "text-emerald-700",
            border: "border-emerald-200",
            from: "bg-emerald-50",
          },
          1: {
            net: "text-blue-700",
            border: "border-blue-200",
            from: "bg-slate-50",
          },
          2: {
            net: "text-amber-700",
            border: "border-amber-200",
            from: "bg-amber-50",
          },
          3: {
            net: "text-[#0F172A]",
            border: "border-slate-200",
            from: "bg-slate-50",
          },
        };
        return (
          <div className="space-y-4">
            {byCurrency.length === 0 && (
              <div className="bg-slate-50 border border-slate-200 p-6 text-center text-slate-500 rounded-xl">
                No transaction activity for this period.
              </div>
            )}
            {byCurrency.map((c) => {
              const net = c.in - c.out;
              const t = tint[c.currency] || tint[0];
              return (
                <div key={c.currency}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      {c.code} Cash Flow
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-emerald-50 border border-emerald-200 p-6 shadow-sm rounded-xl">
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 bg-emerald-600 flex items-center justify-center">
                          <ArrowUpRight className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xs font-semibold text-emerald-700 uppercase">
                          Money In
                        </span>
                      </div>
                      <div className="text-3xl font-semibold text-emerald-700 mb-1">
                        {c.in.toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}
                      </div>
                      <div className="text-sm text-slate-600">
                        Total inflows ({c.code})
                      </div>
                    </div>
                    <div className="bg-red-50 border border-red-200 p-6 shadow-sm rounded-xl">
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 bg-red-600 flex items-center justify-center">
                          <ArrowDownRight className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xs font-semibold text-red-700 uppercase">
                          Money Out
                        </span>
                      </div>
                      <div className="text-3xl font-semibold text-red-700 mb-1">
                        {c.out.toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}
                      </div>
                      <div className="text-sm text-slate-600">
                        Total outflows ({c.code})
                      </div>
                    </div>
                    <div
                      className={` ${t.from} to-white border rounded-lg ${t.border} p-6 shadow-sm`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 bg-slate-700 flex items-center justify-center">
                          <TrendingUp className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 uppercase">
                          Net Flow
                        </span>
                      </div>
                      <div className={`text-3xl font-semibold mb-1 ${t.net}`}>
                        {net >= 0 ? "+" : ""}
                        {net.toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}
                      </div>
                      <div className="text-sm text-slate-600">
                        Inflows - Outflows ({c.code})
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Transactions count (currency-agnostic) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 border border-slate-200 p-6 shadow-sm rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-blue-600 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-[#0F172A] uppercase">
                    Transactions
                  </span>
                </div>
                <div className="text-3xl font-semibold text-[#0F172A] mb-1">
                  {statistics.totalTransactions}
                </div>
                <div className="text-sm text-slate-600">
                  Total transactions count
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
