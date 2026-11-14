"use client";

import { CashAccount, CashStats, ModalType, Transaction } from "../helpers";
import { CreateCashAccountDto, Currency, UpdateCashAccountDto, createCashAccount, currencyCode, deleteCashAccount, getCashAccountStatement, getCashAccounts, getCashStats, updateCashAccount } from "@/lib/api";
import { toast } from "sonner";
import { useAllowedCurrencies } from "@/lib/useBaseCurrency";
import { useCallback, useState } from "react";

/** CashAtHand: data (part 1 of 2 of useCashAtHand). */
export function useCashAtHandData() {
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

  return {
    currencyOk,
    statementCurrency,
    setStatementCurrency,
    cashAccounts,
    setCashAccounts,
    stats,
    setStats,
    allTransactions,
    setAllTransactions,
    isLoading,
    setIsLoading,
    isLoadingTransactions,
    setIsLoadingTransactions,
    isSubmitting,
    setIsSubmitting,
    searchTerm,
    setSearchTerm,
    transactionsCurrentPage,
    setTransactionsCurrentPage,
    selectedTransaction,
    setSelectedTransaction,
    modalType,
    setModalType,
    selectedAccount,
    setSelectedAccount,
    formData,
    setFormData,
    dateFilter,
    setDateFilter,
    typeFilter,
    setTypeFilter,
    currencyFilter,
    setCurrencyFilter,
    mapDtoToAccount,
    mapTransactionToDisplay,
    fetchCashAccounts,
    fetchStats,
    fetchTransactions,
    handleRefresh,
    getCurrencySymbol,
    getCurrencyName,
    CASH_CURRENCIES,
    existingCurrencies,
    missingCurrencies,
    allCurrenciesAdded,
    openAddModal,
    openEditModal,
    openDeleteModal,
    closeModal,
    handleCreateAccount,
    handleUpdateAccount,
    handleDeleteAccount,
    filteredTransactions,
    transactionsPerPage,
    indexOfLastTransaction,
    indexOfFirstTransaction,
    currentTransactions,
    totalTransactionPages,
  };
}
