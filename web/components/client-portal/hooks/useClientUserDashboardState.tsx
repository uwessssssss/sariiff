"use client";

import { Bell, FileText, LayoutDashboard, PieChart, User } from "lucide-react";
import { ChangePasswordDto, ClientAlertDto, ClientAnalyticsDto, ClientDashboardDto, ClientProfileDto, ClientTransactionDto, Currency, PortalTransactionFilters, QuickStatsDto, TransactionType, downloadTransactionReceipt, exportTransactionsCsv, getClientAlerts, getClientAnalytics, getClientDashboard, getClientTransactions, getStoredAuth, allPages, markAlertAsRead, markAllAlertsAsRead } from "@/lib/api";
import { ClientUserDashboardProps, ClientView } from "../helpers";
import { localDate } from "@/lib/dates";
import { toast } from "sonner";
import { useCallback, useRef, useState } from "react";

/** ClientUserDashboard: state (part 1 of 2 of useClientUserDashboard). */
export function useClientUserDashboardState(prev: { userName: ClientUserDashboardProps["userName"]; onLogout: ClientUserDashboardProps["onLogout"] }) {
  const { userName } = prev;
  // View State
  const [activeView, setActiveView] = useState<ClientView>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
  // Each keystroke in the search and each filter change starts a request; an older one that
  // answers last must not replace the list for what is typed now.
  const txnSeq = useRef(0);
  // The filters on screen, shared by the list and the statement PDF/print.
  const txnFilters = (): Partial<PortalTransactionFilters> => {
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
    return filters;
  };
  /** Every transaction matching the filters on screen (the PDF and print used only the page shown, at most 50). */
  const allMatchingTransactions = async (): Promise<ClientTransactionDto[]> => {
    const r = await allPages<ClientTransactionDto>((p, n) => getClientTransactions(p, n, txnFilters()), 200, 5000);
    return r.success && r.data ? r.data.items : transactions;
  };
  const fetchTransactions = useCallback(async () => {
    const seq = ++txnSeq.current;
    try {
      setLoadingTransactions(true);
      const filters = txnFilters();

      const result = await getClientTransactions(
        currentPage,
        pageSize,
        filters,
      );
      if (seq !== txnSeq.current) return;
      if (result.success && result.data) {
        setTransactions(result.data.items);
        setTotalCount(result.data.totalCount);
        setTotalPages(Math.ceil(result.data.totalCount / pageSize));
      }
    } catch (err) {
      if (seq !== txnSeq.current) return;
      console.error("Failed to fetch transactions", err);
      toast.error("Failed to fetch transactions");
    } finally {
      if (seq === txnSeq.current) setLoadingTransactions(false);
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
  const handleDownloadStatement = async () => {
    if (!profile) {
      toast.error("Profile data not loaded");
      return;
    }

    try {
      // The PDF library is loaded on first download, not with the dashboard (it's most of the page's weight).
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Get company info
      const auth = getStoredAuth();
      // The bureau's name from the profile: a client's stored sign-in holds the CLIENT's name there.
      const companyName = profile.companyName || "Account statement";

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
      const rows = await allMatchingTransactions();
      if (rows.length > 0) {
        yPos += 32;
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("TRANSACTION HISTORY", 14, yPos);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(9);
        doc.text(`${rows.length} transactions`, pageWidth - 14, yPos, {
          align: "right",
        });

        const txnTableData = rows.map((txn) => {
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
            3: { cellWidth: 16, halign: "center" }, // "Type" used to wrap as "Typ / e"
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

  return {
    activeView,
    setActiveView,
    mobileMenuOpen,
    setMobileMenuOpen,
    dashboard,
    setDashboard,
    profile,
    setProfile,
    quickStats,
    setQuickStats,
    transactions,
    setTransactions,
    recentTransactions,
    setRecentTransactions,
    alerts,
    setAlerts,
    analytics,
    setAnalytics,
    loading,
    setLoading,
    loadingTransactions,
    setLoadingTransactions,
    loadingAlerts,
    setLoadingAlerts,
    loadingAnalytics,
    setLoadingAnalytics,
    analyticsCurrency,
    setAnalyticsCurrency,
    error,
    setError,
    currentPage,
    setCurrentPage,
    totalPages,
    setTotalPages,
    totalCount,
    setTotalCount,
    pageSize,
    currencyFilter,
    setCurrencyFilter,
    typeFilter,
    setTypeFilter,
    searchQuery,
    setSearchQuery,
    filterPeriod,
    setFilterPeriod,
    alertPage,
    setAlertPage,
    alertTotalPages,
    setAlertTotalPages,
    unreadOnly,
    setUnreadOnly,
    selectedTransaction,
    setSelectedTransaction,
    selectedAlert,
    setSelectedAlert,
    showPasswordModal,
    setShowPasswordModal,
    passwordForm,
    setPasswordForm,
    passwordLoading,
    setPasswordLoading,
    menuItems,
    fetchDashboard,
    fetchTransactions,
    fetchAlerts,
    fetchAnalytics,
    handleRefresh,
    handleMarkAlertRead,
    handleMarkAllAlertsRead,
    handleDownloadReceipt,
    handleExportCsv,
    handleDownloadStatement,
    allMatchingTransactions,
  };
}
