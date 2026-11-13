"use client";

import { AlertTriangle, BarChart3, Building2, DollarSign, LayoutDashboard, RefreshCw, ScrollText, Server, Shield, TrendingDown, TrendingUp, X } from "lucide-react";
import { Component, type ReactNode } from "react";
import { motion } from "framer-motion";

// ==================== TYPES ====================

export type TabId =
  | "overview"
  | "companies"
  | "security"
  | "financial"
  | "analytics"
  | "audit"
  | "system";
export interface ModalState {
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
export const volumeLines = (c: any): string[] => {
  const list = c?.monthlyVolumeByCurrency;
  if (Array.isArray(list) && list.length > 0)
    return list.map((v: any) => {
      const code = v.currencyCode || ["KES", "USD", "UGX", "EUR"][v.currency] || "KES";
      const d = code === "KES" || code === "UGX" ? 0 : 2;
      return `${code} ${(v.amount || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
    });
  return [formatCurrency(c?.monthlyVolume || 0)];
};
export const CODES = ["KES", "USD", "UGX", "EUR"];
export const codeOf = (c?: number) => CODES[c ?? 0] ?? "KES";
/** "KES 98.0M", "UGX 1.31B", "USD 410K" — compact, for dense admin views. */
export const compactMoney = (amount: number, code: string) => {
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
export type Shape = { lists: string[]; nums: string[] };
export const SHAPES: Record<"dashboard" | "security" | "financial" | "analytics" | "health" | "company", Shape> = {
  dashboard: { lists: ["topCompaniesByVolume", "topCompaniesByTransactions", "recentSignups", "expiringSubscriptions", "recentErrors", "companies", "totalVolumeByCurrency", "monthlyVolumeByCurrency", "companiesByBaseCurrency"], nums: ["totalCompanies", "activeCompanies", "trialCompanies", "expiredCompanies", "suspendedCompanies", "companiesGrowth", "totalUsers", "totalClients", "activeUsersToday", "usersGrowth", "monthlyRecurringRevenue", "totalRevenue", "pendingPayments", "revenueGrowth", "totalTransactionsVolume", "monthlyTransactionsVolume", "totalTransactionsCount", "monthlyTransactionsCount", "volumeGrowth", "errorsLast24h", "securityAlertsActive"] },
  security: { lists: ["recentAlerts", "recentFailedLogins"], nums: ["failedLoginsLast24h", "failedLoginsLast7d", "lockedAccounts", "suspiciousActivities", "blockedIPs", "activeAlerts"] },
  financial: { lists: ["revenueByPlan", "transactionsByType", "totalVolumeByCurrency", "monthlyVolumeByCurrency"], nums: ["totalRevenue", "monthlyRevenue", "yearlyRevenue", "pendingPayments", "revenueGrowth", "totalTransactionsVolume", "monthlyTransactionsVolume", "avgTransactionSize"] },
  analytics: { lists: ["featureUsage", "userGrowth", "transactionGrowth", "revenueGrowth"], nums: ["dailyActiveUsers", "weeklyActiveUsers", "monthlyActiveUsers", "avgSessionDurationSeconds"] },
  health: { lists: ["reasons"], nums: ["apiResponseTimeMs", "apiRequestsPerMinute", "apiErrorRate", "databaseLatencyMs", "databaseConnections", "serverCpuUsage", "serverMemoryUsage", "serverDiskUsage", "activeWebSockets", "uptimeSeconds", "errorsLast24h", "warningsLast24h", "criticalAlertsLast24h"] },
  company: { lists: ["monthlyVolumeByCurrency", "otherCurrencyHoldings", "recentLogins", "recentTransactions", "totalVolumeByCurrency", "mobileMoneyByCurrency"], nums: ["activeClients", "activeUsers", "bankAccountsCount", "errorCount", "monthlyFee", "monthlyTransactions", "monthlyVolume", "mpesaAgentsCount", "totalBankBalanceKES", "totalBankBalanceUSD", "totalCashBalanceKES", "totalCashBalanceUSD", "totalClientBalanceKES", "totalClientBalanceUSD", "totalClients", "totalMpesaBalance", "totalPaid", "totalTransactions", "totalUsers", "totalVolume", "unreconciledCount"] }
};
export const asArray = (v: any) => (Array.isArray(v) ? v : []);
export const normalise = <T,>(d: any, shape: Shape): T | null => {
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
export const paged = <T,>(d: any): T => {
  const base = d && typeof d === "object" ? d : {};
  return { totalCount: 0, page: 1, pageSize: 0, totalPages: 0, ...base, items: asArray(base.items) } as T;
};
export const PLATFORM_CURRENCY = "KES";
/** Per-currency holdings for the bureau details modal. The API sends KES and
 *  USD in dedicated fields, everything else in otherCurrencyHoldings, and
 *  mobile money per wallet currency (mobileMoneyByCurrency). */
export const holdingsRows = (c: any) => {
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
export const formatCurrency = (amount: number, currency = "KES") =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
export const formatNumber = (num: number) =>
  new Intl.NumberFormat("en-KE").format(num);
export const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
export const formatDateTime = (date: string) =>
  new Date(date).toLocaleString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export const timeAgo = (date: string) => {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(date);
};
export const getStatusColor = (status: string) => {
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
export const getPlanColor = (plan: string) => {
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
export const humanize = (code?: string | null) =>
  (code || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()).replace(/ (\w)/g, (m) => m.toLowerCase()).replace(/\bip\b/gi, "IP").replace(/\botp\b/gi, "OTP");
export const getSeverityColor = (severity: string) => {
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
export const getLogLevelColor = (level: string) => {
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
export const getHealthColor = (status: string) => {
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

// Older rows hold IPv4 addresses as seen through an IPv6 socket ("::ffff:1.2.3.4"); show "1.2.3.4".
export const showIp = (ip?: string | null) => (ip || "").replace(/^::ffff:/i, "");
export const TABS: { id: TabId; label: string; icon: any; color: string }[] = [
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
export interface SuperAdminDashboardProps {
  userName?: string;
  onLogout?: () => void | Promise<void>;
  activeTab?: TabId;
}
// ==================== SUB-COMPONENTS ====================

export function StatCard({
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
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-500">
          <Icon className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="truncate">{title}</span>
        </div>
        {trend !== undefined && trend !== 0 && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${
              trend >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-3 break-words text-2xl font-semibold leading-tight tabular-nums text-slate-900">{value}</div>
      {subValue && <div className="mt-1 text-sm text-slate-500">{subValue}</div>}
    </div>
  );
}
export function Modal({
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
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </motion.div>
    </motion.div>
  );
}
/** Contains a render error to the tab that threw, so one bad response
 *  can't blank the whole platform console. */
export class TabBoundary extends Component<{ children: () => ReactNode; onRetry?: () => void }, { error: Error | null }> {
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
        <AlertTriangle className="h-6 w-6 text-amber-600" />
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
