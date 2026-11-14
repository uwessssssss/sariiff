"use client";

import { Activity, Building2, DollarSign, RefreshCw, Users } from "lucide-react";
import { PLATFORM_CURRENCY, daysUntil, StatCard, codeOf, compactMoney, formatCurrency, formatDate, formatNumber, getStatusColor } from "../helpers";
import { type SuperAdminDashboardVM } from "../useSuperAdminDashboard";

export function OverviewView({ vm }: { vm: SuperAdminDashboardVM }) {
  const { activeTab, dashboard, loading, openModal, refreshAll, refreshing, setActiveTab, setSelectedCompanyId, viewCompanyDetails } = vm;
  if (loading) return null;
  return (
    <>
{activeTab === "overview" && dashboard && (() => {
                  const monthly = dashboard.monthlyVolumeByCurrency || [];
                  const total = dashboard.totalVolumeByCurrency || [];
                  const totalOf = (c: number) => total.find((t) => t.currency === c)?.amount || 0;
                  const byBase = dashboard.companiesByBaseCurrency || [];
                  const statusRows = [
                    { label: "Active", n: dashboard.activeCompanies, dot: "bg-emerald-500" },
                    { label: "Trial", n: dashboard.trialCompanies, dot: "bg-blue-500" },
                    { label: "Expired", n: dashboard.expiredCompanies, dot: "bg-amber-500" },
                    { label: "Suspended", n: dashboard.suspendedCompanies, dot: "bg-red-500" },
                  ];
                  const maxStatus = Math.max(1, ...statusRows.map((r) => r.n));
                  const active = dashboard.topCompaniesByTransactions?.length
                    ? dashboard.topCompaniesByTransactions
                    : dashboard.topCompaniesByVolume || [];
                  return (
                    <div className="space-y-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Overview</h1>
                          <p className="mt-1 text-sm text-slate-500">
                            {dashboard.totalCompanies} bureaus
                            {byBase.length > 0 &&
                              ` · ${byBase.map((b) => `${b.count} ${b.currency === 2 ? "in Uganda (UGX)" : b.currency === 0 ? "in Kenya (KES)" : codeOf(b.currency)}`).join(", ")}`}
                          </p>
                        </div>
                        <button
                          onClick={refreshAll}
                          disabled={refreshing}
                          className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:self-auto"
                        >
                          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                          Refresh
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                          title="Bureaus"
                          value={dashboard.totalCompanies}
                          subValue={`${dashboard.activeCompanies} active · ${dashboard.trialCompanies} on trial`}
                          icon={Building2}
                          trend={dashboard.companiesGrowth}
                        />
                        <StatCard
                          title="Users"
                          value={formatNumber(dashboard.totalUsers)}
                          subValue={`${dashboard.activeUsersToday} signed in today`}
                          icon={Users}
                          trend={dashboard.usersGrowth}
                        />
                        <StatCard
                          title="Revenue / month"
                          value={formatCurrency(dashboard.monthlyRecurringRevenue, PLATFORM_CURRENCY)}
                          subValue={`${formatCurrency(dashboard.totalRevenue, PLATFORM_CURRENCY)} collected to date`}
                          icon={DollarSign}
                          trend={dashboard.revenueGrowth}
                        />
                        <StatCard
                          title="Transactions this month"
                          value={formatNumber(dashboard.monthlyTransactionsCount)}
                          subValue={`${formatNumber(dashboard.totalTransactionsCount)} all time`}
                          icon={Activity}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                        {/* Volume per currency — amounts in different currencies are never added */}
                        <section className="rounded-xl border border-slate-200 bg-white">
                          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                            <h2 className="text-base font-semibold text-slate-900">Volume by currency</h2>
                            <span className="text-sm text-slate-500">All bureaus</span>
                          </div>
                          {monthly.length === 0 && total.length === 0 ? (
                            <p className="px-5 py-8 text-center text-sm text-slate-500">No transactions yet.</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-100 text-left text-sm text-slate-500">
                                  <th className="px-5 py-2.5 font-medium">Currency</th>
                                  <th className="px-5 py-2.5 text-right font-medium">This month</th>
                                  <th className="px-5 py-2.5 text-right font-medium">All time</th>
                                </tr>
                              </thead>
                              <tbody>
                                {/* Every currency with volume this month OR ever: a currency with no trades
                                    this month used to vanish from the table, all-time figure included. */}
                                {[...new Set([...total, ...monthly].map((x) => x.currency))].sort((x, y) => x - y).map((cur) => {
                                  const m = monthly.find((x) => x.currency === cur) ?? total.find((x) => x.currency === cur)!;
                                  const mm = monthly.find((x) => x.currency === cur);
                                  return (
                                  <tr key={cur} className="border-b border-slate-100 last:border-0">
                                    <td className="px-5 py-3 font-medium text-slate-900">{m.currencyCode || codeOf(cur)}</td>
                                    <td className="px-5 py-3 text-right tabular-nums text-slate-900">
                                      {mm ? formatNumber(Math.round(mm.amount)) : "—"}
                                    </td>
                                    <td className="px-5 py-3 text-right tabular-nums text-slate-500">
                                      {formatNumber(Math.round(totalOf(cur)))}
                                    </td>
                                  </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </section>

                        {/* Bureau status + system */}
                        <section className="rounded-xl border border-slate-200 bg-white p-5">
                          <div className="flex items-center justify-between">
                            <h2 className="text-base font-semibold text-slate-900">Bureau status</h2>
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                                dashboard.systemStatus === "Healthy" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                              }`}
                              title={`${dashboard.errorsLast24h} errors in the last 24 hours`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${dashboard.systemStatus === "Healthy" ? "bg-emerald-500" : "bg-amber-500"}`} />
                              System {(dashboard.systemStatus || "status unknown").toLowerCase()}
                            </span>
                          </div>
                          <div className="mt-4 space-y-3">
                            {statusRows.map((r) => (
                              <div key={r.label}>
                                <div className="flex items-center justify-between text-sm">
                                  <span className="flex items-center gap-2 text-slate-700">
                                    <span className={`h-2 w-2 rounded-full ${r.dot}`} />
                                    {r.label}
                                  </span>
                                  <span className="font-semibold tabular-nums text-slate-900">{r.n}</span>
                                </div>
                                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                                  <div className={`h-1.5 rounded-full ${r.dot}`} style={{ width: `${(r.n / maxStatus) * 100}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                            <button onClick={() => setActiveTab("system")} className="rounded-lg bg-slate-50 px-3 py-2 text-left hover:bg-slate-100">
                              <div className="text-slate-500">Errors (24h)</div>
                              <div className="text-lg font-semibold text-slate-900">{dashboard.errorsLast24h}</div>
                            </button>
                            <button onClick={() => setActiveTab("security")} className="rounded-lg bg-slate-50 px-3 py-2 text-left hover:bg-slate-100">
                              <div className="text-slate-500">Open security alerts</div>
                              <div className={`text-lg font-semibold ${dashboard.securityAlertsActive ? "text-red-600" : "text-slate-900"}`}>
                                {dashboard.securityAlertsActive}
                              </div>
                            </button>
                          </div>
                        </section>
                      </div>

                      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        {/* Most active bureaus (ranked by transactions — comparable across currencies) */}
                        <section className="rounded-xl border border-slate-200 bg-white">
                          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                            <h2 className="text-base font-semibold text-slate-900">Most active bureaus</h2>
                            <span className="text-sm text-slate-500">By transactions</span>
                          </div>
                          {active.length === 0 ? (
                            <p className="px-5 py-8 text-center text-sm text-slate-500">No activity yet.</p>
                          ) : (
                            <ul className="divide-y divide-slate-100">
                              {active.map((c, i) => (
                                <li key={c.id}>
                                  <button
                                    onClick={() => viewCompanyDetails(c.id)}
                                    className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50"
                                  >
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm font-semibold text-slate-600">
                                      {i + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="truncate text-sm font-medium text-slate-900">{c.name}</span>
                                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                                          {codeOf(c.baseCurrency)}
                                        </span>
                                      </div>
                                      <div className="truncate text-sm text-slate-500">
                                        {(c.volumeByCurrency || []).map((v) => compactMoney(v.amount, v.currencyCode || codeOf(v.currency))).join(" · ") || "—"}
                                      </div>
                                    </div>
                                    <span className="shrink-0 text-right">
                                      <span className="block text-sm font-semibold tabular-nums text-slate-900">
                                        {formatNumber(c.transactionCount ?? c.value)}
                                      </span>
                                      <span className="block text-xs text-slate-500">transactions</span>
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </section>

                        {/* Subscriptions needing attention: expired first, then due soon */}
                        <section className="rounded-xl border border-slate-200 bg-white">
                          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                            <h2 className="text-base font-semibold text-slate-900">Subscriptions to follow up</h2>
                            <span className="text-sm text-slate-500">Next 30 days</span>
                          </div>
                          {dashboard.expiringSubscriptions.length === 0 ? (
                            <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing due in the next 30 days.</p>
                          ) : (
                            <ul className="divide-y divide-slate-100">
                              {dashboard.expiringSubscriptions.map((c) => {
                                const days = daysUntil(c.subscriptionExpiresAt) ?? 0;
                                const overdue = days < 0;
                                return (
                                  <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm font-medium text-slate-900">{c.name}</div>
                                      <div className={`text-sm ${overdue ? "text-red-600" : days <= 7 ? "text-amber-700" : "text-slate-500"}`}>
                                        {overdue
                                          ? `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`
                                          : days === 0
                                            ? "Expires today"
                                            : `Expires in ${days} day${days === 1 ? "" : "s"}`}
                                        {" · "}
                                        {c.subscriptionPlan}, {formatCurrency(c.monthlyFee, PLATFORM_CURRENCY)}/mo
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => {
                                        setSelectedCompanyId(c.id);
                                        openModal("updateSubscription", {
                                          plan: c.subscriptionPlan,
                                          status: c.subscriptionStatus,
                                          monthlyFee: c.monthlyFee,
                                        });
                                      }}
                                      className="h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                      Renew
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </section>
                      </div>

                      {/* Recent signups */}
                      <section className="rounded-xl border border-slate-200 bg-white">
                        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                          <h2 className="text-base font-semibold text-slate-900">Newest bureaus</h2>
                          <button onClick={() => setActiveTab("companies")} className="text-sm font-medium text-blue-700 hover:underline">
                            All bureaus
                          </button>
                        </div>
                        <ul className="divide-y divide-slate-100">
                          {dashboard.recentSignups.map((c) => (
                            <li key={c.id}>
                              <button onClick={() => viewCompanyDetails(c.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate text-sm font-medium text-slate-900">{c.name}</span>
                                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusColor(c.subscriptionStatus)}`}>
                                      {c.subscriptionStatus}
                                    </span>
                                  </div>
                                  <div className="text-sm text-slate-500">
                                    {c.code} · {c.ownerName} · {codeOf(c.baseCurrency)}
                                  </div>
                                </div>
                                <span className="shrink-0 text-sm text-slate-500">Joined {formatDate(c.createdAt)}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    </div>
                  );
                })()}
    </>
  );
}
