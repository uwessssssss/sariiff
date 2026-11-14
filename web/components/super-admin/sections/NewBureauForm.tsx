"use client";

import { AnimatePresence } from "framer-motion";
import { Loader2, Plus } from "lucide-react";
import { Modal } from "../helpers";
import { type SuperAdminDashboardVM } from "../useSuperAdminDashboard";

export function NewBureauForm({ vm }: { vm: SuperAdminDashboardVM }) {
  const { closeModal, formData, handleCreateCompany, isSubmitting, modals, setFormData } = vm;
  return (
    <AnimatePresence>
      {modals.createCompany && (
        <Modal
          onClose={() => closeModal("createCompany")}
          title="Add a bureau"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Bureau name *
              </label>
              <input
                type="text"
                value={formData.name || ""}
                onChange={(e: any) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                placeholder="e.g. Kampala Road Bureau"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Owner name *
              </label>
              <input
                type="text"
                value={formData.ownerName || ""}
                onChange={(e: any) =>
                  setFormData({ ...formData, ownerName: e.target.value })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                placeholder="Owner name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                WhatsApp number *
              </label>
              <input
                type="text"
                value={formData.whatsAppNumber || ""}
                onChange={(e: any) =>
                  setFormData({ ...formData, whatsAppNumber: e.target.value })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                placeholder="+254… or +256…"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                value={formData.email || ""}
                onChange={(e: any) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                placeholder="email@company.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Password *
              </label>
              <input
                type="password"
                value={formData.password || ""}
                onChange={(e: any) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                placeholder="Min 8 characters"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Home currency *
              </label>
              <select
                value={formData.baseCurrency ?? 0}
                onChange={(e: any) =>
                  setFormData({ ...formData, baseCurrency: parseInt(e.target.value) })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              >
                <option value={0}>KES — Kenya</option>
                <option value={2}>UGX — Uganda</option>
              </select>
              <p className="mt-1.5 text-xs text-slate-500">
                Rates and profit use this currency. You can change it until the bureau starts trading.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => closeModal("createCompany")}
                className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCompany}
                disabled={isSubmitting}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Add bureau
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
