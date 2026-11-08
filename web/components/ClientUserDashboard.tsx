"use client";

import { escapeHtml, printHtml } from "@/lib/print";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  LayoutDashboard,
  FileText,
  Bell,
  LogOut,
  Wallet,
  DollarSign,
  ArrowUpCircle,
  ArrowDownCircle,
  Download,
  Printer,
  Filter,
  Menu,
  X,
  Search,
  Calendar,
  TrendingUp,
  Eye,
  Share2,
  MessageCircle,
  RefreshCw,
  PieChart,
  BarChart3,
  Activity,
  Clock,
  CheckCircle,
  AlertCircle,
  Info,
  Settings,
  User,
  FileDown,
  Copy,
  Zap,
  Shield,
  Star,
  Target,
  Sparkles,
  Globe,
  ChevronRight,
  ExternalLink,
  Lock,
  CircleDollarSign,
  Banknote,
  Receipt,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { BureauSwitcher, LinkedBureausCard } from "@/components/LinkedBureaus";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart as RechartPieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { SarifMark } from "./SarifMark";

// Import API functions and types
import {
  getClientDashboard,
  getClientTransactions,
  getClientAnalytics,
  getClientAlerts,
  markAlertAsRead,
  markAllAlertsAsRead,
  downloadTransactionReceipt,
  exportTransactionsCsv,
  changeClientPassword,
  updateClientProfile,
  getStoredAuth,
  Currency,
  TransactionType,
  currencyCode,
  ClientType,
  ClientDashboardDto,
  ClientTransactionDto,
  ClientAlertDto,
  ClientAnalyticsDto,
  ClientProfileDto,
  QuickStatsDto,
  PortalTransactionFilters,
  ChangePasswordDto,
  PagedResult,
} from "@/lib/api";
import { localDate } from "@/lib/dates";

interface ClientUserDashboardProps {
  userName: string;
  onLogout: () => void;
}

type ClientView =
  | "dashboard"
  | "statements"
  | "alerts"
  | "analytics"
  | "profile";

// WhatsApp number clients can reach their bureau on (digits only, with
// country code, e.g. 254712345678). Set NEXT_PUBLIC_SUPPORT_WHATSAPP in Vercel.
const SUPPORT_WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "").replace(/\D/g, "");

// ============ HELPER FUNCTIONS ============

const formatCurrency = (
  amount: number,
  currency: Currency | string,
): string => {
  // Accept either the numeric enum or an ISO code ("UGX", "EUR", ...).
  const codeMap: Record<number, string> = {
    0: "KES",
    1: "USD",
    2: "UGX",
    3: "EUR",
  };
  const symbol =
    typeof currency === "number" ? codeMap[currency] || "KES" : currency;
  return `${symbol} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Local time of a transaction (the API sends UTC; the old "time" text field was UTC too).
const formatTime = (dateStr: string): string =>
  new Date(dateStr).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const getAlertIcon = (type: string) => {
  switch (type) {
    case "success":
      return CheckCircle;
    case "warning":
      return AlertCircle;
    case "error":
      return AlertCircle;
    default:
      return Info;
  }
};

const getAlertGradient = (type: string): string => {
  switch (type) {
    case "success":
      return "bg-emerald-500 ";
    case "warning":
      return "bg-amber-500 ";
    case "error":
      return "bg-red-500 ";
    default:
      return "bg-blue-500 ";
  }
};

const getAlertBorderClass = (type: string): string => {
  switch (type) {
    case "success":
      return "border-emerald-300 hover:border-emerald-400";
    case "warning":
      return "border-amber-300 hover:border-amber-400";
    case "error":
      return "border-red-300 hover:border-red-400";
    default:
      return "border-blue-300 hover:border-blue-400";
  }
};

const getClientTypeLabel = (type: ClientType): string => {
  return type === ClientType.Permanent ? "Premium Client" : "Standard Client";
};

// ============ MAIN COMPONENT ============

export function ClientUserDashboard({
  userName,
  onLogout,
}: ClientUserDashboardProps) {
  // View State
  const [activeView, setActiveView] = useState<ClientView>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Escape closes the phone-width menu.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);

  // Data State
  const [dashboard, setDashboard] = useState<ClientDashboardDto | null>(null);
  const [profile, setProfile] = useState<ClientProfileDto | null>(null);
  const [quickStats, setQuickStats] = useState<QuickStatsDto | null>(null);
  const [transactions, setTransactions] = useState<ClientTransactionDto[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<
    ClientTransactionDto[]
  >([]);
  const [alerts, setAlerts] = useState<ClientAlertDto[]>([]);
  const [analytics, setAnalytics] = useState<ClientAnalyticsDto | null>(null);

  // Loading & Error State
  const [loading, setLoading] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsCurrency, setAnalyticsCurrency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  // Filter State
  const [currencyFilter, setCurrencyFilter] = useState<Currency | undefined>(
    undefined,
  );
  const [typeFilter, setTypeFilter] = useState<TransactionType | undefined>(
    undefined,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("all");

  // Alert Pagination
  const [alertPage, setAlertPage] = useState(1);
  const [alertTotalPages, setAlertTotalPages] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Modal State
  const [selectedTransaction, setSelectedTransaction] =
    useState<ClientTransactionDto | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<ClientAlertDto | null>(
    null,
  );
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState<ChangePasswordDto>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Menu Items
  const menuItems = [
    {
      id: "dashboard" as ClientView,
      label: "Dashboard",
      icon: LayoutDashboard,
      gradient: "bg-blue-500 ",
    },
    {
      id: "statements" as ClientView,
      label: "Statements",
      icon: FileText,
      gradient: "bg-violet-500 ",
    },
    {
      id: "alerts" as ClientView,
      label: "Alerts",
      icon: Bell,
      gradient: "bg-amber-500 ",
      badge: quickStats?.unreadAlerts,
    },
    {
      id: "analytics" as ClientView,
      label: "Analytics",
      icon: PieChart,
      gradient: "bg-emerald-500 ",
    },
    {
      id: "profile" as ClientView,
      label: "Profile",
      icon: User,
      gradient: "bg-pink-500 ",
    },
  ];

  // ============ DATA FETCHING ============

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getClientDashboard();
      if (result.success && result.data) {
        setDashboard(result.data);
        setProfile(result.data.profile);
        setQuickStats(result.data.quickStats);
        setRecentTransactions(result.data.recentTransactions);
        setAlerts(result.data.recentAlerts);
      } else {
        setError(result.message || "Failed to load dashboard");
        toast.error(result.message || "Failed to load dashboard");
      }
    } catch (err) {
      setError("Failed to load dashboard");
      toast.error("Failed to load dashboard");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      setLoadingTransactions(true);
      const filters: Partial<PortalTransactionFilters> = {};

      if (currencyFilter !== undefined) filters.currency = currencyFilter;
      if (typeFilter !== undefined) filters.type = typeFilter;
      if (searchQuery) filters.search = searchQuery;

      // Date filters based on period
      if (filterPeriod === "week") {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        filters.startDate = localDate(weekAgo);
      } else if (filterPeriod === "month") {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        filters.startDate = localDate(monthAgo);
      }

      const result = await getClientTransactions(
        currentPage,
        pageSize,
        filters,
      );
      if (result.success && result.data) {
        setTransactions(result.data.items);
        setTotalCount(result.data.totalCount);
        setTotalPages(Math.ceil(result.data.totalCount / pageSize));
      }
    } catch (err) {
      console.error("Failed to fetch transactions", err);
      toast.error("Failed to fetch transactions");
    } finally {
      setLoadingTransactions(false);
    }
  }, [currentPage, currencyFilter, typeFilter, searchQuery, filterPeriod]);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoadingAlerts(true);
      const result = await getClientAlerts(alertPage, 20, unreadOnly);
      if (result.success && result.data) {
        setAlerts(result.data.items);
        setAlertTotalPages(Math.ceil(result.data.totalCount / 20));
      }
    } catch (err) {
      console.error("Failed to fetch alerts", err);
    } finally {
      setLoadingAlerts(false);
    }
  }, [alertPage, unreadOnly]);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoadingAnalytics(true);
      const result = await getClientAnalytics(6);
      if (result.success && result.data) {
        setAnalytics(result.data);
      }
    } catch (err) {
      console.error("Failed to fetch analytics", err);
    } finally {
      setLoadingAnalytics(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Fetch transactions when filters change
  useEffect(() => {
    if (activeView === "statements") {
      fetchTransactions();
    }
  }, [activeView, fetchTransactions]);

  // Fetch alerts when viewing alerts
  useEffect(() => {
    if (activeView === "alerts") {
      fetchAlerts();
    }
  }, [activeView, fetchAlerts]);

  // Fetch analytics when viewing analytics
  useEffect(() => {
    if (activeView === "analytics") {
      fetchAnalytics();
    }
  }, [activeView, fetchAnalytics]);

  // ============ ACTIONS ============

  const handleRefresh = async () => {
    toast.info("Refreshing data...");
    await fetchDashboard();
    if (activeView === "statements") await fetchTransactions();
    if (activeView === "alerts") await fetchAlerts();
    if (activeView === "analytics") await fetchAnalytics();
    toast.success("Data refreshed!");
  };

  const handleMarkAlertRead = async (alertId: string) => {
    try {
      const result = await markAlertAsRead(alertId);
      if (result.success) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? { ...a, isRead: true } : a)),
        );
        if (quickStats) {
          setQuickStats({
            ...quickStats,
            unreadAlerts: quickStats.unreadAlerts - 1,
          });
        }
        toast.success("Alert marked as read");
      }
    } catch (err) {
      toast.error("Failed to mark alert as read");
    }
  };

  const handleMarkAllAlertsRead = async () => {
    try {
      const result = await markAllAlertsAsRead();
      if (result.success) {
        setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
        if (quickStats) {
          setQuickStats({ ...quickStats, unreadAlerts: 0 });
        }
        toast.success("All alerts marked as read");
      }
    } catch (err) {
      toast.error("Failed to mark alerts as read");
    }
  };

  const handleDownloadReceipt = async (transactionId: string, code: string) => {
    try {
      toast.info("Downloading receipt...");
      const blob = await downloadTransactionReceipt(transactionId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${code}.txt`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Receipt downloaded!");
    } catch (err) {
      toast.error("Failed to download receipt");
    }
  };

  const handleExportCsv = async () => {
    try {
      toast.info("Exporting transactions...");
      const blob = await exportTransactionsCsv();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions-${localDate()}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("CSV exported!");
    } catch (err) {
      toast.error("Failed to export CSV");
    }
  };

  const handleDownloadStatement = () => {
    if (!profile) {
      toast.error("Profile data not loaded");
      return;
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Get company info
      const auth = getStoredAuth();
      const companyName = auth?.user?.companyName || "Money Exchange";

      // Safe profile data
      const clientName = profile.fullName || userName || "Client";
      const clientCode = profile.code || "N/A";
      const clientPhone = profile.whatsAppNumber || "N/A";
      const clientEmail = profile.email || "N/A";
      const kesBalance = profile.balanceKES ?? 0;
      const usdBalance = profile.balanceUSD ?? 0;

      // ========== CORPORATE HEADER ==========
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, pageWidth, 4, "F");

      doc.setFillColor(250, 250, 250);
      doc.rect(0, 4, pageWidth, 36, "F");

      doc.setFillColor(37, 99, 235);
      doc.rect(14, 10, 24, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(companyName.charAt(0).toUpperCase(), 26, 26, {
        align: "center",
      });

      doc.setTextColor(17, 24, 39);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(companyName, 44, 18);

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Client Account Statement", 44, 26);

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.text("Statement Date", pageWidth - 14, 14, { align: "right" });
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(
        new Date().toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
        pageWidth - 14,
        21,
        { align: "right" },
      );

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("Account Reference", pageWidth - 14, 28, { align: "right" });
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(clientCode, pageWidth - 14, 35, { align: "right" });

      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(14, 42, pageWidth - 14, 42);

      // ========== CLIENT INFORMATION ==========
      let yPos = 50;

      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("ACCOUNT HOLDER", 14, yPos);

      yPos += 6;
      doc.setFillColor(249, 250, 251);
      doc.rect(14, yPos, pageWidth - 28, 28, "F");

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39);
      doc.text(clientName, 18, yPos + 8);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      doc.text(`Phone: ${clientPhone}`, 18, yPos + 15);
      doc.text(`Email: ${clientEmail}`, 18, yPos + 21);

      // ========== ACCOUNT BALANCES ==========
      yPos += 36;
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("ACCOUNT BALANCES", 14, yPos);

      yPos += 6;
      const balanceWidth = (pageWidth - 32) / 2;

      // One box per currency held (KES, USD always; UGX, EUR, ... when held)
      const pdfBalances = [
        { code: "KES", balance: kesBalance },
        { code: "USD", balance: usdBalance },
        ...(profile.otherBalances || [])
          .filter((b: any) => (b.balance ?? 0) !== 0)
          .map((b: any) => ({ code: b.currencyCode, balance: b.balance ?? 0 })),
      ];
      const CURRENCY_NAMES: Record<string, string> = {
        KES: "Kenyan Shilling", USD: "US Dollar", UGX: "Ugandan Shilling", EUR: "Euro",
      };
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      pdfBalances.forEach((b, i) => {
        const x = i % 2 === 0 ? 14 : 18 + balanceWidth;
        if (i > 0 && i % 2 === 0) yPos += 26;
        doc.rect(x, yPos, balanceWidth, 22, "S");
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128);
        doc.text(`${CURRENCY_NAMES[b.code] ?? b.code} (${b.code})`, x + 4, yPos + 7);
        const positive = b.balance >= 0;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(positive ? 22 : 185, positive ? 163 : 28, positive ? 74 : 28);
        doc.text(`${positive ? "" : "-"}${b.code} ${Math.abs(b.balance).toLocaleString()}`, x + 4, yPos + 16);
      });

      // ========== TRANSACTION HISTORY ==========
      if (transactions && transactions.length > 0) {
        yPos += 32;
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("TRANSACTION HISTORY", 14, yPos);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(9);
        doc.text(`${transactions.length} transactions`, pageWidth - 14, yPos, {
          align: "right",
        });

        const txnTableData = transactions.slice(0, 50).map((txn) => {
          const isCredit = txn.type === "Credit";
          const currency = txn.currency === Currency.KES ? "KES" : txn.currency === Currency.UGX ? "UGX" : txn.currency === Currency.EUR ? "EUR" : "USD";
          const runningBalance = txn.balanceAfter ?? 0;
          const desc = txn.description || "";
          const dateStr = txn.date || new Date().toISOString();

          return [
            new Date(dateStr).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "2-digit",
            }),
            txn.reference || txn.code || "-",
            desc.substring(0, 28) + (desc.length > 28 ? "..." : ""),
            isCredit ? "CR" : "DR",
            currency,
            (txn.amount ?? 0).toLocaleString(),
            `${runningBalance >= 0 ? "" : "-"}${Math.abs(
              runningBalance,
            ).toLocaleString()}`,
          ];
        });

        autoTable(doc, {
          startY: yPos + 4,
          head: [
            [
              "Date",
              "Reference",
              "Description",
              "Type",
              "Curr",
              "Amount",
              "Balance",
            ],
          ],
          body: txnTableData,
          theme: "plain",
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: {
            fillColor: [249, 250, 251],
            textColor: [75, 85, 99],
            fontStyle: "bold",
            lineWidth: 0.1,
            lineColor: [229, 231, 235],
          },
          bodyStyles: { lineWidth: 0.1, lineColor: [243, 244, 246] },
          columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 26 },
            2: { cellWidth: 48 },
            3: { cellWidth: 12, halign: "center" },
            4: { cellWidth: 14, halign: "center" },
            5: { cellWidth: 26, halign: "right" },
            6: { cellWidth: 28, halign: "right" },
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          margin: { left: 14, right: 14 },
          didParseCell: (data: any) => {
            if (data.section === "body" && data.column.index === 3) {
              data.cell.styles.textColor =
                data.cell.raw === "CR" ? [22, 163, 74] : [220, 38, 38];
              data.cell.styles.fontStyle = "bold";
            }
            if (data.section === "body" && data.column.index === 6) {
              const cellVal = String(data.cell.raw || "");
              const isNegative = cellVal.startsWith("-");
              data.cell.styles.textColor = isNegative
                ? [185, 28, 28]
                : [22, 163, 74];
              data.cell.styles.fontStyle = "bold";
            }
          },
          didDrawPage: (data: any) => {
            doc.setDrawColor(229, 231, 235);
            doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20);
            doc.setFontSize(7);
            doc.setTextColor(156, 163, 175);
            doc.text(companyName, 14, pageHeight - 12);
            doc.text(
              `Page ${data.pageNumber}`,
              pageWidth / 2,
              pageHeight - 12,
              { align: "center" },
            );
            doc.text(
              "Computer-generated statement",
              pageWidth - 14,
              pageHeight - 12,
              { align: "right" },
            );
          },
        });
      }

      const fileName = `${companyName.replace(
        /\s+/g,
        "_",
      )}_Statement_${clientCode}_${localDate()}.pdf`;
      doc.save(fileName);
      toast.success("Statement exported successfully!");
    } catch (error) {
      console.error("Error generating statement PDF:", error);
      toast.error("Failed to generate statement PDF");
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    try {
      setPasswordLoading(true);
      const result = await changeClientPassword(passwordForm);
      if (result.success) {
        toast.success("Password changed successfully!");
        setShowPasswordModal(false);
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
      } else {
        toast.error(result.message || "Failed to change password");
      }
    } catch (err) {
      toast.error("Failed to change password");
    } finally {
      setPasswordLoading(false);
    }
  };

  const handlePrintStatement = () => {
    if (!profile) {
      toast.error("Profile data not loaded");
      return;
    }

    const auth = getStoredAuth();
    const companyName = auth?.user?.companyName || "Money Exchange";
    const clientName = profile.fullName || userName || "Client";
    const clientCode = profile.code || "N/A";
    const clientPhone = profile.whatsAppNumber || "N/A";
    const clientEmail = profile.email || "N/A";
    const kesBalance = profile.balanceKES ?? 0;
    const usdBalance = profile.balanceUSD ?? 0;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Account Statement - ${escapeHtml(clientName)}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #111827; font-size: 12px; }
          .header { border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 20px; }
          .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
          .company-name { font-size: 24px; font-weight: bold; color: #111827; }
          .doc-title { color: #6b7280; font-size: 14px; margin-top: 4px; }
          .doc-info { text-align: right; }
          .doc-info label { color: #6b7280; font-size: 10px; display: block; }
          .doc-info span { font-weight: bold; color: #111827; }
          .client-box { background: #f9fafb; padding: 16px; margin-bottom: 20px; }
          .client-name { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
          .client-details { color: #6b7280; }
          .summary-row { display: flex; gap: 16px; margin-bottom: 20px; }
          .summary-card { flex: 1; border: 1px solid #e5e7eb; padding: 12px; }
          .summary-card label { color: #6b7280; font-size: 10px; display: block; margin-bottom: 4px; }
          .summary-card .value { font-size: 16px; font-weight: bold; }
          .positive { color: #16a34a; }
          .negative { color: #dc2626; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f9fafb; color: #4b5563; font-weight: 600; text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e7eb; }
          td { padding: 10px 8px; border-bottom: 1px solid #f3f4f6; }
          tr:nth-child(even) { background: #f9fafb; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .cr { color: #16a34a; font-weight: 600; }
          .dr { color: #dc2626; font-weight: 600; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 10px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-top">
            <div>
              <div class="company-name">${escapeHtml(companyName)}</div>
              <div class="doc-title">Client Account Statement</div>
            </div>
            <div class="doc-info">
              <label>Statement Date</label>
              <span>${escapeHtml(new Date().toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              }))}</span>
              <br/><br/>
              <label>Account Reference</label>
              <span>${escapeHtml(clientCode)}</span>
            </div>
          </div>
        </div>

        <div class="client-box">
          <div class="client-name">${escapeHtml(clientName)}</div>
          <div class="client-details">
            Phone: ${escapeHtml(clientPhone)} | Email: ${escapeHtml(clientEmail)}
          </div>
        </div>

        <div class="summary-row">
          <div class="summary-card">
            <label>KES Balance</label>
            <div class="value ${escapeHtml(kesBalance >= 0 ? "positive" : "negative")}">${escapeHtml(
              kesBalance >= 0 ? "" : "-"
            )}KES ${escapeHtml(Math.abs(kesBalance).toLocaleString())}</div>
          </div>
          <div class="summary-card">
            <label>USD Balance</label>
            <div class="value ${escapeHtml(usdBalance >= 0 ? "positive" : "negative")}">${escapeHtml(
              usdBalance >= 0 ? "" : "-"
            )}USD ${escapeHtml(Math.abs(usdBalance).toLocaleString())}</div>
          </div>
          ${(profile.otherBalances || [])
            .filter((b: any) => (b.balance ?? 0) !== 0)
            .map(
              (b: any) => `<div class="summary-card">
            <label>${escapeHtml(b.currencyCode)} Balance</label>
            <div class="value ${escapeHtml(b.balance >= 0 ? "positive" : "negative")}">${escapeHtml(b.balance >= 0 ? "" : "-")}${escapeHtml(b.currencyCode)} ${escapeHtml(Math.abs(b.balance).toLocaleString())}</div>
          </div>`,
            )
            .join("")}
        </div>

        <h3 style="margin-bottom: 10px;">Transaction History</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Description</th>
              <th class="text-center">Type</th>
              <th class="text-center">Currency</th>
              <th class="text-right">Amount</th>
              <th class="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${transactions
              .slice(0, 50)
              .map((txn) => {
                const isCredit = txn.type === "Credit";
                const currency = txn.currency === Currency.KES ? "KES" : txn.currency === Currency.UGX ? "UGX" : txn.currency === Currency.EUR ? "EUR" : "USD";
                const bal = txn.balanceAfter ?? 0;
                return `
              <tr>
                <td>${escapeHtml(new Date(txn.date || new Date()).toLocaleDateString(
                  "en-GB",
                  { day: "2-digit", month: "short", year: "2-digit" },
                ))}</td>
                <td>${escapeHtml(txn.reference || txn.code || "-")}</td>
                <td>${escapeHtml((txn.description || "").substring(0, 35))}${escapeHtml(
                  (txn.description || "").length > 35 ? "..." : ""
                )}</td>
                <td class="text-center ${escapeHtml(isCredit ? "cr" : "dr")}">${escapeHtml(
                  isCredit ? "CR" : "DR"
                )}</td>
                <td class="text-center">${escapeHtml(currency)}</td>
                <td class="text-right">${escapeHtml((
                  txn.amount ?? 0
                ).toLocaleString())}</td>
                <td class="text-right ${escapeHtml(bal >= 0 ? "positive" : "negative")}">${escapeHtml(
                  bal >= 0 ? "" : "-"
                )}${escapeHtml(Math.abs(bal).toLocaleString())}</td>
              </tr>
            `;
              })
              .join("")}
          </tbody>
        </table>

        <div class="footer">
          <p>This is a computer-generated statement and does not require a signature.</p>
          <p>${escapeHtml(companyName)} • Generated on ${escapeHtml(new Date().toLocaleString())}</p>
        </div>
      </body>
      </html>
    `;

    // Sandboxed, script-free print (lib/print.ts); values above are escaped.
    if (!printHtml(printContent)) {
      toast.error("Couldn't open the print view");
      return;
    }
    toast.success("Print preview opened!");
  };

  // Opens WhatsApp to the bureau's support number. Hidden everywhere when
  // NEXT_PUBLIC_SUPPORT_WHATSAPP isn't set, so clients never reach a dead number.
  const handleContactSupport = () => {
    if (!SUPPORT_WHATSAPP) return;
    window.open(`https://wa.me/${SUPPORT_WHATSAPP}`, "_blank", "noopener");
  };

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [currencyFilter, typeFilter, searchQuery, filterPeriod]);

  // ============ COMPUTED VALUES ============

  // One row per currency the client actually uses (no empty KES/USD rows).
  // Currency filter shows only the currencies this client actually holds.
  const CURRENCY_VALUES: Record<string, Currency> = { KES: Currency.KES, USD: Currency.USD, UGX: Currency.UGX, EUR: Currency.EUR };
  const balanceRows: { code: string; balance: number; totalIn: number; totalOut: number }[] = profile
    ? [
        ...((profile.balanceKES ?? 0) !== 0 || (profile.totalInKES ?? 0) !== 0 || (profile.totalOutKES ?? 0) !== 0
          ? [{ code: "KES", balance: profile.balanceKES ?? 0, totalIn: profile.totalInKES ?? 0, totalOut: profile.totalOutKES ?? 0 }]
          : []),
        ...((profile.balanceUSD ?? 0) !== 0 || (profile.totalInUSD ?? 0) !== 0 || (profile.totalOutUSD ?? 0) !== 0
          ? [{ code: "USD", balance: profile.balanceUSD ?? 0, totalIn: profile.totalInUSD ?? 0, totalOut: profile.totalOutUSD ?? 0 }]
          : []),
        ...(profile.otherBalances || []).map((b) => ({
          code: b.currencyCode,
          balance: b.balance ?? 0,
          totalIn: b.totalIn ?? 0,
          totalOut: b.totalOut ?? 0,
        })),
      ]
    : [];
  const statementCurrencies = (
    balanceRows.length > 0 ? balanceRows.map((b) => b.code) : ["KES", "USD"]
  )
    .filter((code, i, all) => code in CURRENCY_VALUES && all.indexOf(code) === i)
    .map((code) => ({ code, value: CURRENCY_VALUES[code] }));

  // This month's in/out per currency (KES, USD, UGX, EUR) — only those with activity
  const monthRows: { code: string; in: number; out: number }[] = quickStats
    ? [
        { code: "KES", in: quickStats.thisMonthInKES || 0, out: quickStats.thisMonthOutKES || 0 },
        { code: "USD", in: quickStats.thisMonthInUSD || 0, out: quickStats.thisMonthOutUSD || 0 },
        ...((quickStats as any).thisMonthOtherCurrencies || []).map((c: any) => ({
          code: c.currencyCode,
          in: c.income || 0,
          out: c.expenses || 0,
        })),
      ].filter((r) => r.in || r.out)
    : [];

  // Analytics are shown one currency at a time (amounts can't be mixed)
  const analyticsCode =
    statementCurrencies.find((c) => c.value === analyticsCurrency)?.code ??
    statementCurrencies[0]?.code ??
    "KES";
  const analyticsCur = CURRENCY_VALUES[analyticsCode] ?? Currency.KES;
  const otherFlow = (list: any[] | undefined) =>
    (list || []).find((x: any) => x.currencyCode === analyticsCode || x.currency === analyticsCur);
  const netIncomeIn = (t: any): number =>
    analyticsCode === "KES"
      ? t.netIncomeKES
      : analyticsCode === "USD"
        ? t.netIncomeUSD
        : ((otherFlow(t.otherCurrencies)?.income ?? 0) - (otherFlow(t.otherCurrencies)?.expenses ?? 0));
  const avgIn = (t: any): number | null =>
    analyticsCode === "KES" ? t.avgTransactionKES : analyticsCode === "USD" ? t.avgTransactionUSD : null;
  const currentBalanceIn = balanceRows.find((b) => b.code === analyticsCode)?.balance ?? 0;

  // Prepare chart data from analytics
  const monthlyChartData =
    analytics?.monthlyData.map((m) => ({
      month: m.month,
      income:
        analyticsCode === "KES" ? m.incomeKES : analyticsCode === "USD" ? m.incomeUSD : otherFlow(m.otherCurrencies)?.income ?? 0,
      expenses:
        analyticsCode === "KES" ? m.expensesKES : analyticsCode === "USD" ? m.expensesUSD : otherFlow(m.otherCurrencies)?.expenses ?? 0,
      balance:
        analyticsCode === "KES" ? m.balanceKES : analyticsCode === "USD" ? m.balanceUSD : currentBalanceIn,
    })) || [];

  const categoryChartData =
    analytics?.categoryBreakdown.map((c, i) => ({
      name: c.category,
      value: c.count,
      color: ["#3b82f6", "#ef4444", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899"][
        i % 6
      ],
    })) || [];

  const weeklyChartData = analytics?.weeklyActivity || [];

  // ============ LOADING STATE ============

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-slate-50 text-sm text-slate-500">
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
          <p className="mt-3 text-[15px] font-medium text-slate-900">Couldn't load your account.</p>
          <p className="mt-1 text-[14px] text-slate-600">{error}</p>
          <button
            onClick={fetchDashboard}
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-[14px] font-semibold text-white hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const displayName = profile?.fullName || userName;
  const firstName = displayName.trim().split(/\s+/)[0];
  const clientInitials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  const ClientSidebar = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <SarifMark size={32} className="shrink-0 rounded-[7px] ring-1 ring-white/15" />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold leading-tight text-white">Sarif</div>
          <div className="text-[12px] text-slate-400">Client account</div>
        </div>
        {onNavigate && (
          <button onClick={onNavigate} aria-label="Close menu" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <BureauSwitcher phone={profile?.whatsAppNumber ?? ""} />
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Main">
        {menuItems.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveView(item.id);
                onNavigate?.();
              }}
              aria-current={active ? "page" : undefined}
              className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[14px] font-medium ${
                active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <item.icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-blue-300" : ""}`} />
              <span className="flex-1 text-left">{item.label}</span>
              {(item.badge ?? 0) > 0 && (
                <span className="min-w-[20px] rounded-full bg-red-500 px-1.5 text-center text-[12px] font-semibold leading-5 text-white">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
        {SUPPORT_WHATSAPP && (
          <button
            onClick={handleContactSupport}
            className="mt-3 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[14px] font-medium text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <MessageCircle className="h-[18px] w-[18px] shrink-0" />
            Contact your bureau
          </button>
        )}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[13px] font-semibold text-white">
            {clientInitials || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium text-white">{displayName}</div>
            <div className="truncate text-[12px] text-slate-400">{profile?.code}</div>
          </div>
          <button
            onClick={onLogout}
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

  const sectionHead = "flex items-baseline justify-between border-b border-slate-200 px-5 py-4";
  const th = "px-4 py-2.5 text-left text-[13px] font-medium whitespace-nowrap text-slate-500";

  // ============ RENDER ============
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
          <span className="text-[16px] font-semibold text-slate-900">Sarif</span>
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
            {activeView === "dashboard" && (
              <motion.div key="dashboard" className="space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">Hello, {firstName}</h1>
                    <p className="mt-1 text-[14px] text-slate-500">
                      Account {profile?.code}
                      {profile?.lastLoginAt && (
                        <>
                          <span className="mx-2 text-slate-300">/</span>
                          Last signed in {formatDate(profile.lastLoginAt)}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleRefresh}
                      aria-label="Refresh"
                      title="Refresh"
                      className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-50"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handleExportCsv}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-[14px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="h-4 w-4" />
                      Export CSV
                    </button>
                    <button
                      onClick={handleDownloadStatement}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-[14px] font-semibold text-white hover:bg-blue-700"
                    >
                      <FileText className="h-4 w-4" />
                      Print statement
                    </button>
                  </div>
                </div>

                {/* Balances */}
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className={sectionHead}>
                    <h2 className="text-[16px] font-semibold text-slate-900">Your balances</h2>
                    <span className="hidden text-[13px] text-slate-500 sm:inline">Totals since your account opened</span>
                  </div>
                  {balanceRows.length === 0 ? (
                    <p className="px-5 py-6 text-[14px] text-slate-600">
                      No balances yet. They'll appear here once your bureau records a transaction for you.
                    </p>
                  ) : (
                    <>
                      <ul className="divide-y divide-slate-100 sm:hidden">
                        {balanceRows.map((b) => (
                          <li key={b.code} className="px-5 py-4">
                            <div className="flex items-baseline justify-between">
                              <span className="text-[14px] font-medium text-slate-700">{b.code}</span>
                              <span className={`text-[18px] font-semibold tabular-nums ${b.balance < 0 ? "text-red-700" : "text-slate-900"}`}>
                                {formatCurrency(b.balance, b.code)}
                              </span>
                            </div>
                            <div className="mt-1 flex justify-between text-[13px] tabular-nums text-slate-500">
                              <span>In {formatCurrency(b.totalIn, b.code)}</span>
                              <span>Out {formatCurrency(b.totalOut, b.code)}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <table className="hidden w-full tabular-nums sm:table">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className={`${th} pl-5`}>Currency</th>
                            <th className={`${th} text-right`}>Balance</th>
                            <th className={`${th} text-right`}>Total in</th>
                            <th className={`${th} pr-5 text-right`}>Total out</th>
                          </tr>
                        </thead>
                        <tbody>
                          {balanceRows.map((b) => (
                            <tr key={b.code} className="border-b border-slate-100 last:border-0">
                              <td className="px-4 py-3.5 pl-5 text-[14px] font-medium text-slate-900">{b.code}</td>
                              <td className={`px-4 py-3.5 text-right text-[17px] font-semibold ${b.balance < 0 ? "text-red-700" : "text-slate-900"}`}>
                                {formatCurrency(b.balance, b.code)}
                              </td>
                              <td className="px-4 py-3.5 text-right text-[14px] text-emerald-700">{formatCurrency(b.totalIn, b.code)}</td>
                              <td className="px-4 py-3.5 pr-5 text-right text-[14px] text-red-700">{formatCurrency(b.totalOut, b.code)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                  {monthRows.length > 0 ? (
                    <div className="flex flex-wrap gap-x-8 gap-y-1 border-t border-slate-200 bg-slate-50 px-5 py-3 text-[13px] tabular-nums text-slate-600">
                      <span className="font-medium text-slate-700">This month</span>
                      {monthRows.map((r) => (
                        <span key={r.code}>
                          {r.code} in {formatCurrency(r.in, r.code).replace(`${r.code} `, "")}, out{" "}
                          {formatCurrency(r.out, r.code).replace(`${r.code} `, "")}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </section>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  {/* Recent transactions */}
                  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className={sectionHead}>
                      <h2 className="text-[16px] font-semibold text-slate-900">Recent transactions</h2>
                      <button onClick={() => setActiveView("statements")} className="rounded-lg text-[13px] font-medium text-blue-700 hover:underline">
                        See all
                      </button>
                    </div>
                    {recentTransactions.length === 0 ? (
                      <p className="px-5 py-10 text-center text-[14px] text-slate-600">No transactions yet.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {recentTransactions.slice(0, 6).map((txn) => {
                          const isOut = txn.type === "Debit";
                          return (
                            <li key={txn.id}>
                              <button
                                onClick={() => setSelectedTransaction(txn)}
                                className="rounded-lg flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-slate-50"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[14px] font-medium text-slate-900">{txn.description}</div>
                                  <div className="mt-0.5 truncate text-[13px] text-slate-500">
                                    {formatDate(txn.date)}, {formatTime(txn.date)}
                                    {txn.reference && <span className="ml-3">{txn.reference}</span>}
                                  </div>
                                </div>
                                <div className="shrink-0 text-right tabular-nums">
                                  <div className={`text-[14px] font-semibold ${isOut ? "text-red-700" : "text-emerald-700"}`}>
                                    {isOut ? "−" : "+"}
                                    {formatCurrency(txn.amount, txn.currency)}
                                  </div>
                                  <div className="mt-0.5 text-[12px] text-slate-500">
                                    Balance {formatCurrency(txn.balanceAfter, txn.currency)}
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  {/* Alerts */}
                  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className={sectionHead}>
                      <h2 className="text-[16px] font-semibold text-slate-900">Alerts</h2>
                      <button onClick={() => setActiveView("alerts")} className="rounded-lg text-[13px] font-medium text-blue-700 hover:underline">
                        See all
                      </button>
                    </div>
                    {alerts.length === 0 ? (
                      <p className="px-5 py-10 text-center text-[14px] text-slate-600">No alerts.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {alerts.slice(0, 4).map((alert) => (
                          <li key={alert.id}>
                            <button onClick={() => setSelectedAlert(alert)} className="rounded-lg flex w-full gap-3 px-5 py-3.5 text-left hover:bg-slate-50">
                              <span
                                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${alert.isRead ? "bg-transparent" : "bg-blue-600"}`}
                                aria-label={alert.isRead ? undefined : "Unread"}
                              />
                              <div className="min-w-0">
                                <div className={`text-[14px] ${alert.isRead ? "text-slate-700" : "font-semibold text-slate-900"}`}>{alert.title}</div>
                                <div className="mt-0.5 line-clamp-2 text-[13px] text-slate-500">{alert.message}</div>
                                <div className="mt-1 text-[12px] text-slate-400">{formatDate(alert.createdAt)}</div>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </motion.div>
            )}
            {/* ============ STATEMENTS VIEW ============ */}
            {activeView === "statements" && (
              <motion.div
                key="statements"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">Statements</h1>
                    <p className="mt-1 text-[14px] text-slate-500">
                      {totalCount === 1 ? "1 transaction" : `${totalCount.toLocaleString()} transactions`}
                      {filterPeriod === "month" ? " in the last month" : filterPeriod === "week" ? " in the last 7 days" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDownloadStatement}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-[14px] font-medium text-white hover:bg-blue-700"
                    >
                      <Download className="h-4 w-4" />
                      Download PDF
                    </button>
                    <button
                      onClick={handlePrintStatement}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[14px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Printer className="h-4 w-4" />
                      <span className="hidden sm:inline">Print</span>
                    </button>
                    <button
                      onClick={handleExportCsv}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[14px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <FileDown className="h-4 w-4" />
                      <span className="hidden sm:inline">CSV</span>
                    </button>
                  </div>
                </div>

                {/* Filters: one quiet row */}
                {(() => {
                  const seg = (on: boolean) =>
                    `h-8 rounded-md px-3 text-[13px] font-medium transition-colors ${
                      on ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`;
                  return (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                      <div className="relative lg:w-72">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="search"
                          aria-label="Search transactions"
                          placeholder="Search description or reference"
                          value={searchQuery}
                          onChange={(e: any) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <div role="group" aria-label="Period" className="inline-flex rounded-lg bg-slate-100 p-0.5">
                          {([
                            ["all", "All time"],
                            ["month", "Last month"],
                            ["week", "Last 7 days"],
                          ] as const).map(([v, label]) => (
                            <button key={v} aria-pressed={filterPeriod === v} onClick={() => { setFilterPeriod(v); setCurrentPage(1); }} className={seg(filterPeriod === v)}>
                              {label}
                            </button>
                          ))}
                        </div>
                        {statementCurrencies.length > 1 && (
                          <div role="group" aria-label="Currency" className="inline-flex rounded-lg bg-slate-100 p-0.5">
                            <button aria-pressed={currencyFilter === undefined} onClick={() => { setCurrencyFilter(undefined); setCurrentPage(1); }} className={seg(currencyFilter === undefined)}>
                              All
                            </button>
                            {statementCurrencies.map((c) => (
                              <button key={c.value} aria-pressed={currencyFilter === c.value} onClick={() => { setCurrencyFilter(c.value); setCurrentPage(1); }} className={seg(currencyFilter === c.value)}>
                                {c.code}
                              </button>
                            ))}
                          </div>
                        )}
                        <div role="group" aria-label="Direction" className="inline-flex rounded-lg bg-slate-100 p-0.5">
                          <button aria-pressed={typeFilter === undefined} onClick={() => { setTypeFilter(undefined); setCurrentPage(1); }} className={seg(typeFilter === undefined)}>
                            All
                          </button>
                          <button aria-pressed={typeFilter === TransactionType.Credit} onClick={() => { setTypeFilter(TransactionType.Credit); setCurrentPage(1); }} className={seg(typeFilter === TransactionType.Credit)}>
                            Money in
                          </button>
                          <button aria-pressed={typeFilter === TransactionType.Debit} onClick={() => { setTypeFilter(TransactionType.Debit); setCurrentPage(1); }} className={seg(typeFilter === TransactionType.Debit)}>
                            Money out
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Transactions */}
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {loadingTransactions ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-[14px] text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading transactions
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="py-16 text-center">
                      <p className="text-[14px] font-medium text-slate-900">No transactions</p>
                      <p className="mt-1 text-[13px] text-slate-500">
                        {searchQuery || filterPeriod !== "all" || currencyFilter !== undefined || typeFilter !== undefined
                          ? "Nothing matches these filters."
                          : "Transactions on your account will appear here."}
                      </p>
                      {(searchQuery || filterPeriod !== "all" || currencyFilter !== undefined || typeFilter !== undefined) && (
                        <button
                          onClick={() => {
                            setSearchQuery("");
                            setFilterPeriod("all");
                            setCurrencyFilter(undefined);
                            setTypeFilter(undefined);
                            setCurrentPage(1);
                          }}
                          className="mt-3 text-[13px] font-medium text-blue-700 hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Phone: one line per transaction, like the dashboard list */}
                      <ul className="divide-y divide-slate-100 lg:hidden">
                        {transactions.map((txn) => {
                          const isIn = txn.type !== "Debit";
                          return (
                            <li key={txn.id}>
                              <button
                                onClick={() => setSelectedTransaction(txn)}
                                className="flex w-full items-center gap-4 px-4 py-3.5 text-left hover:bg-slate-50"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[14px] font-medium text-slate-900">{txn.description}</div>
                                  <div className="mt-0.5 truncate text-[13px] text-slate-500">
                                    {formatDate(txn.date)}, {formatTime(txn.date)} · {txn.code}
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <div className={`text-[14px] font-medium tabular-nums ${isIn ? "text-emerald-700" : "text-slate-900"}`}>
                                    {isIn ? "+" : "−"}
                                    {formatCurrency(txn.amount, txn.currency)}
                                  </div>
                                  <div className="mt-0.5 text-[12px] tabular-nums text-slate-500">
                                    Bal {formatCurrency(txn.balanceAfter, txn.currency)}
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>

                      {/* Desktop: a bank-statement table */}
                      <div className="hidden overflow-x-auto lg:block">
                        <table className="w-full text-[14px]">
                          <thead>
                            <tr className="border-b border-slate-200 text-left text-[12px] font-medium text-slate-500">
                              <th scope="col" className="px-5 py-3 font-medium">Date</th>
                              <th scope="col" className="px-5 py-3 font-medium">Description</th>
                              <th scope="col" className="px-5 py-3 text-right font-medium">Money in</th>
                              <th scope="col" className="px-5 py-3 text-right font-medium">Money out</th>
                              <th scope="col" className="px-5 py-3 text-right font-medium">Balance</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {transactions.map((txn) => {
                              const isIn = txn.type !== "Debit";
                              const amount = formatCurrency(txn.amount, txn.currency);
                              return (
                                <tr
                                  key={txn.id}
                                  tabIndex={0}
                                  onClick={() => setSelectedTransaction(txn)}
                                  onKeyDown={(e: any) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelectedTransaction(txn))}
                                  className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                                >
                                  <td className="whitespace-nowrap px-5 py-3 align-top">
                                    <div className="text-slate-900">{formatDate(txn.date)}</div>
                                    <div className="text-[12px] text-slate-500">{formatTime(txn.date)}</div>
                                  </td>
                                  <td className="px-5 py-3 align-top">
                                    <div className="text-slate-900">{txn.description}</div>
                                    <div className="text-[12px] text-slate-500">{txn.code}</div>
                                  </td>
                                  <td className="whitespace-nowrap px-5 py-3 text-right align-top tabular-nums text-emerald-700">
                                    {isIn ? amount : ""}
                                  </td>
                                  <td className="whitespace-nowrap px-5 py-3 text-right align-top tabular-nums text-slate-900">
                                    {isIn ? "" : amount}
                                  </td>
                                  <td className="whitespace-nowrap px-5 py-3 text-right align-top font-medium tabular-nums text-slate-900">
                                    {formatCurrency(txn.balanceAfter, txn.currency)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
                          <p className="text-[13px] text-slate-500 tabular-nums">
                            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount.toLocaleString()}
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                              disabled={currentPage === 1}
                              aria-label="Previous page"
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <ChevronLeft className="h-4 w-4" />
                              Previous
                            </button>
                            <button
                              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                              disabled={currentPage === totalPages}
                              aria-label="Next page"
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Next
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </section>
              </motion.div>
            )}

            {/* ============ ALERTS VIEW ============ */}
            {activeView === "alerts" && (
              <motion.div
                key="alerts"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-[26px] font-semibold      text-slate-900 tracking-tight">
                      Notifications & Alerts
                    </h1>
                    <p className="text-slate-600 mt-2">
                      Stay updated with your account activity
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setUnreadOnly(!unreadOnly)}
                      className={`rounded-lg px-5 py-3 text-sm font-bold transition-all ${
                        unreadOnly
                          ? " bg-amber-600  text-white "
                          : "bg-white text-slate-700 border border-slate-300"
                      }`}
                    >
                      {unreadOnly ? "Showing Unread" : "Show Unread Only"}
                    </button>
                    <button
                      onClick={handleMarkAllAlertsRead}
                      className="rounded-lg px-5 py-3 text-sm font-bold text-slate-700 bg-white border border-slate-300 hover:border-emerald-300 hover:bg-emerald-50 transition-all"
                    >
                      Mark All Read
                    </button>
                  </div>
                </div>

                {loadingAlerts ? (
                  <div className="p-12 text-center">
                    <Loader2 className="w-10 h-10 text-amber-600 animate-spin mx-auto mb-4" />
                    <p className="text-slate-500">Loading alerts...</p>
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="rounded-xl bg-white  border border-slate-200 p-12 text-center ">
                    <Bell className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-slate-700 mb-2">
                      No Alerts
                    </h3>
                    <p className="text-slate-500">You're all caught up!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {alerts.map((alert) => {
                      const AlertIcon = getAlertIcon(alert.type);
                      const gradient = getAlertGradient(alert.type);
                      const borderClass = getAlertBorderClass(alert.type);

                      return (
                        <button
                          key={alert.id}
                          onClick={() => setSelectedAlert(alert)}
                          className={`rounded-lg w-full bg-white  border  p-6 transition-all text-left group relative overflow-hidden ${borderClass} ${
                            alert.isRead ? "opacity-60" : ""
                          }`}
                        >
                          <div
                            className={`absolute inset-0  ${gradient} opacity-0 group-hover:opacity-5 transition-opacity`}
                          />
                          <div className="flex items-start gap-4 relative z-10">
                            <div
                              className={`w-12 h-12 flex items-center justify-center   ${gradient}`}
                            >
                              <AlertIcon className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="font-semibold text-slate-900 text-lg group-hover:text-blue-600 transition-colors">
                                  {alert.title}
                                </h4>
                                {!alert.isRead && (
                                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                )}
                              </div>
                              <p className="text-slate-600 mb-3 leading-relaxed">
                                {alert.message}
                              </p>
                              <p className="text-sm text-slate-500 flex items-center gap-1.5">
                                <Clock className="w-4 h-4" />
                                {formatDate(alert.createdAt)}
                              </p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600  transition-all flex-shrink-0" />
                          </div>
                        </button>
                      );
                    })}

                    {/* Alert Pagination */}
                    {alertTotalPages > 1 && (
                      <div className="flex items-center justify-center gap-2 pt-4">
                        <button
                          onClick={() =>
                            setAlertPage((p) => Math.max(1, p - 1))
                          }
                          disabled={alertPage === 1}
                          className="rounded-lg px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <span className="text-sm text-slate-600">
                          Page {alertPage} of {alertTotalPages}
                        </span>
                        <button
                          onClick={() =>
                            setAlertPage((p) =>
                              Math.min(alertTotalPages, p + 1),
                            )
                          }
                          disabled={alertPage === alertTotalPages}
                          className="rounded-lg px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* ============ ANALYTICS VIEW ============ */}
            {activeView === "analytics" && (
              <motion.div
                key="analytics"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div>
                  <h1 className="text-[26px] font-semibold      text-slate-900 tracking-tight">
                    Account Analytics
                  </h1>
                  <p className="text-slate-600 mt-2">
                    Deep insights into your financial performance
                  </p>
                  {statementCurrencies.length > 1 && (
                    <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Currency">
                      {statementCurrencies.map((c) => (
                        <button
                          key={c.code}
                          onClick={() => setAnalyticsCurrency(c.value)}
                          aria-pressed={analyticsCode === c.code}
                          className={`rounded-md px-3 py-1 text-[13px] font-semibold ${
                            analyticsCode === c.code ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {c.code}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {loadingAnalytics ? (
                  <div className="p-12 text-center">
                    <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mx-auto mb-4" />
                    <p className="text-slate-500">Loading analytics...</p>
                  </div>
                ) : !analytics ? (
                  <div className="rounded-xl bg-white  border border-slate-200 p-12 text-center ">
                    <BarChart3 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-slate-700 mb-2">
                      No Analytics Data
                    </h3>
                    <p className="text-slate-500">
                      Start making transactions to see analytics
                    </p>
                  </div>
                ) : (
                  <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="rounded-xl bg-white  border border-blue-200 hover:border-blue-400 p-6 transition-all ">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-12 h-12  bg-blue-500  flex items-center justify-center ">
                            <TrendingUp className="w-6 h-6 text-white" />
                          </div>
                          <span className="text-sm font-bold text-emerald-600 flex items-center gap-1">
                            {analytics.totals.growthPercentage > 0 ? "+" : ""}
                            {analytics.totals.growthPercentage.toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-500   mb-2">
                          Growth
                        </p>
                        <p className="text-sm text-slate-600">
                          Transactions this month vs last month
                        </p>
                      </div>

                      <div className="rounded-xl bg-white  border border-blue-200 hover:border-blue-400 p-6 transition-all ">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-12 h-12  bg-violet-500  flex items-center justify-center ">
                            <Activity className="w-6 h-6 text-white" />
                          </div>
                          <span className="text-xs font-bold text-blue-600">
                            Active
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-500   mb-2">
                          Total Transactions
                        </p>
                        <p className="text-2xl font-semibold     text-slate-900">
                          {analytics.totals.totalTransactions}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white  border border-emerald-200 hover:border-emerald-400 p-6 transition-all ">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-12 h-12  bg-emerald-500  flex items-center justify-center ">
                            <CircleDollarSign className="w-6 h-6 text-white" />
                          </div>
                        </div>
                        <p className="text-xs font-bold text-slate-500   mb-2">
                          Net Income ({analyticsCode})
                        </p>
                        <p className="text-2xl font-semibold     text-slate-900">
                          {formatCurrency(netIncomeIn(analytics.totals), analyticsCur)}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white  border border-pink-200 hover:border-pink-400 p-6 transition-all ">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-12 h-12  bg-pink-500  flex items-center justify-center ">
                            <Banknote className="w-6 h-6 text-white" />
                          </div>
                        </div>
                        <p className="text-xs font-bold text-slate-500   mb-2">
                          Avg Transaction ({analyticsCode})
                        </p>
                        <p className="text-2xl font-semibold     text-slate-900">
                          {avgIn(analytics.totals) === null
                            ? "—"
                            : formatCurrency(avgIn(analytics.totals)!, analyticsCur)}
                        </p>
                      </div>
                    </div>

                    {/* Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Monthly Performance */}
                      <div className="rounded-xl bg-white  border border-blue-200 hover:border-blue-300 transition-all ">
                        <div className="p-6 border-b border-slate-200">
                          <h3 className="text-lg font-semibold     text-blue-700">
                            Monthly Performance
                          </h3>
                          <p className="text-sm text-slate-600 mt-1">
                            Income vs Expenses trend
                          </p>
                        </div>
                        <div className="p-6">
                          <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={monthlyChartData}>
                              <defs>
                                <linearGradient
                                  id="incomeGradient"
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor="#10b981"
                                    stopOpacity={0.8}
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor="#10b981"
                                    stopOpacity={0}
                                  />
                                </linearGradient>
                                <linearGradient
                                  id="expenseGradient"
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor="#ef4444"
                                    stopOpacity={0.8}
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor="#ef4444"
                                    stopOpacity={0}
                                  />
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="month" stroke="#94a3b8" />
                              <YAxis stroke="#94a3b8" />
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#e2e8f0"
                              />
                              <Tooltip
                                contentStyle={{
                                  background: "white",
                                  border: "2px solid #cbd5e1",
                                  borderRadius: "0px",
                                  boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
                                }}
                                formatter={(value: number) =>
                                  formatCurrency(value, analyticsCur)
                                }
                              />
                              <Area
                                type="monotone"
                                dataKey="income"
                                stroke="#10b981"
                                fillOpacity={1}
                                fill="url(#incomeGradient)"
                                strokeWidth={3}
                              />
                              <Area
                                type="monotone"
                                dataKey="expenses"
                                stroke="#ef4444"
                                fillOpacity={1}
                                fill="url(#expenseGradient)"
                                strokeWidth={3}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Category Breakdown */}
                      <div className="rounded-xl bg-white  border border-blue-200 hover:border-blue-300 transition-all ">
                        <div className="p-6 border-b border-slate-200">
                          <h3 className="text-lg font-semibold     text-violet-700">
                            Transaction Breakdown
                          </h3>
                          <p className="text-sm text-slate-600 mt-1">
                            By category distribution
                          </p>
                        </div>
                        <div className="p-6">
                          <ResponsiveContainer width="100%" height={300}>
                            <RechartPieChart>
                              <Pie
                                data={categoryChartData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) =>
                                  `${name} ${(percent * 100).toFixed(0)}%`
                                }
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                              >
                                {categoryChartData.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                  />
                                ))}
                              </Pie>
                              <Tooltip />
                            </RechartPieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Balance Growth */}
                      <div className="rounded-xl bg-white  border border-emerald-200 hover:border-emerald-300 transition-all ">
                        <div className="p-6 border-b border-slate-200">
                          <h3 className="text-lg font-semibold     text-emerald-700">
                            Balance Growth
                          </h3>
                          <p className="text-sm text-slate-600 mt-1">
                            6-month trend analysis
                          </p>
                        </div>
                        <div className="p-6">
                          <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={monthlyChartData}>
                              <XAxis dataKey="month" stroke="#94a3b8" />
                              <YAxis stroke="#94a3b8" />
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#e2e8f0"
                              />
                              <Tooltip
                                formatter={(value: number) =>
                                  formatCurrency(value, analyticsCur)
                                }
                              />
                              <Line
                                type="monotone"
                                dataKey="balance"
                                stroke="#10b981"
                                strokeWidth={4}
                                dot={{ fill: "#10b981", r: 6 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Weekly Activity */}
                      <div className="rounded-xl bg-white  border border-pink-200 hover:border-pink-300 transition-all ">
                        <div className="p-6 border-b border-slate-200">
                          <h3 className="text-lg font-semibold     text-pink-700">
                            Weekly Activity
                          </h3>
                          <p className="text-sm text-slate-600 mt-1">
                            Transaction volume by day
                          </p>
                        </div>
                        <div className="p-6">
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={weeklyChartData}>
                              <XAxis dataKey="day" stroke="#94a3b8" />
                              <YAxis stroke="#94a3b8" />
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#e2e8f0"
                              />
                              <Tooltip />
                              <Bar
                                dataKey="transactions"
                                fill="url(#pinkGradient)"
                              />
                              <defs>
                                <linearGradient
                                  id="pinkGradient"
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop offset="0%" stopColor="#ec4899" />
                                  <stop offset="100%" stopColor="#f43f5e" />
                                </linearGradient>
                              </defs>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>

                    {/* Insights */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className=" bg-blue-500   p-6 border border-blue-400  relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl hidden" />
                        <div className="relative z-10">
                          <div className="w-12 h-12 bg-white flex items-center justify-center mb-4">
                            <Zap className="w-6 h-6 text-blue-600" />
                          </div>
                          <h3 className="text-xl font-semibold text-white mb-2">
                            Smart Insight
                          </h3>
                          <p className="text-blue-50 leading-relaxed">
                            {analytics.totals.growthPercentage > 0
                              ? `Your account is growing! ${analytics.totals.growthPercentage.toFixed(
                                  1,
                                )}% increase this month.`
                              : "Your account activity is steady. Keep tracking your transactions!"}
                          </p>
                        </div>
                      </div>

                      <div className=" bg-emerald-500   p-6 border border-emerald-400  relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl hidden" />
                        <div className="relative z-10">
                          <div className="w-12 h-12 bg-white flex items-center justify-center mb-4">
                            <Target className="w-6 h-6 text-emerald-600" />
                          </div>
                          <h3 className="text-xl font-semibold text-white mb-2">
                            Summary
                          </h3>
                          <p className="text-emerald-50 leading-relaxed">
                            {analytics.totals.totalTransactions} total
                            transactions
                            {avgIn(analytics.totals) !== null && (
                              <>
                                {" "}with an average of{" "}
                                {formatCurrency(avgIn(analytics.totals)!, analyticsCur)} per{" "}
                                {analyticsCode} transaction
                              </>
                            )}
                            .
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}
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
                  <h1 className="text-[26px] font-semibold      text-slate-900 tracking-tight">
                    Profile Settings
                  </h1>
                  <p className="text-slate-600 mt-2">
                    Manage your account information and preferences
                  </p>
                </div>

                {/* Profile Header Card */}
                <div className=" bg-blue-500   p-8 border border-blue-400  relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl hidden" />
                  <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-400/20 rounded-full blur-3xl hidden" />
                  <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
                    <div className="w-24 h-24 bg-white flex items-center justify-center text-blue-600 text-[26px] font-semibold tracking-tight">
                      {(profile?.fullName || userName).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 text-center md:text-left">
                      <h2 className="text-3xl font-semibold text-white mb-2">
                        {profile?.fullName || userName}
                      </h2>
                      <p className="text-blue-100 font-semibold mb-4">
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
                        <span className="px-4 py-2 bg-white text-emerald-600 text-xs font-bold flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          Protected
                        </span>
                        {profile?.clientType === ClientType.Permanent && (
                          <span className="px-4 py-2 bg-white text-amber-600 text-xs font-bold flex items-center gap-2">
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
                        <p className="text-xs font-bold text-slate-500   mb-1">
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
                        <p className="text-xs font-bold text-slate-500   mb-1">
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
                          <p className="text-xs font-bold text-slate-500   mb-1">
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
                        <p className="text-xs font-bold text-slate-500   mb-1">
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
                          <p className="text-xs font-bold text-slate-500   mb-1">
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
                        <p className="text-xs font-bold text-slate-500   mb-1">
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

                {/* Account Balances */}
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
                    <div className="p-6  bg-emerald-50  border border-emerald-200">
                      <div className="flex items-center gap-3 mb-3">
                        <Banknote className="w-8 h-8 text-emerald-600" />
                        <span className="text-sm font-bold text-emerald-700">
                          KES Balance
                        </span>
                      </div>
                      <p className="text-[26px] font-semibold     text-slate-900 tracking-tight">
                        {formatCurrency(profile?.balanceKES ?? 0, Currency.KES)}
                      </p>
                      <p className="text-xs text-slate-500 mt-2">
                        Opening:{" "}
                        {formatCurrency(
                          profile?.openingBalanceKES ?? 0,
                          Currency.KES,
                        )}
                      </p>
                    </div>

                    <div className="p-6  bg-violet-50  border border-blue-200">
                      <div className="flex items-center gap-3 mb-3">
                        <DollarSign className="w-8 h-8 text-blue-600" />
                        <span className="text-sm font-bold text-blue-700">
                          USD Balance
                        </span>
                      </div>
                      <p className="text-[26px] font-semibold     text-slate-900 tracking-tight">
                        {formatCurrency(profile?.balanceUSD ?? 0, Currency.USD)}
                      </p>
                      <p className="text-xs text-slate-500 mt-2">
                        Opening:{" "}
                        {formatCurrency(
                          profile?.openingBalanceUSD ?? 0,
                          Currency.USD,
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Balances in other currencies (UGX, EUR, ...) — only if held */}
                {(profile?.otherBalances || []).length > 0 && (
                  <div className="rounded-xl bg-white  border border-blue-200  p-6">
                    <h3 className="text-sm font-bold text-blue-700   mb-3">
                      Other Currencies
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(profile?.otherBalances || []).map((b: any) => (
                        <div
                          key={b.currencyCode || b.currency}
                          className="flex items-center justify-between border border-blue-100 bg-blue-50/50 p-4"
                        >
                          <div>
                            <p className="text-xs font-bold text-blue-600">
                              {b.currencyCode}
                            </p>
                            <p className="text-xs text-slate-500">
                              In: {(b.totalIn ?? 0).toLocaleString()} · Out:{" "}
                              {(b.totalOut ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <p
                            className={`text-xl font-bold ${(b.balance ?? 0) < 0 ? "text-red-600" : "text-slate-900"}`}
                          >
                            {formatCurrency(b.balance ?? 0, b.currencyCode)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
      <AnimatePresence>
        {selectedTransaction && (() => {
          const t = selectedTransaction;
          const isIn = t.type !== "Debit";
          const code = currencyCode(t.currency);
          const rows: [string, ReactNode][] = [
            ["Date", `${formatDate(t.date)}, ${formatTime(t.date)}`],
            ["Type", isIn ? "Money in (credit)" : "Money out (debit)"],
            ["Currency", code],
          ];
          if (t.counterAccountName) rows.push([isIn ? "From" : "To", t.counterAccountName]);
          if (t.exchangeRate && t.counterAmount != null && t.counterCurrency != null)
            rows.push([
              "Exchange",
              `${formatCurrency(t.counterAmount, t.counterCurrency)} at ${t.exchangeRate.toLocaleString(undefined, { maximumFractionDigits: 6 })}`,
            ]);
          rows.push(["Balance before", formatCurrency(t.balanceBefore, t.currency)]);
          rows.push(["Balance after", formatCurrency(t.balanceAfter, t.currency)]);
          const details = [
            `${t.description}`,
            `${isIn ? "Money in" : "Money out"}: ${formatCurrency(t.amount, t.currency)}`,
            `Date: ${formatDate(t.date)}, ${formatTime(t.date)}`,
            `Transaction: ${t.code}`,
            t.reference && t.reference !== t.code ? `Reference: ${t.reference}` : "",
          ].filter(Boolean).join("\n");
          return (
            <>
              <motion.div
                key="txn-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-slate-900/40"
                onClick={() => setSelectedTransaction(null)}
              />
              <motion.div
                key="txn-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="txn-title"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.15 }}
                onKeyDown={(e: any) => e.key === "Escape" && setSelectedTransaction(null)}
                className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border sm:border-slate-200"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                  <div className="min-w-0">
                    <h2 id="txn-title" className="truncate text-[15px] font-semibold text-slate-900">{t.description}</h2>
                    <p className="mt-0.5 text-[13px] text-slate-500">{t.code}</p>
                  </div>
                  <button
                    autoFocus
                    aria-label="Close"
                    onClick={() => setSelectedTransaction(null)}
                    className="-mr-1.5 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Amount */}
                <div className="px-5 pb-2 pt-5">
                  <p className="text-[13px] text-slate-500">{isIn ? "Money in" : "Money out"}</p>
                  <p className={`mt-1 text-[28px] font-semibold tracking-tight tabular-nums ${isIn ? "text-emerald-700" : "text-slate-900"}`}>
                    {isIn ? "+" : "−"}
                    {formatCurrency(t.amount, t.currency)}
                  </p>
                </div>

                {/* Details */}
                <dl className="divide-y divide-slate-100 px-5">
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-6 py-2.5 text-[14px]">
                      <dt className="shrink-0 text-slate-500">{label}</dt>
                      <dd className="text-right tabular-nums text-slate-900">{value}</dd>
                    </div>
                  ))}
                  {t.reference && t.reference !== t.code && (
                    <div className="flex items-baseline justify-between gap-6 py-2.5 text-[14px]">
                      <dt className="shrink-0 text-slate-500">Reference</dt>
                      <dd className="flex min-w-0 items-center gap-2 text-slate-900">
                        <span className="truncate font-mono text-[13px]">{t.reference}</span>
                        <button
                          aria-label="Copy reference"
                          onClick={() => {
                            navigator.clipboard.writeText(t.reference);
                            toast.success("Reference copied");
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </dd>
                    </div>
                  )}
                  {t.notes && (
                    <div className="py-2.5 text-[14px]">
                      <dt className="text-slate-500">Notes</dt>
                      <dd className="mt-1 whitespace-pre-line text-slate-900">{t.notes}</dd>
                    </div>
                  )}
                </dl>

                {/* Actions */}
                <div className="flex gap-2 border-t border-slate-200 px-5 py-4">
                  <button
                    onClick={() => handleDownloadReceipt(t.id, t.code)}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 text-[14px] font-medium text-white hover:bg-blue-700"
                  >
                    <Download className="h-4 w-4" />
                    Download receipt
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(details);
                      toast.success("Details copied");
                    }}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-[14px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Copy className="h-4 w-4" />
                    Copy details
                  </button>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* ============ ALERT DETAIL MODAL ============ */}
      <AnimatePresence>
        {selectedAlert && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={() => setSelectedAlert(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white shadow-2xl z-50 max-h-[90vh] overflow-y-auto"
            >
              {(() => {
                const AlertIcon = getAlertIcon(selectedAlert.type);
                const gradient = getAlertGradient(selectedAlert.type);
                return (
                  <>
                    {/* Header */}
                    <div
                      className={`sticky top-0  ${gradient} p-6 border-b relative overflow-hidden z-10`}
                    >
                      <div className="absolute inset-0   " />
                      <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-white flex items-center justify-center ">
                            <AlertIcon className="w-7 h-7 text-slate-700" />
                          </div>
                          <div>
                            <h3 className="text-xl font-semibold text-white">
                              {selectedAlert.title}
                            </h3>
                            <p className="text-white/80 text-sm font-semibold flex items-center gap-1.5 mt-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formatDate(selectedAlert.createdAt)}
                            </p>
                          </div>
                        </div>
                        <button aria-label="Close"
                          onClick={() => setSelectedAlert(null)}
                          className="rounded-lg p-2 hover:bg-white/20 transition-all"
                        >
                          <X className="w-6 h-6 text-white" />
                        </button>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-6">
                      <div className="p-5 bg-slate-50 border border-slate-200">
                        <p className="text-base leading-relaxed text-slate-900 font-medium">
                          {selectedAlert.message}
                        </p>
                      </div>

                      <div className="flex items-center justify-between p-4  bg-slate-50  border border-slate-200">
                        <div>
                          <p className="text-xs font-bold text-slate-500   mb-1">
                            Alert Type
                          </p>
                          <span
                            className={`inline-flex px-3 py-2 text-sm font-semibold border ${
                              selectedAlert.type === "success"
                                ? " bg-emerald-50  text-emerald-700 border-emerald-300"
                                : selectedAlert.type === "warning"
                                  ? " bg-amber-50  text-amber-700 border-amber-300"
                                  : selectedAlert.type === "error"
                                    ? " bg-red-50  text-red-700 border-red-300"
                                    : " bg-blue-50  text-blue-700 border-blue-300"
                            }`}
                          >
                            {selectedAlert.type.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-500   mb-1">
                            Status
                          </p>
                          <span
                            className={`inline-flex px-3 py-2 text-sm font-semibold ${
                              selectedAlert.isRead
                                ? "bg-slate-100 text-slate-600 border border-slate-300"
                                : "bg-blue-100 text-blue-700 border border-blue-300"
                            }`}
                          >
                            {selectedAlert.isRead ? "Read" : "Unread"}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3">
                        {!selectedAlert.isRead && (
                          <button
                            onClick={() => {
                              handleMarkAlertRead(selectedAlert.id);
                              setSelectedAlert({
                                ...selectedAlert,
                                isRead: true,
                              });
                            }}
                            className={`rounded-lg flex-1 flex items-center justify-center gap-2 px-4 py-3  ${gradient} text-white font-bold  transition-all`}
                          >
                            <CheckCircle className="w-4 h-4" />
                            Mark as Read
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedAlert(null)}
                          className={`rounded-lg ${
                            selectedAlert.isRead ? "flex-1" : ""
                          } px-4 py-3 bg-white text-slate-700 font-bold border border-slate-300 hover:border-slate-400 transition-all`}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ============ PASSWORD CHANGE MODAL ============ */}
      <AnimatePresence>
        {showPasswordModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={() => setShowPasswordModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white shadow-2xl z-50"
            >
              {/* Header */}
              <div className=" bg-blue-500   p-6 border-b border-blue-400">
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
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
