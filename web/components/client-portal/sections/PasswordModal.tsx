"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Lock, X } from "lucide-react";
import { type ClientUserDashboardVM } from "../useClientUserDashboard";

export function PasswordModal({ vm }: { vm: ClientUserDashboardVM }) {
  const { handleChangePassword, passwordForm, passwordLoading, setPasswordForm, setShowPasswordModal, showPasswordModal } = vm;
  return (
    <AnimatePresence>
      {showPasswordModal && (
        // one layer holding the panel (like every other pop-up), so it is announced as a
        // dialog, keeps focus inside, closes on Escape and can't run off a small screen
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowPasswordModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto bg-white shadow-2xl"
          >
            {/* Header */}
            <div className=" bg-blue-600   p-6 border-b border-blue-400">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lock className="w-6 h-6 text-white" />
                  <h3 className="text-xl font-semibold text-white">
                    Change Password
                  </h3>
                </div>
                <button aria-label="Close"
                  onClick={() => setShowPasswordModal(false)}
                  className="rounded-lg p-2 hover:bg-white/20 transition-all"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e: any) =>
                    setPasswordForm({
                      ...passwordForm,
                      currentPassword: e.target.value,
                    })
                  }
                  className="rounded-lg w-full px-4 py-3 border border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all font-medium"
                  placeholder="Enter current password"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e: any) =>
                    setPasswordForm({
                      ...passwordForm,
                      newPassword: e.target.value,
                    })
                  }
                  className="rounded-lg w-full px-4 py-3 border border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all font-medium"
                  placeholder="Enter new password (min 8 characters)"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e: any) =>
                    setPasswordForm({
                      ...passwordForm,
                      confirmPassword: e.target.value,
                    })
                  }
                  className="rounded-lg w-full px-4 py-3 border border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all font-medium"
                  placeholder="Confirm new password"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleChangePassword}
                  disabled={passwordLoading}
                  className="rounded-lg flex-1 flex items-center justify-center gap-2 px-4 py-3  bg-blue-600 hover:bg-blue-700  text-white font-bold  transition-all disabled:opacity-50"
                >
                  {passwordLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  {passwordLoading ? "Changing..." : "Change Password"}
                </button>
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordForm({
                      currentPassword: "",
                      newPassword: "",
                      confirmPassword: "",
                    });
                  }}
                  className="rounded-lg px-4 py-3 bg-white text-slate-700 font-bold border border-slate-300 hover:border-slate-400 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
