"use client";

import { AlertTriangle, Key, Loader2 } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { Modal } from "../helpers";
import { type SuperAdminDashboardVM } from "../useSuperAdminDashboard";

export function ResetPasswordForm({ vm }: { vm: SuperAdminDashboardVM }) {
  const { closeModal, formData, handleResetPassword, isSubmitting, modals, setFormData } = vm;
  return (
    <AnimatePresence>
      {modals.resetPassword && (
        <Modal
          onClose={() => closeModal("resetPassword")}
          title="Reset owner password"
        >
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 p-4">
              <div className="flex gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-700" />
                <p className="text-sm text-amber-700">
                  This replaces the bureau owner's sign-in password.
                </p>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                New password
              </label>
              <input
                type="password"
                value={formData.password || ""}
                onChange={(e: any) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                placeholder="Enter new password"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Confirm password
              </label>
              <input
                type="password"
                value={formData.confirmPassword || ""}
                onChange={(e: any) =>
                  setFormData({
                    ...formData,
                    confirmPassword: e.target.value,
                  })
                }
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                placeholder="Confirm password"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => closeModal("resetPassword")}
                className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={isSubmitting}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Key className="w-4 h-4" />
                )}
                Reset password
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
