"use client";

import { LogOut, X } from "lucide-react";
import { PLATFORM_CURRENCY, SuperAdminDashboardProps, TABS } from "../helpers";
import { SarifMark } from "../../SarifMark";
import * as api from "@/lib/superadmin-api";
import { buildCredentialMessage, shareViaWhatsApp } from "@/lib/whatsapp";
import { localDate } from "@/lib/dates";
import { toast } from "sonner";
import { useEffect } from "react";
import { type useSuperAdminDashboardState } from "./useSuperAdminDashboardState";

/** SuperAdminDashboard: export (part 2 of 2 of useSuperAdminDashboard). */
export function useSuperAdminDashboardExport(prev: { userName: NonNullable<SuperAdminDashboardProps["userName"]>; onLogout: SuperAdminDashboardProps["onLogout"]; initialTab: NonNullable<SuperAdminDashboardProps["activeTab"]> } & ReturnType<typeof useSuperAdminDashboardState>) {
  const { activeTab, closeModal, dashboard, fetchAnalytics, fetchAuditLogs, fetchCompanies, fetchDashboard, fetchFinancial, fetchSecurity, fetchSystemHealth, fetchSystemLogs, formData, mobileMenuOpen, openModal, setActiveTab, setIsSubmitting, setLoading, setMobileMenuOpen, setSidebarOpen, userName } = prev;
  const handleAddWhitelist = async () => {
    if (!formData.ipAddress) {
      toast.error("IP address required");
      return;
    }
    setIsSubmitting(true);
    const res = await api.addIPToWhitelist({
      ipAddress: formData.ipAddress,
      description: formData.description,
    });
    setIsSubmitting(false);
    if (res.success) {
      toast.success("IP added to whitelist");
      closeModal("addWhitelist");
      fetchSecurity();
    } else {
      toast.error(res.message);
    }
  };
  const handleRemoveWhitelist = async (id: string) => {
    const res = await api.removeIPFromWhitelist(id);
    if (res.success) {
      toast.success("IP removed from whitelist");
      fetchSecurity();
    } else {
      toast.error(res.message);
    }
  };
  const handleRecordPayment = async () => {
    if (!formData.companyId || !formData.amount) {
      toast.error("Company and amount required");
      return;
    }
    setIsSubmitting(true);
    const res = await api.recordPayment({
      companyId: formData.companyId,
      amount: parseFloat(formData.amount),
      currency: PLATFORM_CURRENCY,
      paymentMethod: formData.paymentMethod || "M-Pesa",
      reference: formData.reference,
      notes: formData.notes,
    });
    setIsSubmitting(false);
    if (res.success) {
      toast.success("Payment recorded");
      closeModal("recordPayment");
      fetchFinancial();
      fetchDashboard();
    } else {
      toast.error(res.message);
    }
  };
  const handleCreateCompany = async () => {
    if (
      !formData.name ||
      !formData.ownerName ||
      !formData.whatsAppNumber ||
      !formData.password
    ) {
      toast.error("Please fill all required fields");
      return;
    }
    if (formData.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setIsSubmitting(true);
    const res = await api.createCompany({
      name: formData.name,
      ownerName: formData.ownerName,
      whatsAppNumber: formData.whatsAppNumber,
      email: formData.email,
      password: formData.password,
      baseCurrency: formData.baseCurrency ?? 0,
    });
    setIsSubmitting(false);
    if (res.success) {
      const companyCode = res.data?.code || "";
      closeModal("createCompany");
      fetchCompanies();
      fetchDashboard();
      // Offer to share credentials via WhatsApp
      if (formData.whatsAppNumber && formData.password) {
        (/could not be sent/i.test(res.message ?? "") ? toast.warning : toast.success)(
          /could not be sent/i.test(res.message ?? "") ? res.message : "Company created successfully", {
          duration: /could not be sent/i.test(res.message ?? "") ? 15000 : 8000,
          action: {
            label: "📱 Share Credentials",
            onClick: () =>
              shareViaWhatsApp(
                formData.whatsAppNumber,
                buildCredentialMessage({
                  role: "office",
                  fullName: formData.ownerName,
                  code: companyCode,
                  password: formData.password,
                  companyName: formData.name,
                }),
              ),
          },
        });
      } else {
        toast.success("Company created successfully");
      }
    } else {
      toast.error(res.message);
    }
  };
  const handleExportAuditLogs = async () => {
    const blob = await api.exportAuditLogs();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${localDate()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Audit logs exported");
    } else {
      toast.error("Failed to export");
    }
  };
  // ==================== RENDER ====================

  const navItem = (tab: (typeof TABS)[number], compact: boolean, onPick?: () => void) => {
    const active = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => {
          setActiveTab(tab.id);
          onPick?.();
        }}
        title={compact ? tab.label : undefined}
        aria-current={active ? "page" : undefined}
        className={`flex h-10 w-full items-center gap-3 rounded-lg text-sm font-medium ${
          compact ? "justify-center" : "px-3"
        } ${active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
      >
        <tab.icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-blue-300" : ""}`} />
        {!compact && <span className="truncate">{tab.label}</span>}
        {!compact && tab.id === "security" && (dashboard?.securityAlertsActive ?? 0) > 0 && (
          <span className="ml-auto rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
            {dashboard?.securityAlertsActive}
          </span>
        )}
      </button>
    );
  };
  const SidebarBody = ({ compact, onClose }: { compact: boolean; onClose?: () => void }) => (
    <div className="flex h-full flex-col">
      <div className={`flex h-16 items-center gap-3 border-b border-white/10 ${compact ? "justify-center px-0" : "px-5"}`}>
        <SarifMark size={32} className="shrink-0 rounded-[7px] ring-1 ring-white/15" />
        {!compact && (
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold leading-tight text-white">Sarif</div>
            <div className="text-xs text-slate-400">Platform admin</div>
          </div>
        )}
        {onClose && (
          <button onClick={onClose} aria-label="Close menu" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Admin">
        {TABS.map((tab) => navItem(tab, compact, onClose))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className={`flex items-center gap-3 ${compact ? "flex-col" : "px-2"}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-white">
            {(userName || "A").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          {!compact && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{userName}</div>
              <div className="text-xs text-slate-400">Super admin</div>
            </div>
          )}
          <button
            onClick={() => openModal("logout")}
            title="Log out"
            aria-label="Log out"
            className="rounded-md p-2 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
  const activeLabel = TABS.find((t) => t.id === activeTab)?.label ?? "";
  // Escape closes the phone-width menu.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);
  useEffect(() => {
    const apply = () => setSidebarOpen(window.innerWidth >= 1280);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);
  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchDashboard().finally(() => setLoading(false));
  }, [fetchDashboard]);
  // Collapse sidebar to icons below laptop width (more room for content tables)
  useEffect(() => {
    const applySidebarForWidth = () =>
      setSidebarOpen(window.innerWidth >= 1024);
    applySidebarForWidth();
    window.addEventListener("resize", applySidebarForWidth);
    return () => window.removeEventListener("resize", applySidebarForWidth);
  }, []);
  // Tab-specific data
  useEffect(() => {
    switch (activeTab) {
      case "companies":
        fetchCompanies();
        break;
      case "security":
        fetchSecurity();
        break;
      case "financial":
        fetchFinancial();
        break;
      case "analytics":
        fetchAnalytics();
        break;
      case "audit":
        fetchAuditLogs();
        break;
      case "system":
        fetchSystemHealth();
        fetchSystemLogs();
        break;
    }
  }, [
    activeTab,
    fetchCompanies,
    fetchSecurity,
    fetchFinancial,
    fetchAnalytics,
    fetchAuditLogs,
    fetchSystemHealth,
    fetchSystemLogs,
  ]);

  return {
    handleAddWhitelist,
    handleRemoveWhitelist,
    handleRecordPayment,
    handleCreateCompany,
    handleExportAuditLogs,
    navItem,
    SidebarBody,
    activeLabel,
  };
}
