"use client";

import { escapeHtml, printHtml } from "@/lib/print";
import { useAllowedCurrencies } from "@/lib/useBaseCurrency";
import { StatementModal } from "./StatementModal";
import { useState, useEffect, useCallback } from "react";
import {
  Wallet,
  DollarSign,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  X,
  Building2,
  FileText,
  Download,
  Printer,
  Eye,
  Filter,
  Activity,
  Loader2,
  RefreshCw,
  Plus,
  Edit3,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Banknote,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  getCashAccounts,
  getCashAccountStatement,
  getCashStats,
  createCashAccount,
  updateCashAccount,
  deleteCashAccount,
  CashAccountResponseDto,
  CreateCashAccountDto,
  UpdateCashAccountDto,
  Currency,
  getAccountTypeLabel,
  getStoredAuth,
  currencyCode,
  formatMoney,
  CURRENCY_META,
} from "@/lib/api";
import { CurrencyTotals, rowsFromStats } from "./CurrencyTotals";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { localDate } from "@/lib/dates";

// Transaction interface to match backend StatementLineDto
interface Transaction {
  id: string;
  code: string;
  date: string;
  reference: string;
  description: string;
  transactionType: number;
  thisAccountAction: string;
  debit: number | null;
  credit: number | null;
  amount: number;
  currency: number;
  balanceBefore: number;
  balanceAfter: number;
  exchangeRate?: number;
  counterAmount?: number;
  counterCurrency?: number;
  notes?: string;
  reconciliationStatus: number;
  relatedAccount?: {
    accountId: string;
    accountType: number;
    accountName: string;
    accountCode: string;
    currency: number;
    action: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    clientCode?: string;
    clientPhone?: string;
  };
}

// CashStats interface to match backend CashStatsDto
interface CashStats {
  balanceKES: number;
  openingBalanceKES: number;
  totalDebitKES: number;
  totalCreditKES: number;
  netMovementKES: number;
  balanceUSD: number;
  openingBalanceUSD: number;
  totalDebitUSD: number;
  totalCreditUSD: number;
  netMovementUSD: number;
  /** Every cash currency (KES, USD, UGX, EUR) — from the API when available */
  byCurrency?: any[] | null;
}

// CashAccount interface to match backend CashAccountResponseDto
interface CashAccount {
  id: string;
  currency: number;
  balance: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  createdAt: string;
}

// Modal types
type ModalType = "add" | "edit" | "delete" | "view" | null;


/** Money in for the OTHER account? A client (liability) gains on Credit; a till on Debit. */
const relatedIn = (r: { action?: string; accountType?: number }) =>
  r.accountType === 3 ? r.action === "Credit" : r.action === "Debit";

export function CashAtHand() {
  // Kenyan bureaus don't use UGX; Ugandan ones use KES too (lib/useBaseCurrency).
  const { has: currencyOk } = useAllowedCurrencies();
  const [statementCurrency, setStatementCurrency] = useState<number | null>(null);
  // Data states
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [stats, setStats] = useState<CashStats>({
    balanceKES: 0,
    openingBalanceKES: 0,
    totalDebitKES: 0,
    totalCreditKES: 0,
    netMovementKES: 0,
    balanceUSD: 0,
    openingBalanceUSD: 0,
    totalDebitUSD: 0,
    totalCreditUSD: 0,
    netMovementUSD: 0,
  });
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // UI states
  const [searchTerm, setSearchTerm] = useState("");
  const [transactionsCurrentPage, setTransactionsCurrentPage] = useState(1);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);

  // Modal states
  const [modalType, setModalType] = useState<ModalType>(null);
  const [selectedAccount, setSelectedAccount] = useState<CashAccount | null>(
    null,
  );

  // Form states
  const [formData, setFormData] = useState({
    currency: 0 as Currency,
    openingBalance: 0,
  });

  // Filters
  const [dateFilter, setDateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");

  // Map backend DTO to frontend CashAccount interface
  const mapDtoToAccount = (dto: any): CashAccount => {
    return {
      id: dto.id,
      currency: dto.currency,
      balance: dto.balance,
      openingBalance: dto.openingBalance,
      totalDebit: dto.totalDebit || 0,
      totalCredit: dto.totalCredit || 0,
      netMovement: dto.netMovement || 0,
      createdAt: dto.createdAt || new Date().toISOString(),
    };
  };

  // Map backend transaction to frontend Transaction interface
  const mapTransactionToDisplay = (txn: any, currency: number): Transaction => {
    return {
      id: txn.transactionId || txn.id || "",
      code: txn.transactionCode || txn.code || "",
      date: txn.date || txn.transactionDate || txn.createdAt || "",
      reference: txn.reference || txn.transactionCode || "",
      description: txn.description || "",
      transactionType: txn.transactionType ?? 0,
      thisAccountAction: txn.thisAccountAction || "",
      debit: txn.debit ?? null,
      credit: txn.credit ?? null,
      amount: txn.amount ?? 0,
      currency: txn.currency ?? currency,
      balanceBefore: txn.balanceBefore ?? 0,
      balanceAfter: txn.balanceAfter ?? 0,
      exchangeRate: txn.exchangeRate,
      counterAmount: txn.counterAmount,
      counterCurrency: txn.counterCurrency,
      notes: txn.notes,
      reconciliationStatus: txn.reconciliationStatus ?? 0,
      relatedAccount: txn.relatedAccount
        ? {
            accountId: txn.relatedAccount.accountId || "",
            accountType: txn.relatedAccount.accountType ?? 0,
            accountName: txn.relatedAccount.accountName || "Unknown Account",
            accountCode: txn.relatedAccount.accountCode || "",
            currency: txn.relatedAccount.currency ?? 0,
            action: txn.relatedAccount.action || "",
            amount: txn.relatedAccount.amount ?? 0,
            balanceBefore: txn.relatedAccount.balanceBefore ?? 0,
            balanceAfter: txn.relatedAccount.balanceAfter ?? 0,
            clientCode: txn.relatedAccount.clientCode,
            clientPhone: txn.relatedAccount.clientPhone,
          }
        : undefined,
    };
  };

  // Fetch cash accounts
  const fetchCashAccounts = useCallback(async () => {
    try {
      const response = await getCashAccounts();
      if (response.success && response.data) {
        const mappedAccounts = response.data.map(mapDtoToAccount);
        setCashAccounts(mappedAccounts);
      }
    } catch (error) {
      console.error("Error fetching cash accounts:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, []);

  // Fetch cash stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await getCashStats();
      if (response.success && response.data) {
        setStats({
          balanceKES: response.data.balanceKES || 0,
          openingBalanceKES: response.data.openingBalanceKES || 0,
          totalDebitKES: response.data.totalDebitKES || 0,
          totalCreditKES: response.data.totalCreditKES || 0,
          netMovementKES: response.data.netMovementKES || 0,
          balanceUSD: response.data.balanceUSD || 0,
          openingBalanceUSD: response.data.openingBalanceUSD || 0,
          totalDebitUSD: response.data.totalDebitUSD || 0,
          totalCreditUSD: response.data.totalCreditUSD || 0,
          netMovementUSD: response.data.netMovementUSD || 0,
          byCurrency: response.data.byCurrency ?? null,
        });
      }
    } catch (error) {
      console.error("Error fetching cash stats:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, []);

  // Fetch transactions for both currencies
  const fetchTransactions = useCallback(async () => {
    setIsLoadingTransactions(true);
    try {
      // One statement per cash till the bureau actually has (it used to ask for all
      // four currencies and got "Cash account not found" for each missing one).
      const acc = await getCashAccounts().catch(() => null);
      const rows: any[] = acc?.success ? (Array.isArray(acc.data) ? acc.data : (acc.data as any)?.items || []) : [];
      const currencies: number[] = rows.length
        ? Array.from(new Set(rows.map((a: any) => Number(a.currency))))
        : acc?.success ? [] : [0, 1, 2, 3];
      const responses = await Promise.all(
        currencies.map((c) => getCashAccountStatement(c).catch(() => null)),
      );

      const transactions: Transaction[] = [];
      responses.forEach((res, i) => {
        if (res?.success && res.data?.transactions) {
          transactions.push(
            ...res.data.transactions.map((txn: any) =>
              mapTransactionToDisplay(txn, currencies[i]),
            ),
          );
        }
      });

      transactions.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      setAllTransactions(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast.error("Failed to fetch transactions");
    } finally {
      setIsLoadingTransactions(false);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchCashAccounts(),
        fetchStats(),
        fetchTransactions(),
      ]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchCashAccounts, fetchStats, fetchTransactions]);

  // Refresh all data
  const handleRefresh = async () => {
    setIsLoading(true);
    await Promise.all([fetchCashAccounts(), fetchStats(), fetchTransactions()]);
    setIsLoading(false);
    toast.success("Data refreshed!");
  };

  // Get currency label helper
  const getCurrencySymbol = (currency: number): string => {
    return currency === 0 ? "KES" : currency === 2 ? "UGX" : currency === 3 ? "EUR" : "$";
  };

  const getCurrencyName = (currency: number): string => {
    return currency === 0 ? "KES" : currency === 2 ? "UGX" : currency === 3 ? "EUR" : "USD";
  };

  // One cash account per currency. All four currencies can be added.
  const CASH_CURRENCIES = [
    { value: 0, code: "KES", name: "Kenyan Shilling" },
    { value: 1, code: "USD", name: "US Dollar" },
    { value: 2, code: "UGX", name: "Ugandan Shilling" },
    { value: 3, code: "EUR", name: "Euro" },
  ];
  const existingCurrencies = new Set(cashAccounts.map((a) => a.currency as number));
  const missingCurrencies = CASH_CURRENCIES.filter((c) => !existingCurrencies.has(c.value) && currencyOk(c.value));
  const allCurrenciesAdded = missingCurrencies.length === 0;

  // Modal handlers
  const openAddModal = () => {
    setFormData({
      currency: (missingCurrencies[0]?.value ?? 0) as import("@/lib/api").Currency, // first currency without an account
      openingBalance: 0,
    });
    setSelectedAccount(null);
    setModalType("add");
  };

  const openEditModal = (account: CashAccount) => {
    setSelectedAccount(account);
    setFormData({
      currency: account.currency as import("@/lib/api").Currency,
      openingBalance: account.openingBalance,
    });
    setModalType("edit");
  };

  const openDeleteModal = (account: CashAccount) => {
    setSelectedAccount(account);
    setModalType("delete");
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedAccount(null);
    setFormData({ currency: 0, openingBalance: 0 });
  };

  // Form handlers
  const handleCreateAccount = async () => {
    if (formData.openingBalance < 0) {
      toast.error("Opening balance cannot be negative");
      return;
    }

    setIsSubmitting(true);
    try {
      const dto: CreateCashAccountDto = {
        currency: formData.currency,
        openingBalance: formData.openingBalance,
      };

      const response = await createCashAccount(dto);
      if (response.success) {
        toast.success(
          `Cash account for ${getCurrencyName(
            formData.currency,
          )} created successfully!`,
        );
        closeModal();
        await Promise.all([fetchCashAccounts(), fetchStats()]);
      } else {
        toast.error(response.message || "Failed to create cash account");
      }
    } catch (error) {
      console.error("Error creating cash account:", error);
      toast.error("Failed to create cash account");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateAccount = async () => {
    if (!selectedAccount) return;

    if (formData.openingBalance < 0) {
      toast.error("Opening balance cannot be negative");
      return;
    }

    setIsSubmitting(true);
    try {
      const dto: UpdateCashAccountDto = {
        openingBalance: formData.openingBalance,
      };

      const response = await updateCashAccount(selectedAccount.id, dto);
      if (response.success) {
        toast.success("Cash account updated successfully!");
        closeModal();
        await Promise.all([
          fetchCashAccounts(),
          fetchStats(),
          fetchTransactions(),
        ]);
      } else {
        toast.error(response.message || "Failed to update cash account");
      }
    } catch (error) {
      console.error("Error updating cash account:", error);
      toast.error("Failed to update cash account");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!selectedAccount) return;

    setIsSubmitting(true);
    try {
      const response = await deleteCashAccount(selectedAccount.id);
      if (response.success) {
        toast.success("Cash account deleted successfully!");
        closeModal();
        await Promise.all([
          fetchCashAccounts(),
          fetchStats(),
          fetchTransactions(),
        ]);
      } else {
        toast.error(response.message || "Failed to delete cash account");
      }
    } catch (error) {
      console.error("Error deleting cash account:", error);
      toast.error("Failed to delete cash account");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Apply filters
  const filteredTransactions = allTransactions.filter((txn) => {
    const matchesSearch =
      txn.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.code.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType =
      typeFilter === "all" ||
      (typeFilter === "debit" && txn.thisAccountAction === "Debit") ||
      (typeFilter === "credit" && txn.thisAccountAction === "Credit");

    const matchesCurrency =
      currencyFilter === "all" ||
      currencyCode(txn.currency) === currencyFilter;

    let matchesDate = true;
    if (dateFilter !== "all") {
      const txnDate = new Date(txn.date);
      const today = new Date();
      if (dateFilter === "today") {
        matchesDate = txnDate.toDateString() === today.toDateString();
      } else if (dateFilter === "week") {
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        matchesDate = txnDate >= weekAgo;
      } else if (dateFilter === "month") {
        matchesDate =
          txnDate.getMonth() === today.getMonth() &&
          txnDate.getFullYear() === today.getFullYear();
      }
    }

    return matchesSearch && matchesType && matchesCurrency && matchesDate;
  });

  // Pagination
  const transactionsPerPage = 15;
  const indexOfLastTransaction = transactionsCurrentPage * transactionsPerPage;
  const indexOfFirstTransaction = indexOfLastTransaction - transactionsPerPage;
  const currentTransactions = filteredTransactions.slice(
    indexOfFirstTransaction,
    indexOfLastTransaction,
  );
  const totalTransactionPages = Math.ceil(
    filteredTransactions.length / transactionsPerPage,
  );

  const handleExport = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Get company info from auth
      const auth = getStoredAuth();
      const companyName = auth?.user?.companyName || "Money Exchange";
      const companyPhone = auth?.user?.whatsAppNumber || "";

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
      doc.text("Cash at Hand Report", 44, 26);

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.text("Report Date", pageWidth - 14, 14, { align: "right" });
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

      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(14, 42, pageWidth - 14, 42);

      // ========== CASH BALANCES ==========
      let yPos = 50;
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("CASH PORTFOLIO", 14, yPos);

      yPos += 6;
      const cardWidth = (pageWidth - 32) / 2;

      // One card per currency held (KES, USD, UGX, EUR), two per row
      const summaryRows = rowsFromStats(stats);
      summaryRows.forEach((r, i) => {
        const x = i % 2 === 0 ? 14 : 18 + cardWidth;
        if (i > 0 && i % 2 === 0) yPos += 32;
        const code = currencyCode(r.currency);
        doc.setDrawColor(229, 231, 235);
        doc.rect(x, yPos, cardWidth, 28, "S");
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.setFont("helvetica", "normal");
        doc.text(`${CURRENCY_META[r.currency]?.label ?? code} (${code})`, x + 4, yPos + 8);
        const positive = r.balance >= 0;
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(positive ? 22 : 185, positive ? 163 : 28, positive ? 74 : 28);
        doc.text(`${positive ? "" : "-"}${formatMoney(Math.abs(r.balance), r.currency)}`, x + 4, yPos + 18);
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.text(`In: ${r.moneyIn.toLocaleString()} | Out: ${r.moneyOut.toLocaleString()}`, x + 4, yPos + 24);
      });

      // ========== TRANSACTION HISTORY ==========
      if (filteredTransactions.length > 0) {
        yPos += 38;
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("TRANSACTION HISTORY", 14, yPos);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(9);
        doc.text(
          `${filteredTransactions.length} transactions`,
          pageWidth - 14,
          yPos,
          { align: "right" },
        );

        const txnTableData = filteredTransactions.map((txn) => {
          const isCredit = txn.thisAccountAction === "Credit";
          const currencyLabel = getCurrencyName(txn.currency);
          return [
            new Date(txn.date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "2-digit",
            }),
            txn.reference || txn.code,
            txn.description.substring(0, 28) +
              (txn.description.length > 28 ? "..." : ""),
            isCredit ? "CR" : "DR",
            currencyLabel,
            txn.amount.toLocaleString(),
            `${txn.balanceAfter >= 0 ? "" : "-"}${Math.abs(
              txn.balanceAfter,
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
            2: { cellWidth: 46 },
            3: { cellWidth: 12, halign: "center" },
            4: { cellWidth: 14, halign: "center" },
            5: { cellWidth: 26, halign: "right" },
            6: { cellWidth: 28, halign: "right" },
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          margin: { left: 14, right: 14 },
          didParseCell: (data: any) => {
            if (data.section === "body" && data.column.index === 3) {
              // Asset account: DR = money IN (green), CR = money OUT (red)
              data.cell.styles.textColor =
                data.cell.raw === "DR" ? [22, 163, 74] : [220, 38, 38];
              data.cell.styles.fontStyle = "bold";
            }
            if (data.section === "body" && data.column.index === 6) {
              const isNegative = (data.cell.raw as string).startsWith("-");
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
              "Computer-generated report",
              pageWidth - 14,
              pageHeight - 12,
              { align: "right" },
            );
          },
        });
      }

      const fileName = `${companyName.replace(/\s+/g, "_")}_Cash_Report_${
        localDate()
      }.pdf`;
      doc.save(fileName);
      toast.success("Cash report exported successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };

  const handlePrint = () => {
    const auth = getStoredAuth();
    const companyName = auth?.user?.companyName || "Money Exchange";

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cash at Hand Report - ${escapeHtml(companyName)}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #111827; font-size: 12px; }
          .header { border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 20px; }
          .company-name { font-size: 24px; font-weight: bold; }
          .doc-title { color: #6b7280; font-size: 14px; margin-top: 4px; }
          .summary-row { display: flex; gap: 20px; margin-bottom: 20px; }
          .summary-card { flex: 1; border: 1px solid #e5e7eb; padding: 16px; }
          .summary-card label { color: #6b7280; font-size: 10px; display: block; margin-bottom: 8px; }
          .summary-card .value { font-size: 20px; font-weight: bold; }
          .positive { color: #16a34a; }
          .negative { color: #dc2626; }
          .meta { color: #6b7280; font-size: 10px; margin-top: 8px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f9fafb; color: #4b5563; font-weight: 600; text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e7eb; }
          td { padding: 10px 8px; border-bottom: 1px solid #f3f4f6; }
          tr:nth-child(even) { background: #f9fafb; }
          .cr { color: #dc2626; font-weight: 600; }
          .dr { color: #16a34a; font-weight: 600; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">${escapeHtml(companyName)}</div>
          <div class="doc-title">Cash at Hand Report • ${escapeHtml(new Date().toLocaleDateString(
            "en-GB",
            { day: "2-digit", month: "long", year: "numeric" },
          ))}</div>
        </div>

        <div class="summary-row">
          ${rowsFromStats(stats)
            .map(
              (r) => `<div class="summary-card">
            <label>${escapeHtml(CURRENCY_META[r.currency]?.label ?? currencyCode(r.currency))} (${escapeHtml(currencyCode(r.currency))})</label>
            <div class="value ${escapeHtml(r.balance >= 0 ? "positive" : "negative")}">${escapeHtml(r.balance >= 0 ? "" : "-")}${escapeHtml(formatMoney(Math.abs(r.balance), r.currency))}</div>
            <div class="meta">In: ${escapeHtml(r.moneyIn.toLocaleString())} | Out: ${escapeHtml(r.moneyOut.toLocaleString())}</div>
          </div>`,
            )
            .join("")}
        </div>

        <h3 style="margin-bottom: 10px;">Transaction History (${escapeHtml(
          filteredTransactions.length
        )})</h3>
        <table>
          <thead><tr><th>Date</th><th>Reference</th><th>Description</th><th class="text-center">Type</th><th class="text-center">Curr</th><th class="text-right">Amount</th><th class="text-right">Balance</th></tr></thead>
          <tbody>
            ${filteredTransactions
              .map(
                (txn) => `
              <tr>
                <td>${escapeHtml(new Date(txn.date).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "2-digit",
                }))}</td>
                <td>${escapeHtml(txn.reference || txn.code)}</td>
                <td>${escapeHtml(txn.description.substring(0, 35))}${escapeHtml(
                  txn.description.length > 35 ? "..." : ""
                )}</td>
                <td class="text-center ${escapeHtml(
                  txn.thisAccountAction === "Credit" ? "cr" : "dr"
                )}">${escapeHtml(txn.thisAccountAction === "Credit" ? "CR" : "DR")}</td>
                <td class="text-center">${escapeHtml(
                  getCurrencyName(txn.currency)
                )}</td>
                <td class="text-right">${escapeHtml(txn.amount.toLocaleString())}</td>
                <td class="text-right ${escapeHtml(
                  txn.balanceAfter >= 0 ? "positive" : "negative"
                )}">${escapeHtml(txn.balanceAfter >= 0 ? "" : "-")}${escapeHtml(Math.abs(
                  txn.balanceAfter,
                ).toLocaleString())}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>

        <div class="footer">
          <p>This is a computer-generated report. ${escapeHtml(companyName)} • ${escapeHtml(new Date().toLocaleString())}</p>
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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading cash accounts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="min-w-0 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Cash at hand
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Physical cash available in the office • Main Office
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={openAddModal}
              disabled={allCurrenciesAdded}
              title={allCurrenciesAdded ? "Every currency already has a cash account" : undefined}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add account
            </button>
            <button
              onClick={handleRefresh}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={handleExport}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          </div>
        </motion.div>

        {/* Cash Account Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {statementCurrency !== null && (
            <StatementModal
              kind="cash"
              cashCurrency={statementCurrency}
              currency={statementCurrency}
              title={`Cash ${currencyCode(statementCurrency)}`}
              subtitle={`CASH-${currencyCode(statementCurrency)} · Physical cash in the office`}
              onClose={() => setStatementCurrency(null)}
            />
          )}
          {cashAccounts.map((account, index) => (
            <motion.div
              key={account.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`rounded-xl bg-white border   transition-all duration-300 ${
                account.currency === 0
                  ? "border-emerald-200 hover:border-emerald-400"
                  : "border-blue-200 hover:border-blue-400"
              }`}
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 flex items-center justify-center border rounded-lg ${
                        account.currency === 0
                          ? "bg-emerald-100 border-emerald-200"
                          : "bg-blue-100 border-blue-200"
                      }`}
                    >
                      <Banknote
                        className={`w-6 h-6 ${
                          account.currency === 0
                            ? "text-emerald-700"
                            : "text-blue-600"
                        }`}
                      />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        Cash {getCurrencyName(account.currency)}
                      </h3>
                      <p className="text-xs text-slate-500">
                        CASH-{getCurrencyName(account.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStatementCurrency(account.currency as number)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      title="Statement"
                    >
                      <FileText className="h-3.5 w-3.5" /> Statement
                    </button>
                    <button
                      onClick={() => openEditModal(account)}
                      className="rounded-lg p-2 bg-slate-100 hover:bg-slate-200 transition-colors"
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4 text-slate-600" />
                    </button>
                    <button
                      onClick={() => openDeleteModal(account)}
                      className="rounded-lg p-2 bg-red-50 hover:bg-red-100 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>

                {/* Balance */}
                <div
                  className={`p-4 mb-4 border-l-4 ${
                    account.currency === 0
                      ? "bg-emerald-50 border-emerald-500"
                      : "bg-blue-50 border-blue-500"
                  }`}
                >
                  <p className="text-xs text-slate-600 font-semibold mb-1">
                    Current Balance
                  </p>
                  <p
                    className={`text-2xl font-semibold tracking-tight ${
                      account.currency === 0
                        ? "text-emerald-600"
                        : "text-blue-600"
                    }`}
                  >
                    {getCurrencySymbol(account.currency)}{" "}
                    {account.balance.toLocaleString()}
                  </p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-3 border border-slate-200 rounded-lg">
                    <p className="text-xs text-slate-500 font-semibold">
                      Opening Balance
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      {getCurrencySymbol(account.currency)}{" "}
                      {account.openingBalance.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 border border-slate-200 rounded-lg">
                    <p className="text-xs text-slate-500 font-semibold">
                      Net Movement
                    </p>
                    <p
                      className={`text-sm font-semibold ${
                        account.netMovement >= 0
                          ? "text-emerald-700"
                          : "text-red-600"
                      }`}
                    >
                      {account.netMovement >= 0 ? "+" : ""}
                      {getCurrencySymbol(account.currency)}{" "}
                      {account.netMovement.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-emerald-50 p-3 border border-emerald-200 rounded-lg">
                    <p className="text-xs text-emerald-700 font-semibold">
                      Total Debit (In)
                    </p>
                    <p className="text-sm font-semibold text-emerald-700">
                      +{getCurrencySymbol(account.currency)}{" "}
                      {account.totalDebit.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-red-50 p-3 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-700 font-semibold">
                      Total Credit (Out)
                    </p>
                    <p className="text-sm font-semibold text-red-700">
                      -{getCurrencySymbol(account.currency)}{" "}
                      {account.totalCredit.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Created: {new Date(account.createdAt).toLocaleDateString()}
                  </span>
                  <span
                    className={`px-2 py-1 font-semibold ${
                      account.currency === 0
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {getCurrencyName(account.currency)}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}

          {/* Empty State - Show when no accounts exist */}
          {cashAccounts.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl col-span-full bg-white border border-dashed border-slate-300 p-12 text-center"
            >
              <Wallet className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-700 mb-2">
                No Cash Accounts
              </h3>
              <p className="text-slate-500 mb-6">
                Create your first cash account to start tracking physical cash.
              </p>
              <button
                onClick={openAddModal}
                className="rounded-lg inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all"
              >
                <Plus className="w-5 h-5" />
                Add Cash Account
              </button>
            </motion.div>
          )}

          {/* Prompt to add missing currency */}
          {cashAccounts.length > 0 && !allCurrenciesAdded && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className=" bg-slate-50 border border-dashed border-slate-300 p-8 flex flex-col items-center justify-center rounded-xl"
            >
              <div className="w-16 h-16 bg-slate-200 flex items-center justify-center mb-4">
                <Plus className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 mb-2">
                Add another currency
              </h3>
              <p className="text-sm text-slate-500 mb-4 text-center">
                Not yet added: {missingCurrencies.map((c) => c.code).join(", ")}
              </p>
              <button
                onClick={openAddModal}
                className="rounded-lg inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add account
              </button>
            </motion.div>
          )}
        </div>

        {/* Per-currency summary (KES, USD, UGX, EUR) */}
        <CurrencyTotals rows={rowsFromStats(stats)} />

        {/* Filters and Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl bg-white  border border-slate-200  p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <Filter className="w-5 h-5 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-700 ">
              Transaction Filters
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1">
              <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 border border-slate-200 rounded-lg">
                <Search className="w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e: any) => setSearchTerm(e.target.value)}
                  className="rounded-lg flex-1 outline-none text-slate-700 placeholder:text-slate-500 bg-transparent"
                />
              </div>
            </div>

            <div>
              <select
                value={dateFilter}
                onChange={(e: any) => setDateFilter(e.target.value)}
                className="rounded-lg w-full px-4 py-3 border border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>
            </div>

            <div>
              <select
                value={typeFilter}
                onChange={(e: any) => setTypeFilter(e.target.value)}
                className="rounded-lg w-full px-4 py-3 border border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="debit">Debit (In)</option>
                <option value="credit">Credit (Out)</option>
              </select>
            </div>

            <div>
              <select
                value={currencyFilter}
                onChange={(e: any) => setCurrencyFilter(e.target.value)}
                className="rounded-lg w-full px-4 py-3 border border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All currencies</option>
                {cashAccounts.map((a) => (
                  <option key={a.currency} value={currencyCode(a.currency)}>
                    {currencyCode(a.currency)} only
                  </option>
                ))}
              </select>
            </div>
          </div>
        </motion.div>

        {/* Transactions Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-xl bg-white  border border-slate-200  overflow-hidden"
        >
          {isLoadingTransactions ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
              <span className="text-slate-600">Loading transactions...</span>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto max-w-full">
                <table className="w-full">
                  <thead className="bg-[#E9EEF6]">
                    <tr>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Date
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Reference
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Description
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Action
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Debit (In)
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Credit (Out)
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Balance
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Related Account
                      </th>
                      <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {currentTransactions.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-8 text-center text-slate-500"
                        >
                          No transactions found.
                        </td>
                      </tr>
                    ) : (
                      currentTransactions.map((txn, index) => (
                        <motion.tr
                          key={txn.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.02 }}
                          className="hover:bg-blue-50/50 transition-colors"
                        >
                          <td className="px-4 py-4 text-sm text-slate-600 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-500" />
                              {new Date(txn.date).toLocaleString()}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-slate-500" />
                              <span className="text-sm font-semibold text-slate-700">
                                {txn.reference || txn.code}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-900 font-semibold max-w-sm">
                            {txn.description}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1 border-l-4 text-xs font-semibold ${
                                txn.thisAccountAction === "Debit"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-500"
                                  : "bg-red-50 text-red-700 border-red-500"
                              }`}
                            >
                              {/* Down = money in, up = money out (same as the statement and the app) */}
                              {txn.thisAccountAction === "Debit" ? (
                                <ArrowDownCircle className="w-3.5 h-3.5" />
                              ) : (
                                <ArrowUpCircle className="w-3.5 h-3.5" />
                              )}
                              {txn.thisAccountAction}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right">
                            {txn.debit !== null ? (
                              <span className="text-base font-semibold text-emerald-700">
                                +{getCurrencySymbol(txn.currency)}{" "}
                                {txn.debit.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right">
                            {txn.credit !== null ? (
                              <span className="text-base font-semibold text-red-600">
                                -{getCurrencySymbol(txn.currency)}{" "}
                                {txn.credit.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-base font-semibold text-slate-900 whitespace-nowrap text-right">
                            {getCurrencySymbol(txn.currency)}{" "}
                            {txn.balanceAfter.toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                            {txn.relatedAccount && (
                              <div className="text-xs">
                                <div className="font-semibold text-slate-900">
                                  {txn.relatedAccount.accountName}
                                </div>
                                <div className="text-slate-600">
                                  {getAccountTypeLabel(
                                    txn.relatedAccount
                                      .accountType as import("@/lib/api").AccountType,
                                  )}{" "}
                                  • {txn.relatedAccount.action}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center">
                            <button
                              onClick={() => setSelectedTransaction(txn)}
                              className="rounded-lg inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-all font-semibold text-sm"
                            >
                              <Eye className="w-4 h-4" />
                              View
                            </button>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalTransactionPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
                  <div className="text-sm text-slate-600">
                    Showing {indexOfFirstTransaction + 1} to{" "}
                    {Math.min(
                      indexOfLastTransaction,
                      filteredTransactions.length,
                    )}{" "}
                    of {filteredTransactions.length} transactions
                  </div>
                  <div className="flex gap-2">
                    <button aria-label="Previous"
                      onClick={() =>
                        setTransactionsCurrentPage((prev) =>
                          Math.max(1, prev - 1),
                        )
                      }
                      disabled={transactionsCurrentPage === 1}
                      className="rounded-lg p-2 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-600" />
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from(
                        { length: Math.min(5, totalTransactionPages) },
                        (_, i) => {
                          let pageNum;
                          if (totalTransactionPages <= 5) {
                            pageNum = i + 1;
                          } else if (transactionsCurrentPage <= 3) {
                            pageNum = i + 1;
                          } else if (
                            transactionsCurrentPage >=
                            totalTransactionPages - 2
                          ) {
                            pageNum = totalTransactionPages - 4 + i;
                          } else {
                            pageNum = transactionsCurrentPage - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              onClick={() =>
                                setTransactionsCurrentPage(pageNum)
                              }
                              className={`rounded-lg px-4 py-2 border transition-all font-semibold text-sm ${
                                transactionsCurrentPage === pageNum
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        },
                      )}
                    </div>
                    <button aria-label="Next"
                      onClick={() =>
                        setTransactionsCurrentPage((prev) =>
                          Math.min(totalTransactionPages, prev + 1),
                        )
                      }
                      disabled={
                        transactionsCurrentPage === totalTransactionPages
                      }
                      className="rounded-lg p-2 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>

      {/* ==================== MODALS ==================== */}

      {/* Add Cash Account Modal */}
      <AnimatePresence>
        {modalType === "add" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white w-full max-w-md shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className=" bg-[#0F172A]  p-4 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20  flex items-center justify-center">
                      <Plus className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Add Cash Account</h3>
                      <p className="text-xs opacity-80">
                        Create a new cash drawer
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={closeModal}
                    className="rounded-lg p-2 hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                {/* Currency Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Currency *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {CASH_CURRENCIES.map((c) => {
                      const exists = existingCurrencies.has(c.value);
                      const selected = formData.currency === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              currency: c.value as import("@/lib/api").Currency,
                            })
                          }
                          disabled={exists}
                          className={`rounded-lg border p-3 text-left transition-colors ${
                            selected ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                          } ${exists ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <p className={`text-sm font-semibold ${selected ? "text-blue-700" : "text-slate-800"}`}>{c.code}</p>
                          <p className="text-xs text-slate-600">{exists ? "Already added" : c.name}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Opening Balance */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Opening Balance *
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">
                      {formData.currency === 0 ? "KES" : formData.currency === 2 ? "UGX" : formData.currency === 3 ? "EUR" : "$"}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.openingBalance}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          openingBalance: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="rounded-lg w-full pl-14 pr-4 py-3 border border-slate-200 focus:border-blue-500 focus:outline-none text-lg font-semibold"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Enter the starting cash amount in the drawer
                  </p>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                  <div className="flex gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <p className="font-semibold mb-1">What happens next?</p>
                      <p className="text-xs">
                        The cash account will be created with the opening
                        balance you specify. All transactions will be tracked
                        from this starting point.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-slate-200 bg-slate-50 p-4 flex gap-3">
                <button
                  onClick={closeModal}
                  className="rounded-lg flex-1 px-4 py-3 border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAccount}
                  disabled={
                    isSubmitting ||
                    existingCurrencies.has(formData.currency as number)
                  }
                  className="rounded-lg flex-1 px-4 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create Account
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Cash Account Modal */}
      <AnimatePresence>
        {modalType === "edit" && selectedAccount && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white w-full max-w-md shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div
                className={`p-4 text-white ${
                  selectedAccount.currency === 0
                    ? " bg-emerald-700 "
                    : " bg-blue-600 "
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20  flex items-center justify-center">
                      <Edit3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Edit Cash Account</h3>
                      <p className="text-xs">
                        Cash {getCurrencyName(selectedAccount.currency)}
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={closeModal}
                    className="rounded-lg p-2 hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                {/* Current Balance Display */}
                <div
                  className={`p-4 border-l-4 ${
                    selectedAccount.currency === 0
                      ? "bg-emerald-50 border-emerald-500"
                      : "bg-blue-50 border-blue-500"
                  }`}
                >
                  <p className="text-xs text-slate-600 font-semibold">
                    Current Balance
                  </p>
                  <p
                    className={`text-2xl font-semibold ${
                      selectedAccount.currency === 0
                        ? "text-emerald-600"
                        : "text-blue-600"
                    }`}
                  >
                    {getCurrencySymbol(selectedAccount.currency)}{" "}
                    {selectedAccount.balance.toLocaleString()}
                  </p>
                </div>

                {/* Opening Balance */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Opening Balance *
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">
                      {selectedAccount.currency === 0 ? "KES" : selectedAccount.currency === 2 ? "UGX" : selectedAccount.currency === 3 ? "EUR" : "$"}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.openingBalance}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          openingBalance: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="rounded-lg w-full pl-14 pr-4 py-3 border border-slate-200 focus:border-blue-500 focus:outline-none text-lg font-semibold"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Changing the opening balance will adjust the current balance
                    accordingly
                  </p>
                </div>

                {/* Balance Adjustment Preview */}
                {formData.openingBalance !== selectedAccount.openingBalance && (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                    <div className="flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-800">
                        <p className="font-semibold mb-1">
                          Balance Adjustment Preview
                        </p>
                        <div className="text-xs space-y-1">
                          <p>
                            Opening:{" "}
                            {getCurrencySymbol(selectedAccount.currency)}{" "}
                            {selectedAccount.openingBalance.toLocaleString()} →{" "}
                            {getCurrencySymbol(selectedAccount.currency)}{" "}
                            {formData.openingBalance.toLocaleString()}
                          </p>
                          <p className="font-semibold">
                            New Balance:{" "}
                            {getCurrencySymbol(selectedAccount.currency)}{" "}
                            {(
                              selectedAccount.balance +
                              (formData.openingBalance -
                                selectedAccount.openingBalance)
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-slate-200 bg-slate-50 p-4 flex gap-3">
                <button
                  onClick={closeModal}
                  className="rounded-lg flex-1 px-4 py-3 border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateAccount}
                  disabled={isSubmitting}
                  className="rounded-lg flex-1 px-4 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {modalType === "delete" && selectedAccount && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white w-full max-w-md shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className=" bg-red-600  p-4 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20  flex items-center justify-center">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Delete Cash Account</h3>
                      <p className="text-xs">
                        This action cannot be undone
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={closeModal}
                    className="rounded-lg p-2 hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                {/* Account Info */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className={`w-10 h-10 flex items-center justify-center ${
                        selectedAccount.currency === 0
                          ? "bg-emerald-100"
                          : "bg-blue-100"
                      }`}
                    >
                      <Banknote
                        className={`w-5 h-5 ${
                          selectedAccount.currency === 0
                            ? "text-emerald-700"
                            : "text-blue-600"
                        }`}
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">
                        Cash {getCurrencyName(selectedAccount.currency)}
                      </p>
                      <p className="text-xs text-slate-500">
                        CASH-{getCurrencyName(selectedAccount.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Current Balance</p>
                      <p className="font-semibold text-slate-900">
                        {getCurrencySymbol(selectedAccount.currency)}{" "}
                        {selectedAccount.balance.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Opening Balance</p>
                      <p className="font-semibold text-slate-900">
                        {getCurrencySymbol(selectedAccount.currency)}{" "}
                        {selectedAccount.openingBalance.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Warning */}
                <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-red-800">
                      <p className="font-semibold mb-1">Warning</p>
                      <p className="text-xs">
                        You can only delete a cash account if it has no
                        transactions. All existing transactions must be deleted
                        or reversed first.
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-slate-600 text-center">
                  Are you sure you want to delete this cash account?
                </p>
              </div>

              {/* Footer */}
              <div className="border-t border-slate-200 bg-slate-50 p-4 flex gap-3">
                <button
                  onClick={closeModal}
                  className="rounded-lg flex-1 px-4 py-3 border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isSubmitting}
                  className="rounded-lg flex-1 px-4 py-3 bg-red-600 text-white font-semibold hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete Account
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction Detail Modal */}
      <AnimatePresence>
        {selectedTransaction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-2 sm:p-4"
            onClick={() => setSelectedTransaction(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Card Header */}
              <div
                className={`p-3 sm:p-4 text-white flex-shrink-0 ${
                  selectedTransaction.thisAccountAction === "Debit"
                    ? " bg-[#0F172A] "
                    : " bg-[#0F172A] "
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20  flex items-center justify-center rounded-lg">
                      {selectedTransaction.thisAccountAction === "Debit" ? (
                        <ArrowDownCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <ArrowUpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-semibold">
                        Transaction Details
                      </h3>
                      <p className="text-xs sm:text-xs opacity-80">
                        {selectedTransaction.reference ||
                          selectedTransaction.code}
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setSelectedTransaction(null)}
                    className="p-1.5 hover:bg-white/20 transition-colors rounded-lg"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              </div>

              {/* Card Body - Scrollable */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
                {/* Transaction Amount */}
                <div
                  className={`p-3 border-l-4 rounded-r-lg ${
                    selectedTransaction.thisAccountAction === "Debit"
                      ? "bg-emerald-50 border-emerald-500"
                      : "bg-red-50 border-red-500"
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-600 ">
                    Amount
                  </p>
                  <p
                    className={`text-xl sm:text-2xl font-semibold ${
                      selectedTransaction.thisAccountAction === "Debit"
                        ? "text-emerald-700"
                        : "text-red-700"
                    }`}
                  >
                    {selectedTransaction.thisAccountAction === "Debit"
                      ? "+"
                      : "-"}
                    {getCurrencySymbol(selectedTransaction.currency)}{" "}
                    {selectedTransaction.amount.toLocaleString()}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs sm:text-xs text-slate-600">
                    <span>
                      Before: {getCurrencySymbol(selectedTransaction.currency)}{" "}
                      {selectedTransaction.balanceBefore.toLocaleString()}
                    </span>
                    <span>→</span>
                    <span className="font-semibold">
                      After: {getCurrencySymbol(selectedTransaction.currency)}{" "}
                      {selectedTransaction.balanceAfter.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Debit/Credit */}
                <div className="grid grid-cols-2 gap-2">
                  <div
                    className={`p-2 sm:p-3 border rounded-lg ${
                      selectedTransaction.debit !== null
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <p className="text-xs sm:text-xs font-semibold text-slate-500 ">
                      Debit (In)
                    </p>
                    <p
                      className={`text-sm sm:text-base font-semibold ${
                        selectedTransaction.debit !== null
                          ? "text-emerald-700"
                          : "text-slate-500"
                      }`}
                    >
                      {selectedTransaction.debit !== null
                        ? `+${getCurrencySymbol(
                            selectedTransaction.currency,
                          )} ${selectedTransaction.debit.toLocaleString()}`
                        : "-"}
                    </p>
                  </div>
                  <div
                    className={`p-2 sm:p-3 border rounded-lg ${
                      selectedTransaction.credit !== null
                        ? "bg-red-50 border-red-200"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <p className="text-xs sm:text-xs font-semibold text-slate-600 ">
                      Credit (Out)
                    </p>
                    <p
                      className={`text-sm sm:text-base font-semibold ${
                        selectedTransaction.credit !== null
                          ? "text-red-700"
                          : "text-slate-600"
                      }`}
                    >
                      {selectedTransaction.credit !== null
                        ? `-${getCurrencySymbol(
                            selectedTransaction.currency,
                          )} ${selectedTransaction.credit.toLocaleString()}`
                        : "-"}
                    </p>
                  </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 p-2 border border-slate-200 rounded-lg">
                    <p className="text-xs sm:text-xs font-semibold text-slate-500 ">
                      Code
                    </p>
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 font-mono truncate">
                      {selectedTransaction.code}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-2 border border-slate-200 rounded-lg">
                    <p className="text-xs sm:text-xs font-semibold text-slate-500 ">
                      Date
                    </p>
                    <p className="text-xs sm:text-sm font-semibold text-slate-900">
                      {new Date(selectedTransaction.date).toLocaleDateString()}
                    </p>
                  </div>
                  <div
                    className={`p-2 border rounded-lg ${
                      selectedTransaction.thisAccountAction === "Debit"
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-red-50 border-red-200"
                    }`}
                  >
                    <p className="text-xs sm:text-xs font-semibold text-slate-600 ">
                      Action
                    </p>
                    <p
                      className={`text-xs sm:text-sm font-semibold ${
                        selectedTransaction.thisAccountAction === "Debit"
                          ? "text-emerald-700"
                          : "text-red-700"
                      }`}
                    >
                      {selectedTransaction.thisAccountAction}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-2 border border-slate-200 rounded-lg">
                    <p className="text-xs sm:text-xs font-semibold text-slate-500 ">
                      Currency
                    </p>
                    <p className="text-xs sm:text-sm font-semibold text-slate-900">
                      {getCurrencyName(selectedTransaction.currency)}
                    </p>
                  </div>
                </div>

                {/* Description */}
                <div className="bg-blue-50 p-2 sm:p-3 border border-blue-200 rounded-lg">
                  <p className="text-xs sm:text-xs font-semibold text-blue-700 ">
                    Description
                  </p>
                  <p className="text-xs sm:text-sm font-semibold text-slate-900">
                    {selectedTransaction.description}
                  </p>
                </div>

                {/* Notes */}
                {selectedTransaction.notes && (
                  <div className="bg-amber-50 p-2 sm:p-3 border border-amber-200 rounded-lg">
                    <p className="text-xs sm:text-xs font-semibold text-amber-700 ">
                      Notes
                    </p>
                    <p className="text-xs sm:text-sm text-slate-900">
                      {selectedTransaction.notes}
                    </p>
                  </div>
                )}

                {/* Related Account */}
                {selectedTransaction.relatedAccount && (
                  <div className="bg-blue-50 border border-blue-200 p-2 sm:p-3 rounded-lg">
                    <p className="text-xs sm:text-xs font-semibold text-blue-700 mb-2">
                      Related Account
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-xs sm:text-xs">
                      <div className="bg-white p-1.5 sm:p-2 border border-blue-100 rounded">
                        <p className="text-slate-500">Type</p>
                        <p className="font-semibold text-slate-900 truncate">
                          {getAccountTypeLabel(
                            selectedTransaction.relatedAccount
                              .accountType as import("@/lib/api").AccountType,
                          )}
                        </p>
                      </div>
                      <div className="bg-white p-1.5 sm:p-2 border border-blue-100 rounded">
                        <p className="text-slate-500">Name</p>
                        <p className="font-semibold text-slate-900 truncate">
                          {selectedTransaction.relatedAccount.accountName}
                        </p>
                      </div>
                      <div
                        className={`p-1.5 sm:p-2 border rounded ${
                          relatedIn(selectedTransaction.relatedAccount)
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-red-50 border-red-200"
                        }`}
                      >
                        <p className="text-slate-600">Action</p>
                        <p
                          className={`font-semibold ${
                            relatedIn(selectedTransaction.relatedAccount)
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}
                        >
                          {selectedTransaction.relatedAccount.action}
                        </p>
                      </div>
                      <div className="bg-white p-1.5 sm:p-2 border border-blue-100 rounded">
                        <p className="text-slate-500">Amount</p>
                        <p className="font-semibold text-slate-900">
                          {getCurrencySymbol(
                            selectedTransaction.relatedAccount.currency,
                          )}{" "}
                          {selectedTransaction.relatedAccount.amount.toLocaleString()}
                        </p>
                      </div>
                      {selectedTransaction.relatedAccount.clientCode && (
                        <div className="bg-white p-1.5 sm:p-2 border border-blue-100 rounded col-span-2">
                          <p className="text-slate-500">Client</p>
                          <p className="font-semibold text-slate-900 font-mono">
                            {selectedTransaction.relatedAccount.clientCode}{" "}
                            {selectedTransaction.relatedAccount.clientPhone &&
                              `• ${selectedTransaction.relatedAccount.clientPhone}`}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="border-t border-slate-200 bg-slate-50 p-3 flex-shrink-0">
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="rounded-lg w-full px-6 py-2 bg-slate-700 text-white hover:bg-slate-800 transition-all font-semibold text-sm "
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
