"use client";

import { AnimatePresence } from "framer-motion";
import { DollarSign, Loader2 } from "lucide-react";
import { Modal, PLATFORM_CURRENCY } from "../helpers";
import { type SuperAdminDashboardVM } from "../useSuperAdminDashboard";

export function RecordPaymentForm({ vm }: { vm: SuperAdminDashboardVM }) {
  const { closeModal, dashboard, formData, handleRecordPayment, isSubmitting, modals, setFormData } = vm;
  return (
    <AnimatePresence>
      {modals.recordPayment && (
        <Modal
          onClose={() => closeModal("recordPayment")}
          title="Record a payment"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Bureau *
              </label>
              <select
                value={formData.companyId || ""}
                onChange={(e: any) =>
                  setFormData({ ...formData, companyId: e.target.value })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              >
                <option value="">Select company...</option>
                {dashboard?.companies?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Amount *
                </label>
                <input
                  type="number"
                  value={formData.amount || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Currency
                </label>
                {/* Every bureau — Ugandan ones too — is billed in KES. */}
                <div className="flex h-10 w-full items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">
                  {PLATFORM_CURRENCY}
                  <span className="ml-2 text-xs font-normal text-slate-500">all bureaus are billed in {PLATFORM_CURRENCY}</span>
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Payment method
              </label>
              <select
                value={formData.paymentMethod || "M-Pesa"}
                onChange={(e: any) =>
                  setFormData({ ...formData, paymentMethod: e.target.value })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              >
                <option value="M-Pesa">M-Pesa</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Reference
              </label>
              <input
                type="text"
                value={formData.reference || ""}
                onChange={(e: any) =>
                  setFormData({ ...formData, reference: e.target.value })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                placeholder="Transaction ref"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => closeModal("recordPayment")}
                className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={isSubmitting}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <DollarSign className="w-4 h-4" />
                )}
                Record payment
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
