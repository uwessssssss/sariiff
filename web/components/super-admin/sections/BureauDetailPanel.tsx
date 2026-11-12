"use client";

import { AnimatePresence } from "framer-motion";
import { Ban, CheckCircle2, CreditCard, Edit, Key, Lock } from "lucide-react";
import { Modal, PLATFORM_CURRENCY, SHAPES, codeOf, formatCurrency, getPlanColor, getStatusColor, holdingsRows, normalise, volumeLines } from "../helpers";
import { TransactionPinPanel } from "../../TransactionPinPanel";
import * as api from "@/lib/superadmin-api";
import { toast } from "sonner";
import { type SuperAdminDashboardVM } from "../useSuperAdminDashboard";

export function BureauDetailPanel({ vm }: { vm: SuperAdminDashboardVM }) {
  const { closeModal, handleActivateCompany, modals, openModal, selectedCompany, setSelectedCompany } = vm;
  return (
    <AnimatePresence>
      {modals.companyDetails && selectedCompany && (
        <Modal
          onClose={() => closeModal("companyDetails")}
          title={selectedCompany.name}
          size="xl"
        >
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1 text-sm">
                <p className="text-slate-500">
                  <span className="font-medium text-slate-700">{selectedCompany.code}</span> · Owner {selectedCompany.ownerName}
                </p>
                <p className="text-slate-500 break-all">
                  {selectedCompany.email} · {selectedCompany.whatsAppNumber}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusColor(selectedCompany.subscriptionStatus)}`}>
                  {selectedCompany.subscriptionStatus}
                </span>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${getPlanColor(selectedCompany.subscriptionPlan)}`}>
                  {selectedCompany.subscriptionPlan}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Home currency</p>
                <p className="text-xs text-slate-500">
                  {selectedCompany.canChangeBaseCurrency !== false
                    ? "Rates and profit use this currency. It can change until the bureau starts trading."
                    : "Locked because the bureau already has exchange or mobile money history."}
                </p>
              </div>
              {selectedCompany.canChangeBaseCurrency !== false ? (
                <select
                  aria-label="Home currency"
                  value={selectedCompany.baseCurrency ?? 0}
                  onChange={async (e: any) => {
                    const next = parseInt(e.target.value);
                    const res = await api.setCompanyBaseCurrency(selectedCompany.id, next);
                    if (res.success && res.data) {
                      setSelectedCompany(normalise(res.data, SHAPES.company));
                      toast.success(`Home currency set to ${codeOf(next)}. Exchange rates must be entered again.`);
                    } else {
                      toast.error(res.message || "Couldn't change the home currency");
                    }
                  }}
                  className="h-10 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                >
                  <option value={0}>KES — Kenya</option>
                  <option value={2}>UGX — Uganda</option>
                </select>
              ) : (
                <span className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-full bg-slate-100 px-3 text-sm font-medium text-slate-700 sm:self-auto">
                  <Lock className="h-3.5 w-3.5" /> {codeOf(selectedCompany.baseCurrency)}
                </span>
              )}
            </div>

            <TransactionPinPanel companyId={selectedCompany.id} companyName={selectedCompany.name} />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: "Users", value: <span className="text-2xl">{selectedCompany.totalUsers}</span> },
                { label: "Clients", value: <span className="text-2xl">{selectedCompany.totalClients}</span> },
                {
                  label: "Volume this month",
                  value: (
                    <span className="flex flex-col text-sm leading-snug">
                      {volumeLines(selectedCompany).map((l) => (
                        <span key={l} className="whitespace-nowrap">{l}</span>
                      ))}
                    </span>
                  ),
                },
                { label: `Paid to Sarif (${PLATFORM_CURRENCY})`, value: <span className="text-2xl">{formatCurrency(selectedCompany.totalPaid || 0, PLATFORM_CURRENCY)}</span> },
              ].map((t, i) => (
                <div key={t.label} className={`rounded-lg border border-slate-200 p-4 ${i >= 2 ? "col-span-2 lg:col-span-1" : ""}`}>
                  <p className="text-xs font-medium text-slate-500">{t.label}</p>
                  <div className="mt-1 font-semibold tabular-nums text-slate-900">{t.value}</div>
                </div>
              ))}
            </div>

            {/* Money held — one row per currency, home currency first.
                Mobile money is listed in each wallet's own currency. */}
            <div className="rounded-lg border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h4 className="text-sm font-semibold text-slate-900">Money held</h4>
                <span className="text-xs text-slate-500">
                  {selectedCompany.bankAccountsCount || 0} bank · {selectedCompany.mpesaAgentsCount || 0} mobile money
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500">
                      <th className="py-2 pl-4 pr-3 text-left font-medium">Currency</th>
                      <th className="px-3 py-2 whitespace-nowrap text-right font-medium">Cash</th>
                      <th className="px-3 py-2 whitespace-nowrap text-right font-medium">Bank</th>
                      <th className="px-3 py-2 whitespace-nowrap text-right font-medium">Mobile money</th>
                      <th className="px-3 py-2 whitespace-nowrap text-right font-medium">Total held</th>
                      <th className="py-2 pl-3 pr-4 whitespace-nowrap text-right font-medium">Owed to clients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdingsRows(selectedCompany).map((h) => (
                      <tr key={h.code} className="border-t border-slate-100">
                        <td className="py-2.5 pl-4 pr-3 whitespace-nowrap font-medium text-slate-900">
                          {h.code}
                          {h.isBase && (
                            <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">home</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums text-slate-700">{formatCurrency(h.cash, h.code)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums text-slate-700">{formatCurrency(h.bank, h.code)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums text-slate-700">
                          {h.isBase ? formatCurrency(h.mobile, h.code) : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">{formatCurrency(h.cash + h.bank + h.mobile, h.code)}</td>
                        <td className={`py-2.5 pl-3 pr-4 whitespace-nowrap text-right tabular-nums ${h.owed ? "text-amber-700" : "text-slate-500"}`}>{formatCurrency(h.owed, h.code)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              <button
                onClick={() => {
                  openModal("editCompany", {
                    name: selectedCompany.name,
                    ownerName: selectedCompany.ownerName,
                    email: selectedCompany.email,
                    taxId: selectedCompany.taxId,
                    website: selectedCompany.website,
                    address: selectedCompany.address,
                  });
                }}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Edit className="h-4 w-4" /> Edit details
              </button>
              <button
                onClick={() => {
                  closeModal("companyDetails");
                  openModal("updateSubscription", {
                    plan: selectedCompany.subscriptionPlan,
                    status: selectedCompany.subscriptionStatus,
                    monthlyFee: selectedCompany.monthlyFee,
                  });
                }}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <CreditCard className="h-4 w-4" /> Subscription
              </button>
              <button
                onClick={() => {
                  closeModal("companyDetails");
                  openModal("resetPassword");
                }}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Key className="h-4 w-4" /> Reset password
              </button>
              <div className="flex-1" />
              {selectedCompany.isActive ? (
                <button
                  onClick={() => {
                    closeModal("companyDetails");
                    openModal("suspendCompany");
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <Ban className="h-4 w-4" /> Suspend
                </button>
              ) : (
                <button
                  onClick={() => handleActivateCompany(selectedCompany.id)}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
                >
                  <CheckCircle2 className="h-4 w-4" /> Activate
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
