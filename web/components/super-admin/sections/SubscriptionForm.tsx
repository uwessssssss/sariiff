"use client";

import { AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Modal, PLATFORM_CURRENCY } from "../helpers";
import { type SuperAdminDashboardVM } from "../useSuperAdminDashboard";

export function SubscriptionForm({ vm }: { vm: SuperAdminDashboardVM }) {
  const { closeModal, formData, handleUpdateSubscription, isSubmitting, modals, setFormData } = vm;
  return (
    <AnimatePresence>
      {modals.updateSubscription && (
        <Modal
          onClose={() => closeModal("updateSubscription")}
          title="Subscription"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Plan
              </label>
              <select
                value={formData.plan || ""}
                onChange={(e: any) =>
                  setFormData({ ...formData, plan: e.target.value })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              >
                <option value="Free">Free</option>
                <option value="Starter">Starter</option>
                <option value="Professional">Professional</option>
                <option value="Enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Status
              </label>
              <select
                value={formData.status || ""}
                onChange={(e: any) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              >
                <option value="Active">Active</option>
                <option value="Trial">Trial</option>
                <option value="Expired">Expired</option>
                <option value="Suspended">Suspended</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Monthly fee ({PLATFORM_CURRENCY})
              </label>
              <input
                type="number"
                value={formData.monthlyFee || ""}
                onChange={(e: any) =>
                  setFormData({ ...formData, monthlyFee: e.target.value })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                placeholder="0"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Expires on
              </label>
              <input
                type="date"
                value={formData.expiresAt || ""}
                onChange={(e: any) =>
                  setFormData({ ...formData, expiresAt: e.target.value })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => closeModal("updateSubscription")}
                className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateSubscription}
                disabled={isSubmitting}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Save subscription
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
