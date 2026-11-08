"use client";

import { useState, useEffect, useCallback, Component, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { SarifMark } from "./SarifMark";
import { TransactionPinPanel } from "./TransactionPinPanel";
import { shareViaWhatsApp, buildCredentialMessage } from "@/lib/whatsapp";
import {
  LayoutDashboard,
  Building2,
  Shield,
  DollarSign,
  BarChart3,
  ScrollText,
  Server,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Bell,
  LogOut,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Ban,
  CheckCircle2,
  Key,
  Lock,
  AlertTriangle,
  AlertCircle,
  Users,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Database,
  Calendar,
  Download,
  Plus,
  Trash2,
  Edit,
  Phone,
  CreditCard,
  Wallet,
  Crown,
  ShieldCheck,
  ShieldAlert,
  History,
  Mail,
  Loader2,
} from "lucide-react";

import * as api from "@/lib/superadmin-api";
import type {
  SuperAdminDashboard as DashboardData,
  CompanyStats,
  CompanyDetail,
  SystemHealth,
  SecurityOverview,
  SecurityAlert,
  IPWhitelist,
  FinancialOverview,
  PaymentHistory,
  AnalyticsOverview,
  AuditLog,
  LoginHistory,
  SystemLog,
  PagedResult,
} from "@/lib/superadmin-api";
import { localDate } from "@/lib/dates";

// ==================== TYPES ====================

type TabId =
  | "overview"
  | "companies"
  | "security"
  | "financial"
  | "analytics"
  | "audit"
  | "system";

interface ModalState {
  companyDetails: boolean;
  resetPassword: boolean;
  suspendCompany: boolean;
  updateSubscription: boolean;
  blockIP: boolean;
  addWhitelist: boolean;
  recordPayment: boolean;
  resolveAlert: boolean;
  createCompany: boolean;
  editCompany: boolean;
  logout: boolean;
}

// ==================== HELPERS ====================

/**
 * Monthly volume per currency ("KES 1,200,000 · UGX 4,000,000"). The single
 * monthlyVolume number adds currencies together, so it's only a fallback for
 * an older API.
 */
const volumeLines = (c: any): string[] => {
  const list = c?.monthlyVolumeByCurrency;
  if (Array.isArray(list) && list.length > 0)
    return list.map((v: any) => {
      const code = v.currencyCode || ["KES", "USD", "UGX", "EUR"][v.currency] || "KES";
      const d = code === "KES" || code === "UGX" ? 0 : 2;
      return `${code} ${(v.amount || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
    });
  return [formatCurrency(c?.monthlyVolume || 0)];
};

const CODES = ["KES", "USD", "UGX", "EUR"];
const codeOf = (c?: number) => CODES[c ?? 0] ?? "KES";

/** "KES 98.0M", "UGX 1.31B", "USD 410K" — compact, for dense admin views. */
const compactMoney = (amount: number, code: string) => {
  const a = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  const fmt = (n: number, unit: string) =>
    `${code} ${sign}${n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)}${unit}`;
  if (a >= 1e9) return fmt(a / 1e9, "B");
  if (a >= 1e6) return fmt(a / 1e6, "M");
  if (a >= 1e4) return fmt(a / 1e3, "K");
  return `${code} ${sign}${a.toLocaleString("en-US", { maximumFractionDigits: code === "KES" || code === "UGX" ? 0 : 2 })}`;
};

/** Sarif's own billing currency (subscription fees). */
// ==================== RESPONSE GUARDS ====================
// One malformed or partial API response must never blank the console.
// Each overview is normalised against its own shape (generated from the types
// in lib/superadmin-api.ts — the same field name can be a list on one response
// and a number on another, e.g. revenueGrowth). Lists become []; missing numbers
// become 0 and the result is flagged __partial so the tab can say so instead of
// passing a filled-in 0 off as real.
type Shape = { lists: string[]; nums: string[] };
const SHAPES: Record<"dashboard" | "security" | "financial" | "analytics" | "health" | "company", Shape> = {
  dashboard: { lists: ["topCompaniesByVolume", "topCompaniesByTransactions", "recentSignups", "expiringSubscriptions", "recentErrors", "companies", "totalVolumeByCurrency", "monthlyVolumeByCurrency", "companiesByBaseCurrency"], nums: ["totalCompanies", "activeCompanies", "trialCompanies", "expiredCompanies", "suspendedCompanies", "companiesGrowth", "totalUsers", "totalClients", "activeUsersToday", "usersGrowth", "monthlyRecurringRevenue", "totalRevenue", "pendingPayments", "revenueGrowth", "totalTransactionsVolume", "monthlyTransactionsVolume", "totalTransactionsCount", "monthlyTransactionsCount", "volumeGrowth", "errorsLast24h", "securityAlertsActive"] },
  security: { lists: ["recentAlerts", "recentFailedLogins"], nums: ["failedLoginsLast24h", "failedLoginsLast7d", "lockedAccounts", "suspiciousActivities", "blockedIPs", "activeAlerts"] },
  financial: { lists: ["revenueByPlan", "transactionsByType", "totalVolumeByCurrency", "monthlyVolumeByCurrency"], nums: ["totalRevenue", "monthlyRevenue", "yearlyRevenue", "pendingPayments", "revenueGrowth", "totalTransactionsVolume", "monthlyTransactionsVolume", "avgTransactionSize"] },
  analytics: { lists: ["featureUsage", "userGrowth", "transactionGrowth", "revenueGrowth"], nums: ["dailyActiveUsers", "weeklyActiveUsers", "monthlyActiveUsers", "avgSessionDurationSeconds"] },
  health: { lists: ["reasons"], nums: ["apiResponseTimeMs", "apiRequestsPerMinute", "apiErrorRate", "databaseLatencyMs", "databaseConnections", "serverCpuUsage", "serverMemoryUsage", "serverDiskUsage", "activeWebSockets", "uptimeSeconds", "errorsLast24h", "warningsLast24h", "criticalAlertsLast24h"] },
  company: { lists: ["monthlyVolumeByCurrency", "otherCurrencyHoldings", "recentLogins", "recentTransactions", "totalVolumeByCurrency", "mobileMoneyByCurrency"], nums: ["activeClients", "activeUsers", "bankAccountsCount", "errorCount", "monthlyFee", "monthlyTransactions", "monthlyVolume", "mpesaAgentsCount", "totalBankBalanceKES", "totalBankBalanceUSD", "totalCashBalanceKES", "totalCashBalanceUSD", "totalClientBalanceKES", "totalClientBalanceUSD", "totalClients", "totalMpesaBalance", "totalPaid", "totalTransactions", "totalUsers", "totalVolume", "unreconciledCount"] }
};
const asArray = (v: any) => (Array.isArray(v) ? v : []);
const normalise = <T,>(d: any, shape: Shape): T | null => {
  if (!d || typeof d !== "object") return null;
  const out: any = { ...d };
  let partial = false;
  for (const k of shape.lists) {
    if (!Array.isArray(out[k])) { if (out[k] !== undefined) partial = true; out[k] = []; }
  }
  for (const k of shape.nums) {
    if (typeof out[k] !== "number" || !isFinite(out[k])) { partial = true; out[k] = 0; }
  }
  if (partial) out.__partial = true;
  return out as T;
};
const paged = <T,>(d: any): T => {
  const base = d && typeof d === "object" ? d : {};
  return { totalCount: 0, page: 1, pageSize: 0, totalPages: 0, ...base, items: asArray(base.items) } as T;
};

const PLATFORM_CURRENCY = "KES";

/** Per-currency holdings for the bureau details modal. The API sends KES and
 *  USD in dedicated fields, everything else in otherCurrencyHoldings, and
 *  mobile money per wallet currency (mobileMoneyByCurrency). */
const holdingsRows = (c: any) => {
  const base = codeOf(c?.baseCurrency);
  const map = new Map<string, { code: string; cash: number; bank: number; mobile: number; owed: number; isBase: boolean }>();
  const row = (code: string) => {
    if (!map.has(code)) map.set(code, { code, cash: 0, bank: 0, mobile: 0, owed: 0, isBase: code === base });
    return map.get(code)!;
  };
  row(base);
  const kes = row("KES");
  kes.cash += c?.totalCashBalanceKES || 0;
  kes.bank += c?.totalBankBalanceKES || 0;
  kes.owed += c?.totalClientBalanceKES || 0;
  const usd = row("USD");
  usd.cash += c?.totalCashBalanceUSD || 0;
  usd.bank += c?.totalBankBalanceUSD || 0;
  usd.owed += c?.totalClientBalanceUSD || 0;
  for (const h of c?.otherCurrencyHoldings || []) {
    const r = row(h.currencyCode || codeOf(h.currency));
    r.cash += h.cashBalance || 0;
    r.bank += h.bankBalance || 0;
    r.owed += h.clientBalance || 0;
  }
  // Mobile money per wallet currency (an M-Pesa wallet is KES even at a Ugandan bureau).
  if (Array.isArray(c?.mobileMoneyByCurrency) && c.mobileMoneyByCurrency.length > 0)
    for (const w of c.mobileMoneyByCurrency) row(w.currencyCode || codeOf(w.currency)).mobile += w.amount || 0;
  else row(base).mobile += c?.totalMpesaBalance || 0;
  const order = (code: string) => (code === base ? 0 : code === "USD" ? 1 : 2 + CODES.indexOf(code));
  return [...map.values()]
    // hide a non-home currency the bureau doesn't hold at all (e.g. KES at a Ugandan bureau)
    .filter((r) => r.isBase || r.code === "USD" || r.cash || r.bank || r.owed)
    .sort((a, b) => order(a.code) - order(b.code));
};

const formatCurrency = (amount: number, currency = "KES") =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);

const formatNumber = (num: number) =>
  new Intl.NumberFormat("en-KE").format(num);

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const formatDateTime = (date: string) =>
  new Date(date).toLocaleString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const timeAgo = (date: string) => {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(date);
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "Active":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Trial":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "Expired":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Suspended":
    case "Cancelled":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-slate-500/20 text-slate-500 border-slate-500/30";
  }
};

const getPlanColor = (plan: string) => {
  switch (plan) {
    case "Enterprise":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "Professional":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "Starter":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default:
      return "bg-slate-500/20 text-slate-500 border-slate-500/30";
  }
};

/** "RateLimitExceeded" -> "Rate limit exceeded" */
const humanize = (code?: string | null) =>
  (code || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()).replace(/ (\w)/g, (m) => m.toLowerCase()).replace(/\bip\b/gi, "IP").replace(/\botp\b/gi, "OTP");

const getSeverityColor = (severity: string) => {
  switch (severity?.toLowerCase()) {
    case "critical":
      return "bg-red-50 text-red-700";
    case "warning":
      return "bg-amber-50 text-amber-700";
    case "info":
      return "bg-blue-50 text-blue-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
};

const getLogLevelColor = (level: string) => {
  switch (level?.toLowerCase()) {
    case "error":
    case "critical":
      return "text-red-700 bg-red-50";
    case "warning":
      return "text-amber-700 bg-amber-50";
    case "info":
      return "text-blue-700 bg-blue-50";
    default:
      return "text-slate-600 bg-slate-100";
  }
};

const getHealthColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case "healthy":
      return "text-emerald-700";
    case "degraded":
      return "text-amber-700";
    case "down":
      return "text-red-700";
    default:
      return "text-slate-500";
  }
};

// ==================== TAB CONFIG ====================

const TABS: { id: TabId; label: string; icon: any; color: string }[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    color: "bg-violet-600 ",
  },
  {
    id: "companies",
    label: "Bureaus",
    icon: Building2,
    color: "bg-emerald-600 ",
  },
  {
    id: "security",
    label: "Security",
    icon: Shield,
    color: "bg-red-600 ",
  },
  {
    id: "financial",
    label: "Financial",
    icon: DollarSign,
    color: "bg-amber-600 ",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    color: "bg-blue-600 ",
  },
  {
    id: "audit",
    label: "Audit log",
    icon: ScrollText,
    color: "bg-slate-600 ",
  },
  {
    id: "system",
    label: "System",
    icon: Server,
    color: "bg-indigo-600 ",
  },
];

// ==================== MAIN COMPONENT ====================

// Props interface
interface SuperAdminDashboardProps {
  userName?: string;
  onLogout?: () => void;
  activeTab?: TabId;
}

export function SuperAdminDashboard({
  userName = "Super Admin",
  onLogout,
  activeTab: initialTab = "overview",
}: SuperAdminDashboardProps) {
  // Router for navigation
  const router = useRouter();

  // Navigation
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Escape closes the phone-width menu.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);
  const [baseFilter, setBaseFilter] = useState<string>("all");
  useEffect(() => {
    const apply = () => setSidebarOpen(window.innerWidth >= 1280);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

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

  // ==================== ACTIONS ====================

  const openModal = (modal: keyof ModalState, data?: any) => {
    setFormData(data || {});
    setModals((prev) => ({ ...prev, [modal]: true }));
  };

  const closeModal = (modal: keyof ModalState) => {
    setModals((prev) => ({ ...prev, [modal]: false }));
    setFormData({});
  };

  // FIXED: Working logout with proper redirect
  const handleLogout = () => {
    // Close modal first
    closeModal("logout");

    // Clear all auth data first (regardless of onLogout)
    localStorage.removeItem("sariff_auth");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    sessionStorage.clear();

    // Show success message
    toast.success("Logged out successfully");

    // Call auth provider's logout if available
    if (onLogout) {
      try {
        onLogout();
      } catch (e) {
        console.error("onLogout failed:", e);
      }
    }

    // Force redirect after a brief delay (ensures redirect happens)
    setTimeout(() => {
      window.location.href = "/login";
    }, 150);
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
      if (selectedCompanyId) viewCompanyDetails(selectedCompanyId);
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
      currency: formData.currency || "KES",
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
        className={`flex h-10 w-full items-center gap-3 rounded-lg text-[14px] font-medium ${
          compact ? "justify-center" : "px-3"
        } ${active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
      >
        <tab.icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-blue-700" : ""}`} />
        {!compact && <span className="truncate">{tab.label}</span>}
        {!compact && tab.id === "security" && (dashboard?.securityAlertsActive ?? 0) > 0 && (
          <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
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
            <div className="text-[16px] font-semibold leading-tight text-white">Sarif</div>
            <div className="text-[12px] text-slate-400">Platform admin</div>
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
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[13px] font-semibold text-white">
            {(userName || "A").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          {!compact && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium text-white">{userName}</div>
              <div className="text-[12px] text-slate-400">Super admin</div>
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
          <span className="text-[16px] font-semibold text-slate-900">Sarif admin</span>
        </div>
        <span className="text-[13px] text-slate-500">{activeLabel}</span>
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
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
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
                {activeTab === "overview" && dashboard && (() => {
                  const monthly = dashboard.monthlyVolumeByCurrency || [];
                  const total = dashboard.totalVolumeByCurrency || [];
                  const totalOf = (c: number) => total.find((t) => t.currency === c)?.amount || 0;
                  const byBase = dashboard.companiesByBaseCurrency || [];
                  const statusRows = [
                    { label: "Active", n: dashboard.activeCompanies, dot: "bg-emerald-500" },
                    { label: "Trial", n: dashboard.trialCompanies, dot: "bg-blue-500" },
                    { label: "Expired", n: dashboard.expiredCompanies, dot: "bg-amber-500" },
                    { label: "Suspended", n: dashboard.suspendedCompanies, dot: "bg-red-500" },
                  ];
                  const maxStatus = Math.max(1, ...statusRows.map((r) => r.n));
                  const active = dashboard.topCompaniesByTransactions?.length
                    ? dashboard.topCompaniesByTransactions
                    : dashboard.topCompaniesByVolume || [];
                  const now = Date.now();
                  return (
                    <div className="space-y-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">Overview</h1>
                          <p className="mt-1 text-[14px] text-slate-500">
                            {dashboard.totalCompanies} bureaus
                            {byBase.length > 0 &&
                              ` · ${byBase.map((b) => `${b.count} ${b.currency === 2 ? "in Uganda (UGX)" : b.currency === 0 ? "in Kenya (KES)" : codeOf(b.currency)}`).join(", ")}`}
                          </p>
                        </div>
                        <button
                          onClick={refreshAll}
                          disabled={refreshing}
                          className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-3.5 text-[14px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:self-auto"
                        >
                          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                          Refresh
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                          title="Bureaus"
                          value={dashboard.totalCompanies}
                          subValue={`${dashboard.activeCompanies} active · ${dashboard.trialCompanies} on trial`}
                          icon={Building2}
                          trend={dashboard.companiesGrowth}
                        />
                        <StatCard
                          title="Users"
                          value={formatNumber(dashboard.totalUsers)}
                          subValue={`${dashboard.activeUsersToday} signed in today`}
                          icon={Users}
                          trend={dashboard.usersGrowth}
                        />
                        <StatCard
                          title="Revenue / month"
                          value={formatCurrency(dashboard.monthlyRecurringRevenue, PLATFORM_CURRENCY)}
                          subValue={`${formatCurrency(dashboard.totalRevenue, PLATFORM_CURRENCY)} collected to date`}
                          icon={DollarSign}
                          trend={dashboard.revenueGrowth}
                        />
                        <StatCard
                          title="Transactions this month"
                          value={formatNumber(dashboard.monthlyTransactionsCount)}
                          subValue={`${formatNumber(dashboard.totalTransactionsCount)} all time`}
                          icon={Activity}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                        {/* Volume per currency — amounts in different currencies are never added */}
                        <section className="rounded-xl border border-slate-200 bg-white">
                          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                            <h2 className="text-[16px] font-semibold text-slate-900">Volume by currency</h2>
                            <span className="text-[13px] text-slate-500">All bureaus</span>
                          </div>
                          {monthly.length === 0 && total.length === 0 ? (
                            <p className="px-5 py-8 text-center text-[14px] text-slate-500">No transactions yet.</p>
                          ) : (
                            <table className="w-full text-[14px]">
                              <thead>
                                <tr className="border-b border-slate-100 text-left text-[13px] text-slate-500">
                                  <th className="px-5 py-2.5 font-medium">Currency</th>
                                  <th className="px-5 py-2.5 text-right font-medium">This month</th>
                                  <th className="px-5 py-2.5 text-right font-medium">All time</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(monthly.length ? monthly : total).map((m) => (
                                  <tr key={m.currency} className="border-b border-slate-100 last:border-0">
                                    <td className="px-5 py-3 font-medium text-slate-900">{m.currencyCode || codeOf(m.currency)}</td>
                                    <td className="px-5 py-3 text-right tabular-nums text-slate-900">
                                      {monthly.length ? formatNumber(Math.round(m.amount)) : "—"}
                                    </td>
                                    <td className="px-5 py-3 text-right tabular-nums text-slate-500">
                                      {formatNumber(Math.round(totalOf(m.currency)))}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </section>

                        {/* Bureau status + system */}
                        <section className="rounded-xl border border-slate-200 bg-white p-5">
                          <div className="flex items-center justify-between">
                            <h2 className="text-[16px] font-semibold text-slate-900">Bureau status</h2>
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium ${
                                dashboard.systemStatus === "Healthy" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                              }`}
                              title={`${dashboard.errorsLast24h} errors in the last 24 hours`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${dashboard.systemStatus === "Healthy" ? "bg-emerald-500" : "bg-amber-500"}`} />
                              System {(dashboard.systemStatus || "status unknown").toLowerCase()}
                            </span>
                          </div>
                          <div className="mt-4 space-y-3">
                            {statusRows.map((r) => (
                              <div key={r.label}>
                                <div className="flex items-center justify-between text-[14px]">
                                  <span className="flex items-center gap-2 text-slate-700">
                                    <span className={`h-2 w-2 rounded-full ${r.dot}`} />
                                    {r.label}
                                  </span>
                                  <span className="font-semibold tabular-nums text-slate-900">{r.n}</span>
                                </div>
                                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                                  <div className={`h-1.5 rounded-full ${r.dot}`} style={{ width: `${(r.n / maxStatus) * 100}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-[13px]">
                            <button onClick={() => setActiveTab("system")} className="rounded-lg bg-slate-50 px-3 py-2 text-left hover:bg-slate-100">
                              <div className="text-slate-500">Errors (24h)</div>
                              <div className="text-[18px] font-semibold text-slate-900">{dashboard.errorsLast24h}</div>
                            </button>
                            <button onClick={() => setActiveTab("security")} className="rounded-lg bg-slate-50 px-3 py-2 text-left hover:bg-slate-100">
                              <div className="text-slate-500">Open security alerts</div>
                              <div className={`text-[18px] font-semibold ${dashboard.securityAlertsActive ? "text-red-600" : "text-slate-900"}`}>
                                {dashboard.securityAlertsActive}
                              </div>
                            </button>
                          </div>
                        </section>
                      </div>

                      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        {/* Most active bureaus (ranked by transactions — comparable across currencies) */}
                        <section className="rounded-xl border border-slate-200 bg-white">
                          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                            <h2 className="text-[16px] font-semibold text-slate-900">Most active bureaus</h2>
                            <span className="text-[13px] text-slate-500">By transactions</span>
                          </div>
                          {active.length === 0 ? (
                            <p className="px-5 py-8 text-center text-[14px] text-slate-500">No activity yet.</p>
                          ) : (
                            <ul className="divide-y divide-slate-100">
                              {active.map((c, i) => (
                                <li key={c.id}>
                                  <button
                                    onClick={() => viewCompanyDetails(c.id)}
                                    className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50"
                                  >
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[13px] font-semibold text-slate-600">
                                      {i + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="truncate text-[14px] font-medium text-slate-900">{c.name}</span>
                                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                                          {codeOf(c.baseCurrency)}
                                        </span>
                                      </div>
                                      <div className="truncate text-[13px] text-slate-500">
                                        {(c.volumeByCurrency || []).map((v) => compactMoney(v.amount, v.currencyCode || codeOf(v.currency))).join(" · ") || "—"}
                                      </div>
                                    </div>
                                    <span className="shrink-0 text-right">
                                      <span className="block text-[14px] font-semibold tabular-nums text-slate-900">
                                        {formatNumber(c.transactionCount ?? c.value)}
                                      </span>
                                      <span className="block text-[12px] text-slate-500">transactions</span>
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </section>

                        {/* Subscriptions needing attention: expired first, then due soon */}
                        <section className="rounded-xl border border-slate-200 bg-white">
                          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                            <h2 className="text-[16px] font-semibold text-slate-900">Subscriptions to follow up</h2>
                            <span className="text-[13px] text-slate-500">Next 30 days</span>
                          </div>
                          {dashboard.expiringSubscriptions.length === 0 ? (
                            <p className="px-5 py-8 text-center text-[14px] text-slate-500">Nothing due in the next 30 days.</p>
                          ) : (
                            <ul className="divide-y divide-slate-100">
                              {dashboard.expiringSubscriptions.map((c) => {
                                const exp = c.subscriptionExpiresAt ? new Date(c.subscriptionExpiresAt).getTime() : now;
                                const days = Math.round((exp - now) / 86400000);
                                const overdue = days < 0;
                                return (
                                  <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-[14px] font-medium text-slate-900">{c.name}</div>
                                      <div className={`text-[13px] ${overdue ? "text-red-600" : days <= 7 ? "text-amber-700" : "text-slate-500"}`}>
                                        {overdue
                                          ? `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`
                                          : days === 0
                                            ? "Expires today"
                                            : `Expires in ${days} day${days === 1 ? "" : "s"}`}
                                        {" · "}
                                        {c.subscriptionPlan}, {formatCurrency(c.monthlyFee, PLATFORM_CURRENCY)}/mo
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => {
                                        setSelectedCompanyId(c.id);
                                        openModal("updateSubscription", {
                                          plan: c.subscriptionPlan,
                                          status: c.subscriptionStatus,
                                          monthlyFee: c.monthlyFee,
                                        });
                                      }}
                                      className="h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                      Renew
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </section>
                      </div>

                      {/* Recent signups */}
                      <section className="rounded-xl border border-slate-200 bg-white">
                        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                          <h2 className="text-[16px] font-semibold text-slate-900">Newest bureaus</h2>
                          <button onClick={() => setActiveTab("companies")} className="text-[13px] font-medium text-blue-700 hover:underline">
                            All bureaus
                          </button>
                        </div>
                        <ul className="divide-y divide-slate-100">
                          {dashboard.recentSignups.map((c) => (
                            <li key={c.id}>
                              <button onClick={() => viewCompanyDetails(c.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate text-[14px] font-medium text-slate-900">{c.name}</span>
                                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusColor(c.subscriptionStatus)}`}>
                                      {c.subscriptionStatus}
                                    </span>
                                  </div>
                                  <div className="text-[13px] text-slate-500">
                                    {c.code} · {c.ownerName} · {codeOf(c.baseCurrency)}
                                  </div>
                                </div>
                                <span className="shrink-0 text-[13px] text-slate-500">Joined {formatDate(c.createdAt)}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    </div>
                  );
                })()}

                {/* COMPANIES TAB */}
                {activeTab === "companies" && (() => {
                  const rows = (companies?.items ?? []).filter(
                    (c) => baseFilter === "all" || (c.baseCurrency ?? 0) === Number(baseFilter),
                  );
                  const total = companies?.totalCount ?? 0;
                  const now = Date.now();
                  const iconBtn = "rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900";
                  return (
                    <div className="space-y-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">Bureaus</h1>
                          <p className="mt-1 text-[14px] text-slate-500">{total} registered on Sarif</p>
                        </div>
                        <button
                          onClick={() => openModal("createCompany")}
                          className="inline-flex h-10 items-center gap-2 self-start rounded-lg bg-blue-600 px-4 text-[14px] font-semibold text-white hover:bg-blue-700 sm:self-auto"
                        >
                          <Plus className="h-4 w-4" /> Add bureau
                        </button>
                      </div>

                      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search by name, code or owner"
                            value={searchTerm}
                            onChange={(e: any) => {
                              setSearchTerm(e.target.value);
                              setCompaniesPage(1);
                            }}
                            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-[14px] text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                          />
                        </div>
                        <select
                          value={companyStatus}
                          onChange={(e: any) => {
                            setCompanyStatus(e.target.value);
                            setCompaniesPage(1);
                          }}
                          aria-label="Subscription status"
                          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[14px] text-slate-700 outline-none focus:border-blue-600"
                        >
                          <option value="all">All statuses</option>
                          <option value="active">Active</option>
                          <option value="trial">Trial</option>
                          <option value="expired">Expired</option>
                          <option value="suspended">Suspended</option>
                        </select>
                        <select
                          value={baseFilter}
                          onChange={(e: any) => setBaseFilter(e.target.value)}
                          aria-label="Home currency"
                          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[14px] text-slate-700 outline-none focus:border-blue-600"
                        >
                          <option value="all">All countries</option>
                          <option value="0">Kenya (KES)</option>
                          <option value="2">Uganda (UGX)</option>
                        </select>
                      </div>

                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[920px] text-[14px]">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[13px] text-slate-500">
                                <th className="px-5 py-3 font-medium">Bureau</th>
                                <th className="px-3 py-3 font-medium">Home</th>
                                <th className="px-3 py-3 font-medium">Subscription</th>
                                <th className="px-3 py-3 text-right font-medium">Clients</th>
                                <th className="px-3 py-3 font-medium">This month</th>
                                <th className="px-3 py-3 text-right font-medium">Billing</th>
                                <th className="px-5 py-3 text-right font-medium">
                                  <span className="sr-only">Actions</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {rows.length === 0 && (
                                <tr>
                                  <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                                    {companies ? "No bureaus match these filters." : "Couldn't load bureaus. Try Refresh."}
                                  </td>
                                </tr>
                              )}
                              {rows.map((c) => {
                                const exp = c.subscriptionExpiresAt ? new Date(c.subscriptionExpiresAt).getTime() : null;
                                const days = exp !== null ? Math.round((exp - now) / 86400000) : null;
                                const vols = c.monthlyVolumeByCurrency ?? [];
                                return (
                                  <tr
                                    key={c.id}
                                    onClick={() => viewCompanyDetails(c.id)}
                                    className="cursor-pointer align-top hover:bg-slate-50"
                                  >
                                    <td className="px-5 py-3.5">
                                      <div className="font-medium text-slate-900">{c.name}</div>
                                      <div className="text-[13px] text-slate-500">
                                        {c.code} · {c.ownerName}
                                      </div>
                                    </td>
                                    <td className="px-3 py-3.5">
                                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px] font-medium text-slate-700">
                                        {codeOf(c.baseCurrency)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3.5">
                                      <div className="flex items-center gap-2">
                                        <span className={`rounded-full border px-2 py-0.5 text-[12px] font-medium ${getStatusColor(c.subscriptionStatus)}`}>
                                          {c.subscriptionStatus}
                                        </span>
                                        <span className="text-[13px] text-slate-600">{c.subscriptionPlan}</span>
                                      </div>
                                      {days !== null && (
                                        <div className={`mt-1 text-[12px] ${days < 0 ? "text-red-600" : days <= 7 ? "text-amber-700" : "text-slate-500"}`}>
                                          {days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? "Expires today" : `Renews in ${days}d`}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-3.5 text-right tabular-nums">
                                      <div className="text-slate-900">{formatNumber(c.totalClients)}</div>
                                      <div className="text-[12px] text-slate-500">{c.activeClients} active</div>
                                    </td>
                                    <td className="px-3 py-3.5">
                                      <div className="tabular-nums text-slate-900">{formatNumber(c.monthlyTransactions)} transactions</div>
                                      <div className="text-[12px] text-slate-500">
                                        {vols.length ? vols.map((v) => compactMoney(v.amount, v.currencyCode || codeOf(v.currency))).join(" · ") : "No volume"}
                                      </div>
                                    </td>
                                    <td className="px-3 py-3.5 text-right tabular-nums">
                                      <div className="text-slate-900">{formatCurrency(c.monthlyFee, PLATFORM_CURRENCY)}/mo</div>
                                      <div className="text-[12px] text-slate-500">{formatCurrency(c.totalPaid, PLATFORM_CURRENCY)} paid</div>
                                    </td>
                                    <td className="px-5 py-2.5" onClick={(e: any) => e.stopPropagation()}>
                                      <div className="flex items-center justify-end gap-0.5">
                                        <button onClick={() => viewCompanyDetails(c.id)} className={iconBtn} title="View details" aria-label={`View ${c.name}`}>
                                          <Eye className="h-4 w-4" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            setSelectedCompanyId(c.id);
                                            openModal("updateSubscription", {
                                              plan: c.subscriptionPlan,
                                              status: c.subscriptionStatus,
                                              monthlyFee: c.monthlyFee,
                                            });
                                          }}
                                          className={iconBtn}
                                          title="Subscription"
                                          aria-label={`Subscription for ${c.name}`}
                                        >
                                          <CreditCard className="h-4 w-4" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            setSelectedCompanyId(c.id);
                                            openModal("resetPassword");
                                          }}
                                          className={iconBtn}
                                          title="Reset password"
                                          aria-label={`Reset password for ${c.name}`}
                                        >
                                          <Key className="h-4 w-4" />
                                        </button>
                                        {c.isActive ? (
                                          <button
                                            onClick={() => {
                                              setSelectedCompanyId(c.id);
                                              openModal("suspendCompany");
                                            }}
                                            className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                                            title="Suspend"
                                            aria-label={`Suspend ${c.name}`}
                                          >
                                            <Ban className="h-4 w-4" />
                                          </button>
                                        ) : (
                                          <button
                                            onClick={() => handleActivateCompany(c.id)}
                                            className="rounded-md p-2 text-emerald-700 hover:bg-emerald-50"
                                            title="Reactivate"
                                            aria-label={`Reactivate ${c.name}`}
                                          >
                                            <CheckCircle2 className="h-4 w-4" />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {total > 10 && (
                          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-[13px] text-slate-500">
                            <span>
                              {(companiesPage - 1) * 10 + 1}–{Math.min(companiesPage * 10, total)} of {total}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setCompaniesPage((p) => Math.max(1, p - 1))}
                                disabled={companiesPage === 1}
                                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                                aria-label="Previous page"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                              <span className="px-2 font-medium text-slate-900">{companiesPage}</span>
                              <button
                                onClick={() => setCompaniesPage((p) => p + 1)}
                                disabled={companiesPage * 10 >= total}
                                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                                aria-label="Next page"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* SECURITY TAB */}
                {activeTab === "security" && (
                  <div className="space-y-6">
                    <div>
                      <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">Security</h1>
                      <p className="mt-1 text-[14px] text-slate-500">Sign-in failures, alerts and blocked addresses</p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <StatCard
                        title="Failed sign-ins (24h)"
                        value={<span className={(security?.failedLoginsLast24h || 0) > 0 ? "text-red-600" : ""}>{security?.failedLoginsLast24h || 0}</span>}
                        subValue={`${security?.failedLoginsLast7d || 0} in the last 7 days`}
                        icon={ShieldAlert}
                      />
                      <StatCard title="Locked accounts" value={security?.lockedAccounts || 0} icon={Lock} />
                      <StatCard title="Blocked IPs" value={security?.blockedIPs || 0} icon={Ban} />
                      <StatCard
                        title="Open alerts"
                        value={security?.activeAlerts || 0}
                        subValue={`${security?.suspiciousActivities || 0} suspicious activities`}
                        icon={AlertTriangle}
                      />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="rounded-xl bg-white border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-[16px] font-semibold text-slate-900">
                            Alerts
                          </h3>
                          <select
                            value={alertStatus}
                            onChange={(e: any) => {
                              setAlertStatus(e.target.value);
                              setAlertsPage(1);
                            }}
                            className="rounded-lg px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-900 text-sm"
                          >
                            <option value="all">All</option>
                            <option value="active">Active</option>
                            <option value="resolved">Resolved</option>
                          </select>
                        </div>
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {alerts?.items && alerts.items.length > 0 ? (
                            alerts.items.map((alert) => (
                              <div
                                key={alert.id}
                                className={`rounded-lg border border-slate-200 p-4 ${
                                  alert.isResolved ? "bg-slate-50 opacity-75" : "border-l-4 border-l-red-500 bg-white"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span
                                        className={`px-2 py-0.5 text-xs font-medium ${getSeverityColor(
                                          alert.severity,
                                        )}`}
                                      >
                                        {alert.severity}
                                      </span>
                                      <span className="text-slate-500 text-xs">
                                        {humanize(alert.alertType)}
                                      </span>
                                    </div>
                                    <p className="text-slate-900 text-sm">
                                      {alert.message}
                                    </p>
                                    <p className="text-slate-500 text-xs mt-1">
                                      {alert.ipAddress &&
                                        `IP: ${alert.ipAddress} • `}
                                      {timeAgo(alert.createdAt)}
                                    </p>
                                  </div>
                                  {!alert.isResolved && (
                                    <button
                                      onClick={() => {
                                        setSelectedAlertId(alert.id);
                                        openModal("resolveAlert");
                                      }}
                                      className="h-8 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                      Resolve
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-slate-500 text-center py-8">
                              No alerts found
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-6">
                        <div className="rounded-xl bg-white border border-slate-200 p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[16px] font-semibold text-slate-900">
                              Block an address
                            </h3>
                            <button
                              onClick={() => openModal("blockIP")}
                              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-red-700 hover:bg-red-50"
                            >
                              <Ban className="w-4 h-4" /> Block an IP
                            </button>
                          </div>
                          <p className="text-slate-500 text-sm">
                            Block malicious IP addresses from accessing the
                            platform.
                          </p>
                        </div>
                        <div className="rounded-xl bg-white border border-slate-200 p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[16px] font-semibold text-slate-900">
                              Allowed IPs
                            </h3>
                            <button
                              onClick={() => openModal("addWhitelist")}
                              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Plus className="w-4 h-4" /> Add IP
                            </button>
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {whitelist && whitelist.length > 0 ? (
                              whitelist.map((ip) => (
                                <div
                                  key={ip.id}
                                  className="rounded-xl flex items-center justify-between p-3 bg-white border border-slate-200"
                                >
                                  <div>
                                    <p className="text-slate-900 font-mono text-sm">
                                      {ip.ipAddress}
                                    </p>
                                    <p className="text-slate-500 text-xs">
                                      {ip.description || "No description"}
                                    </p>
                                  </div>
                                  <button aria-label="Delete"
                                    onClick={() => handleRemoveWhitelist(ip.id)}
                                    className="rounded-lg p-2 hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-700" />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <p className="text-slate-500 text-center py-4">
                                No whitelisted IPs
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {security?.recentFailedLogins &&
                      security.recentFailedLogins.length > 0 && (
                        <div className="rounded-xl bg-white border border-slate-200 p-6">
                          <h3 className="mb-4 text-[16px] font-semibold text-slate-900">
                            Recent failed sign-ins
                          </h3>
                          <div className="overflow-x-auto max-w-full">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-slate-200">
                                  <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                    Time
                                  </th>
                                  <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                    User
                                  </th>
                                  <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                    IP Address
                                  </th>
                                  <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                    Reason
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {security.recentFailedLogins
                                  .slice(0, 10)
                                  .map((login) => (
                                    <tr
                                      key={login.id}
                                      className="border-b border-slate-200"
                                    >
                                      <td className="px-4 py-3 text-slate-900 text-sm">
                                        {timeAgo(login.loginAt)}
                                      </td>
                                      <td className="px-4 py-3 text-slate-900 text-sm">
                                        {login.userName ||
                                          login.companyName ||
                                          "Unknown"}
                                      </td>
                                      <td className="px-4 py-3 text-slate-500 text-sm font-mono">
                                        {login.ipAddress}
                                      </td>
                                      <td className="px-4 py-3 text-red-700 text-sm">
                                        {login.failureReason ||
                                          "Invalid credentials"}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                  </div>
                )}

                {/* FINANCIAL TAB */}
                {activeTab === "financial" && (() => {
                  const f = financial;
                  const monthly = f?.monthlyVolumeByCurrency ?? [];
                  const total = f?.totalVolumeByCurrency ?? [];
                  const totalOf = (c: number) => total.find((t) => t.currency === c)?.amount || 0;
                  const plans = f?.revenueByPlan ?? [];
                  const maxPlan = Math.max(1, ...plans.map((p) => p.revenue));
                  const followUps = dashboard?.expiringSubscriptions ?? [];
                  const now = Date.now();
                  return (
                    <div className="space-y-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">Financial</h1>
                          <p className="mt-1 text-[14px] text-slate-500">
                            Subscription revenue is in {PLATFORM_CURRENCY}. Bureau volume is shown per currency.
                          </p>
                        </div>
                        <button
                          onClick={() => openModal("recordPayment")}
                          className="inline-flex h-10 items-center gap-2 self-start rounded-lg bg-blue-600 px-4 text-[14px] font-semibold text-white hover:bg-blue-700 sm:self-auto"
                        >
                          <Plus className="h-4 w-4" /> Record payment
                        </button>
                      </div>

                      {!f ? (
                        <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-[14px] text-slate-500">
                          Couldn&apos;t load financial data. Try Refresh.
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <StatCard title="Revenue / month" value={formatCurrency(f.monthlyRevenue, PLATFORM_CURRENCY)} icon={DollarSign} trend={f.revenueGrowth} subValue="From active subscriptions" />
                            <StatCard title="This year" value={formatCurrency(f.yearlyRevenue, PLATFORM_CURRENCY)} icon={TrendingUp} />
                            <StatCard title="Collected to date" value={formatCurrency(f.totalRevenue, PLATFORM_CURRENCY)} icon={CheckCircle2} />
                            <StatCard
                              title="Overdue"
                              value={<span className={f.pendingPayments > 0 ? "text-red-600" : ""}>{formatCurrency(f.pendingPayments, PLATFORM_CURRENCY)}</span>}
                              icon={AlertTriangle}
                              subValue="Fees of lapsed subscriptions"
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <section className="rounded-xl border border-slate-200 bg-white p-5">
                              <h2 className="text-[16px] font-semibold text-slate-900">Revenue by plan</h2>
                              <div className="mt-4 space-y-4">
                                {plans.map((p) => (
                                  <div key={p.plan}>
                                    <div className="flex items-baseline justify-between gap-3 text-[14px]">
                                      <span className="font-medium text-slate-900">
                                        {p.plan}{" "}
                                        <span className="font-normal text-slate-500">
                                          · {p.companyCount} {p.companyCount === 1 ? "bureau" : "bureaus"}
                                        </span>
                                      </span>
                                      <span className="tabular-nums text-slate-900">{formatCurrency(p.revenue, PLATFORM_CURRENCY)}</span>
                                    </div>
                                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                                      <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${(p.revenue / maxPlan) * 100}%` }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>

                            <section className="rounded-xl border border-slate-200 bg-white">
                              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                                <h2 className="text-[16px] font-semibold text-slate-900">Bureau volume by currency</h2>
                                <span className="text-[13px] text-slate-500">
                                  {(f.transactionsByType ?? []).reduce((n, t) => n + t.count, 0).toLocaleString()} transactions
                                </span>
                              </div>
                              <table className="w-full text-[14px]">
                                <thead>
                                  <tr className="border-b border-slate-100 text-left text-[13px] text-slate-500">
                                    <th className="px-5 py-2.5 font-medium">Currency</th>
                                    <th className="px-5 py-2.5 text-right font-medium">This month</th>
                                    <th className="px-5 py-2.5 text-right font-medium">All time</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {/* Every currency with any volume, this month or ever. (It listed only
                                      this month's currencies, so one with no trades this month vanished.) */}
                                  {[...new Set([...total, ...monthly].map((m) => m.currency))].sort((a, b) => a - b).map((cur) => {
                                    const m = monthly.find((x) => x.currency === cur);
                                    return (
                                    <tr key={cur} className="border-b border-slate-100 last:border-0">
                                      <td className="px-5 py-3 font-medium text-slate-900">{codeOf(cur)}</td>
                                      <td className="px-5 py-3 text-right tabular-nums text-slate-900">
                                        {m ? formatNumber(Math.round(m.amount)) : "—"}
                                      </td>
                                      <td className="px-5 py-3 text-right tabular-nums text-slate-500">{formatNumber(Math.round(totalOf(cur)))}</td>
                                    </tr>
                                    );
                                  })}
                                  {monthly.length === 0 && total.length === 0 && (
                                    <tr>
                                      <td colSpan={3} className="px-5 py-8 text-center text-slate-500">
                                        No transactions yet.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                              {(f.transactionsByType ?? []).length > 0 && (
                                <div className="flex gap-6 border-t border-slate-100 px-5 py-3 text-[13px] text-slate-500">
                                  {f.transactionsByType.map((t) => (
                                    <span key={t.type}>
                                      {t.type}: <span className="font-medium tabular-nums text-slate-900">{t.count.toLocaleString()}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </section>
                          </div>
                        </>
                      )}

                      {followUps.length > 0 && (
                        <section className="rounded-xl border border-slate-200 bg-white">
                          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                            <h2 className="text-[16px] font-semibold text-slate-900">Subscriptions to follow up</h2>
                            <span className="text-[13px] text-slate-500">Overdue first</span>
                          </div>
                          <ul className="divide-y divide-slate-100">
                            {followUps.map((c) => {
                              const exp = c.subscriptionExpiresAt ? new Date(c.subscriptionExpiresAt).getTime() : now;
                              const days = Math.round((exp - now) / 86400000);
                              return (
                                <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-[14px] font-medium text-slate-900">{c.name}</div>
                                    <div className={`text-[13px] ${days < 0 ? "text-red-600" : days <= 7 ? "text-amber-700" : "text-slate-500"}`}>
                                      {days < 0 ? `Expired ${Math.abs(days)} days ago` : days === 0 ? "Expires today" : `Expires in ${days} days`}
                                      {" · "}
                                      {formatCurrency(c.monthlyFee || 0, PLATFORM_CURRENCY)}/mo
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setFormData({ ...formData, companyId: c.id, amount: String(c.monthlyFee || "") });
                                      openModal("recordPayment");
                                    }}
                                    className="h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    Record payment
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      )}

                      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="border-b border-slate-200 px-5 py-4">
                          <h2 className="text-[16px] font-semibold text-slate-900">Recent payments</h2>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-[14px]">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[13px] text-slate-500">
                                <th className="px-5 py-2.5 font-medium">Date</th>
                                <th className="px-3 py-2.5 font-medium">Bureau</th>
                                <th className="px-3 py-2.5 font-medium">Method</th>
                                <th className="px-3 py-2.5 font-medium">Reference</th>
                                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                                <th className="px-5 py-2.5 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(payments?.items ?? []).length === 0 && (
                                <tr>
                                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                                    No payments recorded yet.
                                  </td>
                                </tr>
                              )}
                              {(payments?.items ?? []).map((p) => (
                                <tr key={p.id}>
                                  <td className="whitespace-nowrap px-5 py-3 text-slate-700">{p.paidAt ? formatDate(p.paidAt) : "—"}</td>
                                  <td className="px-3 py-3 text-slate-900">{p.companyName}</td>
                                  <td className="px-3 py-3 text-slate-600">{p.paymentMethod}</td>
                                  <td className="px-3 py-3 font-mono text-[13px] text-slate-500">{p.reference || "—"}</td>
                                  <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">
                                    {formatCurrency(p.amount, p.currency || PLATFORM_CURRENCY)}
                                  </td>
                                  <td className="px-5 py-3">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${
                                        p.status === "Completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                                      }`}
                                    >
                                      {p.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </div>
                  );
                })()}

                {/* ANALYTICS TAB */}
                {activeTab === "analytics" && (
                  <div className="space-y-6">
                    <div>
                      <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">Analytics</h1>
                      <p className="mt-1 text-[14px] text-slate-500">How bureaus and their clients use Sarif</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="rounded-xl bg-white border border-slate-200 p-6">
                        <p className="text-slate-500 text-sm mb-1">
                          Daily active users
                        </p>
                        <p className="text-[26px] font-semibold text-slate-900 tracking-tight">
                          {formatNumber(analytics?.dailyActiveUsers || 0)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white border border-slate-200 p-6">
                        <p className="text-slate-500 text-sm mb-1">
                          Weekly active users
                        </p>
                        <p className="text-[26px] font-semibold text-slate-900 tracking-tight">
                          {formatNumber(analytics?.weeklyActiveUsers || 0)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white border border-slate-200 p-6">
                        <p className="text-slate-500 text-sm mb-1">
                          Monthly active users
                        </p>
                        <p className="text-[26px] font-semibold text-slate-900 tracking-tight">
                          {formatNumber(analytics?.monthlyActiveUsers || 0)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white border border-slate-200 p-6">
                        <p className="text-slate-500 text-sm mb-1">
                          Avg. session
                        </p>
                        <p className="text-[26px] font-semibold text-slate-900 tracking-tight">
                          {Math.floor(
                            (analytics?.avgSessionDurationSeconds || 0) / 60,
                          )}
                          m
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-6">
                      <h3 className="mb-4 text-[16px] font-semibold text-slate-900">
                        Feature usage
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {analytics?.featureUsage?.map((feature) => (
                          <div
                            key={feature.feature}
                            className="rounded-xl p-4 bg-white border border-slate-200"
                          >
                            <p className="text-slate-900 font-medium">
                              {feature.feature}
                            </p>
                            <p className="text-2xl font-bold text-blue-700">
                              {formatNumber(feature.totalUses)}
                            </p>
                            <p className="text-slate-500 text-sm">
                              {feature.uniqueUsers} unique users
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 6-month trends */}
                    {analytics && (
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        {[
                          { title: "Users", data: analytics.userGrowth || [], fmt: (n: number) => formatNumber(n) },
                          { title: "Transactions / month", data: analytics.transactionGrowth || [], fmt: (n: number) => formatNumber(n) },
                          { title: `Revenue / month (${PLATFORM_CURRENCY})`, data: analytics.revenueGrowth || [], fmt: (n: number) => compactMoney(n, PLATFORM_CURRENCY) },
                        ].map((chart) => {
                          const max = Math.max(1, ...chart.data.map((d) => d.value));
                          const last = chart.data[chart.data.length - 1]?.value ?? 0;
                          const prev = chart.data[chart.data.length - 2]?.value ?? 0;
                          const change = prev > 0 ? ((last - prev) / prev) * 100 : 0;
                          return (
                            <section key={chart.title} className="rounded-xl border border-slate-200 bg-white p-5">
                              <div className="flex items-baseline justify-between gap-2">
                                <h3 className="text-[14px] font-medium text-slate-500">{chart.title}</h3>
                                {prev > 0 && (
                                  <span className={`text-[12px] font-medium ${change >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                                    {change >= 0 ? "+" : ""}
                                    {change.toFixed(1)}% vs last month
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-[22px] font-semibold tabular-nums text-slate-900">{chart.fmt(last)}</div>
                              {chart.data.length === 0 ? (
                                <p className="mt-4 text-[13px] text-slate-500">No history yet.</p>
                              ) : (
                                <div className="mt-4 flex h-28 items-end gap-2" role="img" aria-label={`${chart.title} over the last ${chart.data.length} months`}>
                                  {chart.data.map((d, i) => (
                                    <div key={d.period} className="flex flex-1 flex-col items-center gap-1.5">
                                      <div
                                        className={`w-full rounded-t ${i === chart.data.length - 1 ? "bg-blue-600" : "bg-slate-200"}`}
                                        style={{ height: `${Math.max(4, (d.value / max) * 96)}px` }}
                                        title={`${d.period}: ${chart.fmt(d.value)}`}
                                      />
                                      <span className="text-[11px] text-slate-500">{d.period}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </section>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* AUDIT TAB */}
                {activeTab === "audit" && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">Audit log</h1>
                        <p className="mt-1 text-[14px] text-slate-500">Who changed what, and every sign-in</p>
                      </div>
                      <button
                        onClick={handleExportAuditLogs}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-[14px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="w-4 h-4" /> Export CSV
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={auditAction}
                        onChange={(e: any) => {
                          setAuditAction(e.target.value);
                          setAuditPage(1);
                        }}
                        className="rounded-lg px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-900"
                      >
                        <option value="all">All actions</option>
                        <option value="Create">Create</option>
                        <option value="Update">Update</option>
                        <option value="Delete">Delete</option>
                        <option value="Login">Login</option>
                      </select>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
                      <div className="overflow-x-auto max-w-full">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-slate-200 bg-white">
                              <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                Timestamp
                              </th>
                              <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                User
                              </th>
                              <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                Company
                              </th>
                              <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                Action
                              </th>
                              <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                Entity
                              </th>
                              <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                Details
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {auditLogs?.items?.map((log) => (
                              <tr
                                key={log.id}
                                className="border-b border-slate-200 hover:bg-slate-50"
                              >
                                <td className="px-4 py-3 text-slate-900 text-sm">
                                  {formatDateTime(log.createdAt)}
                                </td>
                                <td className="px-4 py-3 text-slate-900 text-sm">
                                  {log.userName || "System"}
                                </td>
                                <td className="px-4 py-3 text-slate-500 text-sm">
                                  {log.companyName || "-"}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`px-2 py-1 text-xs font-medium ${
                                      log.action === "Create"
                                        ? "bg-emerald-50 text-emerald-700"
                                        : log.action === "Update"
                                          ? "bg-blue-50 text-blue-700"
                                          : log.action === "Delete"
                                            ? "bg-red-50 text-red-700"
                                            : "bg-slate-500/20 text-slate-500"
                                    }`}
                                  >
                                    {log.action}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-500 text-sm">
                                  {log.entityType}
                                </td>
                                <td className="px-4 py-3 text-slate-500 text-sm max-w-xs truncate">
                                  {log.newValues || "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {auditLogs && auditLogs.totalCount > 15 && (
                        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                          <p className="text-slate-500 text-sm">
                            Page {auditPage} of{" "}
                            {Math.ceil(auditLogs.totalCount / 15)}
                          </p>
                          <div className="flex items-center gap-2">
                            <button aria-label="Previous"
                              onClick={() =>
                                setAuditPage((p) => Math.max(1, p - 1))
                              }
                              disabled={auditPage === 1}
                              className="rounded-lg p-2 hover:bg-slate-50 disabled:opacity-30"
                            >
                              <ChevronLeft className="w-5 h-5 text-slate-900" />
                            </button>
                            <button aria-label="Next"
                              onClick={() => setAuditPage((p) => p + 1)}
                              disabled={auditPage * 15 >= auditLogs.totalCount}
                              className="p-2 hover:bg-slate-50 disabled:opacity-30"
                            >
                              <ChevronRight className="w-5 h-5 text-slate-900" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-6">
                      <h3 className="mb-4 text-[16px] font-semibold text-slate-900">
                        Sign-in history
                      </h3>
                      <div className="space-y-2">
                        {loginHistory?.items?.slice(0, 10).map((login) => (
                          <div
                            key={login.id}
                            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
                          >
                            <div className="flex items-center gap-3">
                              {login.isSuccessful ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                              ) : (
                                <X className="w-5 h-5 text-red-700" />
                              )}
                              <div>
                                <p className="text-slate-900 text-sm">
                                  {login.userName ||
                                    login.companyName ||
                                    "Unknown"}
                                </p>
                                <p className="text-slate-500 text-xs">
                                  {login.userRole === "OfficeUser" ? "Office" : login.userRole === "SuperAdmin" ? "Super admin" : login.userRole}
                                  {login.companyName ? ` · ${login.companyName}` : ""} · {login.ipAddress}
                                  {!login.isSuccessful && login.failureReason ? (
                                    <span className="text-red-600"> · {login.failureReason}</span>
                                  ) : null}
                                </p>
                              </div>
                            </div>
                            <span className="text-slate-500 text-sm">
                              {timeAgo(login.loginAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* SYSTEM TAB */}
                {activeTab === "system" && (
                  <div className="space-y-6">
                    <div>
                      <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">System</h1>
                      <p className="mt-1 text-[14px] text-slate-500">API, database and server health, plus recent logs</p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-6">
                      <div className="flex items-center gap-4 mb-6">
                        <div
                          className={`w-16 h-16 flex items-center justify-center ${
                            systemHealth?.overallStatus === "Healthy"
                              ? "bg-emerald-50"
                              : systemHealth?.overallStatus === "Degraded"
                                ? "bg-amber-50"
                                : "bg-red-50"
                          }`}
                        >
                          {systemHealth?.overallStatus === "Healthy" ? (
                            <ShieldCheck
                              className={`w-8 h-8 ${getHealthColor(
                                systemHealth?.overallStatus || "",
                              )}`}
                            />
                          ) : (
                            <AlertTriangle
                              className={`w-8 h-8 ${getHealthColor(
                                systemHealth?.overallStatus || "",
                              )}`}
                            />
                          )}
                        </div>
                        <div>
                          <h3
                            className={`text-2xl font-bold ${getHealthColor(
                              systemHealth?.overallStatus || "",
                            )}`}
                          >
                            {systemHealth?.overallStatus || "Unknown"}
                          </h3>
                          <p className="text-slate-500">
                            Last checked:{" "}
                            {systemHealth?.lastCheckedAt
                              ? timeAgo(systemHealth.lastCheckedAt)
                              : "N/A"}
                          </p>
                          {!!systemHealth?.reasons?.length && (
                            <ul className="mt-1.5 space-y-0.5 text-sm text-amber-800">
                              {systemHealth.reasons.map((r) => (
                                <li key={r}>• {r}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="rounded-xl p-4 bg-white border border-slate-200">
                          <div className="flex items-center gap-2 mb-3">
                            <Zap className="w-5 h-5 text-blue-700" />
                            <span className="text-slate-900 font-medium">API</span>
                            <span
                              className={`ml-auto px-2 py-0.5 text-xs ${getHealthColor(
                                systemHealth?.apiStatus || "",
                              )}`}
                            >
                              {systemHealth?.apiStatus}
                            </span>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-500">
                                Response Time
                              </span>
                              <span className="text-slate-900">
                                {systemHealth?.apiResponseTimeMs}ms
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">
                                Requests/min
                              </span>
                              <span className="text-slate-900">
                                {systemHealth?.apiRequestsPerMinute}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Error Rate</span>
                              <span
                                className={
                                  systemHealth?.apiErrorRate &&
                                  systemHealth.apiErrorRate > 1
                                    ? "text-red-700"
                                    : "text-slate-900"
                                }
                              >
                                {systemHealth?.apiErrorRate?.toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-xl p-4 bg-white border border-slate-200">
                          <div className="flex items-center gap-2 mb-3">
                            <Database className="w-5 h-5 text-blue-700" />
                            <span className="text-slate-900 font-medium">
                              Database
                            </span>
                            <span
                              className={`ml-auto px-2 py-0.5 text-xs ${getHealthColor(
                                systemHealth?.databaseStatus || "",
                              )}`}
                            >
                              {systemHealth?.databaseStatus}
                            </span>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Latency</span>
                              <span className="text-slate-900">
                                {systemHealth?.databaseLatencyMs}ms
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">
                                Connections
                              </span>
                              <span className="text-slate-900">
                                {systemHealth?.databaseConnections}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-xl p-4 bg-white border border-slate-200">
                          <div className="flex items-center gap-2 mb-3">
                            <Server className="w-5 h-5 text-emerald-700" />
                            <span className="text-slate-900 font-medium">
                              Server
                            </span>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-500">CPU</span>
                              <span
                                className={
                                  systemHealth?.serverCpuUsage &&
                                  systemHealth.serverCpuUsage > 80
                                    ? "text-red-700"
                                    : "text-slate-900"
                                }
                              >
                                {systemHealth?.serverCpuUsage}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Memory</span>
                              <span
                                className={
                                  systemHealth?.serverMemoryUsage &&
                                  systemHealth.serverMemoryUsage > 80
                                    ? "text-red-700"
                                    : "text-slate-900"
                                }
                              >
                                {systemHealth?.serverMemoryUsage}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Disk</span>
                              <span
                                className={
                                  systemHealth?.serverDiskUsage &&
                                  systemHealth.serverDiskUsage > 80
                                    ? "text-amber-700"
                                    : "text-slate-900"
                                }
                              >
                                {systemHealth?.serverDiskUsage}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[16px] font-semibold text-slate-900">
                          Recent logs
                        </h3>
                        <div className="flex items-center gap-3">
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={showResolved}
                            onChange={(e: any) => {
                              setShowResolved(e.target.checked);
                              setSystemLogsPage(1);
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600/20"
                          />
                          Show resolved
                        </label>
                        <select
                          value={logLevel}
                          onChange={(e: any) => {
                            setLogLevel(e.target.value);
                            setSystemLogsPage(1);
                          }}
                          className="rounded-lg px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-900 text-sm"
                        >
                          <option value="all">All levels</option>
                          <option value="Error">Error</option>
                          <option value="Warning">Warning</option>
                          <option value="Info">Info</option>
                        </select>
                        </div>
                      </div>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {systemLogs?.items && systemLogs.items.length > 0 ? (
                          systemLogs.items.map((log) => (
                            <div key={log.id} className={`rounded-lg border border-slate-200 p-3 ${log.resolvedAt ? "bg-slate-50" : "bg-white"}`}>
                              <div className="flex items-start gap-3">
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium ${log.resolvedAt ? "bg-emerald-50 text-emerald-700" : getLogLevelColor(log.level)}`}
                                >
                                  {log.resolvedAt ? "Resolved" : log.level}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm break-words ${log.resolvedAt ? "text-slate-500" : "text-slate-900"}`}>
                                    {log.message}
                                  </p>
                                  <p className="text-xs text-slate-500 mt-1">
                                    {log.source} • {timeAgo(log.createdAt)}
                                    {log.resolvedAt && <> • resolved {timeAgo(log.resolvedAt)}</>}
                                  </p>
                                </div>
                                {!log.resolvedAt && ["Error", "Warning", "Critical"].includes(log.level) && (
                                  <button
                                    onClick={() => resolveLog(log.id)}
                                    disabled={resolvingId !== null}
                                    title="Marks this entry and every identical one as resolved. They stay in the log but stop counting against health."
                                    className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    {resolvingId === log.id ? "Resolving…" : "Mark resolved"}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-slate-500 text-center py-8">
                            No system logs found
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
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
                  <p className="text-sm text-slate-500">
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
      <AnimatePresence>
        {modals.companyDetails && selectedCompany && (
          <Modal
            onClose={() => closeModal("companyDetails")}
            title={selectedCompany.name}
            size="xl"
          >
            <div className="space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="text-slate-500">
                    <span className="font-medium text-slate-700">{selectedCompany.code}</span> · Owner {selectedCompany.ownerName}
                  </p>
                  <p className="text-slate-500 break-all">
                    {selectedCompany.email} · {selectedCompany.whatsAppNumber}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusColor(selectedCompany.subscriptionStatus)}`}>
                    {selectedCompany.subscriptionStatus}
                  </span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${getPlanColor(selectedCompany.subscriptionPlan)}`}>
                    {selectedCompany.subscriptionPlan}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Home currency</p>
                  <p className="text-xs text-slate-500">
                    {selectedCompany.canChangeBaseCurrency !== false
                      ? "Rates and profit use this currency. It can change until the bureau starts trading."
                      : "Locked because the bureau already has exchange or mobile money history."}
                  </p>
                </div>
                {selectedCompany.canChangeBaseCurrency !== false ? (
                  <select
                    aria-label="Home currency"
                    value={selectedCompany.baseCurrency ?? 0}
                    onChange={async (e: any) => {
                      const next = parseInt(e.target.value);
                      const res = await api.setCompanyBaseCurrency(selectedCompany.id, next);
                      if (res.success && res.data) {
                        setSelectedCompany(normalise(res.data, SHAPES.company));
                        toast.success(`Home currency set to ${codeOf(next)}. Exchange rates must be entered again.`);
                      } else {
                        toast.error(res.message || "Couldn't change the home currency");
                      }
                    }}
                    className="h-10 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  >
                    <option value={0}>KES — Kenya</option>
                    <option value={2}>UGX — Uganda</option>
                  </select>
                ) : (
                  <span className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-full bg-slate-100 px-3 text-sm font-medium text-slate-700 sm:self-auto">
                    <Lock className="h-3.5 w-3.5" /> {codeOf(selectedCompany.baseCurrency)}
                  </span>
                )}
              </div>

              <TransactionPinPanel companyId={selectedCompany.id} companyName={selectedCompany.name} />

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: "Users", value: <span className="text-2xl">{selectedCompany.totalUsers}</span> },
                  { label: "Clients", value: <span className="text-2xl">{selectedCompany.totalClients}</span> },
                  {
                    label: "Volume this month",
                    value: (
                      <span className="flex flex-col text-sm leading-snug">
                        {volumeLines(selectedCompany).map((l) => (
                          <span key={l} className="whitespace-nowrap">{l}</span>
                        ))}
                      </span>
                    ),
                  },
                  { label: `Paid to Sarif (${PLATFORM_CURRENCY})`, value: <span className="text-2xl">{formatCurrency(selectedCompany.totalPaid || 0, PLATFORM_CURRENCY)}</span> },
                ].map((t, i) => (
                  <div key={t.label} className={`rounded-lg border border-slate-200 p-4 ${i >= 2 ? "col-span-2 lg:col-span-1" : ""}`}>
                    <p className="text-xs font-medium text-slate-500">{t.label}</p>
                    <div className="mt-1 font-semibold tabular-nums text-slate-900">{t.value}</div>
                  </div>
                ))}
              </div>

              {/* Money held — one row per currency, home currency first.
                  Mobile money is listed in each wallet's own currency. */}
              <div className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <h4 className="text-sm font-semibold text-slate-900">Money held</h4>
                  <span className="text-xs text-slate-500">
                    {selectedCompany.bankAccountsCount || 0} bank · {selectedCompany.mpesaAgentsCount || 0} mobile money
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500">
                        <th className="py-2 pl-4 pr-3 text-left font-medium">Currency</th>
                        <th className="px-3 py-2 whitespace-nowrap text-right font-medium">Cash</th>
                        <th className="px-3 py-2 whitespace-nowrap text-right font-medium">Bank</th>
                        <th className="px-3 py-2 whitespace-nowrap text-right font-medium">Mobile money</th>
                        <th className="px-3 py-2 whitespace-nowrap text-right font-medium">Total held</th>
                        <th className="py-2 pl-3 pr-4 whitespace-nowrap text-right font-medium">Owed to clients</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdingsRows(selectedCompany).map((h) => (
                        <tr key={h.code} className="border-t border-slate-100">
                          <td className="py-2.5 pl-4 pr-3 whitespace-nowrap font-medium text-slate-900">
                            {h.code}
                            {h.isBase && (
                              <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">home</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums text-slate-700">{formatCurrency(h.cash, h.code)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums text-slate-700">{formatCurrency(h.bank, h.code)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums text-slate-700">
                            {h.isBase ? formatCurrency(h.mobile, h.code) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">{formatCurrency(h.cash + h.bank + h.mobile, h.code)}</td>
                          <td className={`py-2.5 pl-3 pr-4 whitespace-nowrap text-right tabular-nums ${h.owed ? "text-amber-700" : "text-slate-400"}`}>{formatCurrency(h.owed, h.code)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                <button
                  onClick={() => {
                    openModal("editCompany", {
                      name: selectedCompany.name,
                      ownerName: selectedCompany.ownerName,
                      email: selectedCompany.email,
                      taxId: selectedCompany.taxId,
                      website: selectedCompany.website,
                      address: selectedCompany.address,
                    });
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  <Edit className="h-4 w-4" /> Edit details
                </button>
                <button
                  onClick={() => {
                    closeModal("companyDetails");
                    openModal("updateSubscription", {
                      plan: selectedCompany.subscriptionPlan,
                      status: selectedCompany.subscriptionStatus,
                      monthlyFee: selectedCompany.monthlyFee,
                    });
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <CreditCard className="h-4 w-4" /> Subscription
                </button>
                <button
                  onClick={() => {
                    closeModal("companyDetails");
                    openModal("resetPassword");
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Key className="h-4 w-4" /> Reset password
                </button>
                <div className="flex-1" />
                {selectedCompany.isActive ? (
                  <button
                    onClick={() => {
                      closeModal("companyDetails");
                      openModal("suspendCompany");
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Ban className="h-4 w-4" /> Suspend
                  </button>
                ) : (
                  <button
                    onClick={() => handleActivateCompany(selectedCompany.id)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Activate
                  </button>
                )}
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Edit Company Modal */}
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
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="py-2 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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

      {/* Update Subscription Modal - FIXED with status field */}
      <AnimatePresence>
        {modals.updateSubscription && (
          <Modal
            onClose={() => closeModal("updateSubscription")}
            title="Subscription"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Plan
                </label>
                <select
                  value={formData.plan || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, plan: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                >
                  <option value="Free">Free</option>
                  <option value="Starter">Starter</option>
                  <option value="Professional">Professional</option>
                  <option value="Enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  value={formData.status || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, status: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                >
                  <option value="Active">Active</option>
                  <option value="Trial">Trial</option>
                  <option value="Expired">Expired</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Monthly fee (KES)
                </label>
                <input
                  type="number"
                  value={formData.monthlyFee || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, monthlyFee: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Expires on
                </label>
                <input
                  type="date"
                  value={formData.expiresAt || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, expiresAt: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => closeModal("updateSubscription")}
                  className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateSubscription}
                  disabled={isSubmitting}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Save subscription
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Reset Password Modal */}
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
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="py-2 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="py-2 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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
      <AnimatePresence>
        {modals.recordPayment && (
          <Modal
            onClose={() => closeModal("recordPayment")}
            title="Record a payment"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Bureau *
                </label>
                <select
                  value={formData.companyId || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, companyId: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                >
                  <option value="">Select company...</option>
                  {dashboard?.companies?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Amount *
                  </label>
                  <input
                    type="number"
                    value={formData.amount || ""}
                    onChange={(e: any) =>
                      setFormData({ ...formData, amount: e.target.value })
                    }
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Currency
                  </label>
                  <select
                    value={formData.currency || "KES"}
                    onChange={(e: any) =>
                      setFormData({ ...formData, currency: e.target.value })
                    }
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  >
                    <option value="KES">KES</option>
                    <option value="USD">USD</option>
                    <option value="UGX">UGX</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Payment method
                </label>
                <select
                  value={formData.paymentMethod || "M-Pesa"}
                  onChange={(e: any) =>
                    setFormData({ ...formData, paymentMethod: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                >
                  <option value="M-Pesa">M-Pesa</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Reference
                </label>
                <input
                  type="text"
                  value={formData.reference || ""}
                  onChange={(e: any) =>
                    setFormData({ ...formData, reference: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
                  placeholder="Transaction ref"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => closeModal("recordPayment")}
                  className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRecordPayment}
                  disabled={isSubmitting}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <DollarSign className="w-4 h-4" />
                  )}
                  Record payment
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

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
                  className="py-2 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
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

// ==================== SUB-COMPONENTS ====================

function StatCard({
  title,
  value,
  subValue,
  icon: Icon,
  trend,
}: {
  title: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  icon: any;
  trend?: number;
  color?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-slate-500">
          <Icon className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">{title}</span>
        </div>
        {trend !== undefined && trend !== 0 && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[12px] font-medium ${
              trend >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-3 break-words text-[24px] font-semibold leading-tight tabular-nums text-slate-900">{value}</div>
      {subValue && <div className="mt-1 text-[13px] text-slate-500">{subValue}</div>}
    </div>
  );
}

function Modal({
  onClose,
  title,
  size = "md",
  children,
}: {
  onClose: () => void;
  title: string;
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
}) {
  const sizeClasses = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-3xl", xl: "max-w-4xl" };
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 8, opacity: 0 }}
        onClick={(e: any) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ${sizeClasses[size]}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-[17px] font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </motion.div>
    </motion.div>
  );
}

export default SuperAdminDashboard;

/** Contains a render error to the tab that threw, so one bad response
 *  can't blank the whole platform console. */
class TabBoundary extends Component<{ children: () => ReactNode; onRetry?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[SuperAdmin] tab render failed:", error);
  }
  render() {
    // children is a render function so the tab is built inside this boundary,
    // where a throw is caught, rather than in the parent render.
    if (!this.state.error) return this.props.children();
    return (
      <div role="alert" className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-6 py-14 text-center">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        <p className="mt-3 text-sm font-semibold text-slate-900">This section couldn&apos;t load</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          The server sent data this page didn&apos;t expect. The rest of the console still works.
        </p>
        <button
          onClick={() => {
            this.setState({ error: null });
            this.props.onRetry?.();
          }}
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  }
}
