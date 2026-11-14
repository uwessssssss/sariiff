"use client";

import { AlertCircle, Banknote, Bell, Calendar, CheckCircle, ChevronRight, Globe, Loader2, Lock, LogOut, Menu, MessageCircle, Receipt, Shield, Star, User } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ClientType } from "@/lib/api";
import { ClientUserDashboardProps, SUPPORT_WHATSAPP, formatCurrency, formatDate, getClientTypeLabel } from "./helpers";
import { LinkedBureausCard } from "@/components/LinkedBureaus";
import { SarifMark } from "../SarifMark";
import { useClientUserDashboard } from "./useClientUserDashboard";
import { buildClientUserDashboardView } from "./buildClientUserDashboardView";
import { DashboardView } from "./sections/DashboardView";
import { StatementsView } from "./sections/StatementsView";
import { AlertsView } from "./sections/AlertsView";
import dynamic from "next/dynamic";
import { TransactionDetailModal } from "./sections/TransactionDetailModal";
import { AlertDetailModal } from "./sections/AlertDetailModal";
import { PasswordModal } from "./sections/PasswordModal";

// Charts (recharts) load when the Analytics tab is first opened, not with the dashboard.
const AnalyticsView = dynamic(() => import("./sections/AnalyticsView").then((m) => m.AnalyticsView), { ssr: false });

// ============ MAIN COMPONENT ============

export function ClientUserDashboard({
  userName,
  onLogout,
}: ClientUserDashboardProps) {
  const data = useClientUserDashboard({ userName, onLogout });
  const { dashboard, error, fetchDashboard, loading } = data;
  // ============ LOADING STATE ============

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-slate-50 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your account…
      </div>
    );
  }
  if (error && !dashboard) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="max-w-sm text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
          <p className="mt-3 text-base font-medium text-slate-900">Couldn't load your account.</p>
          <p className="mt-1 text-sm text-slate-600">{error}</p>
          <button
            onClick={fetchDashboard}
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const vm = { ...data, ...buildClientUserDashboardView(data) };
  const { ClientSidebar, activeView, handleContactSupport, mobileMenuOpen, profile, quickStats, setActiveView, setMobileMenuOpen, setShowPasswordModal } = vm;
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 bg-[#0F172A] lg:block">
        <ClientSidebar />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-3 lg:hidden">
        <div className="flex items-center gap-2">
          <button onClick={() => setMobileMenuOpen(true)} aria-label="Open menu" className="rounded-md p-2 text-slate-700 hover:bg-slate-100">
            <Menu className="h-5 w-5" />
          </button>
          <SarifMark size={26} />
          <span className="text-base font-semibold text-slate-900">Sarif</span>
        </div>
        <button
          onClick={() => setActiveView("alerts")}
          aria-label={`Alerts${(quickStats?.unreadAlerts ?? 0) > 0 ? `, ${quickStats?.unreadAlerts} unread` : ""}`}
          className="relative rounded-md p-2 text-slate-700 hover:bg-slate-100"
        >
          <Bell className="h-5 w-5" />
          {(quickStats?.unreadAlerts ?? 0) > 0 && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
          )}
        </button>
      </header>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-50 lg:hidden ${mobileMenuOpen ? "" : "pointer-events-none"}`} aria-hidden={!mobileMenuOpen}>
        <div
          onClick={() => setMobileMenuOpen(false)}
          className={`absolute inset-0 bg-slate-900/50 transition-opacity ${mobileMenuOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-72 bg-[#0F172A]  transition-transform duration-200 ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <ClientSidebar onNavigate={() => setMobileMenuOpen(false)} />
        </aside>
      </div>

      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <AnimatePresence mode="wait">
            {/* ============ DASHBOARD VIEW ============ */}
            <DashboardView vm={vm} />
            {/* ============ STATEMENTS VIEW ============ */}
            <StatementsView vm={vm} />

            {/* ============ ALERTS VIEW ============ */}
            <AlertsView vm={vm} />

            {/* ============ ANALYTICS VIEW ============ */}
            {activeView === "analytics" && <AnalyticsView vm={vm} />}
            {/* ============ PROFILE VIEW ============ */}
            {activeView === "profile" && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div>
                  <h1 className="text-2xl font-semibold      text-slate-900 tracking-tight">
                    Profile Settings
                  </h1>
                  <p className="text-slate-600 mt-2">
                    Manage your account information and preferences
                  </p>
                </div>

                {/* Profile Header Card */}
                <div className=" bg-blue-600   p-8 border border-blue-400  relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl hidden" />
                  <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-400/20 rounded-full blur-3xl hidden" />
                  <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
                    <div className="w-24 h-24 bg-white flex items-center justify-center text-blue-600 text-2xl font-semibold tracking-tight">
                      {(profile?.fullName || userName).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 text-center md:text-left">
                      <h2 className="text-3xl font-semibold text-white mb-2">
                        {profile?.fullName || userName}
                      </h2>
                      <p className="text-white font-semibold mb-4">
                        {getClientTypeLabel(
                          profile?.clientType ?? ClientType.Temporary,
                        )}{" "}
                        • ID: {profile?.code || "Loading..."}
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                        <span className="px-4 py-2 bg-white text-blue-600 text-xs font-bold flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          {profile?.isActive ? "Active Account" : "Inactive"}
                        </span>
                        <span className="px-4 py-2 bg-white text-emerald-700 text-xs font-bold flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          Protected
                        </span>
                        {profile?.clientType === ClientType.Permanent && (
                          <span className="px-4 py-2 bg-white text-amber-700 text-xs font-bold flex items-center gap-2">
                            <Star className="w-4 h-4 fill-amber-600" />
                            Premium
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Personal Information */}
                <div className="rounded-xl bg-white  border border-slate-200 hover:border-pink-200 transition-all ">
                  <div className="p-6 border-b border-slate-200">
                    <h3 className="text-xl font-semibold     text-pink-700">
                      Personal Information
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Your account details
                    </p>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="flex items-center gap-4 p-4  bg-slate-50  border border-slate-200 hover:border-blue-300 transition-all group">
                      <User className="w-6 h-6 text-blue-600  transition-transform" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-600   mb-1">
                          Full Name
                        </p>
                        <p className="text-base font-bold text-slate-900">
                          {profile?.fullName || "Loading..."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 p-4  bg-slate-50  border border-slate-200 hover:border-blue-300 transition-all group">
                      <Receipt className="w-6 h-6 text-blue-600  transition-transform" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-600   mb-1">
                          Client Code
                        </p>
                        <p className="text-base font-bold text-slate-900 font-mono">
                          {profile?.code || "Loading..."}
                        </p>
                      </div>
                    </div>

                    {profile?.email && (
                      <div className="flex items-center gap-4 p-4  bg-slate-50  border border-slate-200 hover:border-emerald-300 transition-all group">
                        <Globe className="w-6 h-6 text-emerald-600  transition-transform" />
                        <div className="flex-1">
                          <p className="text-xs font-bold text-slate-600   mb-1">
                            Email Address
                          </p>
                          <p className="text-base font-bold text-slate-900">
                            {profile.email}
                          </p>
                        </div>
                        <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-300">
                          Verified
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 p-4  bg-slate-50  border border-slate-200 hover:border-amber-300 transition-all group">
                      <MessageCircle className="w-6 h-6 text-amber-600  transition-transform" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-600   mb-1">
                          WhatsApp Number
                        </p>
                        <p className="text-base font-bold text-slate-900">
                          {profile?.whatsAppNumber || "Loading..."}
                        </p>
                      </div>
                      <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-300">
                        Verified
                      </span>
                    </div>

                    {profile?.idPassport && (
                      <div className="flex items-center gap-4 p-4  bg-slate-50  border border-slate-200 hover:border-pink-300 transition-all group">
                        <Shield className="w-6 h-6 text-pink-600  transition-transform" />
                        <div className="flex-1">
                          <p className="text-xs font-bold text-slate-600   mb-1">
                            ID/Passport
                          </p>
                          <p className="text-base font-bold text-slate-900">
                            {profile.idPassport}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-4 p-4  bg-slate-50  border border-slate-200 hover:border-cyan-300 transition-all group">
                      <Calendar className="w-6 h-6 text-cyan-600  transition-transform" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-600   mb-1">
                          Member Since
                        </p>
                        <p className="text-base font-bold text-slate-900">
                          {profile?.createdAt
                            ? formatDate(profile.createdAt)
                            : "Loading..."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Account Balances: every currency the client holds, home currency of the
                    bureau included (a Ugandan client saw "KES Balance 0" and "USD Balance 0"
                    first and their UGX balance under "Other Currencies"). */}
                <div className="rounded-xl bg-white  border border-slate-200 hover:border-emerald-200 transition-all ">
                  <div className="p-6 border-b border-slate-200">
                    <h3 className="text-xl font-semibold     text-emerald-700">
                      Account Balances
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Your current balances
                    </p>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(() => {
                      const rows = [
                        { code: "KES", balance: profile?.balanceKES ?? 0, opening: profile?.openingBalanceKES ?? 0, active: !!(profile?.balanceKES || profile?.totalInKES || profile?.totalOutKES) },
                        { code: "USD", balance: profile?.balanceUSD ?? 0, opening: profile?.openingBalanceUSD ?? 0, active: !!(profile?.balanceUSD || profile?.totalInUSD || profile?.totalOutUSD) },
                        ...((profile?.otherBalances || []) as any[]).map((b) => ({
                          code: b.currencyCode, balance: b.balance ?? 0, opening: b.openingBalance ?? 0,
                          active: !!(b.balance || b.totalIn || b.totalOut),
                        })),
                      ];
                      const held = rows.filter((r) => r.active);
                      return (held.length ? held : rows.slice(0, 1)).map((r) => (
                        <div key={r.code} className="p-6  bg-emerald-50  border border-emerald-200 rounded-lg">
                          <div className="flex items-center gap-3 mb-3">
                            <Banknote className="w-8 h-8 text-emerald-600" />
                            <span className="text-sm font-bold text-emerald-700">{r.code} Balance</span>
                          </div>
                          <p className="text-2xl font-semibold text-slate-900 tracking-tight">
                            {formatCurrency(r.balance, r.code)}
                          </p>
                          <p className="text-xs text-slate-600 mt-2">Opening: {formatCurrency(r.opening, r.code)}</p>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Phone login: bureaus linked to this phone (hidden for code+password sign-ins) */}
                {profile?.clientType === ClientType.Permanent && (
                  <LinkedBureausCard phone={profile.whatsAppNumber} onSignedOut={onLogout} />
                )}

                {/* Security Settings */}
                {profile?.clientType === ClientType.Permanent && (
                  <div className="rounded-xl bg-white  border border-slate-200 hover:border-blue-200 transition-all ">
                    <div className="p-6 border-b border-slate-200">
                      <h3 className="text-xl font-semibold     text-blue-700">
                        Security & Privacy
                      </h3>
                      <p className="text-sm text-slate-600 mt-1">
                        Manage your account security
                      </p>
                    </div>
                    <div className="p-6 space-y-4">
                      <button
                        onClick={() => setShowPasswordModal(true)}
                        className="rounded-lg w-full flex items-center justify-between p-4  bg-blue-50  border border-blue-300 hover:border-blue-400  transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <Lock className="w-6 h-6 text-blue-600  transition-transform" />
                          <div className="text-left">
                            <p className="font-bold text-slate-900">
                              Change Password
                            </p>
                            <p className="text-xs text-slate-600">
                              Update your login password
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-blue-600  transition-transform" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4">
                  {SUPPORT_WHATSAPP && (
                    <button
                      onClick={handleContactSupport}
                      className="rounded-lg flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
                    >
                      <MessageCircle className="w-5 h-5" />
                      Contact your bureau
                    </button>
                  )}
                  <button
                    onClick={onLogout}
                    className="rounded-lg flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-white text-slate-700 font-bold border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-all"
                  >
                    <LogOut className="w-5 h-5" />
                    Logout
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* ============ TRANSACTION DETAIL MODAL ============ */}
      <TransactionDetailModal vm={vm} />

      {/* ============ ALERT DETAIL MODAL ============ */}
      <AlertDetailModal vm={vm} />

      {/* ============ PASSWORD CHANGE MODAL ============ */}
      <PasswordModal vm={vm} />
    </div>
  );
}
