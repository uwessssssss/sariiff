"use client";

import { escapeHtml, printHtml } from "@/lib/print";
import { useState, useEffect, useCallback } from "react";
import {
  Receipt,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Calendar,
  X,
  Download,
  Printer,
  Eye,
  Tag,
  DollarSign,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  Edit,
  Trash2,
  Loader2,
  RefreshCw,
  Building2,
  Smartphone,
  Banknote,
  AlertTriangle,
  CheckCircle,
  Filter,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  getExpenseCategories,
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats,
  getCashAccounts,
  getBankAccounts,
  getMpesaAgents,
  getStoredAuth,
  ExpenseDto,
  CreateExpenseDto,
  UpdateExpenseDto,
  Currency,
  PaymentMethod,
  AccountType,
  CashAccountDto,
  BankAccountDto,
  MpesaAgentDto,
  formatMoney,
  allPages,
} from "@/lib/api";
import { useBaseCurrency, useAllowedCurrencies } from "@/lib/useBaseCurrency";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { localDate } from "@/lib/dates";

// ==============================================
// Types
// ==============================================

interface ExpenseTransaction {
  id: string;
  code: string;
  date: string;
  description: string;
  categoryId: string;
  categoryName: string;
  currency: "KES" | "USD" | "UGX" | "EUR";
  amount: number;
  reference: string;
  paymentMethod: string;
  vendor: string;
  approvedBy: string;
}

interface ExpenseCategory {
  id: string;
  name: string;
  description?: string;
  kesTotal: number;
  usdTotal: number;
  /** Spend in every currency used (KES, USD, UGX, EUR) */
  totals: { currency: number; amount: number }[];
  transactionCount: number;
  isActive: boolean;
}

interface ExpenseStats {
  totalKES: number;
  totalUSD: number;
  thisMonthKES: number;
  thisMonthUSD: number;
  activeCategories: number;
  /** Every currency spent in (KES, USD, UGX, EUR) */
  byCurrency?: { currency: number; total: number; thisMonth: number }[] | null;
}

interface FormData {
  categoryId: string;
  description: string;
  amount: number;
  currency: number;
  vendor: string;
  paymentMethod: number;
  paymentAccountType: number;
  paymentAccountId: string;
  reference: string;
  expenseDate: string;
}

interface EditFormData {
  description: string;
  vendor: string;
  amount: number;
  reference: string;
}

interface AccountOption {
  id: string;
  name: string;
  type: number;
  currency: number;
  balance: number;
}

// ==============================================
// Helper Functions
// ==============================================

const formatNumber = (num: number) => {
  return new Intl.NumberFormat("en-KE").format(num);
};

const formatCurrency = (amount: number, currency: "KES" | "USD" | "UGX" | "EUR" | number) => {
  const currencyCode =
    typeof currency === "number" ? (currency === 0 ? "KES" : currency === 2 ? "UGX" : currency === 3 ? "EUR" : "USD") : currency;
  return `${currencyCode} ${formatNumber(amount)}`;
};

// ==============================================
// Modal Wrapper Component
// ==============================================

function ModalWrapper({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e: any) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e: any) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// ==============================================
// Main Component
// ==============================================

export function ExpensesAccount() {
  // Kenyan bureaus don't use UGX; Ugandan ones use KES too (lib/useBaseCurrency).
  const { has: currencyOk } = useAllowedCurrencies();
  // Home currency: default for new expenses. Mobile money wallets each hold their own
  // network's currency (M-Pesa = KES even in Uganda), sent by the server as agent.currency.
  const { base } = useBaseCurrency();
  const [allCategories, setAllCategories] = useState<ExpenseCategory[]>([]);
  const [allExpenses, setAllExpenses] = useState<ExpenseTransaction[]>([]);
  const [stats, setStats] = useState<ExpenseStats>({
    totalKES: 0,
    totalUSD: 0,
    thisMonthKES: 0,
    thisMonthUSD: 0,
    activeCategories: 0,
  });
  const [cashAccounts, setCashAccounts] = useState<CashAccountDto[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountDto[]>([]);
  const [mpesaAgents, setMpesaAgents] = useState<MpesaAgentDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<ExpenseCategory | null>(null);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [categoriesCurrentPage, setCategoriesCurrentPage] = useState(1);
  const [transactionsCurrentPage, setTransactionsCurrentPage] = useState(1);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showEditExpense, setShowEditExpense] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedExpense, setSelectedExpense] =
    useState<ExpenseTransaction | null>(null);
  const [expenseToDelete, setExpenseToDelete] =
    useState<ExpenseTransaction | null>(null);

  const [formData, setFormData] = useState<FormData>({
    categoryId: "",
    description: "",
    amount: 0,
    currency: base,
    vendor: "",
    paymentMethod: 0,
    paymentAccountType: 0,
    paymentAccountId: "",
    reference: "",
    expenseDate: localDate(),
  });
  // The home currency arrives after first render — apply it to an untouched form.
  useEffect(() => {
    setFormData((f) => (f.amount ? f : { ...f, currency: base }));
  }, [base]);

  const [editFormData, setEditFormData] = useState<EditFormData>({
    description: "",
    vendor: "",
    amount: 0,
    reference: "",
  });

  // ==============================================
  // Data Mapping
  // ==============================================

  const mapCategoryDto = (dto: any): ExpenseCategory => ({
    id: dto.id,
    name: dto.name,
    description: dto.description,
    kesTotal: dto.totalKES || 0,
    usdTotal: dto.totalUSD || 0,
    totals:
      Array.isArray(dto.totalsByCurrency) && dto.totalsByCurrency.length > 0
        ? dto.totalsByCurrency.map((t: any) => ({ currency: t.currency, amount: t.amount || 0 }))
        : [
            { currency: 0, amount: dto.totalKES || 0 },
            { currency: 1, amount: dto.totalUSD || 0 },
          ].filter((t) => t.amount),
    transactionCount: dto.transactionCount || 0,
    isActive: dto.isActive ?? true,
  });

  const mapExpenseDto = (dto: ExpenseDto): ExpenseTransaction => {
    const paymentMethodNames: { [key: number]: string } = {
      0: "Cash",
      1: "Bank Transfer",
      2: "Mobile money",
      3: "Credit Card",
      4: "Cheque",
    };
    return {
      id: dto.id,
      code: dto.code,
      date: new Date(dto.expenseDate || dto.createdAt).toLocaleString(),
      description: dto.description,
      categoryId: dto.categoryId,
      categoryName: dto.categoryName || "Unknown",
      currency:
        dto.currency === 0
          ? "KES"
          : dto.currency === 2
            ? "UGX"
            : dto.currency === 3
              ? "EUR"
              : "USD",
      amount: dto.amount,
      reference: dto.reference || dto.code,
      paymentMethod: paymentMethodNames[dto.paymentMethod] || "Unknown",
      vendor: dto.vendorPayee || "Unknown",
      approvedBy: dto.createdByName || "System",
    };
  };

  // ==============================================
  // Data Fetching
  // ==============================================

  const fetchCategories = useCallback(async () => {
    try {
      const response = await getExpenseCategories();
      if (response.success && response.data) {
        setAllCategories(response.data.map(mapCategoryDto));
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, []);

  const fetchExpenses = useCallback(async () => {
    try {
      const response = await allPages((p, n) => getExpenses(p, n));
      if (response.success && response.data) {
        const expenses = response.data.items || response.data;
        if (Array.isArray(expenses)) {
          setAllExpenses(expenses.map(mapExpenseDto));
        }
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await getExpenseStats();
      if (response.success && response.data) {
        setStats({
          totalKES: response.data.totalKES || 0,
          totalUSD: response.data.totalUSD || 0,
          thisMonthKES: response.data.thisMonthKES || 0,
          thisMonthUSD: response.data.thisMonthUSD || 0,
          activeCategories: response.data.activeCategories || 0,
          byCurrency: (response.data as any).byCurrency ?? null,
        });
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, []);

  // FIXED: Handle both array and paginated response structures
  const fetchPaymentAccounts = useCallback(async () => {
    try {
      const [cashRes, bankRes, mpesaRes] = await Promise.all([
        getCashAccounts(),
        getBankAccounts(),
        getMpesaAgents(),
      ]);
      if (cashRes.success && cashRes.data) {
        const cashData = Array.isArray(cashRes.data)
          ? cashRes.data
          : (cashRes.data as any).items || [];
        setCashAccounts(cashData);
      }
      if (bankRes.success && bankRes.data) {
        const bankData = Array.isArray(bankRes.data)
          ? bankRes.data
          : (bankRes.data as any).items || [];
        setBankAccounts(bankData);
      }
      if (mpesaRes.success && mpesaRes.data) {
        const mpesaData = Array.isArray(mpesaRes.data)
          ? mpesaRes.data
          : (mpesaRes.data as any).items || [];
        setMpesaAgents(mpesaData);
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchCategories(),
        fetchExpenses(),
        fetchStats(),
        fetchPaymentAccounts(),
      ]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchCategories, fetchExpenses, fetchStats, fetchPaymentAccounts]);

  const handleRefresh = async () => {
    setIsLoading(true);
    await Promise.all([
      fetchCategories(),
      fetchExpenses(),
      fetchStats(),
      fetchPaymentAccounts(),
    ]);
    setIsLoading(false);
    toast.success("Data refreshed!");
  };

  // ==============================================
  // Account Helpers - FIXED: Handle missing isActive property
  // ==============================================

  const getAvailableAccounts = useCallback((): AccountOption[] => {
    const accounts: AccountOption[] = [];
    if (formData.paymentAccountType === 0) {
      cashAccounts
        .filter(
          (acc) => acc.currency === formData.currency && acc.isActive !== false,
        )
        .forEach((acc) => {
          accounts.push({
            id: acc.id,
            name: `Cash ${acc.currency === 0 ? "KES" : acc.currency === 2 ? "UGX" : acc.currency === 3 ? "EUR" : "USD"}`,
            type: 0,
            currency: acc.currency,
            balance: acc.balance,
          });
        });
    }
    if (formData.paymentAccountType === 1) {
      bankAccounts
        .filter(
          (acc) => acc.currency === formData.currency && acc.isActive !== false,
        )
        .forEach((acc) => {
          accounts.push({
            id: acc.id,
            name: `${acc.bankName} - ${acc.accountNumber}`,
            type: 1,
            currency: acc.currency,
            balance: acc.balance,
          });
        });
    }
    if (formData.paymentAccountType === 2) {
      mpesaAgents
        .filter((acc) => acc.isActive !== false && ((acc as any).currency ?? base) === formData.currency)
        .forEach((acc) => {
          accounts.push({
            id: acc.id,
            name: `${acc.agentName} - ${acc.agentNumber}`,
            type: 2,
            currency: (acc as any).currency ?? base,
            balance: acc.balance,
          });
        });
    }
    return accounts;
  }, [formData.paymentAccountType, formData.currency, cashAccounts, bankAccounts, mpesaAgents, base]);

  useEffect(() => {
    const accounts = getAvailableAccounts();
    if (accounts.length > 0) {
      const valid = accounts.some(
        (acc) => acc.id === formData.paymentAccountId,
      );
      if (!formData.paymentAccountId || !valid) {
        setFormData((prev) => ({ ...prev, paymentAccountId: accounts[0].id }));
      }
    } else {
      setFormData((prev) => ({ ...prev, paymentAccountId: "" }));
    }
  }, [formData.paymentAccountType, formData.currency, getAvailableAccounts]);

  // ==============================================
  // CRUD Handlers
  // ==============================================

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formData.categoryId ||
      !formData.description.trim() ||
      formData.amount <= 0 ||
      !formData.paymentAccountId
    ) {
      toast.error("Please fill in all required fields");
      return;
    }
    setIsSubmitting(true);
    try {
      const createDto: CreateExpenseDto = {
        categoryId: formData.categoryId,
        description: formData.description.trim(),
        vendorPayee: formData.vendor.trim() || undefined,
        amount: formData.amount,
        currency: formData.currency as Currency,
        paymentMethod: formData.paymentMethod as PaymentMethod,
        paymentAccountType: formData.paymentAccountType as AccountType,
        paymentAccountId: formData.paymentAccountId,
        reference: formData.reference.trim() || undefined,
        expenseDate: new Date(
          formData.expenseDate + "T12:00:00Z",
        ).toISOString(),
      };
      const response = await createExpense(createDto);
      if (response.success) {
        toast.success("Expense recorded successfully!");
        setShowAddExpense(false);
        setFormData({
          categoryId: "",
          description: "",
          amount: 0,
          currency: base,
          vendor: "",
          paymentMethod: 0,
          paymentAccountType: 0,
          paymentAccountId: "",
          reference: "",
          expenseDate: localDate(),
        });
        await Promise.all([
          fetchCategories(),
          fetchExpenses(),
          fetchStats(),
          fetchPaymentAccounts(),
        ]);
      } else {
        toast.error(response.message || "Failed to create expense");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to create expense");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !selectedExpense ||
      !editFormData.description.trim() ||
      editFormData.amount <= 0
    ) {
      toast.error("Please fill in all required fields");
      return;
    }
    setIsSubmitting(true);
    try {
      const updateDto: UpdateExpenseDto = {
        description: editFormData.description.trim(),
        vendorPayee: editFormData.vendor.trim() || undefined,
        amount: editFormData.amount,
        reference: editFormData.reference.trim() || undefined,
      };
      const response = await updateExpense(selectedExpense.id, updateDto);
      if (response.success) {
        toast.success("Expense updated successfully!");
        setShowEditExpense(false);
        setSelectedExpense(null);
        await Promise.all([
          fetchCategories(),
          fetchExpenses(),
          fetchStats(),
          fetchPaymentAccounts(),
        ]);
      } else {
        toast.error(response.message || "Failed to update expense");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to update expense");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return;
    setIsDeleting(true);
    try {
      const response = await deleteExpense(expenseToDelete.id);
      if (response.success) {
        toast.success(
          `Expense deleted! ${
            expenseToDelete.currency
          } ${expenseToDelete.amount.toLocaleString()} restored.`,
        );
        setShowDeleteModal(false);
        setExpenseToDelete(null);
        await Promise.all([
          fetchCategories(),
          fetchExpenses(),
          fetchStats(),
          fetchPaymentAccounts(),
        ]);
      } else {
        toast.error(response.message || "Failed to delete expense");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete expense");
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditModal = (expense: ExpenseTransaction) => {
    setSelectedExpense(expense);
    setEditFormData({
      description: expense.description,
      vendor: expense.vendor === "Unknown" ? "" : expense.vendor,
      amount: expense.amount,
      reference: expense.reference,
    });
    setShowEditExpense(true);
  };

  const openDeleteModal = (expense: ExpenseTransaction) => {
    setExpenseToDelete(expense);
    setShowDeleteModal(true);
  };

  // ==============================================
  // Export & Print Functions - Corporate Design
  // ==============================================

  const handleExportPDF = () => {
    if (!selectedCategory) {
      toast.error("Please select a category first");
      return;
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Get company info from auth - with safe defaults
      const auth = getStoredAuth();
      const companyName = auth?.user?.companyName || "Money Exchange";

      // Safe category data access
      const categoryName = selectedCategory.name || "Unknown Category";
      const kesTotal = selectedCategory.kesTotal ?? 0;
      const usdTotal = selectedCategory.usdTotal ?? 0;
      const transactionCount = selectedCategory.transactionCount ?? 0;
      const isActive = selectedCategory.isActive !== false;

      // ========== CORPORATE HEADER ==========
      doc.setFillColor(16, 185, 129); // Emerald for expenses
      doc.rect(0, 0, pageWidth, 4, "F");

      doc.setFillColor(250, 250, 250);
      doc.rect(0, 4, pageWidth, 36, "F");

      doc.setFillColor(16, 185, 129);
      doc.rect(14, 10, 24, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("E", 26, 26, { align: "center" });

      doc.setTextColor(17, 24, 39);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(companyName, 44, 18);

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Expense Category Report", 44, 26);

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

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("Category", pageWidth - 14, 28, { align: "right" });
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(categoryName, pageWidth - 14, 35, { align: "right" });

      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(14, 42, pageWidth - 14, 42);

      // ========== CATEGORY INFORMATION ==========
      let yPos = 50;
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("CATEGORY DETAILS", 14, yPos);

      yPos += 6;
      doc.setFillColor(249, 250, 251);
      doc.rect(14, yPos, pageWidth - 28, 20, "F");

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39);
      doc.text(categoryName, 18, yPos + 8);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      doc.text(`${transactionCount} transactions recorded`, 18, yPos + 15);

      // Status badge
      doc.setFillColor(
        isActive ? 220 : 254,
        isActive ? 252 : 226,
        isActive ? 231 : 226,
      );
      doc.rect(pageWidth - 40, yPos + 4, 22, 6, "F");
      doc.setFontSize(7);
      doc.setTextColor(
        isActive ? 22 : 153,
        isActive ? 101 : 27,
        isActive ? 52 : 27,
      );
      doc.text(isActive ? "ACTIVE" : "INACTIVE", pageWidth - 29, yPos + 8, {
        align: "center",
      });

      // ========== EXPENSE SUMMARY ==========
      yPos += 28;
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("EXPENSE SUMMARY", 14, yPos);

      yPos += 6;
      const cardWidth = (pageWidth - 38) / 3;

      // Total spent, every currency (KES, USD, UGX, EUR)
      doc.setDrawColor(229, 231, 235);
      doc.rect(14, yPos, cardWidth * 2 + 5, 20, "S");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.setFont("helvetica", "normal");
      doc.text("Total spent", 16, yPos + 6);
      doc.setFontSize(11);
      doc.setTextColor(220, 38, 38);
      doc.setFont("helvetica", "bold");
      doc.text(totalsText(selectedCategory.totals), 16, yPos + 14);

      // Transaction Count
      doc.rect(14 + (cardWidth + 5) * 2, yPos, cardWidth, 20, "S");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.setFont("helvetica", "normal");
      doc.text("Transactions", 18 + (cardWidth + 5) * 2, yPos + 6);
      doc.setFontSize(11);
      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "bold");
      doc.text(String(transactionCount), 18 + (cardWidth + 5) * 2, yPos + 14);

      // ========== TRANSACTION HISTORY ==========
      if (filteredTransactions && filteredTransactions.length > 0) {
        yPos += 30;
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("EXPENSE TRANSACTIONS", 14, yPos);

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
          const desc = txn.description || "";
          const vendor = txn.vendor || "";
          const dateStr = txn.date || new Date().toISOString();
          return [
            new Date(dateStr).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "2-digit",
            }),
            txn.code || "-",
            desc.substring(0, 25) + (desc.length > 25 ? "..." : ""),
            vendor.substring(0, 15) + (vendor.length > 15 ? "..." : ""),
            txn.paymentMethod || "-",
            txn.currency || "-",
            (txn.amount ?? 0).toLocaleString(),
          ];
        });

        autoTable(doc, {
          startY: yPos + 4,
          head: [
            [
              "Date",
              "Code",
              "Description",
              "Vendor",
              "Method",
              "Curr",
              "Amount",
            ],
          ],
          body: txnTableData,
          theme: "plain",
          styles: { fontSize: 7, cellPadding: 2.5 },
          headStyles: {
            fillColor: [249, 250, 251],
            textColor: [75, 85, 99],
            fontStyle: "bold",
            lineWidth: 0.1,
            lineColor: [229, 231, 235],
          },
          bodyStyles: { lineWidth: 0.1, lineColor: [243, 244, 246] },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 22 },
            2: { cellWidth: 40 },
            3: { cellWidth: 28 },
            4: { cellWidth: 20 },
            5: { cellWidth: 14, halign: "center" },
            6: { cellWidth: 26, halign: "right" },
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          margin: { left: 14, right: 14 },
          didParseCell: (data: any) => {
            if (data.section === "body" && data.column.index === 6) {
              data.cell.styles.textColor = [220, 38, 38];
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
            doc.text("Expense Report", pageWidth - 14, pageHeight - 12, {
              align: "right",
            });
          },
        });
      }

      const safeCategoryName = categoryName.replace(/[^a-zA-Z0-9]/g, "-");
      const fileName = `${companyName.replace(
        /\s+/g,
        "_",
      )}_Expenses_${safeCategoryName}_${
        localDate()
      }.pdf`;
      doc.save(fileName);
      toast.success("Expense report exported successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };

  const handlePrint = () => {
    if (!selectedCategory) {
      toast.error("Please select a category first");
      return;
    }

    const auth = getStoredAuth();
    const companyName = auth?.user?.companyName || "Money Exchange";

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Expense Report - ${escapeHtml(selectedCategory.name)}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #111827; font-size: 12px; }
          .header { border-bottom: 3px solid #10b981; padding-bottom: 20px; margin-bottom: 20px; }
          .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
          .company-name { font-size: 24px; font-weight: bold; color: #111827; }
          .doc-title { color: #6b7280; font-size: 14px; margin-top: 4px; }
          .doc-info { text-align: right; }
          .doc-info label { color: #6b7280; font-size: 10px; display: block; }
          .doc-info span { font-weight: bold; color: #111827; }
          .category-box { background: #f9fafb; padding: 16px; margin-bottom: 20px; }
          .category-name { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
          .category-details { color: #6b7280; }
          .summary-row { display: flex; gap: 16px; margin-bottom: 20px; }
          .summary-card { flex: 1; border: 1px solid #e5e7eb; padding: 12px; }
          .summary-card label { color: #6b7280; font-size: 10px; display: block; margin-bottom: 4px; }
          .summary-card .value { font-size: 16px; font-weight: bold; color: #dc2626; }
          .summary-card .value.neutral { color: #111827; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f9fafb; color: #4b5563; font-weight: 600; text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e7eb; }
          td { padding: 10px 8px; border-bottom: 1px solid #f3f4f6; }
          tr:nth-child(even) { background: #f9fafb; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .amount { color: #dc2626; font-weight: 600; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 10px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-top">
            <div>
              <div class="company-name">${escapeHtml(companyName)}</div>
              <div class="doc-title">Expense Category Report</div>
            </div>
            <div class="doc-info">
              <label>Report Date</label>
              <span>${escapeHtml(new Date().toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              }))}</span>
              <br/><br/>
              <label>Category</label>
              <span>${escapeHtml(selectedCategory.name)}</span>
            </div>
          </div>
        </div>

        <div class="category-box">
          <div class="category-name">${escapeHtml(selectedCategory.name)}</div>
          <div class="category-details">
            ${escapeHtml(selectedCategory.transactionCount)} transactions recorded
          </div>
        </div>

        <div class="summary-row">
          <div class="summary-card" style="flex:2">
            <label>Total spent</label>
            <div class="value">${escapeHtml(totalsText(selectedCategory.totals))}</div>
          </div>
          <div class="summary-card">
            <label>Transactions</label>
            <div class="value neutral">${escapeHtml(
              selectedCategory.transactionCount
            )}</div>
          </div>
        </div>

        <h3 style="margin-bottom: 10px;">Expense Transactions</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Code</th>
              <th>Description</th>
              <th>Vendor</th>
              <th>Method</th>
              <th class="text-center">Curr</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
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
                <td>${escapeHtml(txn.code)}</td>
                <td>${escapeHtml(txn.description.substring(0, 30))}${escapeHtml(
                  txn.description.length > 30 ? "..." : ""
                )}</td>
                <td>${escapeHtml(txn.vendor.substring(0, 18))}${escapeHtml(
                  txn.vendor.length > 18 ? "..." : ""
                )}</td>
                <td>${escapeHtml(txn.paymentMethod)}</td>
                <td class="text-center">${escapeHtml(txn.currency)}</td>
                <td class="text-right amount">${escapeHtml(txn.amount.toLocaleString())}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>

        <div class="footer">
          <p>This is a computer-generated report and does not require a signature.</p>
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

  const getCategoryExpenses = (categoryId: string) =>
    allExpenses.filter((exp) => exp.categoryId === categoryId);

  const filteredCategories = allCategories.filter(
    (cat) =>
      cat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cat.id.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const categoriesPerPage = 10;
  const currentCategories = filteredCategories.slice(
    (categoriesCurrentPage - 1) * categoriesPerPage,
    categoriesCurrentPage * categoriesPerPage,
  );
  const totalCategoryPages = Math.ceil(
    filteredCategories.length / categoriesPerPage,
  );

  const totalKes =
    stats.totalKES || allCategories.reduce((sum, cat) => sum + cat.kesTotal, 0);
  const totalUsd =
    stats.totalUSD || allCategories.reduce((sum, cat) => sum + cat.usdTotal, 0);
  // Spend per currency for the summary card (KES, USD, UGX, EUR)
  const spendByCurrency: { currency: number; total: number; thisMonth: number }[] =
    stats.byCurrency && stats.byCurrency.length > 0
      ? stats.byCurrency
      : [
          { currency: 0, total: totalKes, thisMonth: stats.thisMonthKES },
          { currency: 1, total: totalUsd, thisMonth: stats.thisMonthUSD },
        ].filter((r) => r.total);
  const totalsText = (t: { currency: number; amount: number }[]) =>
    t.filter((x) => x.amount).map((x) => formatMoney(x.amount, x.currency)).join(" · ") || "-";

  const categoryTransactions = selectedCategory
    ? getCategoryExpenses(selectedCategory.id)
    : [];
  const filteredTransactions = categoryTransactions.filter(
    (txn) =>
      txn.description.toLowerCase().includes(transactionSearch.toLowerCase()) ||
      txn.reference.toLowerCase().includes(transactionSearch.toLowerCase()),
  );

  const transactionsPerPage = 10;
  const currentTransactions = filteredTransactions.slice(
    (transactionsCurrentPage - 1) * transactionsPerPage,
    transactionsCurrentPage * transactionsPerPage,
  );
  const totalTransactionPages = Math.ceil(
    filteredTransactions.length / transactionsPerPage,
  );

  const availableAccounts = getAvailableAccounts();

  // FIXED: Use !== false to handle undefined isActive (default to true)
  const hasCashAccounts = cashAccounts.some(
    (acc) => acc.currency === formData.currency && acc.isActive !== false,
  );
  const hasBankAccounts = bankAccounts.some(
    (acc) => acc.currency === formData.currency && acc.isActive !== false,
  );
  const hasMpesaAccounts = mpesaAgents.some(
    (acc) => acc.isActive !== false && ((acc as any).currency ?? base) === formData.currency,
  );

  // ==============================================
  // Loading State
  // ==============================================

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading expenses...</p>
        </div>
      </div>
    );
  }

  // ==============================================
  // Render
  // ==============================================

  return (
    <div className="min-w-0">
      <div className="min-w-0 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Expenses
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Track and manage all business expenses by category
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={() => setShowAddExpense(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Record Expense
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Spend per currency (KES, USD, UGX, EUR) — the page's lead figure, blue */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white shadow-sm sm:col-span-2">
            <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-white/10 blur-3xl" />
            <div className="relative mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-blue-50">Total spent</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                <Receipt className="h-4 w-4 text-white" />
              </div>
            </div>
            {spendByCurrency.length === 0 ? (
              <p className="relative text-3xl font-semibold">0</p>
            ) : (
              <div className="relative space-y-1.5">
                {spendByCurrency.map((r, i) => (
                  <div key={r.currency} className="flex items-baseline justify-between gap-4">
                    <span className={`font-semibold tabular-nums ${i === 0 ? "text-3xl" : "text-lg"}`}>
                      {formatMoney(r.total, r.currency)}
                    </span>
                    <span className="text-xs tabular-nums text-blue-50">
                      {formatMoney(r.thisMonth, r.currency)} this month
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {[
            { label: "Categories", value: stats.activeCategories || allCategories.length, note: "In use", Icon: Tag },
            { label: "Expenses recorded", value: allExpenses.length, note: "All time", Icon: Receipt },
          ].map(({ label, value, note, Icon }) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E9EEF6]">
                  <Icon className="h-4 w-4 text-[#0F172A]" />
                </div>
              </div>
              <p className="text-xl font-semibold tabular-nums text-slate-900">{value}</p>
              <p className="mt-1 text-xs text-slate-500">{note}</p>
            </div>
          ))}
        </div>

        {/* Categories Table */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="p-4 border-b border-gray-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Expense Categories
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={searchTerm}
                  onChange={(e: any) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-gray-200 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-lg"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto max-w-full">
            <table className="w-full">
              <thead className="border-gray-200 bg-[#E9EEF6]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                    Name
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                    Total spent
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                    Expenses
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {currentCategories.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-gray-500"
                    >
                      No categories found
                    </td>
                  </tr>
                ) : (
                  currentCategories.map((cat) => (
                    <tr
                      key={cat.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-gray-900">
                          <Tag className="w-4 h-4 text-gray-500" />
                          {cat.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 tabular-nums">
                        {cat.totals.filter((t) => t.amount).length === 0
                          ? "-"
                          : cat.totals
                              .filter((t) => t.amount)
                              .map((t) => (
                                <div key={t.currency} className="whitespace-nowrap">
                                  {formatMoney(t.amount, t.currency)}
                                </div>
                              ))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-sm font-medium">
                          {cat.transactionCount ||
                            getCategoryExpenses(cat.id).length}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => {
                            setSelectedCategory(cat);
                            setTransactionsCurrentPage(1);
                          }}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalCategoryPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Page {categoriesCurrentPage} of {totalCategoryPages}
              </p>
              <div className="flex gap-2">
                <button aria-label="Previous"
                  onClick={() =>
                    setCategoriesCurrentPage((p) => Math.max(1, p - 1))
                  }
                  disabled={categoriesCurrentPage === 1}
                  className="p-2 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 rounded-lg"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button aria-label="Next"
                  onClick={() =>
                    setCategoriesCurrentPage((p) =>
                      Math.min(totalCategoryPages, p + 1),
                    )
                  }
                  disabled={categoriesCurrentPage === totalCategoryPages}
                  className="p-2 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 rounded-lg"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================== CATEGORY DETAIL MODAL ==================== */}
      <AnimatePresence>
        {selectedCategory && (
          <ModalWrapper onClose={() => setSelectedCategory(null)}>
            <div className="bg-white w-full max-w-4xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-blue-600 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 flex items-center justify-center">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">
                      {selectedCategory.name}
                    </h3>
                    <p className="text-blue-50 text-sm">
                      {getCategoryExpenses(selectedCategory.id).length} Expense
                      Records
                    </p>
                  </div>
                </div>
                <button aria-label="Close"
                  onClick={() => setSelectedCategory(null)}
                  className="p-2 hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 border-b border-gray-200">
                <div className="bg-white border border-gray-200 p-3 col-span-2 rounded-lg">
                  <p className="text-xs text-gray-500 font-medium mb-1">Total spent</p>
                  <p className="text-lg font-semibold text-gray-900 tabular-nums">
                    {totalsText(selectedCategory.totals)}
                  </p>
                </div>
                <div className="bg-white border border-gray-200 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase font-medium mb-1">
                    Total Count
                  </p>
                  <p className="text-lg font-semibold text-blue-600">
                    {filteredTransactions.length}
                  </p>
                </div>
                <div className="bg-blue-600 p-3 text-white">
                  <p className="text-xs text-blue-50 uppercase font-medium mb-1">
                    Category
                  </p>
                  <p className="text-lg font-semibold truncate">
                    {selectedCategory.name}
                  </p>
                </div>
              </div>

              {/* Search */}
              <div className="p-4 border-b border-gray-200">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search expenses..."
                    value={transactionSearch}
                    onChange={(e: any) => setTransactionSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                  />
                </div>
              </div>

              {/* Transactions Table */}
              <div className="flex-1 overflow-auto">
                {currentTransactions.length === 0 ? (
                  <div className="p-12 text-center">
                    <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">
                      No Expenses Found
                    </h3>
                    <p className="text-gray-500">Try adjusting your search</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-w-full">
                    <table className="w-full">
                      <thead className="border-gray-200 sticky top-0 bg-[#E9EEF6]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                            Reference
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                            Date
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                            Description
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                            Vendor
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                            Amount
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {currentTransactions.map((txn) => (
                          <tr
                            key={txn.id}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              {txn.reference}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {txn.date}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 max-w-[200px] truncate">
                              {txn.description}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {txn.vendor !== "Unknown" ? txn.vendor : "-"}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                              {txn.currency} {formatNumber(txn.amount)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => openEditModal(txn)}
                                  className="p-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                                  title="Edit"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => openDeleteModal(txn)}
                                  className="p-1.5 bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pagination */}
              {totalTransactionPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                  <p className="text-sm text-gray-500">
                    Page {transactionsCurrentPage} of {totalTransactionPages} (
                    {filteredTransactions.length} expenses)
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setTransactionsCurrentPage((p) => Math.max(1, p - 1))
                      }
                      disabled={transactionsCurrentPage === 1}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 rounded-lg"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </button>
                    <button
                      onClick={() =>
                        setTransactionsCurrentPage((p) =>
                          Math.min(totalTransactionPages, p + 1),
                        )
                      }
                      disabled={
                        transactionsCurrentPage === totalTransactionPages
                      }
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 rounded-lg"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex gap-3 p-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={handleExportPDF}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
                <button
                  onClick={handlePrint}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Print Statement
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}
      </AnimatePresence>

      {/* ==================== ADD EXPENSE MODAL ==================== */}
      <AnimatePresence>
        {showAddExpense && (
          <ModalWrapper onClose={() => setShowAddExpense(false)}>
            <div className="bg-white w-full max-w-xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-emerald-700 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">
                      Record New Expense
                    </h3>
                    <p className="text-emerald-100 text-sm">
                      Double-entry accounting applied automatically
                    </p>
                  </div>
                </div>
                <button aria-label="Close"
                  onClick={() => setShowAddExpense(false)}
                  className="p-2 hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form
                onSubmit={handleCreateExpense}
                className="flex-1 overflow-auto p-4 space-y-4"
              >
                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expense Category <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={(e: any) =>
                      setFormData({ ...formData, categoryId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                  >
                    <option value="">Select category...</option>
                    {allCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e: any) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                    placeholder="Enter description"
                  />
                </div>

                {/* Amount & Currency */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.amount || ""}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Currency <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={formData.currency}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          currency: parseInt(e.target.value),
                          paymentAccountId: "",
                          paymentAccountType:
                            // M-Pesa (type 2) is KES-only
                            parseInt(e.target.value) !== 0 &&
                            formData.paymentAccountType === 2
                              ? 0
                              : formData.paymentAccountType,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                    >
                      <option value={0}>KES - Kenyan Shilling</option>
                      <option value={1}>USD - US Dollar</option>
                      {currencyOk("UGX") && <option value={2}>UGX - Ugandan Shilling</option>}
                      <option value={3}>EUR - Euro</option>
                    </select>
                  </div>
                </div>

                {/* Vendor */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendor/Payee
                  </label>
                  <input
                    type="text"
                    value={formData.vendor}
                    onChange={(e: any) =>
                      setFormData({ ...formData, vendor: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                    placeholder="Enter vendor name"
                  />
                </div>

                {/* Payment Account Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Account Type <span className="text-red-600">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        type: 0,
                        icon: Banknote,
                        label: "Cash",
                        disabled: !hasCashAccounts,
                      },
                      {
                        type: 1,
                        icon: Building2,
                        label: "Bank",
                        disabled: !hasBankAccounts,
                      },
                      {
                        type: 2,
                        icon: Smartphone,
                        label: "Mobile money",
                        disabled: !hasMpesaAccounts, // only wallets that hold the expense's currency
                      },
                    ].map(({ type, icon: Icon, label, disabled }) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            paymentAccountType: type,
                            paymentAccountId: "",
                            ...(type === 2 ? { currency: base } : {}),
                          })
                        }
                        disabled={disabled}
                        className={`flex flex-col items-center gap-2 p-3 border transition-colors rounded-lg ${
                          formData.paymentAccountType === type
                            ? "border-blue-500 bg-[#E9EEF6] text-[#0F172A]"
                            : disabled
                              ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                              : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-sm font-medium">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Select Account */}
                {availableAccounts.length > 0 ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select Account <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={formData.paymentAccountId}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          paymentAccountId: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                    >
                      <option value="">Select account...</option>
                      {availableAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} (Balance:{" "}
                          {formatMoney(acc.balance, acc.currency)})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-800">
                        No Accounts Available
                      </p>
                      <p className="text-sm text-amber-700">
                        Please create an account first.
                      </p>
                    </div>
                  </div>
                )}

                {/* Date & Reference */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Expense Date <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.expenseDate}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          expenseDate: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reference
                    </label>
                    <input
                      type="text"
                      value={formData.reference}
                      onChange={(e: any) =>
                        setFormData({ ...formData, reference: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                      placeholder="Optional reference"
                    />
                  </div>
                </div>

                {/* Double-Entry Preview */}
                <div className="bg-[#E9EEF6] border border-slate-200 p-4 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Receipt className="w-5 h-5 text-blue-600" />
                    <h4 className="font-semibold text-[#0F172A]">
                      Double-Entry Preview
                    </h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                      <div className="w-8 h-8 bg-red-100 flex items-center justify-center">
                        <ArrowUpCircle className="w-4 h-4 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">
                          Debit (Expense ↑)
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {allCategories.find(
                            (c) => c.id === formData.categoryId,
                          )?.name || "Select Category"}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-red-600">
                        +{formatMoney(formData.amount, formData.currency)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                      <div className="w-8 h-8 bg-emerald-100 flex items-center justify-center">
                        <ArrowDownCircle className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">
                          Credit (Asset ↓)
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {
                            ["Cash", "Bank", "Mobile money"][
                              formData.paymentAccountType
                            ]
                          }{" "}
                          Account
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-700">
                        -{formatMoney(formData.amount, formData.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </form>

              {/* Footer */}
              <div className="flex gap-3 p-4 border-t border-gray-200 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setShowAddExpense(false)}
                  className="flex-1 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  onClick={handleCreateExpense}
                  disabled={isSubmitting || !formData.paymentAccountId}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {isSubmitting ? "Recording..." : "Record Expense"}
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}
      </AnimatePresence>

      {/* ==================== EDIT EXPENSE MODAL ==================== */}
      <AnimatePresence>
        {showEditExpense && selectedExpense && (
          <ModalWrapper onClose={() => setShowEditExpense(false)}>
            <div className="bg-white w-full max-w-md">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-amber-700 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 flex items-center justify-center">
                    <Edit className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Edit Expense</h3>
                    <p className="text-amber-100 text-sm">
                      Reference: {selectedExpense.reference}
                    </p>
                  </div>
                </div>
                <button aria-label="Close"
                  onClick={() => setShowEditExpense(false)}
                  className="p-2 hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleUpdateExpense} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={editFormData.description}
                    onChange={(e: any) =>
                      setEditFormData({
                        ...editFormData,
                        description: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editFormData.amount || ""}
                      onChange={(e: any) =>
                        setEditFormData({
                          ...editFormData,
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Currency
                    </label>
                    <input
                      type="text"
                      value={selectedExpense.currency}
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendor/Payee
                  </label>
                  <input
                    type="text"
                    value={editFormData.vendor}
                    onChange={(e: any) =>
                      setEditFormData({
                        ...editFormData,
                        vendor: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reference
                  </label>
                  <input
                    type="text"
                    value={editFormData.reference}
                    onChange={(e: any) =>
                      setEditFormData({
                        ...editFormData,
                        reference: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                  />
                </div>

                {/* Amount Change Warning */}
                {editFormData.amount !== selectedExpense.amount && (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-amber-800">
                          Amount Change Detected
                        </p>
                        <p className="text-sm text-amber-700 mt-1">
                          This will adjust the payment account balance.
                        </p>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          <div className="bg-white p-2 border border-amber-100 text-center rounded-lg">
                            <p className="text-xs text-gray-500">Original</p>
                            <p className="font-medium text-gray-700">
                              {selectedExpense.currency}{" "}
                              {formatNumber(selectedExpense.amount)}
                            </p>
                          </div>
                          <div className="bg-white p-2 border border-amber-100 text-center rounded-lg">
                            <p className="text-xs text-gray-500">New</p>
                            <p className="font-medium text-blue-600">
                              {selectedExpense.currency}{" "}
                              {formatNumber(editFormData.amount)}
                            </p>
                          </div>
                          <div className="bg-white p-2 border border-amber-100 text-center rounded-lg">
                            <p className="text-xs text-gray-500">Difference</p>
                            <p
                              className={`font-medium ${
                                editFormData.amount > selectedExpense.amount
                                  ? "text-red-600"
                                  : "text-emerald-700"
                              }`}
                            >
                              {editFormData.amount > selectedExpense.amount
                                ? "+"
                                : ""}
                              {selectedExpense.currency}{" "}
                              {formatNumber(
                                editFormData.amount - selectedExpense.amount,
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </form>

              {/* Footer */}
              <div className="flex gap-3 p-4 border-t border-gray-200 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setShowEditExpense(false)}
                  className="flex-1 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  onClick={handleUpdateExpense}
                  disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {isSubmitting ? "Updating..." : "Update Expense"}
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}
      </AnimatePresence>

      {/* ==================== DELETE CONFIRMATION MODAL ==================== */}
      <AnimatePresence>
        {showDeleteModal && expenseToDelete && (
          <ModalWrapper onClose={() => setShowDeleteModal(false)}>
            <div className="bg-white w-full max-w-md">
              {/* Header */}
              <div className="p-6 text-center bg-red-600 text-white">
                <div className="w-16 h-16 bg-white/20 flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-semibold">Delete Expense?</h3>
                <p className="text-white text-sm mt-1">
                  This action cannot be undone
                </p>
              </div>

              {/* Content */}
              <div className="p-4 space-y-4">
                <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-red-100 flex items-center justify-center flex-shrink-0">
                      <Receipt className="w-6 h-6 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {expenseToDelete.description}
                      </p>
                      <p className="text-sm text-gray-500">
                        Reference: {expenseToDelete.reference}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-dashed border-gray-200 mt-4 pt-4 flex justify-between items-center">
                    <span className="text-gray-600">Amount to Restore</span>
                    <span className="text-xl font-semibold text-gray-900">
                      {expenseToDelete.currency}{" "}
                      {formatNumber(expenseToDelete.amount)}
                    </span>
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                  <h4 className="font-semibold text-emerald-800 mb-3">
                    What will happen:
                  </h4>
                  <ul className="space-y-2">
                    {[
                      "Expense record will be permanently deleted",
                      "Associated transaction will be reversed",
                      `${expenseToDelete.currency} ${formatNumber(
                        expenseToDelete.amount,
                      )} will be restored to the payment account`,
                    ].map((text, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-sm text-emerald-700"
                      >
                        <CheckCircle className="w-4 h-4 flex-shrink-0" />
                        {text}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 p-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteExpense}
                  disabled={isDeleting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {isDeleting ? "Deleting..." : "Delete Expense"}
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ExpensesAccount;
