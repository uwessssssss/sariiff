"use client";

import { AccountOption, EditFormData, ExpenseCategory, ExpenseStats, ExpenseTransaction, FormData } from "../helpers";
import { AccountType, BankAccountDto, CashAccountDto, CreateExpenseDto, Currency, ExpenseDto, MpesaAgentDto, PaymentMethod, UpdateExpenseDto, allPages, createExpense, deleteExpense, getBankAccounts, getCashAccounts, getExpenseCategories, getExpenseStats, getExpenses, getMpesaAgents, updateExpense } from "@/lib/api";
import { localDate } from "@/lib/dates";
import { toast } from "sonner";
import { useAllowedCurrencies, useBaseCurrency } from "@/lib/useBaseCurrency";
import { useCallback, useState } from "react";

/** ExpensesAccount: state (part 1 of 2 of useExpensesAccount). */
export function useExpensesAccountState() {
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
      3: "Account transfer",   // the API's PaymentMethod 3 (it was labelled "Credit Card")
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

  return {
    currencyOk,
    base,
    allCategories,
    setAllCategories,
    allExpenses,
    setAllExpenses,
    stats,
    setStats,
    cashAccounts,
    setCashAccounts,
    bankAccounts,
    setBankAccounts,
    mpesaAgents,
    setMpesaAgents,
    isLoading,
    setIsLoading,
    isSubmitting,
    setIsSubmitting,
    isDeleting,
    setIsDeleting,
    searchTerm,
    setSearchTerm,
    selectedCategory,
    setSelectedCategory,
    transactionSearch,
    setTransactionSearch,
    categoriesCurrentPage,
    setCategoriesCurrentPage,
    transactionsCurrentPage,
    setTransactionsCurrentPage,
    showAddExpense,
    setShowAddExpense,
    showEditExpense,
    setShowEditExpense,
    showDeleteModal,
    setShowDeleteModal,
    selectedExpense,
    setSelectedExpense,
    expenseToDelete,
    setExpenseToDelete,
    formData,
    setFormData,
    editFormData,
    setEditFormData,
    mapCategoryDto,
    mapExpenseDto,
    fetchCategories,
    fetchExpenses,
    fetchStats,
    fetchPaymentAccounts,
    handleRefresh,
    getAvailableAccounts,
    handleCreateExpense,
    handleUpdateExpense,
    handleDeleteExpense,
  };
}
