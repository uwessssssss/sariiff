"use client";

import { PLATFORM_CURRENCY, compactMoney, formatNumber } from "../helpers";
import { type SuperAdminDashboardVM } from "../useSuperAdminDashboard";

export function AnalyticsView({ vm }: { vm: SuperAdminDashboardVM }) {
  const { activeTab, analytics, loading } = vm;
  if (loading) return null;
  return (
    <>
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Analytics</h1>
            <p className="mt-1 text-sm text-slate-500">How bureaus and their clients use Sarif</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl bg-white border border-slate-200 p-6">
              <p className="text-slate-500 text-sm mb-1">
                Daily active users
              </p>
              <p className="text-2xl font-semibold text-slate-900 tracking-tight">
                {formatNumber(analytics?.dailyActiveUsers || 0)}
              </p>
            </div>
            <div className="rounded-xl bg-white border border-slate-200 p-6">
              <p className="text-slate-500 text-sm mb-1">
                Weekly active users
              </p>
              <p className="text-2xl font-semibold text-slate-900 tracking-tight">
                {formatNumber(analytics?.weeklyActiveUsers || 0)}
              </p>
            </div>
            <div className="rounded-xl bg-white border border-slate-200 p-6">
              <p className="text-slate-500 text-sm mb-1">
                Monthly active users
              </p>
              <p className="text-2xl font-semibold text-slate-900 tracking-tight">
                {formatNumber(analytics?.monthlyActiveUsers || 0)}
              </p>
            </div>
            <div className="rounded-xl bg-white border border-slate-200 p-6">
              <p className="text-slate-500 text-sm mb-1">
                Avg. session
              </p>
              <p className="text-2xl font-semibold text-slate-900 tracking-tight">
                {/* 0 = not measured (a session has no end time); never show a made-up figure */}
                {analytics?.avgSessionDurationSeconds
                  ? `${Math.floor(analytics.avgSessionDurationSeconds / 60)}m`
                  : "Not measured"}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-white border border-slate-200 p-6">
            <h3 className="mb-4 text-base font-semibold text-slate-900">
              Feature usage
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {analytics?.featureUsage?.map((feature) => (
                <div
                  key={feature.feature}
                  className="rounded-xl p-4 bg-white border border-slate-200"
                >
                  <p className="text-slate-900 font-medium">
                    {feature.feature}
                  </p>
                  <p className="text-2xl font-bold text-blue-700">
                    {formatNumber(feature.totalUses)}
                  </p>
                  <p className="text-slate-500 text-sm">
                    {feature.uniqueUsers} unique users
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 6-month trends */}
          {analytics && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {[
                { title: "Users", data: analytics.userGrowth || [], fmt: (n: number) => formatNumber(n) },
                { title: "Transactions / month", data: analytics.transactionGrowth || [], fmt: (n: number) => formatNumber(n) },
                { title: `Revenue / month (${PLATFORM_CURRENCY})`, data: analytics.revenueGrowth || [], fmt: (n: number) => compactMoney(n, PLATFORM_CURRENCY) },
              ].map((chart) => {
                const max = Math.max(1, ...chart.data.map((d) => d.value));
                const last = chart.data[chart.data.length - 1]?.value ?? 0;
                const prev = chart.data[chart.data.length - 2]?.value ?? 0;
                const change = prev > 0 ? ((last - prev) / prev) * 100 : 0;
                return (
                  <section key={chart.title} className="rounded-xl border border-slate-200 bg-white p-5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-medium text-slate-500">{chart.title}</h3>
                      {prev > 0 && (
                        <span className={`text-xs font-medium ${change >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                          {change >= 0 ? "+" : ""}
                          {change.toFixed(1)}% vs last month
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{chart.fmt(last)}</div>
                    {chart.data.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-500">No history yet.</p>
                    ) : (
                      <div className="mt-4 flex h-28 items-end gap-2" role="img" aria-label={`${chart.title} over the last ${chart.data.length} months`}>
                        {chart.data.map((d, i) => (
                          <div key={d.period} className="flex flex-1 flex-col items-center gap-1.5">
                            <div
                              className={`w-full rounded-t ${i === chart.data.length - 1 ? "bg-blue-600" : "bg-slate-200"}`}
                              style={{ height: `${Math.max(4, (d.value / max) * 96)}px` }}
                              title={`${d.period}: ${chart.fmt(d.value)}`}
                            />
                            <span className="text-xs text-slate-500">{d.period}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
