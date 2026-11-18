"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ClientType, currencyCode, unlinkClientPhoneLogin } from "@/lib/api";
import { AlertTriangle, Bell, Clock, Hash, Loader2, Mail, Phone, RefreshCw, Trash2, User, UserCheck, Wallet, X } from "lucide-react";
import { clientCurrencyLines } from "../helpers";
import { toast } from "sonner";
import { type ClientManagementVM } from "../useClientManagement";
import { BalanceAlertsPanel } from "./BalanceAlertsPanel";

const inputClass =
  "rounded-lg w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all";

export function EditModal({ vm }: { vm: ClientManagementVM }) {
  const { allowedCurrencies, editFormData, fetchClients, handleUpdateClient, homeCurrency, isSubmitting, samples, selectedClient, setEditFormData, setSelectedClient, setShowConvertModal, setShowDeleteConfirm, setShowEditModal, showEditModal } = vm;
  const [tab, setTab] = useState<"details" | "alerts">("details");
  const open = !!(showEditModal && selectedClient);
  useEffect(() => { if (open) setTab("details"); }, [open, selectedClient?.id]);
  // Escape closes, as on every other office dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowEditModal(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setShowEditModal]);

  if (!selectedClient) return <AnimatePresence />;
  const set = (field: string, value: unknown) => setEditFormData({ ...editFormData, [field]: value });
  const original = {
    fullName: selectedClient.fullName || "",
    whatsAppNumber: selectedClient.whatsAppNumber || "",
    email: selectedClient.email || "",
    idPassport: selectedClient.idPassport || "",
    isActive: selectedClient.isActive !== false,
  };
  const changed = (Object.keys(original) as (keyof typeof original)[]).filter((k) => (editFormData as any)[k] !== original[k]);
  const numberChanged = (editFormData.whatsAppNumber || "").trim() !== original.whatsAppNumber;
  const nameMissing = !(editFormData.fullName || "").trim();
  const numberMissing = !(editFormData.whatsAppNumber || "").trim();
  const canSave = changed.length > 0 && !nameMissing && !numberMissing && !isSubmitting;

  // Currencies a balance alert can watch: home first, then the others this bureau may hold.
  const alertCurrencies = [homeCurrency, ...(allowedCurrencies as number[]).filter((c) => c !== homeCurrency)];

  const lines = clientCurrencyLines(selectedClient);
  if (!lines.some((l) => l.currency === homeCurrency))
    lines.unshift({ currency: homeCurrency, code: currencyCode(homeCurrency), moneyIn: 0, moneyOut: 0, balance: 0 });
  lines.sort((a, b) => (a.currency === homeCurrency ? -1 : b.currency === homeCurrency ? 1 : a.currency - b.currency));

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60]" role="dialog" aria-modal="true" aria-labelledby="edit-client-title">
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            className="bg-white shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col rounded-2xl"
          >
            {/* Header */}
            <div className="bg-blue-600 px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="edit-client-title" className="text-lg font-semibold text-white truncate">{selectedClient.fullName}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-800 rounded-md text-xs font-semibold text-white">
                      <Hash className="w-3 h-3" />{selectedClient.code}
                    </span>
                    {selectedClient.clientType === ClientType.Permanent ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-700 rounded-md text-xs font-semibold text-white"><UserCheck className="w-3 h-3" />Permanent</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-700 rounded-md text-xs font-semibold text-white"><Clock className="w-3 h-3" />Temporary</span>
                    )}
                    {selectedClient.isActive === false && (
                      <span className="px-2 py-0.5 bg-slate-800 rounded-md text-xs font-semibold text-white">Inactive</span>
                    )}
                  </div>
                </div>
                <button type="button" aria-label="Close" onClick={() => setShowEditModal(false)} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Balances: home currency first, then every other currency the client holds */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200">
              <div className="flex gap-3 overflow-x-auto">
                {lines.map((l) => (
                  <div key={l.currency} className={`min-w-[9rem] flex-1 rounded-xl bg-white px-3 py-2 border ${l.currency === homeCurrency ? "border-blue-200" : "border-slate-200"}`}>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                      <Wallet className="w-3.5 h-3.5 text-blue-600" />{l.code}{l.currency === homeCurrency ? " · home" : ""}
                    </div>
                    <p className={`text-base font-semibold tabular-nums ${l.balance >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {l.balance < 0 ? "−" : ""}{l.code} {Math.abs(l.balance).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div role="tablist" aria-label="Edit client" className="flex gap-1 border-b border-slate-200 px-6">
              {([["details", "Details", User], ["alerts", "Balance alerts", Bell]] as const).map(([key, label, Icon]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                  className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                  <Icon className="w-4 h-4" />{label}
                </button>
              ))}
            </div>

            <div className="px-6 py-5 overflow-y-auto flex-1">
              {tab === "alerts" ? (
                <BalanceAlertsPanel clientId={selectedClient.id} clientName={selectedClient.fullName} currencies={alertCurrencies} homeCurrency={homeCurrency} />
              ) : (
                <form id="edit-client-form" onSubmit={(e) => { if (!canSave) { e.preventDefault(); return; } handleUpdateClient(e); }} className="space-y-4" noValidate>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="edit-fullName" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700"><User className="w-4 h-4 text-slate-500" />Full name</label>
                      <input id="edit-fullName" type="text" value={editFormData.fullName ?? ""} onChange={(e) => set("fullName", e.target.value)}
                        aria-invalid={nameMissing} className={`${inputClass} ${nameMissing ? "border-red-400" : ""}`} />
                      {nameMissing && <p className="mt-1 text-xs text-red-600">A name is required</p>}
                    </div>
                    <div>
                      <label htmlFor="edit-whatsApp" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700"><Phone className="w-4 h-4 text-slate-500" />WhatsApp number</label>
                      <input id="edit-whatsApp" type="tel" value={editFormData.whatsAppNumber ?? ""} onChange={(e) => set("whatsAppNumber", e.target.value)}
                        placeholder={samples.phoneCompact} aria-invalid={numberMissing} className={`${inputClass} ${numberMissing ? "border-red-400" : ""}`} />
                      {numberMissing && <p className="mt-1 text-xs text-red-600">A WhatsApp number is required</p>}
                    </div>
                    <div>
                      <label htmlFor="edit-email" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700"><Mail className="w-4 h-4 text-slate-500" />Email <span className="font-normal text-slate-500">(optional)</span></label>
                      <input id="edit-email" type="email" value={editFormData.email ?? ""} onChange={(e) => set("email", e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="edit-idPassport" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700"><Hash className="w-4 h-4 text-slate-500" />ID / Passport <span className="font-normal text-slate-500">(optional)</span></label>
                      <input id="edit-idPassport" type="text" value={editFormData.idPassport ?? ""} onChange={(e) => set("idPassport", e.target.value)} className={inputClass} />
                    </div>
                  </div>

                  {numberChanged && !numberMissing && selectedClient.phoneLoginLinked && (
                    <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Saving a new number unlinks the phone login and signs the client out of it. They link again from the new number.
                    </div>
                  )}

                  {/* Active: the server signs a deactivated client out at once */}
                  <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Active</p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {editFormData.isActive !== false
                          ? "The client can sign in and you can post to this account."
                          : "Inactive: the client is signed out and cannot sign in, and new postings to this account are refused. Balances and history stay."}
                      </p>
                    </div>
                    <button type="button" role="switch" aria-checked={editFormData.isActive !== false} aria-label="Active"
                      onClick={() => set("isActive", editFormData.isActive === false)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${editFormData.isActive !== false ? "bg-emerald-600" : "bg-slate-300"}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${editFormData.isActive !== false ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                  </div>

                  {/* Phone login (one login, several bureaus): the office can cut the link, e.g. a lost phone */}
                  {selectedClient.phoneLoginLinked && (
                    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">Phone login: linked</h4>
                        <p className="mt-0.5 text-xs text-slate-600">
                          This client can open this account with a code sent to {selectedClient.whatsAppNumber}.
                          Unlink if the phone is lost or changed hands. Balances and history stay.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(`Unlink phone login for ${selectedClient.fullName}? They can still sign in with code and password.`)) return;
                          const r = await unlinkClientPhoneLogin(selectedClient.id);
                          if (!r.success) { toast.error(r.message || "Couldn't unlink"); return; }
                          toast.success("Phone login unlinked");
                          setSelectedClient({ ...selectedClient, phoneLoginLinked: false });
                          fetchClients();
                        }}
                        className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Unlink
                      </button>
                    </div>
                  )}

                  {/* Convert to Permanent (for Temporary clients) */}
                  {selectedClient.clientType === ClientType.Temporary && (
                    <div className="flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">Temporary client</h4>
                        <p className="mt-0.5 text-xs text-slate-600">Convert to permanent to give this client a sign-in to the client portal.</p>
                      </div>
                      <button type="button" onClick={() => { setShowEditModal(false); setShowConvertModal(true); }}
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                        <RefreshCw className="w-3.5 h-3.5" />Convert to permanent
                      </button>
                    </div>
                  )}
                </form>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => { setShowEditModal(false); setShowDeleteConfirm(true); }}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">
                <Trash2 className="w-4 h-4" />Delete client
              </button>
              <div className="ml-auto flex gap-3">
                <button type="button" onClick={() => setShowEditModal(false)}
                  className="rounded-lg px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 font-semibold text-slate-700">
                  {tab === "alerts" || changed.length === 0 ? "Close" : "Cancel"}
                </button>
                {tab === "details" && (
                  <button type="submit" form="edit-client-form" disabled={!canSave}
                    className="rounded-lg px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2">
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isSubmitting ? "Saving…" : changed.length ? "Save changes" : "No changes"}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
