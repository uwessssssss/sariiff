"use client";

import { AnimatePresence } from "framer-motion";
import { Menu, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { OfficeUserDashboardProps, TransactionForm } from "./helpers";
import { SarifMark } from "@/components/SarifMark";
import { useOfficeUserDashboard } from "./useOfficeUserDashboard";

// ===========================================================================

export function OfficeUserDashboard({
  userName,
  onLogout,
  activeTab: initialTab = "dashboard",
}: OfficeUserDashboardProps) {
  const vm = useOfficeUserDashboard({ userName, onLogout, activeTab: initialTab });
  const { SidebarBody, fetchDashboardData, mobileMenuOpen, renderContent, setMobileMenuOpen, setShowTransactionForm, setSidebarOpen, showTransactionForm, sidebarOpen } = vm;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
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
          <button
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-2 text-slate-700 hover:bg-slate-100"
          >
            <Menu className="h-5 w-5" />
          </button>
          <SarifMark size={26} />
          <span className="text-base font-semibold text-slate-900">Sarif</span>
        </div>
        <button
          onClick={() => setShowTransactionForm(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          New
        </button>
      </header>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-50 lg:hidden ${mobileMenuOpen ? "" : "pointer-events-none"}`} aria-hidden={!mobileMenuOpen}>
        <div
          onClick={() => setMobileMenuOpen(false)}
          className={`absolute inset-0 bg-slate-900/50 transition-opacity ${mobileMenuOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-72 bg-[#0F172A] shadow-sm transition-transform duration-200 ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarBody compact={false} onClose={() => setMobileMenuOpen(false)} />
        </aside>
      </div>

      {/* Content */}
      <main className={`transition-[padding] duration-200 ${sidebarOpen ? "lg:pl-60" : "lg:pl-[72px]"}`}>
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{renderContent()}</div>
      </main>

      <AnimatePresence>
        {showTransactionForm && (
          <TransactionForm
            onClose={() => setShowTransactionForm(false)}
            onSuccess={fetchDashboardData}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
