"use client";

import * as api from "@/lib/superadmin-api";
import { logout as apiLogout } from "@/lib/api";
import { type AnalyticsOverview, type AuditLog, type CompanyDetail, type CompanyStats, type SuperAdminDashboard as DashboardData, type FinancialOverview, type IPWhitelist, type LoginHistory, type PagedResult, type PaymentHistory, type SecurityAlert, type SecurityOverview, type SystemHealth, type SystemLog } from "@/lib/superadmin-api";
import { ModalState, SHAPES, SuperAdminDashboardProps, TabId, asArray, normalise, paged } from "../helpers";
import { toast } from "sonner";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

/** SuperAdminDashboard: state (part 1 of 2 of useSuperAdminDashboard). */
export function useSuperAdminDashboardState(prev: { userName: NonNullable<SuperAdminDashboardProps["userName"]>; onLogout: SuperAdminDashboardProps["onLogout"]; initialTab: NonNullable<SuperAdminDashboardProps["activeTab"]> }) {
  const { initialTab, onLogout } = prev;
  // Router for navigation
  const router = useRouter();
  // Navigation
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [baseFilter, setBaseFilter] = useState<string>("all");
  // Data state
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [companies, setCompanies] = useState<PagedResult<CompanyStats> | null>(
    null,
  );
  const [selectedCompany, setSelectedCompany] = useState<CompanyDetail | null>(
    null,
  );
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [security, setSecurity] = useState<SecurityOverview | null>(null);
  const [alerts, setAlerts] = useState<PagedResult<SecurityAlert> | null>(null);
  const [whitelist, setWhitelist] = useState<IPWhitelist[]>([]);
  const [financial, setFinancial] = useState<FinancialOverview | null>(null);
  const [payments, setPayments] = useState<PagedResult<PaymentHistory> | null>(
    null,
  );
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [auditLogs, setAuditLogs] = useState<PagedResult<AuditLog> | null>(
    null,
  );
  const [loginHistory, setLoginHistory] =
    useState<PagedResult<LoginHistory> | null>(null);
  const [systemLogs, setSystemLogs] = useState<PagedResult<SystemLog> | null>(
    null,
  );
  // UI state
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Pagination
  const [companiesPage, setCompaniesPage] = useState(1);
  const [alertsPage, setAlertsPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [loginPage, setLoginPage] = useState(1);
  const [systemLogsPage, setSystemLogsPage] = useState(1);
  // Filters
  const [companyStatus, setCompanyStatus] = useState("all");
  const [alertStatus, setAlertStatus] = useState("all");
  const [logLevel, setLogLevel] = useState("all");
  const [showResolved, setShowResolved] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [auditAction, setAuditAction] = useState("all");
  // Modals
  const [modals, setModals] = useState<ModalState>({
    companyDetails: false,
    resetPassword: false,
    suspendCompany: false,
    updateSubscription: false,
    blockIP: false,
    addWhitelist: false,
    recordPayment: false,
    resolveAlert: false,
    createCompany: false,
    editCompany: false,
    logout: false,
  });
  // Form state
  const [formData, setFormData] = useState<any>({});
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    null,
  );
  // ==================== DATA FETCHING ====================

  const fetchDashboard = useCallback(async () => {
    const res = await api.getDashboard();
    if (res.success) setDashboard(normalise(res.data, SHAPES.dashboard));
  }, []);
  const fetchCompanies = useCallback(async () => {
    const res = await api.getCompanies({
      page: companiesPage,
      pageSize: 10,
      search: searchTerm,
      status: companyStatus,
    });
    if (res.success) setCompanies(paged(res.data));
  }, [companiesPage, searchTerm, companyStatus]);
  const fetchSystemHealth = useCallback(async () => {
    const res = await api.getSystemHealth();
    if (res.success) setSystemHealth(normalise(res.data, SHAPES.health));
  }, []);
  const fetchSecurity = useCallback(async () => {
    const [secRes, alertRes, whiteRes] = await Promise.all([
      api.getSecurityOverview(),
      api.getSecurityAlerts({
        page: alertsPage,
        pageSize: 10,
        resolved:
          alertStatus === "resolved"
            ? true
            : alertStatus === "active"
              ? false
              : undefined,
      }),
      api.getIPWhitelist(),
    ]);
    if (secRes.success) setSecurity(normalise(secRes.data, SHAPES.security));
    if (alertRes.success) setAlerts(paged(alertRes.data));
    if (whiteRes.success) setWhitelist(asArray(whiteRes.data));
  }, [alertsPage, alertStatus]);
  const fetchFinancial = useCallback(async () => {
    const [finRes, payRes] = await Promise.all([
      api.getFinancialOverview(),
      api.getPayments({ page: paymentsPage, pageSize: 10 }),
    ]);
    if (finRes.success) setFinancial(normalise(finRes.data, SHAPES.financial));
    if (payRes.success) setPayments(paged(payRes.data));
  }, [paymentsPage]);
  const fetchAnalytics = useCallback(async () => {
    const res = await api.getAnalytics();
    if (res.success) setAnalytics(normalise(res.data, SHAPES.analytics));
  }, []);
  const fetchAuditLogs = useCallback(async () => {
    const [auditRes, loginRes] = await Promise.all([
      api.getAuditLogs({
        page: auditPage,
        pageSize: 15,
        action: auditAction !== "all" ? auditAction : undefined,
      }),
      api.getLoginHistory({ page: loginPage, pageSize: 10 }),
    ]);
    if (auditRes.success) setAuditLogs(paged(auditRes.data));
    if (loginRes.success) setLoginHistory(paged(loginRes.data));
  }, [auditPage, loginPage, auditAction]);
  const fetchSystemLogs = useCallback(async () => {
    const res = await api.getSystemLogs({
      page: systemLogsPage,
      pageSize: 20,
      level: logLevel,
      includeResolved: showResolved,
    });
    if (res.success) setSystemLogs(paged(res.data));
  }, [systemLogsPage, logLevel, showResolved]);
  // Marks this entry and every identical one resolved, then refreshes the
  // log list and the health status (resolved entries stop counting).
  const resolveLog = async (id: string) => {
    setResolvingId(id);
    try {
      const res = await api.resolveSystemLog(id, true);
      if (res.success) {
        toast.success(res.message || "Marked resolved");
        await Promise.all([fetchSystemLogs(), fetchSystemHealth()]);
      } else {
        toast.error(res.message || "Couldn't mark it resolved");
      }
    } catch {
      toast.error("Couldn't mark it resolved");
    } finally {
      setResolvingId(null);
    }
  };
  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchDashboard(),
      activeTab === "companies" && fetchCompanies(),
      activeTab === "security" && fetchSecurity(),
      activeTab === "financial" && fetchFinancial(),
      activeTab === "analytics" && fetchAnalytics(),
      activeTab === "audit" && fetchAuditLogs(),
      activeTab === "system" &&
        Promise.all([fetchSystemHealth(), fetchSystemLogs()]),
    ]);
    setRefreshing(false);
    toast.success("Data refreshed");
  };
  // ==================== ACTIONS ====================

  const openModal = (modal: keyof ModalState, data?: any) => {
    setFormData(data || {});
    setModals((prev) => ({ ...prev, [modal]: true }));
  };
  const closeModal = (modal: keyof ModalState) => {
    setModals((prev) => ({ ...prev, [modal]: false }));
    setFormData({});
  };
  // Sign out: end the session on the server FIRST (it needs the stored refresh token), then
  // clear the browser. Clearing first sent the logout with no token and no sign-in, so the
  // server refused it and the super admin's refresh token stayed valid.
  const handleLogout = async () => {
    closeModal("logout");
    try {
      if (onLogout) await onLogout();
      else await apiLogout();
    } catch (e) {
      console.error("Sign-out request failed:", e);
    } finally {
      localStorage.removeItem("sariff_auth");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      sessionStorage.clear();
      window.location.href = "/login";
    }
  };
  const viewCompanyDetails = async (id: string) => {
    const res = await api.getCompanyDetails(id);
    if (res.success) {
      setSelectedCompany(normalise(res.data, SHAPES.company));
      setSelectedCompanyId(id);
      openModal("companyDetails");
    } else {
      toast.error("Failed to load company details");
    }
  };
  const handleSuspendCompany = async () => {
    if (!selectedCompanyId || !formData.reason) {
      toast.error("Please provide a reason");
      return;
    }
    setIsSubmitting(true);
    const res = await api.suspendCompany(selectedCompanyId, formData.reason);
    setIsSubmitting(false);
    if (res.success) {
      toast.success("Company suspended");
      closeModal("suspendCompany");
      closeModal("companyDetails");
      fetchCompanies();
      fetchDashboard();
    } else {
      toast.error(res.message);
    }
  };
  const handleActivateCompany = async (id: string) => {
    const res = await api.activateCompany(id);
    if (res.success) {
      toast.success("Company activated");
      fetchCompanies();
      fetchDashboard();
      if (modals.companyDetails) viewCompanyDetails(id);
    } else {
      toast.error(res.message);
    }
  };
  const handleResetPassword = async () => {
    if (!selectedCompanyId) return;
    if (!formData.password || formData.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setIsSubmitting(true);
    const res = await api.resetPassword(selectedCompanyId, formData.password);
    setIsSubmitting(false);
    if (res.success) {
      toast.success("Password reset successfully");
      closeModal("resetPassword");
    } else {
      toast.error(res.message);
    }
  };
  // FIXED: Now includes status field
  const handleUpdateSubscription = async () => {
    if (!selectedCompanyId) return;
    setIsSubmitting(true);
    const res = await api.updateSubscription(selectedCompanyId, {
      plan: formData.plan || "Free",
      status: formData.status || "Active",
      monthlyFee: parseFloat(formData.monthlyFee) || 0,
      expiresAt: formData.expiresAt,
    });
    setIsSubmitting(false);
    if (res.success) {
      toast.success("Subscription updated");
      closeModal("updateSubscription");
      fetchCompanies();
      if (modals.companyDetails) viewCompanyDetails(selectedCompanyId);
    } else {
      toast.error(res.message);
    }
  };
  // NEW: Edit Company
  const handleEditCompany = async () => {
    if (!selectedCompanyId) return;
    setIsSubmitting(true);
    const res = await api.updateCompany(selectedCompanyId, {
      name: formData.name,
      ownerName: formData.ownerName,
      email: formData.email,
      taxId: formData.taxId,
      website: formData.website,
      address: formData.address,
    });
    setIsSubmitting(false);
    if (res.success) {
      toast.success("Company updated");
      closeModal("editCompany");
      fetchCompanies();
      viewCompanyDetails(selectedCompanyId);
    } else {
      toast.error(res.message);
    }
  };
  const handleResolveAlert = async () => {
    if (!selectedAlertId) return;
    setIsSubmitting(true);
    const res = await api.resolveAlert(selectedAlertId, formData.notes);
    setIsSubmitting(false);
    if (res.success) {
      toast.success("Alert resolved");
      closeModal("resolveAlert");
      fetchSecurity();
    } else {
      toast.error(res.message);
    }
  };
  const handleBlockIP = async () => {
    if (!formData.ipAddress || !formData.reason) {
      toast.error("IP address and reason required");
      return;
    }
    setIsSubmitting(true);
    const res = await api.blockIP({
      ipAddress: formData.ipAddress,
      reason: formData.reason,
      blockUntil: formData.blockUntil,
    });
    setIsSubmitting(false);
    if (res.success) {
      toast.success("IP blocked");
      closeModal("blockIP");
      fetchSecurity();
    } else {
      toast.error(res.message);
    }
  };

  return {
    router,
    activeTab,
    setActiveTab,
    sidebarOpen,
    setSidebarOpen,
    mobileMenuOpen,
    setMobileMenuOpen,
    baseFilter,
    setBaseFilter,
    dashboard,
    setDashboard,
    companies,
    setCompanies,
    selectedCompany,
    setSelectedCompany,
    systemHealth,
    setSystemHealth,
    security,
    setSecurity,
    alerts,
    setAlerts,
    whitelist,
    setWhitelist,
    financial,
    setFinancial,
    payments,
    setPayments,
    analytics,
    setAnalytics,
    auditLogs,
    setAuditLogs,
    loginHistory,
    setLoginHistory,
    systemLogs,
    setSystemLogs,
    loading,
    setLoading,
    refreshing,
    setRefreshing,
    searchTerm,
    setSearchTerm,
    isSubmitting,
    setIsSubmitting,
    companiesPage,
    setCompaniesPage,
    alertsPage,
    setAlertsPage,
    paymentsPage,
    setPaymentsPage,
    auditPage,
    setAuditPage,
    loginPage,
    setLoginPage,
    systemLogsPage,
    setSystemLogsPage,
    companyStatus,
    setCompanyStatus,
    alertStatus,
    setAlertStatus,
    logLevel,
    setLogLevel,
    showResolved,
    setShowResolved,
    resolvingId,
    setResolvingId,
    auditAction,
    setAuditAction,
    modals,
    setModals,
    formData,
    setFormData,
    selectedAlertId,
    setSelectedAlertId,
    selectedCompanyId,
    setSelectedCompanyId,
    fetchDashboard,
    fetchCompanies,
    fetchSystemHealth,
    fetchSecurity,
    fetchFinancial,
    fetchAnalytics,
    fetchAuditLogs,
    fetchSystemLogs,
    resolveLog,
    refreshAll,
    openModal,
    closeModal,
    handleLogout,
    viewCompanyDetails,
    handleSuspendCompany,
    handleActivateCompany,
    handleResetPassword,
    handleUpdateSubscription,
    handleEditCompany,
    handleResolveAlert,
    handleBlockIP,
  };
}
