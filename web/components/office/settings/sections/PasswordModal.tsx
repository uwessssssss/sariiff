"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, Eye, EyeOff, Lock, RefreshCw, X } from "lucide-react";
import { type OfficeSettingsVM } from "../useOfficeSettings";

export function PasswordModal({ vm }: { vm: OfficeSettingsVM }) {
  const { confirmPassword, generateRandomPassword, getClientName, handlePasswordSubmit, newPassword, passwordLoading, selectedClient, setConfirmPassword, setNewPassword, setShowPassword, setShowPasswordModal, showPassword, showPasswordModal } = vm;
  return (
    <AnimatePresence>
      {showPasswordModal && selectedClient && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowPasswordModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e: any) => e.stopPropagation()}
            className="bg-white shadow-2xl max-w-md w-full overflow-hidden"
          >
            <div className="bg-emerald-700 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 flex items-center justify-center">
                    <Lock className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">Set Client Password</h3>
                    <p className="text-sm text-emerald-100">
                      {getClientName(selectedClient)}
                    </p>
                  </div>
                </div>
                <button aria-label="Close"
                  onClick={() => setShowPasswordModal(false)}
                  className="p-2 hover:bg-white/20 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                <p className="text-sm text-slate-700">
                  <strong>Client Code:</strong> {selectedClient.code || "-"}
                </p>
                <p className="text-sm text-slate-700">
                  <strong>Phone:</strong>{" "}
                  {selectedClient.whatsAppNumber || "-"}
                </p>
                <p className="text-sm text-slate-700">
                  <strong>Balance KES:</strong>{" "}
                  {(selectedClient.balanceKES ?? 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </p>
                <p className="text-sm text-slate-700">
                  <strong>Balance USD:</strong>{" "}
                  {(selectedClient.balanceUSD ?? 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e: any) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-4 py-3 pr-10 border border-slate-200 focus:border-emerald-500 outline-none bg-white rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e: any) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-3 border border-slate-200 focus:border-emerald-500 outline-none bg-white rounded-lg"
                />
              </div>
              <button
                onClick={generateRandomPassword}
                className="w-full px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Generate Random Password
              </button>
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                <p className="text-xs text-amber-800">
                  <strong>⚠ Important:</strong> Make sure to share this
                  password securely with the client. They can change it after
                  their first login.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handlePasswordSubmit}
                  disabled={passwordLoading}
                  className="flex-1 px-6 py-3 bg-emerald-700 text-white font-semibold hover:shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {passwordLoading ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-5 h-5" />
                  )}
                  Set Password
                </button>
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 px-6 py-3 bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
