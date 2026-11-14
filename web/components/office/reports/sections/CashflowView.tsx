"use client";

import { CURRENCY_CODES, computeCashflowByCurrency, money, totalsLine } from "../helpers";
import { type ReportsVM } from "../useReports";

export function CashflowView({ vm }: { vm: ReportsVM }) {
  const { accountSummary, base, dailyReport, loading, reportType } = vm;
  if (loading) return null;
  return (
    <>
{reportType === "cashflow" && accountSummary && (
              <div className="p-6 space-y-6">
                {(() => {
                  const byCurrency = computeCashflowByCurrency(
                    dailyReport?.transactions || [],
                  );
                  if (byCurrency.length === 0) {
                    return (
                      <div className="p-6 bg-slate-50 border border-slate-200 text-center text-slate-500 rounded-xl">
                        No cash flow activity for this period.
                      </div>
                    );
                  }
                  return byCurrency.map((c) => {
                    const net = c.in - c.out;
                    return (
                      <div key={c.currency}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            {c.code}
                          </span>
                          <div className="flex-1 h-px bg-slate-200" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl">
                            <h4 className="text-sm font-semibold text-slate-700 uppercase mb-2">
                              Total Inflows ({c.code})
                            </h4>
                            <p className="text-3xl font-semibold text-emerald-700">
                              {c.code} {c.in.toLocaleString()}
                            </p>
                          </div>
                          <div className="p-6 bg-red-50 border border-red-200 rounded-xl">
                            <h4 className="text-sm font-semibold text-slate-700 uppercase mb-2">
                              Total Outflows ({c.code})
                            </h4>
                            <p className="text-3xl font-semibold text-red-700">
                              {c.code} {c.out.toLocaleString()}
                            </p>
                          </div>
                          <div className="p-6 bg-blue-50 border border-blue-200 rounded-xl">
                            <h4 className="text-sm font-semibold text-slate-700 uppercase mb-2">
                              Net Cash Flow ({c.code})
                            </h4>
                            <p
                              className={`text-3xl font-semibold ${
                                net >= 0 ? "text-blue-700" : "text-red-700"
                              }`}
                            >
                              {net >= 0 ? "+" : ""}
                              {c.code} {net.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}

                <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="text-lg font-semibold text-slate-900 mb-4">
                    Current Holdings
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      ...Object.entries(accountSummary.cashByCurrency).map(([c, v]) => ({ label: "Cash", c: Number(c), v })),
                      ...Object.entries(accountSummary.bankByCurrency).map(([c, v]) => ({ label: "Bank", c: Number(c), v })),
                    ]
                      .filter((h) => h.v !== 0 || h.c === base)   // the home currency even at zero (was KES for every bureau)
                      .map((h) => (
                        <div key={`${h.label}-${h.c}`} className="p-4 bg-white border border-slate-200 rounded-xl">
                          <p className="text-sm text-slate-600 mb-1">
                            {h.label} {CURRENCY_CODES[h.c]}
                          </p>
                          <p className="text-xl font-semibold text-slate-900 tabular-nums">{money(h.v, h.c)}</p>
                        </div>
                      ))}
                    <div className="p-4 bg-white border border-slate-200 rounded-xl">
                      <p className="text-sm text-slate-600 mb-1">Mobile money</p>
                      <p className="text-xl font-semibold text-[#0F172A]">
                        {totalsLine(accountSummary.mpesaByCurrency || { [base]: accountSummary.totalMpesa })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
    </>
  );
}
