"use client";

import { AlertTriangle, CheckCircle2, DollarSign, Plus, TrendingUp } from "lucide-react";
import { PLATFORM_CURRENCY, daysUntil, StatCard, codeOf, formatCurrency, formatDate, formatNumber } from "../helpers";
import { type SuperAdminDashboardVM } from "../useSuperAdminDashboard";

export function FinancialView({ vm }: { vm: SuperAdminDashboardVM }) {
  const { activeTab, dashboard, financial, formData, loading, openModal, payments, setFormData } = vm;
  if (loading) return null;
  return (
    <>
{activeTab === "financial" && (() => {
                  const f = financial;
                  const monthly = f?.monthlyVolumeByCurrency ?? [];
                  const total = f?.totalVolumeByCurrency ?? [];
                  const totalOf = (c: number) => total.find((t) => t.currency === c)?.amount || 0;
                  const plans = f?.revenueByPlan ?? [];
                  const maxPlan = Math.max(1, ...plans.map((p) => p.revenue));
                  const followUps = dashboard?.expiringSubscriptions ?? [];
                  return (
                    <div className="space-y-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Financial</h1>
                          <p className="mt-1 text-sm text-slate-500">
                            Subscription revenue is in {PLATFORM_CURRENCY}. Bureau volume is shown per currency.
                          </p>
                        </div>
                        <button
                          onClick={() => openModal("recordPayment")}
                          className="inline-flex h-10 items-center gap-2 self-start rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:self-auto"
                        >
                          <Plus className="h-4 w-4" /> Record payment
                        </button>
                      </div>

                      {!f ? (
                        <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
                          Couldn&apos;t load financial data. Try Refresh.
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <StatCard title="Revenue / month" value={formatCurrency(f.monthlyRevenue, PLATFORM_CURRENCY)} icon={DollarSign} trend={f.revenueGrowth} subValue="From active subscriptions" />
                            <StatCard title="This year" value={formatCurrency(f.yearlyRevenue, PLATFORM_CURRENCY)} icon={TrendingUp} />
                            <StatCard title="Collected to date" value={formatCurrency(f.totalRevenue, PLATFORM_CURRENCY)} icon={CheckCircle2} />
                            <StatCard
                              title="Overdue"
                              value={<span className={f.pendingPayments > 0 ? "text-red-600" : ""}>{formatCurrency(f.pendingPayments, PLATFORM_CURRENCY)}</span>}
                              icon={AlertTriangle}
                              subValue="Fees of lapsed subscriptions"
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <section className="rounded-xl border border-slate-200 bg-white p-5">
                              <h2 className="text-base font-semibold text-slate-900">Revenue by plan</h2>
                              <div className="mt-4 space-y-4">
                                {plans.map((p) => (
                                  <div key={p.plan}>
                                    <div className="flex items-baseline justify-between gap-3 text-sm">
                                      <span className="font-medium text-slate-900">
                                        {p.plan}{" "}
                                        <span className="font-normal text-slate-500">
                                          · {p.companyCount} {p.companyCount === 1 ? "bureau" : "bureaus"}
                                        </span>
                                      </span>
                                      <span className="tabular-nums text-slate-900">{formatCurrency(p.revenue, PLATFORM_CURRENCY)}</span>
                                    </div>
                                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                                      <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${(p.revenue / maxPlan) * 100}%` }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>

                            <section className="rounded-xl border border-slate-200 bg-white">
                              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                                <h2 className="text-base font-semibold text-slate-900">Bureau volume by currency</h2>
                                <span className="text-sm text-slate-500">
                                  {(f.transactionsByType ?? []).reduce((n, t) => n + t.count, 0).toLocaleString()} transactions
                                </span>
                              </div>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-slate-100 text-left text-sm text-slate-500">
                                    <th className="px-5 py-2.5 font-medium">Currency</th>
                                    <th className="px-5 py-2.5 text-right font-medium">This month</th>
                                    <th className="px-5 py-2.5 text-right font-medium">All time</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* Every currency with any volume, this month or ever. (It listed only
                                      this month's currencies, so one with no trades this month vanished.) */}
                                  {[...new Set([...total, ...monthly].map((m) => m.currency))].sort((a, b) => a - b).map((cur) => {
                                    const m = monthly.find((x) => x.currency === cur);
                                    return (
                                    <tr key={cur} className="border-b border-slate-100 last:border-0">
                                      <td className="px-5 py-3 font-medium text-slate-900">{codeOf(cur)}</td>
                                      <td className="px-5 py-3 text-right tabular-nums text-slate-900">
                                        {m ? formatNumber(Math.round(m.amount)) : "—"}
                                      </td>
                                      <td className="px-5 py-3 text-right tabular-nums text-slate-500">{formatNumber(Math.round(totalOf(cur)))}</td>
                                    </tr>
                                    );
                                  })}
                                  {monthly.length === 0 && total.length === 0 && (
                                    <tr>
                                      <td colSpan={3} className="px-5 py-8 text-center text-slate-500">
                                        No transactions yet.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                              {(f.transactionsByType ?? []).length > 0 && (
                                <div className="flex gap-6 border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
                                  {f.transactionsByType.map((t) => (
                                    <span key={t.type}>
                                      {t.type}: <span className="font-medium tabular-nums text-slate-900">{t.count.toLocaleString()}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </section>
                          </div>
                        </>
                      )}

                      {followUps.length > 0 && (
                        <section className="rounded-xl border border-slate-200 bg-white">
                          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                            <h2 className="text-base font-semibold text-slate-900">Subscriptions to follow up</h2>
                            <span className="text-sm text-slate-500">Overdue first</span>
                          </div>
                          <ul className="divide-y divide-slate-100">
                            {followUps.map((c) => {
                              const days = daysUntil(c.subscriptionExpiresAt) ?? 0;
                              return (
                                <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium text-slate-900">{c.name}</div>
                                    <div className={`text-sm ${days < 0 ? "text-red-600" : days <= 7 ? "text-amber-700" : "text-slate-500"}`}>
                                      {days < 0 ? `Expired ${Math.abs(days)} days ago` : days === 0 ? "Expires today" : `Expires in ${days} days`}
                                      {" · "}
                                      {formatCurrency(c.monthlyFee || 0, PLATFORM_CURRENCY)}/mo
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setFormData({ ...formData, companyId: c.id, amount: String(c.monthlyFee || "") });
                                      openModal("recordPayment");
                                    }}
                                    className="h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    Record payment
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      )}

                      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="border-b border-slate-200 px-5 py-4">
                          <h2 className="text-base font-semibold text-slate-900">Recent payments</h2>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-left text-sm text-slate-500">
                                <th className="px-5 py-2.5 font-medium">Date</th>
                                <th className="px-3 py-2.5 font-medium">Bureau</th>
                                <th className="px-3 py-2.5 font-medium">Method</th>
                                <th className="px-3 py-2.5 font-medium">Reference</th>
                                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                                <th className="px-5 py-2.5 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(payments?.items ?? []).length === 0 && (
                                <tr>
                                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                                    No payments recorded yet.
                                  </td>
                                </tr>
                              )}
                              {(payments?.items ?? []).map((p) => (
                                <tr key={p.id}>
                                  <td className="whitespace-nowrap px-5 py-3 text-slate-700">{p.paidAt ? formatDate(p.paidAt) : "—"}</td>
                                  <td className="px-3 py-3 text-slate-900">{p.companyName}</td>
                                  <td className="px-3 py-3 text-slate-600">{p.paymentMethod}</td>
                                  <td className="px-3 py-3 font-mono text-sm text-slate-500">{p.reference || "—"}</td>
                                  <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">
                                    {formatCurrency(p.amount, p.currency || PLATFORM_CURRENCY)}
                                  </td>
                                  <td className="px-5 py-3">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                        p.status === "Completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                                      }`}
                                    >
                                      {p.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </div>
                  );
                })()}
    </>
  );
}
