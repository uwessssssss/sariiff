"use client";

import { AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Modal } from "../helpers";
import { type SuperAdminDashboardVM } from "../useSuperAdminDashboard";

export function EditBureauForm({ vm }: { vm: SuperAdminDashboardVM }) {
  const { closeModal, formData, handleEditCompany, isSubmitting, modals, setFormData } = vm;
  return (
    <AnimatePresence>
      {modals.editCompany && (
        <Modal
          onClose={() => closeModal("editCompany")}
          title="Edit bureau details"
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
                />
              </div>
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
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Tax ID
                </label>
                <input
                  type="text"
                  value={formData.taxId || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, taxId: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Website
                </label>
                <input
                  type="url"
                  value={formData.website || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, website: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Address
              </label>
              <textarea
                value={formData.address || ""}
                onChange={(e: any) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                className="py-2 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                rows={2}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => closeModal("editCompany")}
                className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditCompany}
                disabled={isSubmitting}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Save changes
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
