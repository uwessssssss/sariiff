"use client";

import { BarChart3, Building2, ClipboardCheck, FileText, LayoutDashboard, Loader2, Receipt, Repeat, Settings, Smartphone, Users, Wallet } from "lucide-react";
import { type DashboardFlow, type DashboardHolding } from "@/lib/api";
import dynamic from "next/dynamic";

// ---------------------------------------------------------------------------
// Lazy-loaded tabs (each loads the first time it's opened)
// ---------------------------------------------------------------------------

export const TabLoading = () => (
  <div className="flex h-64 items-center justify-center gap-2 text-sm text-slate-500">
    <Loader2 className="h-4 w-4 animate-spin" />
    Loading…
  </div>
);
export const ClientManagement = dynamic(
  () => import("@/components/office/clients/ClientManagement").then((m) => ({ default: m.ClientManagement })),
  { ssr: false, loading: TabLoading },
);
export const TransactionForm = dynamic(
  () => import("@/components/office/transaction-form/TransactionForm").then((m) => ({ default: m.TransactionForm })),
  { ssr: false },
);
export const Reconciliation = dynamic(
  () => import("@/components/office/reconciliation/Reconciliation").then((m) => ({ default: m.Reconciliation })),
  { ssr: false, loading: TabLoading },
);
export const InvoiceManagement = dynamic(() => import("@/components/office/invoices/InvoiceManagement"), {
  ssr: false,
  loading: TabLoading,
});
export const Reports = dynamic(
  () => import("@/components/office/reports/Reports").then((m) => ({ default: m.Reports })),
  { ssr: false, loading: TabLoading },
);
export const BankAccounts = dynamic(
  () => import("@/components/office/banks/BankAccounts").then((m) => ({ default: m.BankAccounts })),
  { ssr: false, loading: TabLoading },
);
export const MPesaAccounts = dynamic(
  () => import("@/components/office/mpesa/MPesaAccounts").then((m) => ({ default: m.MPesaAccounts })),
  { ssr: false, loading: TabLoading },
);
export const ExchangeSection = dynamic(
  () => import("@/components/office/exchange/ExchangeSection").then((m) => ({ default: m.ExchangeSection })),
  { ssr: false, loading: TabLoading },
);
export const OfficeSettings = dynamic(
  () => import("@/components/office/settings/OfficeSettings").then((m) => ({ default: m.OfficeSettings })),
  { ssr: false, loading: TabLoading },
);
export const CashAtHand = dynamic(
  () => import("@/components/office/cash/CashAtHand").then((m) => ({ default: m.CashAtHand })),
  { ssr: false, loading: TabLoading },
);
export const ExpensesAccount = dynamic(
  () => import("@/components/office/expenses/ExpensesAccount").then((m) => ({ default: m.ExpensesAccount })),
  { ssr: false, loading: TabLoading },
);
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OfficeUserDashboardProps {
  userName: string;
  onLogout: () => void;
  activeTab?: string;
}
export interface DashboardStats {
  holdings: DashboardHolding[];
  flows: DashboardFlow[];
  cash: { kes: number; usd: number };
  banks: { kes: number; usd: number };
  mpesa: { total: number };
  exchange: { kes: number; usd: number };
  clients: { kes: number; usd: number };
  walkin: { kes: number; usd: number };
  daily: {
    credits: number;
    debits: number;
    net: number;
    byCurrency: {
      kes: { credits: number; debits: number; net: number };
      usd: { credits: number; debits: number; net: number };
    };
  };
  totalAccounts: number;
  totalTransactions: number;
  todayTransactions: number;
}
export interface TodayTxn {
  code: string;
  reference: string;
  time: string;
  description: string;
  account: string;
  otherSide: string;
  amount: number;
  currency: string;
  isDebit: boolean;
  isMoneyIn: boolean;
  reversed: boolean;
}
export const EMPTY_STATS: DashboardStats = {
  holdings: [],
  flows: [],
  cash: { kes: 0, usd: 0 },
  banks: { kes: 0, usd: 0 },
  mpesa: { total: 0 },
  exchange: { kes: 0, usd: 0 },
  clients: { kes: 0, usd: 0 },
  walkin: { kes: 0, usd: 0 },
  daily: {
    credits: 0,
    debits: 0,
    net: 0,
    byCurrency: {
      kes: { credits: 0, debits: 0, net: 0 },
      usd: { credits: 0, debits: 0, net: 0 },
    },
  },
  totalAccounts: 0,
  totalTransactions: 0,
  todayTransactions: 0,
};
// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/office/dashboard" },
  { id: "clients", label: "Clients", icon: Users, href: "/office/clients" },
  { id: "cash-at-hand", label: "Cash at hand", icon: Wallet, href: "/office/cash" },
  { id: "banks", label: "Bank accounts", icon: Building2, href: "/office/banks" },
  { id: "mpesa", label: "Mobile money", icon: Smartphone, href: "/office/mpesa" },
  { id: "expenses", label: "Expenses", icon: Receipt, href: "/office/expenses" },
  { id: "exchange", label: "Exchange", icon: Repeat, href: "/office/exchange" },
  { id: "reconciliation", label: "Reconciliation", icon: ClipboardCheck, href: "/office/reconciliation" },
  { id: "invoices", label: "Invoices", icon: FileText, href: "/office/invoices" },
  { id: "reports", label: "Reports", icon: BarChart3, href: "/office/reports" },
  { id: "settings", label: "Settings", icon: Settings, href: "/office/settings" },
];
// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export const fmt = (n: number, decimals: number) =>
  (n || 0).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
export const fmtKES = (n: number) => fmt(n, 0);
export const fmtUSD = (n: number) => fmt(n, 2);
export const signed = (n: number, f: (n: number) => string) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${f(Math.abs(n))}`;
export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
