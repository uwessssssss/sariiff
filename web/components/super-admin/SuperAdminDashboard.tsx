"use client";

import { AlertTriangle, Ban, CheckCircle2, Loader2, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Modal, SuperAdminDashboardProps, TabBoundary } from "./helpers";
import { SarifMark } from "../SarifMark";
import { useSuperAdminDashboard } from "./useSuperAdminDashboard";
import { OverviewView } from "./sections/OverviewView";
import { CompaniesView } from "./sections/CompaniesView";
import { SecurityView } from "./sections/SecurityView";
import { FinancialView } from "./sections/FinancialView";
import { AnalyticsView } from "./sections/AnalyticsView";
import { AuditView } from "./sections/AuditView";
import { SystemView } from "./sections/SystemView";
import { BureauDetailPanel } from "./sections/BureauDetailPanel";
import { EditBureauForm } from "./sections/EditBureauForm";
import { SubscriptionForm } from "./sections/SubscriptionForm";
import { ResetPasswordForm } from "./sections/ResetPasswordForm";
import { NewBureauForm } from "./sections/NewBureauForm";
import { RecordPaymentForm } from "./sections/RecordPaymentForm";

export function SuperAdminDashboard({
  userName = "Super Admin",
  onLogout,
  activeTab: initialTab = "overview",
}: SuperAdminDashboardProps) {
  const vm = useSuperAdminDashboard({ userName, onLogout, activeTab: initialTab });
  const { SidebarBody, activeLabel, activeTab, analytics, closeModal, dashboard, financial, formData, handleAddWhitelist, handleBlockIP, handleLogout, handleResolveAlert, handleSuspendCompany, isSubmitting, loading, mobileMenuOpen, modals, refreshAll, security, setFormData, setMobileMenuOpen, setSidebarOpen, sidebarOpen, systemHealth } = vm;

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      {/* Sidebar (desktop) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden bg-[#0F172A] transition-[width] duration-200 lg:block ${
          sidebarOpen ? "w-60" : "w-[72px]"
        }`}
      >
        <SidebarBody compact={!sidebarOpen} />
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="absolute -right-3 top-[52px] flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm hover:text-slate-900"
        >
          {sidebarOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-3 lg:hidden">
        <div className="flex items-center gap-2">
          <button onClick={() => setMobileMenuOpen(true)} aria-label="Open menu" className="rounded-md p-2 text-slate-700 hover:bg-slate-100">
            <Menu className="h-5 w-5" />
          </button>
          <SarifMark size={26} />
          <span className="text-base font-semibold text-slate-900">Sarif admin</span>
        </div>
        <span className="text-sm text-slate-500">{activeLabel}</span>
      </header>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-50 lg:hidden ${mobileMenuOpen ? "" : "pointer-events-none"}`} aria-hidden={!mobileMenuOpen}>
        <div
          onClick={() => setMobileMenuOpen(false)}
          className={`absolute inset-0 bg-slate-900/50 transition-opacity ${mobileMenuOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-72 bg-[#0F172A] shadow-xl transition-transform duration-200 ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarBody compact={false} onClose={() => setMobileMenuOpen(false)} />
        </aside>
      </div>

      {/* Content */}
      <div className={`transition-[padding] duration-200 ${sidebarOpen ? "lg:pl-60" : "lg:pl-[72px]"}`}>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <TabBoundary key={activeTab} onRetry={refreshAll}>
                {() => (<>
                {(() => {
                  const src: any =
                    activeTab === "overview" ? dashboard :
                    activeTab === "security" ? security :
                    activeTab === "financial" ? financial :
                    activeTab === "analytics" ? analytics :
                    activeTab === "system" ? systemHealth : null;
                  return src?.__partial ? (
                    <div role="status" className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <p>
                        Some figures on this page didn&apos;t come back from the server and are shown as 0.
                        <button onClick={refreshAll} className="ml-1 font-medium underline underline-offset-2">Reload</button>
                      </p>
                    </div>
                  ) : null;
                })()}
                {/* OVERVIEW TAB */}
                <OverviewView vm={vm} />

                {/* COMPANIES TAB */}
                <CompaniesView vm={vm} />

                {/* SECURITY TAB */}
                <SecurityView vm={vm} />

                {/* FINANCIAL TAB */}
                <FinancialView vm={vm} />

                {/* ANALYTICS TAB */}
                <AnalyticsView vm={vm} />

                {/* AUDIT TAB */}
                <AuditView vm={vm} />

                {/* SYSTEM TAB */}
                <SystemView vm={vm} />
                </>)}
                </TabBoundary>
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      {/* ==================== MODALS ==================== */}

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {modals.logout && (
          <Modal onClose={() => closeModal("logout")} title="Log out?">
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-red-50 border border-red-200">
                <div className="w-12 h-12 bg-red-50 flex items-center justify-center">
                  <LogOut className="w-6 h-6 text-red-700" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    Log out of the platform console?
                  </p>
                  <p className="text-sm text-slate-600">
                    You'll need to sign in again to manage bureaus.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => closeModal("logout")}
                  className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Company Details Modal */}
      <BureauDetailPanel vm={vm} />

      {/* Edit Company Modal */}
      <EditBureauForm vm={vm} />

      {/* Update Subscription Modal - FIXED with status field */}
      <SubscriptionForm vm={vm} />

      {/* Reset Password Modal */}
      <ResetPasswordForm vm={vm} />

      {/* Suspend Company Modal */}
      <AnimatePresence>
        {modals.suspendCompany && (
          <Modal
            onClose={() => closeModal("suspendCompany")}
            title="Suspend bureau"
          >
            <div className="space-y-4">
              <p className="text-slate-500">
                Suspend this bureau? Its staff and clients lose access
                immediately, and their data is kept.
              </p>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Reason for suspension
                </label>
                <textarea
                  value={formData.reason || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, reason: e.target.value })
                  }
                  className="py-2 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  rows={3}
                  placeholder="Enter reason..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => closeModal("suspendCompany")}
                  className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSuspendCompany}
                  disabled={isSubmitting}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Ban className="w-4 h-4" />
                  )}
                  Suspend
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Create Company Modal */}
      <NewBureauForm vm={vm} />

      {/* Block IP Modal */}
      <AnimatePresence>
        {modals.blockIP && (
          <Modal onClose={() => closeModal("blockIP")} title="Block an address">
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  IP address *
                </label>
                <input
                  type="text"
                  value={formData.ipAddress || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, ipAddress: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  placeholder="192.168.1.1"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Reason *
                </label>
                <textarea
                  value={formData.reason || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, reason: e.target.value })
                  }
                  className="py-2 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  rows={2}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Block until (optional)
                </label>
                <input
                  type="datetime-local"
                  value={formData.blockUntil || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, blockUntil: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => closeModal("blockIP")}
                  className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBlockIP}
                  disabled={isSubmitting}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Ban className="w-4 h-4" />
                  )}
                  Block IP
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Add Whitelist Modal */}
      <AnimatePresence>
        {modals.addWhitelist && (
          <Modal
            onClose={() => closeModal("addWhitelist")}
            title="Allow an address"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  IP address *
                </label>
                <input
                  type="text"
                  value={formData.ipAddress || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, ipAddress: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  placeholder="192.168.1.1"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  placeholder="Office IP"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => closeModal("addWhitelist")}
                  className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddWhitelist}
                  disabled={isSubmitting}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Add
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Record Payment Modal */}
      <RecordPaymentForm vm={vm} />

      {/* Resolve Alert Modal */}
      <AnimatePresence>
        {modals.resolveAlert && (
          <Modal
            onClose={() => closeModal("resolveAlert")}
            title="Resolve alert"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Resolution notes
                </label>
                <textarea
                  value={formData.notes || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  className="py-2 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  rows={3}
                  placeholder="How was this resolved..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => closeModal("resolveAlert")}
                  className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResolveAlert}
                  disabled={isSubmitting}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Resolve
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SuperAdminDashboard;
