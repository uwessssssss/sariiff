"use client";

import { Ban, CheckCircle2, ChevronLeft, ChevronRight, CreditCard, Eye, Key, Plus, Search } from "lucide-react";
import { PLATFORM_CURRENCY, codeOf, compactMoney, formatCurrency, formatNumber, getStatusColor } from "../helpers";
import { type SuperAdminDashboardVM } from "../useSuperAdminDashboard";

export function CompaniesView({ vm }: { vm: SuperAdminDashboardVM }) {
  const { activeTab, baseFilter, companies, companiesPage, companyStatus, handleActivateCompany, loading, openModal, searchTerm, setBaseFilter, setCompaniesPage, setCompanyStatus, setSearchTerm, setSelectedCompanyId, viewCompanyDetails } = vm;
  if (loading) return null;
  return (
    <>
      {activeTab === "companies" && (() => {
        const rows = (companies?.items ?? []).filter(
          (c) => baseFilter === "all" || (c.baseCurrency ?? 0) === Number(baseFilter),
        );
        const total = companies?.totalCount ?? 0;
        const now = Date.now();
        const iconBtn = "rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900";
        return (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bureaus</h1>
                <p className="mt-1 text-sm text-slate-500">{total} registered on Sarif</p>
              </div>
              <button
                onClick={() => openModal("createCompany")}
                className="inline-flex h-10 items-center gap-2 self-start rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:self-auto"
              >
                <Plus className="h-4 w-4" /> Add bureau
              </button>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by name, code or owner"
                  value={searchTerm}
                  onChange={(e: any) => {
                    setSearchTerm(e.target.value);
                    setCompaniesPage(1);
                  }}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
              <select
                value={companyStatus}
                onChange={(e: any) => {
                  setCompanyStatus(e.target.value);
                  setCompaniesPage(1);
                }}
                aria-label="Subscription status"
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-600"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="expired">Expired</option>
                <option value="suspended">Suspended</option>
              </select>
              <select
                value={baseFilter}
                onChange={(e: any) => setBaseFilter(e.target.value)}
                aria-label="Home currency"
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-600"
              >
                <option value="all">All countries</option>
                <option value="0">Kenya (KES)</option>
                <option value="2">Uganda (UGX)</option>
              </select>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-sm text-slate-500">
                      <th className="px-5 py-3 font-medium">Bureau</th>
                      <th className="px-3 py-3 font-medium">Home</th>
                      <th className="px-3 py-3 font-medium">Subscription</th>
                      <th className="px-3 py-3 text-right font-medium">Clients</th>
                      <th className="px-3 py-3 font-medium">This month</th>
                      <th className="px-3 py-3 text-right font-medium">Billing</th>
                      <th className="px-5 py-3 text-right font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                          {companies ? "No bureaus match these filters." : "Couldn't load bureaus. Try Refresh."}
                        </td>
                      </tr>
                    )}
                    {rows.map((c) => {
                      const exp = c.subscriptionExpiresAt ? new Date(c.subscriptionExpiresAt).getTime() : null;
                      const days = exp !== null ? Math.round((exp - now) / 86400000) : null;
                      const vols = c.monthlyVolumeByCurrency ?? [];
                      return (
                        <tr
                          key={c.id}
                          onClick={() => viewCompanyDetails(c.id)}
                          className="cursor-pointer align-top hover:bg-slate-50"
                        >
                          <td className="px-5 py-3.5">
                            <div className="font-medium text-slate-900">{c.name}</div>
                            <div className="text-sm text-slate-500">
                              {c.code} · {c.ownerName}
                            </div>
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                              {codeOf(c.baseCurrency)}
                            </span>
                          </td>
                          <td className="px-3 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusColor(c.subscriptionStatus)}`}>
                                {c.subscriptionStatus}
                              </span>
                              <span className="text-sm text-slate-600">{c.subscriptionPlan}</span>
                            </div>
                            {days !== null && (
                              <div className={`mt-1 text-xs ${days < 0 ? "text-red-600" : days <= 7 ? "text-amber-700" : "text-slate-500"}`}>
                                {days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? "Expires today" : `Renews in ${days}d`}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3.5 text-right tabular-nums">
                            <div className="text-slate-900">{formatNumber(c.totalClients)}</div>
                            <div className="text-xs text-slate-500">{c.activeClients} active</div>
                          </td>
                          <td className="px-3 py-3.5">
                            <div className="tabular-nums text-slate-900">{formatNumber(c.monthlyTransactions)} transactions</div>
                            <div className="text-xs text-slate-500">
                              {vols.length ? vols.map((v) => compactMoney(v.amount, v.currencyCode || codeOf(v.currency))).join(" · ") : "No volume"}
                            </div>
                          </td>
                          <td className="px-3 py-3.5 text-right tabular-nums">
                            <div className="text-slate-900">{formatCurrency(c.monthlyFee, PLATFORM_CURRENCY)}/mo</div>
                            <div className="text-xs text-slate-500">{formatCurrency(c.totalPaid, PLATFORM_CURRENCY)} paid</div>
                          </td>
                          <td className="px-5 py-2.5" onClick={(e: any) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5">
                              <button onClick={() => viewCompanyDetails(c.id)} className={iconBtn} title="View details" aria-label={`View ${c.name}`}>
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedCompanyId(c.id);
                                  openModal("updateSubscription", {
                                    plan: c.subscriptionPlan,
                                    status: c.subscriptionStatus,
                                    monthlyFee: c.monthlyFee,
                                  });
                                }}
                                className={iconBtn}
                                title="Subscription"
                                aria-label={`Subscription for ${c.name}`}
                              >
                                <CreditCard className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedCompanyId(c.id);
                                  openModal("resetPassword");
                                }}
                                className={iconBtn}
                                title="Reset password"
                                aria-label={`Reset password for ${c.name}`}
                              >
                                <Key className="h-4 w-4" />
                              </button>
                              {c.isActive ? (
                                <button
                                  onClick={() => {
                                    setSelectedCompanyId(c.id);
                                    openModal("suspendCompany");
                                  }}
                                  className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                                  title="Suspend"
                                  aria-label={`Suspend ${c.name}`}
                                >
                                  <Ban className="h-4 w-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleActivateCompany(c.id)}
                                  className="rounded-md p-2 text-emerald-700 hover:bg-emerald-50"
                                  title="Reactivate"
                                  aria-label={`Reactivate ${c.name}`}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {total > 10 && (
                <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm text-slate-500">
                  <span>
                    {(companiesPage - 1) * 10 + 1}–{Math.min(companiesPage * 10, total)} of {total}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCompaniesPage((p) => Math.max(1, p - 1))}
                      disabled={companiesPage === 1}
                      className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="px-2 font-medium text-slate-900">{companiesPage}</span>
                    <button
                      onClick={() => setCompaniesPage((p) => p + 1)}
                      disabled={companiesPage * 10 >= total}
                      className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}
