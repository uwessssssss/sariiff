"use client";

import { BankAccount, BankAccountFormData, BankStats, EditBankAccountFormData, Transaction } from "./helpers";
import { CreateBankAccountDto, Currency, apiRequest, createBankAccount, deleteBankAccount, getBankAccounts, getBankStats, updateBankAccount } from "@/lib/api";
import { refreshOpenStatement } from "../StatementModal";
import { toast } from "sonner";
import { useAllowedCurrencies, useBaseCurrency } from "@/lib/useBaseCurrency";
import { useCallback, useEffect, useState } from "react";

/** All of BankAccounts's state, effects and handlers. The screen and its sections read them from here. */
export function useBankAccounts() {
  // Kenyan bureaus don't use UGX; Ugandan ones use KES too (lib/useBaseCurrency).
  const { has: currencyOk } = useAllowedCurrencies();
  // New accounts / invoices start in the home currency (KES in Kenya, UGX in Uganda)
  const { baseCode } = useBaseCurrency();
  // Data states
  const [allAccounts, setAllAccounts] = useState<BankAccount[]>([]);
  const [stats, setStats] = useState<BankStats>({
    totalAccounts: 0,
    totalBalanceKES: 0,
    totalBalanceUSD: 0,
    totalDebitKES: 0,
    totalDebitUSD: 0,
    totalCreditKES: 0,
    totalCreditUSD: 0,
    netMovementKES: 0,
    netMovementUSD: 0,
  });
  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // UI states
  const [activeTab, setActiveTab] = useState<"all" | "outstanding">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(
    null,
  );
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [showViewTransaction, setShowViewTransaction] = useState(false);
  const [showEditTransaction, setShowEditTransaction] = useState(false);
  const [showDeleteTransaction, setShowDeleteTransaction] = useState(false);
  const [showRelatedAccount, setShowRelatedAccount] = useState(false);
  const [showEditAccount, setShowEditAccount] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<BankAccount | null>(
    null,
  );
  const [accountsCurrentPage, setAccountsCurrentPage] = useState(1);
  const [accountsPerPage] = useState(10);
  // Form states
  const [formData, setFormData] = useState<BankAccountFormData>({
    bankName: "",
    accountNumber: "",
    accountName: "",
    branchCode: "",
    currency: "KES",
    openingBalance: 0,
  });
  // The home currency arrives after first render — apply it to an untouched form.
  useEffect(() => {
    setFormData((f: any) => (f.bankName || f.accountNumber ? f : { ...f, currency: baseCode as any }));
  }, [baseCode]);
  const [editFormData, setEditFormData] = useState<EditBankAccountFormData>({
    bankName: "",
    accountName: "",
    branchCode: "",
    isActive: true,
  });
  // Helper functions for currency display
  const getCurrencySymbol = (currency: number): string => {
    return currency === 1 ? "$" : currency === 2 ? "UGX " : currency === 3 ? "€" : "KES ";
  };
  const getCurrencyName = (currency: number): string => {
    return currency === 0 ? "KES" : currency === 2 ? "UGX" : currency === 3 ? "EUR" : "USD";
  };
  // Map backend DTO to frontend BankAccount interface
  const mapDtoToAccount = (dto: any): BankAccount => {
    return {
      id: dto.id,
      code: dto.code,
      bankName: dto.bankName,
      accountNumber: dto.accountNumber,
      accountName: dto.accountName,
      branchCode: dto.branchCode,
      currency: dto.currency,
      balance: dto.balance,
      openingBalance: dto.openingBalance,
      totalDebit: dto.totalDebit || 0,
      totalCredit: dto.totalCredit || 0,
      netMovement: dto.netMovement || 0,
      isActive: dto.isActive,
      createdAt: dto.createdAt || new Date().toISOString(),
    };
  };
  // Map backend transaction to frontend Transaction interface
  const mapTransactionToDisplay = (txn: any): Transaction => {
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
      currency: txn.currency ?? 0,
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
  // Fetch bank accounts
  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getBankAccounts();
      if (response.success && response.data) {
        const mappedAccounts = response.data.map(mapDtoToAccount);
        setAllAccounts(mappedAccounts);
      } else {
        toast.error(response.message || "Failed to fetch bank accounts");
      }
    } catch (error) {
      console.error("Error fetching bank accounts:", error);
      toast.error("Failed to fetch bank accounts");
    } finally {
      setIsLoading(false);
    }
  }, []);
  // Fetch bank stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await getBankStats();
      if (response.success && response.data) {
        setStats({
          totalAccounts: response.data.totalAccounts || 0,
          totalBalanceKES: response.data.totalBalanceKES || 0,
          totalBalanceUSD: response.data.totalBalanceUSD || 0,
          totalDebitKES: response.data.totalDebitKES || 0,
          totalDebitUSD: response.data.totalDebitUSD || 0,
          totalCreditKES: response.data.totalCreditKES || 0,
          totalCreditUSD: response.data.totalCreditUSD || 0,
          netMovementKES: response.data.netMovementKES || 0,
          netMovementUSD: response.data.netMovementUSD || 0,
          byCurrency: (response.data as any).byCurrency ?? null,
        });
      }
    } catch (error) {
      console.error("Error fetching bank stats:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, []);
  // Initial data fetch
  useEffect(() => {
    fetchAccounts();
    fetchStats();
  }, [fetchAccounts, fetchStats]);
  // Filtered accounts based on tab - accounts with outstanding balances
  const accountsWithOutstanding = allAccounts.filter(
    (acc) => acc.balance !== 0,
  );
  const displayedAccounts =
    activeTab === "outstanding" ? accountsWithOutstanding : allAccounts;
  // Search filter
  const filteredAccounts = displayedAccounts.filter(
    (account) =>
      account.bankName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.accountNumber.includes(searchTerm) ||
      account.code.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  // Pagination for accounts
  const indexOfLastAccount = accountsCurrentPage * accountsPerPage;
  const indexOfFirstAccount = indexOfLastAccount - accountsPerPage;
  const currentAccounts = filteredAccounts.slice(
    indexOfFirstAccount,
    indexOfLastAccount,
  );
  const totalAccountPages = Math.ceil(
    filteredAccounts.length / accountsPerPage,
  );
  // Reset form data
  const resetFormData = () => {
    setFormData({
      bankName: "",
      accountNumber: "",
      accountName: "",
      branchCode: "",
      currency: baseCode as any,
      openingBalance: 0,
    });
  };
  // Handle create bank account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.bankName ||
      !formData.accountNumber ||
      !formData.accountName
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const dto: CreateBankAccountDto = {
        bankName: formData.bankName,
        accountNumber: formData.accountNumber,
        accountName: formData.accountName,
        branchCode: formData.branchCode || undefined,
        currency: formData.currency === "KES" ? Currency.KES : formData.currency === "UGX" ? Currency.UGX : formData.currency === "EUR" ? Currency.EUR : Currency.USD,
        openingBalance: formData.openingBalance || 0,
      };

      const response = await createBankAccount(dto);
      if (response.success) {
        toast.success("✓ Bank Account Added Successfully!");
        setShowAddAccount(false);
        resetFormData();
        fetchAccounts();
        fetchStats();
      } else {
        toast.error(response.message || "Failed to create bank account");
      }
    } catch (error) {
      console.error("Error creating bank account:", error);
      toast.error("Failed to create bank account");
    } finally {
      setIsSubmitting(false);
    }
  };
  // Handle edit account - open modal
  const handleEditAccount = (account: BankAccount) => {
    setSelectedAccount(account);
    setEditFormData({
      bankName: account.bankName,
      accountName: account.accountName,
      branchCode: account.branchCode || "",
      isActive: account.isActive,
    });
    setShowEditAccount(true);
  };
  // Handle update bank account
  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedAccount) return;

    setIsSubmitting(true);
    try {
      const response = await updateBankAccount(selectedAccount.id, {
        bankName: editFormData.bankName,
        accountName: editFormData.accountName,
        branchCode: editFormData.branchCode || undefined,
        isActive: editFormData.isActive,
      });

      if (response.success) {
        toast.success("Bank account updated successfully!");
        setShowEditAccount(false);
        setSelectedAccount(null);
        fetchAccounts();
        fetchStats();
      } else {
        toast.error(response.message || "Failed to update bank account");
      }
    } catch (error) {
      console.error("Error updating bank account:", error);
      toast.error("Failed to update bank account");
    } finally {
      setIsSubmitting(false);
    }
  };
  // Handle delete account
  const handleDeleteAccount = async () => {
    if (!accountToDelete) return;

    setIsSubmitting(true);
    try {
      const response = await deleteBankAccount(accountToDelete.id);
      if (response.success) {
        toast.success(
          `Bank account ${accountToDelete.code} deleted successfully!`,
        );
        setShowDeleteAccount(false);
        setAccountToDelete(null);
        fetchAccounts();
        fetchStats();
      } else {
        toast.error(response.message || "Failed to delete bank account");
      }
    } catch (error) {
      console.error("Error deleting bank account:", error);
      toast.error("Failed to delete bank account");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleViewTransaction = (txn: Transaction) => {
    setSelectedTransaction(txn);
    setShowViewTransaction(true);
  };
  const handleEditTransaction = (txn: Transaction) => {
    setSelectedTransaction(txn);
    setShowEditTransaction(true);
  };
  const handleDeleteTransaction = (txn: Transaction) => {
    setSelectedTransaction(txn);
    setShowDeleteTransaction(true);
  };
  const confirmDeleteTransaction = async (reason = "") => {
    if (!selectedTransaction) return;

    setIsSubmitting(true);
    try {
      const result = await apiRequest<boolean>(
        `/api/transaction/${selectedTransaction.id}`,
        {
          method: "DELETE",
          body: JSON.stringify({ reason: reason || "User requested deletion" }),
        },
      );

      if (result.success) {
        toast.success(
          `Transaction ${
            selectedTransaction.reference || selectedTransaction.code
          } reversed`,
        );
        setShowDeleteTransaction(false);
        setSelectedTransaction(null);
        // Refresh the account statement
        if (selectedAccount) {
          refreshOpenStatement();
        }
        // Also refresh stats
        fetchStats();
      } else {
        toast.error(result.message || "Failed to delete transaction");
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast.error("Failed to delete transaction");
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    currencyOk,
    baseCode,
    allAccounts,
    setAllAccounts,
    stats,
    setStats,
    isLoading,
    setIsLoading,
    isSubmitting,
    setIsSubmitting,
    activeTab,
    setActiveTab,
    searchTerm,
    setSearchTerm,
    showAddAccount,
    setShowAddAccount,
    selectedAccount,
    setSelectedAccount,
    selectedTransaction,
    setSelectedTransaction,
    showViewTransaction,
    setShowViewTransaction,
    showEditTransaction,
    setShowEditTransaction,
    showDeleteTransaction,
    setShowDeleteTransaction,
    showRelatedAccount,
    setShowRelatedAccount,
    showEditAccount,
    setShowEditAccount,
    showDeleteAccount,
    setShowDeleteAccount,
    accountToDelete,
    setAccountToDelete,
    accountsCurrentPage,
    setAccountsCurrentPage,
    accountsPerPage,
    formData,
    setFormData,
    editFormData,
    setEditFormData,
    getCurrencySymbol,
    getCurrencyName,
    mapDtoToAccount,
    mapTransactionToDisplay,
    fetchAccounts,
    fetchStats,
    accountsWithOutstanding,
    displayedAccounts,
    filteredAccounts,
    indexOfLastAccount,
    indexOfFirstAccount,
    currentAccounts,
    totalAccountPages,
    resetFormData,
    handleCreateAccount,
    handleEditAccount,
    handleUpdateAccount,
    handleDeleteAccount,
    handleViewTransaction,
    handleEditTransaction,
    handleDeleteTransaction,
    confirmDeleteTransaction,
  };
}

export type BankAccountsVM = ReturnType<typeof useBankAccounts>;
