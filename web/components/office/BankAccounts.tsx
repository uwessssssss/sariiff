"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  Wallet,
  DollarSign,
  AlertCircle,
  Download,
  X,
  FileText,
  Edit3,
  Trash2,
  Activity,
  Building2,
  Hash,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  getBankStats,
  CreateBankAccountDto,
  Currency,
  apiRequest,
} from "@/lib/api";
import { useBaseCurrency, useAllowedCurrencies } from "@/lib/useBaseCurrency";
import { StatementModal, refreshOpenStatement } from "./StatementModal";
import { TransactionDetailsDialog, RelatedAccountDialog, ReverseTransactionDialog } from "./TransactionDialogs";
import { EditTransactionDialog } from "./EditTransactionDialog";
import { CurrencyTotals, rowsFromStats } from "./CurrencyTotals";

// Updated Transaction interface to match backend StatementLineDto
interface Transaction {
  id: string;
  code: string;
  date: string;
  reference: string;
  description: string;
  transactionType: number;
  thisAccountAction: string; // "Debit" or "Credit"
  debit: number | null;
  credit: number | null;
  amount: number;
  currency: number;
  balanceBefore: number;
  balanceAfter: number;
  exchangeRate?: number | null;
  counterAmount?: number | null;
  counterCurrency?: number | null;
  notes?: string | null;
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
    clientCode?: string | null;
    clientPhone?: string | null;
  };
}

// Updated BankAccount interface to match backend BankAccountDto
interface BankAccount {
  id: string;
  code: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  branchCode?: string;
  currency: number;
  balance: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  isActive: boolean;
  createdAt: string;
}

// Updated Stats interface matching backend BankAccountStatsDto
interface BankStats {
  totalAccounts: number;
  totalBalanceKES: number;
  totalBalanceUSD: number;
  totalDebitKES: number;
  totalDebitUSD: number;
  totalCreditKES: number;
  totalCreditUSD: number;
  netMovementKES: number;
  netMovementUSD: number;
  /** Every bank currency (KES, USD, UGX, EUR) — from the API when available */
  byCurrency?: any[] | null;
}

// Form data interface for creating bank account
interface BankAccountFormData {
  bankName: string;
  accountNumber: string;
  accountName: string;
  branchCode: string;
  currency: "KES" | "USD" | "UGX" | "EUR";
  openingBalance: number;
}

// Form data interface for editing bank account
interface EditBankAccountFormData {
  bankName: string;
  accountName: string;
  branchCode: string;
  isActive: boolean;
}

export function BankAccounts() {
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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading bank accounts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Bank accounts
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Balances and movements for each bank account
          </p>
        </div>
        <button
          onClick={() => setShowAddAccount(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Add bank account
        </button>
      </div>

      {/* Per-currency summary (KES, USD, UGX, EUR) */}
      <CurrencyTotals
        rows={rowsFromStats(stats)}
        title={`Summary by currency · ${stats.totalAccounts} ${stats.totalAccounts === 1 ? "account" : "accounts"}`}
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setActiveTab("all")}
          className={`rounded-lg flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-300 ${
            activeTab === "all"
              ? " bg-[#0F172A]  text-white  "
              : "bg-white text-slate-600 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg"
          }`}
        >
          <CreditCard className="w-5 h-5" />
          All Accounts
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              activeTab === "all" ? "bg-white/20" : "bg-blue-100 text-blue-700"
            }`}
          >
            {allAccounts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("outstanding")}
          className={`rounded-lg flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-300 ${
            activeTab === "outstanding"
              ? " bg-red-600  text-white  "
              : "bg-white text-slate-600 hover:bg-red-50 border border-slate-200 hover:border-red-300 rounded-lg"
          }`}
        >
          <AlertCircle className="w-5 h-5" />
          With Balance
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              activeTab === "outstanding"
                ? "bg-white/20"
                : "bg-red-100 text-red-700"
            }`}
          >
            {accountsWithOutstanding.length}
          </span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 ">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by bank name, account number, or ID..."
              value={searchTerm}
              onChange={(e: any) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border text-slate-400 border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-500 focus:bg-white   transition-all duration-300 placeholder:text-slate-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => toast.info("Opening filter options...")}
              className="flex items-center gap-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all font-medium text-slate-700"
            >
              <Filter className="w-5 h-5" />
              <span className="hidden sm:inline">Filters</span>
            </button>
            <button
              onClick={() => {
                fetchAccounts();
                fetchStats();
                toast.success("Data refreshed!");
              }}
              className="flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
            >
              <RefreshCw className="w-5 h-5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => toast.success("Exporting bank accounts list...")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
            >
              <Download className="w-5 h-5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bank Accounts Table */}
      <div className="bg-white rounded-2xl border border-slate-200  overflow-hidden">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full">
            <thead className="bg-[#E9EEF6]">
              <tr>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Account Code
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Bank Details
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Currency
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Balance
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Net Movement
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Status
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {currentAccounts.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No bank accounts found. Add your first bank account to get
                    started.
                  </td>
                </tr>
              ) : (
                currentAccounts.map((account, index) => (
                  <motion.tr
                    key={account.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="hover:bg-blue-50/50 transition-all duration-200 cursor-pointer group"
                  >
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-blue-600 group-hover:text-blue-700">
                        {account.code}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <div className="font-semibold text-slate-900 text-sm whitespace-nowrap">
                          {account.bankName}
                        </div>
                        <div className="flex flex-col gap-0.5 mt-1">
                          <span className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Building2 className="w-3 h-3" />
                            {account.accountName}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                            <Hash className="w-3 h-3" />
                            {account.accountNumber}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          account.currency === 0
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {getCurrencyName(account.currency)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`text-sm font-semibold ${
                          account.balance >= 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {getCurrencySymbol(account.currency)}
                        {account.balance.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`text-sm font-semibold ${
                          account.netMovement >= 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {account.netMovement >= 0 ? "+" : ""}
                        {getCurrencySymbol(account.currency)}
                        {account.netMovement.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          account.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {account.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedAccount(account)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-all text-xs font-medium rounded-lg"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Statement
                        </button>
                        <button
                          onClick={() => handleEditAccount(account)}
                          className="flex items-center gap-1.5 px-3 py-2 transition-all text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button aria-label="Delete"
                          onClick={() => {
                            setAccountToDelete(account);
                            setShowDeleteAccount(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 transition-all text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-red-50 text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalAccountPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <p className="text-sm text-slate-600">
              Showing {indexOfFirstAccount + 1} to{" "}
              {Math.min(indexOfLastAccount, filteredAccounts.length)} of{" "}
              {filteredAccounts.length} accounts
            </p>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setAccountsCurrentPage((prev) => Math.max(prev - 1, 1))
                }
                disabled={accountsCurrentPage === 1}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Previous
              </button>
              <button
                onClick={() =>
                  setAccountsCurrentPage((prev) =>
                    Math.min(prev + 1, totalAccountPages),
                  )
                }
                disabled={accountsCurrentPage === totalAccountPages}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Account Statement Modal */}
      <AnimatePresence>
        {selectedAccount && !showEditAccount && (
          <StatementModal
            kind="bank"
            accountId={selectedAccount.id}
            title={`${selectedAccount.bankName} – ${selectedAccount.accountNumber}`}
            subtitle={[selectedAccount.code, selectedAccount.accountName].filter(Boolean).join(" · ")}
            currency={Number(selectedAccount.currency ?? 0)}
                        onView={(raw) => handleViewTransaction(mapTransactionToDisplay(raw))}
            onEdit={(raw) => handleEditTransaction(mapTransactionToDisplay(raw))}
            onDelete={(raw) => handleDeleteTransaction(mapTransactionToDisplay(raw))}
            onRelated={(raw) => {
              setSelectedTransaction(mapTransactionToDisplay(raw));
              setShowRelatedAccount(true);
            }}
            onClose={() => setSelectedAccount(null)}
          />
        )}
      </AnimatePresence>

      {/* Add Bank Account Modal */}
      <AnimatePresence>
        {showAddAccount && (
          <div className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e: any) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="sticky top-0 z-10  bg-blue-600   px-6 py-4 border-b-4 border-blue-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                      <Plus className="w-6 h-6" />
                      Add New Bank Account
                    </h3>
                    <p className="text-xs text-blue-100 mt-1">
                      Create a new bank account record
                    </p>
                  </div>
                  <button aria-label="Close"
                    onClick={() => {
                      setShowAddAccount(false);
                      resetFormData();
                    }}
                    className="rounded-lg p-2 hover:bg-white/20 transition-all"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleCreateAccount} className="p-6">
                <div className="space-y-4">
                  {/* Bank Details Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Bank Name */}
                    <div className="group">
                      <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        Bank Name
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.bankName}
                        onChange={(e: any) =>
                          setFormData({ ...formData, bankName: e.target.value })
                        }
                        placeholder="e.g., Equity Bank"
                        className="rounded-lg w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                        required
                      />
                    </div>

                    {/* Account Number */}
                    <div className="group">
                      <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <Hash className="w-4 h-4 text-slate-400" />
                        Account Number
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.accountNumber}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            accountNumber: e.target.value,
                          })
                        }
                        placeholder="0123456789"
                        className="rounded-lg w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                        required
                      />
                    </div>

                    {/* Branch Code */}
                    <div className="group">
                      <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <Hash className="w-4 h-4 text-slate-400" />
                        Branch Code
                      </label>
                      <input
                        type="text"
                        value={formData.branchCode}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            branchCode: e.target.value,
                          })
                        }
                        placeholder="068"
                        className="rounded-lg w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      />
                    </div>

                    {/* Account Type/Currency */}
                    <div className="group">
                      <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-slate-400" />
                        Currency
                        <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.currency}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            currency: e.target.value as "KES" | "USD" | "UGX" | "EUR",
                          })
                        }
                        className="rounded-lg w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none cursor-pointer"
                      >
                        <option value="KES">KES - Kenya Shillings</option>
                        <option value="USD">USD - US Dollar</option>
                        {currencyOk("UGX") && <option value="UGX">UGX - Uganda Shillings</option>}
                        <option value="EUR">EUR - Euro</option>
                      </select>
                    </div>
                  </div>

                  {/* Account Name */}
                  <div className="group">
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-slate-400" />
                      Account Name
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.accountName}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          accountName: e.target.value,
                        })
                      }
                      placeholder="Sarif Exchange - KES"
                      className="rounded-lg w-full px-4 py-3 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      required
                    />
                  </div>

                  {/* Opening Balance Section */}
                  <div className=" bg-blue-50 p-4 border border-blue-200 rounded-xl">
                    <p className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                      <Wallet className="w-4 h-4" />
                      Opening Balance
                    </p>

                    <div className="group">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Opening Balance ({formData.currency})
                      </label>
                      <input
                        type="number"
                        value={formData.openingBalance}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            openingBalance: parseFloat(e.target.value) || 0,
                          })
                        }
                        placeholder="0"
                        min="0"
                        step="0.01"
                        className="rounded-lg w-full px-4 py-3 border text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none bg-white border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      />
                    </div>

                    <div className="mt-3 p-3 bg-blue-100/50 border border-blue-200 rounded-lg">
                      <p className="text-xs text-blue-800 font-semibold">
                        💡 Opening balance represents the initial balance when
                        the account is created
                      </p>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="mt-6 pt-4 border-t border-slate-200 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddAccount(false);
                      resetFormData();
                    }}
                    className="rounded-lg flex-1 px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 shadow-sm "
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-lg flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Adding...
                      </span>
                    ) : (
                      "Add Bank Account"
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Bank Account Modal */}
      <AnimatePresence>
        {showEditAccount && selectedAccount && (
          <div className="fixed inset-0 bg-black/60  flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white shadow-2xl max-w-xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            >
              {/* Premium Header with Gradient Background */}
              <div className="relative  bg-blue-600   px-6 py-4">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>

                <div className="relative flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-white/20  rounded-xl flex items-center justify-center border border-white/30 ">
                      <Edit3 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-0.5">
                        Edit Bank Account
                      </h2>
                      <p className="text-blue-100 text-xs font-medium">
                        Update bank account information
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-white/20 border border-white/30 rounded-lg text-xs font-semibold text-white">
                          <Hash className="w-3 h-3" />
                          {selectedAccount.code}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => {
                      setShowEditAccount(false);
                      setSelectedAccount(null);
                    }}
                    className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all "
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              {/* Scrollable Form Content */}
              <form
                onSubmit={handleUpdateAccount}
                className="px-6 py-5 overflow-y-auto flex-1"
              >
                <div className="space-y-4">
                  {/* Bank Name */}
                  <div className="group">
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400" />
                      Bank Name
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editFormData.bankName}
                      onChange={(e: any) =>
                        setEditFormData({
                          ...editFormData,
                          bankName: e.target.value,
                        })
                      }
                      placeholder="Enter bank name"
                      className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      required
                    />
                  </div>

                  {/* Account Name */}
                  <div className="group">
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-slate-400" />
                      Account Name
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editFormData.accountName}
                      onChange={(e: any) =>
                        setEditFormData({
                          ...editFormData,
                          accountName: e.target.value,
                        })
                      }
                      placeholder="Sarif Exchange - KES"
                      className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      required
                    />
                  </div>

                  {/* Branch Code */}
                  <div className="group">
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <Hash className="w-4 h-4 text-slate-400" />
                      Branch Code
                    </label>
                    <input
                      type="text"
                      value={editFormData.branchCode}
                      onChange={(e: any) =>
                        setEditFormData({
                          ...editFormData,
                          branchCode: e.target.value,
                        })
                      }
                      placeholder="068"
                      className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                    />
                  </div>

                  {/* Account Status */}
                  <div className="group">
                    <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-slate-400" />
                      Account Status
                    </label>
                    <select
                      value={editFormData.isActive ? "active" : "inactive"}
                      onChange={(e: any) =>
                        setEditFormData({
                          ...editFormData,
                          isActive: e.target.value === "active",
                        })
                      }
                      className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none cursor-pointer"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  {/* Read-only fields */}
                  <div className="bg-slate-50 p-4 border border-slate-200 rounded-lg">
                    <p className="text-xs font-semibold text-slate-500 mb-3">
                      Read-only Information
                    </p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500">Account Number</p>
                        <p className="font-semibold text-slate-900 font-mono">
                          {selectedAccount.accountNumber}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Currency</p>
                        <p className="font-semibold text-slate-900">
                          {getCurrencyName(selectedAccount.currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Current Balance</p>
                        <p className="font-semibold text-slate-900">
                          {getCurrencySymbol(selectedAccount.currency)}
                          {selectedAccount.balance.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Opening Balance</p>
                        <p className="font-semibold text-slate-900">
                          {getCurrencySymbol(selectedAccount.currency)}
                          {selectedAccount.openingBalance.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fixed Footer with Action Buttons */}
                <div className="mt-6 pt-4 border-t border-slate-200 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditAccount(false);
                      setSelectedAccount(null);
                    }}
                    className="rounded-lg flex-1 px-6 py-3.5 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 shadow-sm "
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-lg flex-1 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      "Save Changes"
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Bank Account Confirmation Modal */}
      <AnimatePresence>
        {showDeleteAccount && accountToDelete && (
          <div className="fixed inset-0 bg-black/60  flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white shadow-2xl max-w-md w-full overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="relative  bg-red-600   px-6 py-4">
                <div className="relative flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-white/20 flex items-center justify-center border border-white/30 rounded-lg ">
                      <Trash2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-0.5">
                        Delete Account
                      </h2>
                      <p className="text-red-100 text-xs font-medium">
                        This action cannot be undone
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => {
                      setShowDeleteAccount(false);
                      setAccountToDelete(null);
                    }}
                    className="rounded-lg p-1.5 bg-white/10 hover:bg-white/20 transition-all "
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-5">
                <div className="flex items-center justify-center mb-4">
                  <div className="w-16 h-16 bg-red-100 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-600" />
                  </div>
                </div>

                <h4 className="text-lg font-semibold text-slate-900 text-center mb-2">
                  Are you sure you want to delete this bank account?
                </h4>
                <p className="text-sm text-slate-600 text-center mb-4">
                  This will permanently remove the account and all associated
                  data.
                </p>

                <div className="bg-red-50 border border-red-200 p-4 space-y-2 rounded-xl">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-600 ">
                      Code:
                    </span>
                    <span className="text-xs font-mono font-semibold text-slate-900">
                      {accountToDelete.code}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-600 ">
                      Bank:
                    </span>
                    <span className="text-xs font-semibold text-slate-900">
                      {accountToDelete.bankName}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-600 ">
                      Account:
                    </span>
                    <span className="text-xs font-semibold text-slate-900">
                      {accountToDelete.accountName}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-red-300">
                    <span className="text-xs font-semibold text-slate-600 ">
                      Balance:
                    </span>
                    <span className="text-sm font-semibold text-red-600">
                      {getCurrencySymbol(accountToDelete.currency)}
                      {accountToDelete.balance.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4  bg-slate-50  border-t border-slate-200 flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteAccount(false);
                    setAccountToDelete(null);
                  }}
                  className="rounded-lg flex-1 px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 shadow-sm "
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isSubmitting}
                  className="rounded-lg flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </span>
                  ) : (
                    "Delete"
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction pop-ups — shared with the other ledger screens (TransactionDialogs.tsx) */}
      {showViewTransaction && selectedTransaction && (
        <TransactionDetailsDialog
          txn={selectedTransaction}
          kind="bank"
          accountName={selectedAccount ? `${selectedAccount.bankName} – ${selectedAccount.accountNumber}` : undefined}
          onClose={() => {
            setShowViewTransaction(false);
            setSelectedTransaction(null);
          }}
          onRelated={() => {
            setShowViewTransaction(false);
            setShowRelatedAccount(true);
          }}
        />
      )}

      {showRelatedAccount && selectedTransaction?.relatedAccount && (
        <RelatedAccountDialog
          txn={selectedTransaction}
          kind="bank"
          onClose={() => setShowRelatedAccount(false)}
          onBack={() => {
            setShowRelatedAccount(false);
            setShowViewTransaction(true);
          }}
        />
      )}

      {/* Edit Transaction Modal */}
      <AnimatePresence>
        {showEditTransaction && selectedTransaction && (
          <EditTransactionDialog
            txn={selectedTransaction}
            onClose={() => {
              setShowEditTransaction(false);
              setSelectedTransaction(null);
            }}
            onSaved={async () => {
              // reloads the open statement
              refreshOpenStatement();
            }}
          />
        )}
      </AnimatePresence>

      {showDeleteTransaction && selectedTransaction && (
        <ReverseTransactionDialog
          txn={selectedTransaction}
          kind="bank"
          busy={isSubmitting}
          onClose={() => setShowDeleteTransaction(false)}
          onConfirm={(reason) => confirmDeleteTransaction(reason)}
        />
      )}
    </div>
  );
}
