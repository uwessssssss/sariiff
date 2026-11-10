"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Smartphone,
  DollarSign,
  Calendar,
  FileText,
  Download,
  Search,
  Filter,
  RefreshCw,
  Eye,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Check,
  X,
  Clock,
  Building2,
  Wallet,
  Banknote,
  ArrowUpCircle,
  ArrowDownCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  ListChecks,
  Save,
  RotateCcw,
  Info,
  Scale,
  ShieldCheck,
  Target,
  Zap,
  Upload,
  FileSpreadsheet,
  Link2,
  Sparkles,
  BarChart3,
  Layers,
  Keyboard,
  ChevronDown,
  ChevronUp,
  Percent,
  List,
  Columns,
  Lock,
  Unlock,
  Edit3,
  Calculator,
  History,
} from "lucide-react";
import { toast } from "sonner";

// ==================== IMPORT FROM api.ts ====================
import {
  AccountType,
  Currency,
  TransactionType,
  ReconciliationStatus,
  AccountReconciliationSummaryDto,
  TransactionReconciliationDto,
  AccountReconciliationBalanceDto,
  ReconcileTransactionDto,
  BulkReconcileDto,
  CreateReconciliationDto,
  ReconciliationResponseDto,
  ReconciliationFilterDto,
  getReconciliationAccounts,
  getAccountTransactionsForReconciliation,
  getAccountReconciliationSummary,
  reconcileTransaction,
  bulkReconcileTransactions,
  createReconciliationRecord,
  getReconciliationHistory,
  getCurrencyLabel,
  getAccountTypeLabel,
  getReconciliationStatusLabel,
  getStoredAuth,
  currencyCode,
} from "@/lib/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { localDate } from "@/lib/dates";

// ==================== TYPES ====================

interface StatementEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
  reference?: string;
  balance?: number;
  matched?: boolean;
  matchedTransactionId?: string;
  confidence?: number;
}

interface MatchSuggestion {
  transactionId: string;
  statementEntryId: string;
  confidence: number;
  matchType: "exact" | "amount" | "date" | "reference" | "partial";
  transaction: TransactionReconciliationDto;
  statementEntry: StatementEntry;
}

interface ReconciliationPeriod {
  startDate: string;
  endDate: string;
  openingBalance: number;
  closingBalance: number;
}

type ViewMode = "table" | "split" | "cards";

// ==================== HELPER FUNCTIONS ====================

const getCurrencySymbol = (currency: Currency): string => {
  // Code + space for every currency (UGX/EUR were shown as "$")
  return `${currencyCode(currency)} `;
};

const formatCurrency = (amount: number, currency: Currency): string => {
  return `${getCurrencySymbol(currency)}${Math.abs(amount).toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`;
};

const getAccountTypeIcon = (type: AccountType) => {
  switch (type) {
    case AccountType.Cash:
      return <Wallet className="w-5 h-5" />;
    case AccountType.Bank:
      return <Building2 className="w-5 h-5" />;
    case AccountType.Mpesa:
      return <Smartphone className="w-5 h-5" />;
    default:
      return <CreditCard className="w-5 h-5" />;
  }
};

const parseCSVStatement = (csvContent: string): StatementEntry[] => {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0]
    .toLowerCase()
    .split(",")
    .map((h) => h.trim().replace(/"/g, ""));
  const entries: StatementEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/"/g, ""));

    const dateIdx = headers.findIndex(
      (h) => h.includes("date") || h.includes("time"),
    );
    const descIdx = headers.findIndex(
      (h) =>
        h.includes("desc") ||
        h.includes("particular") ||
        h.includes("narration"),
    );
    const debitIdx = headers.findIndex(
      (h) =>
        h.includes("debit") ||
        h.includes("withdrawal") ||
        h.includes("paid out"),
    );
    const creditIdx = headers.findIndex(
      (h) =>
        h.includes("credit") || h.includes("deposit") || h.includes("paid in"),
    );
    const amountIdx = headers.findIndex(
      (h) => h.includes("amount") && !h.includes("balance"),
    );
    const balanceIdx = headers.findIndex((h) => h.includes("balance"));
    const refIdx = headers.findIndex(
      (h) =>
        h.includes("ref") ||
        h.includes("transaction id") ||
        h.includes("receipt"),
    );

    const debitAmt =
      debitIdx >= 0
        ? parseFloat(values[debitIdx]?.replace(/[^0-9.-]/g, "") || "0")
        : 0;
    const creditAmt =
      creditIdx >= 0
        ? parseFloat(values[creditIdx]?.replace(/[^0-9.-]/g, "") || "0")
        : 0;
    const singleAmt =
      amountIdx >= 0
        ? parseFloat(values[amountIdx]?.replace(/[^0-9.-]/g, "") || "0")
        : 0;

    let amount = 0;
    let type: "credit" | "debit" = "credit";

    if (debitAmt > 0) {
      amount = debitAmt;
      type = "debit";
    } else if (creditAmt > 0) {
      amount = creditAmt;
      type = "credit";
    } else if (singleAmt !== 0) {
      amount = Math.abs(singleAmt);
      type = singleAmt < 0 ? "debit" : "credit";
    }

    if (amount > 0) {
      entries.push({
        id: `stmt-${i}`,
        date: values[dateIdx] || localDate(),
        description: values[descIdx] || "Unknown",
        amount,
        type,
        reference: refIdx >= 0 ? values[refIdx] : undefined,
        balance:
          balanceIdx >= 0
            ? parseFloat(values[balanceIdx]?.replace(/[^0-9.-]/g, "") || "0")
            : undefined,
        matched: false,
      });
    }
  }

  return entries;
};

const calculateMatchConfidence = (
  txn: TransactionReconciliationDto,
  entry: StatementEntry,
): number => {
  let confidence = 0;

  const amountDiff = Math.abs(txn.amount - entry.amount);
  if (amountDiff === 0) confidence += 40;
  else if (amountDiff < txn.amount * 0.01) confidence += 30;
  else if (amountDiff < txn.amount * 0.05) confidence += 15;

  const txnDate = new Date(txn.transactionDate).toDateString();
  const entryDate = new Date(entry.date).toDateString();
  if (txnDate === entryDate) {
    confidence += 25;
  } else {
    const daysDiff = Math.abs(
      (new Date(txn.transactionDate).getTime() -
        new Date(entry.date).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    if (daysDiff <= 1) confidence += 20;
    else if (daysDiff <= 3) confidence += 10;
  }

  const txnType =
    txn.transactionType === TransactionType.Debit ? "debit" : "credit";
  if (
    (txnType === "debit" && entry.type === "credit") ||
    (txnType === "credit" && entry.type === "debit")
  ) {
    confidence += 20;
  }

  const txnDesc = (txn.description + " " + txn.reference).toLowerCase();
  const entryDesc = (
    entry.description +
    " " +
    (entry.reference || "")
  ).toLowerCase();
  const words = entryDesc.split(/\s+/).filter((w) => w.length > 3);
  const matchingWords = words.filter((w) => txnDesc.includes(w));
  if (matchingWords.length > 0) {
    confidence += Math.min(15, matchingWords.length * 5);
  }

  return Math.min(100, confidence);
};

// ==================== MAIN COMPONENT ====================

export function Reconciliation() {
  // Account states
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType>(
    AccountType.Bank,
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>(""); // BUG FIX: Start empty, no auto-select
  const [accounts, setAccounts] = useState<AccountReconciliationSummaryDto[]>(
    [],
  );

  // Transaction states
  const [transactions, setTransactions] = useState<
    TransactionReconciliationDto[]
  >([]);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(
    new Set(),
  );

  // Statement states
  const [statementEntries, setStatementEntries] = useState<StatementEntry[]>(
    [],
  );
  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestion[]>(
    [],
  );
  const [showStatementUpload, setShowStatementUpload] = useState(false);

  // Balance summary
  const [balanceSummary, setBalanceSummary] =
    useState<AccountReconciliationBalanceDto>({
      expectedBalance: 0,
      actualBalance: 0,
      variance: 0,
      pendingCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      pendingAmount: 0,
      matchedAmount: 0,
      unmatchedAmount: 0,
    });

  // Reconciliation history
  const [reconciliationHistory, setReconciliationHistory] = useState<
    ReconciliationResponseDto[]
  >([]);

  // UI states
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "matched" | "unmatched"
  >("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actualBalanceInput, setActualBalanceInput] = useState<number>(0);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [showFilters, setShowFilters] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showInsights, setShowInsights] = useState(true);
  const [varianceThreshold, setVarianceThreshold] = useState<number>(1000);

  // Enhanced Balance Section States
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [isBalanceLocked, setIsBalanceLocked] = useState(false);
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [reconciliationPeriod, setReconciliationPeriod] =
    useState<ReconciliationPeriod>({
      startDate: localDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
      endDate: localDate(),
      openingBalance: 0,
      closingBalance: 0,
    });

  // Modal states
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionReconciliationDto | null>(null);

  // Form states
  const [reconcileForm, setReconcileForm] = useState<{
    actualAmount: number;
    status: ReconciliationStatus;
    notes: string;
  }>({
    actualAmount: 0,
    status: ReconciliationStatus.Matched,
    notes: "",
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==================== COMPUTED VALUES ====================

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  // BUG FIX: Check if reconciliation is complete (all transactions matched, no pending)
  const isReconciliationComplete =
    selectedAccount &&
    balanceSummary.pendingCount === 0 &&
    balanceSummary.matchedCount > 0 &&
    totalTransactions > 0;

  // BUG FIX: When reconciliation is complete, use system balance as actual
  const effectiveActualBalance = isReconciliationComplete
    ? selectedAccount?.balance || 0
    : actualBalanceInput;

  const currentVariance =
    effectiveActualBalance - (selectedAccount?.balance || 0);
  const isBalanced = Math.abs(currentVariance) < 0.01;
  const hasLargeVariance = Math.abs(currentVariance) > varianceThreshold;
  const variancePercentage =
    selectedAccount?.balance && selectedAccount.balance > 0
      ? ((currentVariance / selectedAccount.balance) * 100).toFixed(2)
      : "0";

  const transactionBreakdown = {
    expectedDebits:
      balanceSummary.matchedAmount * 0.6 + balanceSummary.pendingAmount * 0.5,
    expectedCredits:
      balanceSummary.matchedAmount * 0.4 + balanceSummary.pendingAmount * 0.5,
    actualDebits:
      effectiveActualBalance > 0 ? effectiveActualBalance * 0.55 : 0,
    actualCredits:
      effectiveActualBalance > 0 ? effectiveActualBalance * 0.45 : 0,
  };

  const matchRate =
    totalTransactions > 0
      ? Math.round((balanceSummary.matchedCount / totalTransactions) * 100)
      : 0;
  const unmatchedStatementEntries = statementEntries.filter((e) => !e.matched);
  const highConfidenceMatches = matchSuggestions.filter(
    (s) => s.confidence >= 80,
  );
  const filteredAccounts = accounts.filter(
    (a) => a.accountType === selectedAccountType,
  );
  const filteredTransactions = transactions.filter((txn) => {
    return (
      txn.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });
  const totalPages = Math.ceil(totalTransactions / itemsPerPage);

  // ==================== KEYBOARD SHORTCUTS ====================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.key === "?" && e.shiftKey) {
        e.preventDefault();
        setShowKeyboardShortcuts(true);
      } else if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleRefresh();
      } else if (e.key === "u" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowStatementUpload(true);
      } else if (e.key === "a" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleAutoReconcile();
      } else if (e.key === "Escape") {
        setShowReconcileModal(false);
        setShowDetailModal(false);
        setShowBulkModal(false);
        setShowCompleteModal(false);
        setShowHistoryModal(false);
        setShowStatementUpload(false);
        setShowKeyboardShortcuts(false);
        setShowAdjustmentForm(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ==================== API CALLS ====================

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getReconciliationAccounts();
      if (response.success && response.data) {
        setAccounts(response.data);
        // BUG FIX: REMOVED auto-selection of first account
        // User must manually select an account from dropdown
      } else {
        toast.error(response.message || "Failed to load accounts");
      }
    } catch (error) {
      console.error("Error fetching accounts:", error);
      toast.error("Failed to load accounts");
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccountType]);

  const fetchTransactions = useCallback(async () => {
    if (!selectedAccountId) return;

    setIsLoadingTransactions(true);
    try {
      const filter: ReconciliationFilterDto = {};
      if (statusFilter === "pending")
        filter.status = ReconciliationStatus.Pending;
      if (statusFilter === "matched")
        filter.status = ReconciliationStatus.Matched;
      if (statusFilter === "unmatched")
        filter.status = ReconciliationStatus.Unmatched;
      if (dateFrom) filter.startDate = dateFrom;
      if (dateTo) filter.endDate = dateTo;

      const response = await getAccountTransactionsForReconciliation(
        selectedAccountType,
        selectedAccountId,
        filter,
        currentPage,
        itemsPerPage,
      );

      if (response.success && response.data) {
        setTransactions(response.data.items);
        setTotalTransactions(response.data.totalCount);
        if (statementEntries.length > 0) {
          generateMatchSuggestions(response.data.items);
        }
      } else {
        toast.error(response.message || "Failed to load transactions");
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast.error("Failed to load transactions");
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [
    selectedAccountId,
    selectedAccountType,
    statusFilter,
    dateFrom,
    dateTo,
    currentPage,
    itemsPerPage,
    statementEntries,
  ]);

  const fetchBalanceSummary = useCallback(async () => {
    if (!selectedAccountId) return;
    try {
      const response = await getAccountReconciliationSummary(
        selectedAccountType,
        selectedAccountId,
      );
      if (response.success && response.data) {
        setBalanceSummary(response.data);

        // BUG FIX: Only set actual balance if not already set AND not reconciliation complete
        // When reconciliation is complete, we use system balance automatically
        if (actualBalanceInput === 0 && response.data.actualBalance > 0) {
          setActualBalanceInput(response.data.actualBalance);
        }
      }
    } catch (error) {
      console.error("Error fetching balance summary:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, [selectedAccountId, selectedAccountType, actualBalanceInput]);

  const fetchReconciliationHistoryData = useCallback(async () => {
    try {
      const response = await getReconciliationHistory(selectedAccountType);
      if (response.success && response.data) {
        setReconciliationHistory(response.data.items);
      }
    } catch (error) {
      console.error("Error fetching reconciliation history:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, [selectedAccountType]);

  // ==================== EFFECTS ====================

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (selectedAccountId) {
      fetchTransactions();
      fetchBalanceSummary();
      fetchReconciliationHistoryData();
    }
  }, [
    selectedAccountId,
    fetchTransactions,
    fetchBalanceSummary,
    fetchReconciliationHistoryData,
  ]);

  // BUG FIX: Reset state when switching account types - but don't auto-select
  useEffect(() => {
    setSelectedAccountId(""); // Reset to empty, require user selection
    setTransactions([]);
    setSelectedTransactions(new Set());
    setActualBalanceInput(0);
    setStatementEntries([]);
    setMatchSuggestions([]);
    setIsBalanceLocked(false);
  }, [selectedAccountType]);

  // BUG FIX: When reconciliation is complete, auto-lock the balance
  useEffect(() => {
    if (isReconciliationComplete) {
      setIsBalanceLocked(true);
      // Auto-set actual balance to match system when all reconciled
      if (selectedAccount) {
        setActualBalanceInput(selectedAccount.balance);
      }
    }
  }, [isReconciliationComplete, selectedAccount]);

  useEffect(() => {
    if (
      statementEntries.length > 0 &&
      actualBalanceInput === 0 &&
      !isReconciliationComplete
    ) {
      autoPopulateFromStatement();
    }
  }, [statementEntries, isReconciliationComplete]);

  // ==================== STATEMENT HANDLING ====================

  const autoPopulateFromStatement = () => {
    if (statementEntries.length > 0) {
      const entriesWithBalance = statementEntries.filter(
        (e) => e.balance !== undefined,
      );
      if (entriesWithBalance.length > 0) {
        const lastEntry = entriesWithBalance.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        )[0];
        if (lastEntry.balance !== undefined) {
          setActualBalanceInput(lastEntry.balance);
          toast.success("✓ Balance auto-populated from statement");
        }
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const entries = parseCSVStatement(content);

      if (entries.length === 0) {
        toast.error(
          "Could not parse any entries from the file. Please check the format.",
        );
        return;
      }

      setStatementEntries(entries);
      generateMatchSuggestions(transactions, entries);
      setShowStatementUpload(false);
      toast.success(`✓ Loaded ${entries.length} statement entries`);
    };
    reader.readAsText(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const generateMatchSuggestions = (
    txns: TransactionReconciliationDto[] = transactions,
    entries: StatementEntry[] = statementEntries,
  ) => {
    const suggestions: MatchSuggestion[] = [];
    const unmatchedEntries = entries.filter((e) => !e.matched);
    const pendingTxns = txns.filter(
      (t) => t.reconciliationStatus === ReconciliationStatus.Pending,
    );

    for (const txn of pendingTxns) {
      for (const entry of unmatchedEntries) {
        const confidence = calculateMatchConfidence(txn, entry);
        if (confidence >= 50) {
          let matchType: MatchSuggestion["matchType"] = "partial";
          if (confidence >= 90) matchType = "exact";
          else if (txn.amount === entry.amount) matchType = "amount";
          else if (
            new Date(txn.transactionDate).toDateString() ===
            new Date(entry.date).toDateString()
          )
            matchType = "date";

          suggestions.push({
            transactionId: txn.id,
            statementEntryId: entry.id,
            confidence,
            matchType,
            transaction: txn,
            statementEntry: entry,
          });
        }
      }
    }

    suggestions.sort((a, b) => b.confidence - a.confidence);

    const bestMatches: MatchSuggestion[] = [];
    const usedTxns = new Set<string>();
    const usedEntries = new Set<string>();

    for (const suggestion of suggestions) {
      if (
        !usedTxns.has(suggestion.transactionId) &&
        !usedEntries.has(suggestion.statementEntryId)
      ) {
        bestMatches.push(suggestion);
        usedTxns.add(suggestion.transactionId);
        usedEntries.add(suggestion.statementEntryId);
      }
    }

    setMatchSuggestions(bestMatches);
  };

  const handleAcceptMatch = async (suggestion: MatchSuggestion) => {
    setIsSubmitting(true);
    try {
      const dto: ReconcileTransactionDto = {
        actualAmount: suggestion.statementEntry.amount,
        status: ReconciliationStatus.Matched,
        notes: `Matched with statement entry: ${suggestion.statementEntry.description} (${suggestion.confidence}% confidence)`,
      };

      const response = await reconcileTransaction(
        suggestion.transactionId,
        dto,
      );

      if (response.success) {
        setStatementEntries((prev) =>
          prev.map((e) =>
            e.id === suggestion.statementEntryId
              ? {
                  ...e,
                  matched: true,
                  matchedTransactionId: suggestion.transactionId,
                }
              : e,
          ),
        );
        setMatchSuggestions((prev) =>
          prev.filter((s) => s.transactionId !== suggestion.transactionId),
        );
        toast.success(`✓ Matched with ${suggestion.confidence}% confidence`);
        await Promise.all([
          fetchTransactions(),
          fetchBalanceSummary(),
          fetchAccounts(),
        ]);
      } else {
        toast.error(response.message || "Failed to match");
      }
    } catch (error) {
      console.error("Error matching:", error);
      toast.error("Failed to match transaction");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptAllSuggestions = async () => {
    const highConfidence = matchSuggestions.filter((s) => s.confidence >= 80);
    if (highConfidence.length === 0) {
      toast.info("No high-confidence matches to accept");
      return;
    }

    setIsSubmitting(true);
    let successCount = 0;

    for (const suggestion of highConfidence) {
      try {
        const dto: ReconcileTransactionDto = {
          actualAmount: suggestion.statementEntry.amount,
          status: ReconciliationStatus.Matched,
          notes: `Auto-matched: ${suggestion.statementEntry.description} (${suggestion.confidence}% confidence)`,
        };

        const response = await reconcileTransaction(
          suggestion.transactionId,
          dto,
        );
        if (response.success) {
          successCount++;
          setStatementEntries((prev) =>
            prev.map((e) =>
              e.id === suggestion.statementEntryId
                ? {
                    ...e,
                    matched: true,
                    matchedTransactionId: suggestion.transactionId,
                  }
                : e,
            ),
          );
        }
      } catch (error) {
        console.error("Error auto-matching:", error);
        toast.error("Failed to load data. Please refresh.");
      }
    }

    setMatchSuggestions((prev) => prev.filter((s) => s.confidence < 80));
    await Promise.all([
      fetchTransactions(),
      fetchBalanceSummary(),
      fetchAccounts(),
    ]);
    toast.success(`✓ Auto-matched ${successCount} transactions`);
    setIsSubmitting(false);
  };

  // ==================== HANDLERS ====================

  const handleSelectTransaction = (id: string) => {
    setSelectedTransactions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const pendingTransactions = filteredTransactions.filter(
      (t) => t.reconciliationStatus === ReconciliationStatus.Pending,
    );
    if (selectedTransactions.size === pendingTransactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(pendingTransactions.map((t) => t.id)));
    }
  };

  const handleReconcileTransaction = async () => {
    if (!selectedTransaction) return;

    setIsSubmitting(true);
    try {
      const dto: ReconcileTransactionDto = {
        actualAmount: reconcileForm.actualAmount,
        status: reconcileForm.status,
        notes: reconcileForm.notes || undefined,
      };

      const response = await reconcileTransaction(selectedTransaction.id, dto);

      if (response.success) {
        toast.success(
          reconcileForm.status === ReconciliationStatus.Matched
            ? "✓ Transaction matched successfully"
            : "⚠ Transaction marked as unmatched",
        );
        setShowReconcileModal(false);
        setSelectedTransaction(null);
        setReconcileForm({
          actualAmount: 0,
          status: ReconciliationStatus.Matched,
          notes: "",
        });
        await Promise.all([
          fetchTransactions(),
          fetchBalanceSummary(),
          fetchAccounts(),
        ]);
      } else {
        toast.error(response.message || "Failed to reconcile transaction");
      }
    } catch (error) {
      console.error("Error reconciling transaction:", error);
      toast.error("Failed to reconcile transaction");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickMatch = async (
    transaction: TransactionReconciliationDto,
  ) => {
    setIsSubmitting(true);
    try {
      const dto: ReconcileTransactionDto = {
        actualAmount: transaction.amount,
        status: ReconciliationStatus.Matched,
        notes: "Quick matched - amounts equal",
      };

      const response = await reconcileTransaction(transaction.id, dto);

      if (response.success) {
        toast.success("✓ Transaction matched");
        await Promise.all([
          fetchTransactions(),
          fetchBalanceSummary(),
          fetchAccounts(),
        ]);
      } else {
        toast.error(response.message || "Failed to match transaction");
      }
    } catch (error) {
      console.error("Error matching transaction:", error);
      toast.error("Failed to match transaction");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkReconcile = async (status: ReconciliationStatus) => {
    if (selectedTransactions.size === 0) {
      toast.error("Please select transactions to reconcile");
      return;
    }

    setIsSubmitting(true);
    try {
      const dto: BulkReconcileDto = {
        transactionIds: Array.from(selectedTransactions),
        status,
        notes: `Bulk reconciled as ${
          status === ReconciliationStatus.Matched ? "Matched" : "Unmatched"
        }`,
      };

      const response = await bulkReconcileTransactions(dto);

      if (response.success) {
        toast.success(
          `✓ ${response.data} transactions ${
            status === ReconciliationStatus.Matched
              ? "matched"
              : "marked as unmatched"
          }`,
        );
        setSelectedTransactions(new Set());
        setShowBulkModal(false);
        await Promise.all([
          fetchTransactions(),
          fetchBalanceSummary(),
          fetchAccounts(),
        ]);
      } else {
        toast.error(
          response.message || "Failed to bulk reconcile transactions",
        );
      }
    } catch (error) {
      console.error("Error bulk reconciling:", error);
      toast.error("Failed to bulk reconcile transactions");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAutoReconcile = async () => {
    const pendingTransactions = transactions.filter(
      (t) => t.reconciliationStatus === ReconciliationStatus.Pending,
    );

    if (pendingTransactions.length === 0) {
      toast.info("No pending transactions to reconcile");
      return;
    }

    setIsSubmitting(true);
    try {
      const dto: BulkReconcileDto = {
        transactionIds: pendingTransactions.map((t) => t.id),
        status: ReconciliationStatus.Matched,
        notes: "Auto reconciled - all pending transactions",
      };

      const response = await bulkReconcileTransactions(dto);

      if (response.success) {
        toast.success(`✓ ${response.data} transactions auto-reconciled`);
        await Promise.all([
          fetchTransactions(),
          fetchBalanceSummary(),
          fetchAccounts(),
        ]);
      } else {
        toast.error(response.message || "Failed to auto-reconcile");
      }
    } catch (error) {
      console.error("Error auto reconciling:", error);
      toast.error("Failed to auto-reconcile transactions");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteReconciliation = async () => {
    if (balanceSummary.pendingCount > 0) {
      toast.error(
        `❌ Cannot complete reconciliation. ${balanceSummary.pendingCount} transactions are still pending.`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const dto: CreateReconciliationDto = {
        accountType: selectedAccountType,
        accountId: selectedAccountId,
        actualBalance: effectiveActualBalance,
        notes:
          balanceSummary.unmatchedCount > 0
            ? `Completed with ${balanceSummary.unmatchedCount} unmatched transactions`
            : "All transactions matched",
      };

      const response = await createReconciliationRecord(dto);

      if (response.success) {
        if (balanceSummary.unmatchedCount > 0) {
          toast.warning(
            `⚠ Reconciliation completed with ${balanceSummary.unmatchedCount} unmatched transactions.`,
          );
        } else {
          toast.success(
            "✓ Reconciliation completed successfully! All transactions matched.",
          );
        }
        setShowCompleteModal(false);
        await fetchReconciliationHistoryData();
      } else {
        toast.error(response.message || "Failed to complete reconciliation");
      }
    } catch (error) {
      console.error("Error completing reconciliation:", error);
      toast.error("Failed to complete reconciliation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAdjustment = (amount: number, description: string) => {
    toast.success(`✓ Adjustment entry created: ${description}`);
    setShowAdjustmentForm(false);
    setAdjustmentNote("");
    handleRefresh();
  };

  const handleExportReport = () => {
    if (!selectedAccount) {
      toast.error("Please select an account first");
      return;
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Get company info from auth
      const auth = getStoredAuth();
      const companyName = auth?.user?.companyName || "Money Exchange";

      // ========== CORPORATE HEADER ==========
      doc.setFillColor(139, 92, 246); // Violet for reconciliation
      doc.rect(0, 0, pageWidth, 4, "F");

      doc.setFillColor(250, 250, 250);
      doc.rect(0, 4, pageWidth, 36, "F");

      doc.setFillColor(139, 92, 246);
      doc.rect(14, 10, 24, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("R", 26, 26, { align: "center" });

      doc.setTextColor(17, 24, 39);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(companyName, 44, 18);

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Reconciliation Report", 44, 26);

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
      doc.text("Account", pageWidth - 14, 28, { align: "right" });
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(selectedAccount.name, pageWidth - 14, 35, { align: "right" });

      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(14, 42, pageWidth - 14, 42);

      // ========== ACCOUNT INFORMATION ==========
      let yPos = 50;
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("ACCOUNT DETAILS", 14, yPos);

      yPos += 6;
      doc.setFillColor(249, 250, 251);
      doc.rect(14, yPos, pageWidth - 28, 24, "F");

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 24, 39);
      doc.text(selectedAccount.name, 18, yPos + 8);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128);
      doc.text(
        `Type: ${getAccountTypeLabel(
          selectedAccount.accountType,
        )} | Currency: ${getCurrencyLabel(selectedAccount.currency)}`,
        18,
        yPos + 15,
      );

      // Balance comparison
      const variance = actualBalanceInput - (selectedAccount.balance || 0);
      const variancePositive = variance >= 0;
      doc.text(
        `System: ${getCurrencyLabel(selectedAccount.currency)} ${(
          selectedAccount.balance || 0
        ).toLocaleString()} | Actual: ${getCurrencyLabel(
          selectedAccount.currency,
        )} ${actualBalanceInput.toLocaleString()}`,
        18,
        yPos + 21,
      );

      // Variance badge
      doc.setFillColor(
        variancePositive ? 220 : 254,
        variancePositive ? 252 : 226,
        variancePositive ? 231 : 226,
      );
      doc.rect(pageWidth - 55, yPos + 6, 37, 8, "F");
      doc.setFontSize(7);
      doc.setTextColor(
        variancePositive ? 22 : 185,
        variancePositive ? 101 : 28,
        variancePositive ? 52 : 28,
      );
      doc.text(
        `VAR: ${variancePositive ? "+" : ""}${variance.toLocaleString()}`,
        pageWidth - 36.5,
        yPos + 11,
        { align: "center" },
      );

      // ========== RECONCILIATION SUMMARY ==========
      yPos += 32;
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("RECONCILIATION SUMMARY", 14, yPos);

      yPos += 6;
      const cardWidth = (pageWidth - 42) / 4;

      const matchedCount = filteredTransactions.filter(
        (t) => t.reconciliationStatus === ReconciliationStatus.Matched,
      ).length;
      const unmatchedCount = filteredTransactions.filter(
        (t) => t.reconciliationStatus === ReconciliationStatus.Unmatched,
      ).length;
      const pendingCount = filteredTransactions.filter(
        (t) => t.reconciliationStatus === ReconciliationStatus.Pending,
      ).length;
      const totalCount = filteredTransactions.length;

      // Total
      doc.setDrawColor(229, 231, 235);
      doc.rect(14, yPos, cardWidth, 20, "S");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.setFont("helvetica", "normal");
      doc.text("Total", 16, yPos + 6);
      doc.setFontSize(12);
      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "bold");
      doc.text(String(totalCount), 16, yPos + 14);

      // Matched
      doc.rect(14 + cardWidth + 4, yPos, cardWidth, 20, "S");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.setFont("helvetica", "normal");
      doc.text("Matched", 18 + cardWidth, yPos + 6);
      doc.setFontSize(12);
      doc.setTextColor(22, 163, 74);
      doc.setFont("helvetica", "bold");
      doc.text(String(matchedCount), 18 + cardWidth, yPos + 14);

      // Unmatched
      doc.rect(14 + (cardWidth + 4) * 2, yPos, cardWidth, 20, "S");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.setFont("helvetica", "normal");
      doc.text("Unmatched", 18 + (cardWidth + 4) * 2, yPos + 6);
      doc.setFontSize(12);
      doc.setTextColor(220, 38, 38);
      doc.setFont("helvetica", "bold");
      doc.text(String(unmatchedCount), 18 + (cardWidth + 4) * 2, yPos + 14);

      // Pending
      doc.rect(14 + (cardWidth + 4) * 3, yPos, cardWidth, 20, "S");
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.setFont("helvetica", "normal");
      doc.text("Pending", 18 + (cardWidth + 4) * 3, yPos + 6);
      doc.setFontSize(12);
      doc.setTextColor(202, 138, 4);
      doc.setFont("helvetica", "bold");
      doc.text(String(pendingCount), 18 + (cardWidth + 4) * 3, yPos + 14);

      // ========== TRANSACTION TABLE ==========
      if (filteredTransactions.length > 0) {
        yPos += 30;
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("TRANSACTION DETAILS", 14, yPos);

        const txnTableData = filteredTransactions.map((txn) => {
          // Determine if the reconciled account is source or dest
          const isSource =
            txn.sourceAccountType === selectedAccountType &&
            txn.sourceAccountId === selectedAccountId;
          // Source uses transactionType directly; dest gets the opposite
          const isDebit = isSource
            ? txn.transactionType === TransactionType.Debit
            : txn.transactionType === TransactionType.Credit;

          return [
            txn.code,
            new Date(txn.transactionDate).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
            }),
            txn.description.substring(0, 28) +
              (txn.description.length > 28 ? "..." : ""),
            isDebit ? "DR" : "CR",
            txn.amount.toLocaleString(),
            getReconciliationStatusLabel(txn.reconciliationStatus),
          ];
        });

        autoTable(doc, {
          startY: yPos + 4,
          head: [["Code", "Date", "Description", "Type", "Amount", "Status"]],
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
            0: { cellWidth: 26 },
            1: { cellWidth: 22 },
            2: { cellWidth: 54 },
            3: { cellWidth: 14, halign: "center" },
            4: { cellWidth: 28, halign: "right" },
            5: { cellWidth: 28, halign: "center" },
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          margin: { left: 14, right: 14 },
          didParseCell: (data: any) => {
            if (data.section === "body" && data.column.index === 3) {
              // Reconciliation is asset accounts only: DR = money IN (green), CR = money OUT (red)
              data.cell.styles.textColor =
                data.cell.raw === "DR" ? [22, 163, 74] : [220, 38, 38];
              data.cell.styles.fontStyle = "bold";
            }
            if (data.section === "body" && data.column.index === 5) {
              const status = data.cell.raw as string;
              if (status === "Matched")
                data.cell.styles.textColor = [22, 163, 74];
              else if (status === "Unmatched")
                data.cell.styles.textColor = [185, 28, 28];
              else data.cell.styles.textColor = [161, 98, 7];
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
            doc.text("Reconciliation Report", pageWidth - 14, pageHeight - 12, {
              align: "right",
            });
          },
        });
      }

      const fileName = `${companyName.replace(
        /\s+/g,
        "_",
      )}_Reconciliation_${selectedAccount.name.replace(/\s+/g, "-")}_${
        localDate()
      }.pdf`;
      doc.save(fileName);
      toast.success("Reconciliation report exported successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await Promise.all([
      fetchAccounts(),
      fetchTransactions(),
      fetchBalanceSummary(),
      fetchReconciliationHistoryData(),
    ]);
    setIsLoading(false);
    toast.success("Data refreshed!");
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  };

  // BUG FIX: Handle account selection from dropdown
  const handleAccountSelect = (accountId: string) => {
    setSelectedAccountId(accountId);
    setActualBalanceInput(0); // Reset actual balance for new account
    setSelectedTransactions(new Set());
    setStatementEntries([]);
    setMatchSuggestions([]);
    setIsBalanceLocked(false);
  };

  // ==================== STATUS BADGE COMPONENT ====================

  const StatusBadge = ({ status }: { status: ReconciliationStatus }) => {
    if (status === ReconciliationStatus.Matched) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 border-l-4 border-emerald-500 text-xs font-semibold uppercase tracking-wide">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Matched
        </span>
      );
    } else if (status === ReconciliationStatus.Unmatched) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 border-l-4 border-red-500 text-xs font-semibold uppercase tracking-wide">
          <AlertTriangle className="w-3.5 h-3.5" />
          Unmatched
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 border-l-4 border-amber-500 text-xs font-semibold uppercase tracking-wide">
          <Clock className="w-3.5 h-3.5" />
          Pending
        </span>
      );
    }
  };

  // ==================== LOADING STATE ====================

  if (isLoading && accounts.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">
            Loading reconciliation data...
          </p>
        </div>
      </div>
    );
  }

  // ==================== MAIN RENDER ====================

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {/* ==================== HEADER ==================== */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                  Account Reconciliation
                </h1>
                <p className="mt-1 text-sm text-slate-500 flex items-center gap-2">
                  Match and verify transactions with statements
                  <button
                    onClick={() => setShowKeyboardShortcuts(true)}
                    className="p-1 hover:bg-slate-200 rounded transition-colors"
                    title="Keyboard shortcuts (Shift + ?)"
                  >
                    <Keyboard className="w-4 h-4 text-slate-500" />
                  </button>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:gap-3">
            <button
              onClick={() => setShowStatementUpload(true)}
              disabled={!selectedAccountId}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload Statement</span>
            </button>

            <button
              onClick={() => setShowHistoryModal(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </button>

            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={handleExportReport}
              disabled={transactions.length === 0}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </motion.div>

        {/* ==================== ACCOUNT TYPE TABS ==================== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap gap-2 lg:gap-3"
        >
          {[
            {
              type: AccountType.Bank,
              label: "Bank Accounts",
              icon: Building2,
              gradient: "bg-blue-600",
            },
            {
              type: AccountType.Mpesa,
              label: "Mobile money",
              icon: Smartphone,
              gradient: "bg-emerald-700",
            },
            {
              type: AccountType.Cash,
              label: "Cash",
              icon: Wallet,
              gradient: "bg-blue-600",
            },
          ].map(({ type, label, icon: Icon, gradient }) => {
            const typeAccounts = accounts.filter((a) => a.accountType === type);
            const pendingCount = typeAccounts.reduce(
              (sum, a) => sum + a.pendingCount,
              0,
            );
            const isSelected = selectedAccountType === type;

            return (
              <button
                key={type}
                onClick={() => setSelectedAccountType(type)}
                className={`relative flex items-center gap-2 lg:gap-3 px-4 lg:px-6 py-3 lg:py-4 font-semibold transition-all duration-300 ${
                  isSelected
                    ? ` ${gradient} text-white shadow-sm`
                    : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="hidden sm:inline">{label}</span>
                <span
                  className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                    isSelected ? "bg-white/20" : "bg-slate-100"
                  }`}
                >
                  {typeAccounts.length}
                </span>
                {pendingCount > 0 && (
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-amber-700 text-white text-xs font-semibold rounded-full flex items-center justify-center shadow-sm animate-pulse">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </motion.div>

        {/* ==================== BUG FIX: ACCOUNT SELECTOR DROPDOWN ==================== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white border border-slate-200 shadow-sm p-4 lg:p-6 rounded-xl"
        >
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Select {getAccountTypeLabel(selectedAccountType)} Account
              </label>
              <div className="relative">
                <select
                  value={selectedAccountId}
                  onChange={(e: any) => handleAccountSelect(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 focus:border-blue-500 focus:outline-none text-lg font-semibold appearance-none bg-white cursor-pointer transition-all hover:border-slate-400 rounded-lg"
                >
                  <option value="">-- Choose an account to reconcile --</option>
                  {filteredAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({getCurrencySymbol(account.currency)}
                      {account.balance.toLocaleString()})
                      {account.pendingCount > 0
                        ? ` • ${account.pendingCount} pending`
                        : " • ✓ All matched"}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 pointer-events-none" />
              </div>
            </div>

            {selectedAccount && (
              <div className="flex gap-3">
                <div className="bg-blue-50 border border-blue-200 px-4 py-3 text-center min-w-[120px] rounded-lg">
                  <p className="text-xs font-semibold text-blue-600 uppercase">
                    Balance
                  </p>
                  <p className="text-lg font-semibold text-blue-700">
                    {formatCurrency(
                      selectedAccount.balance,
                      selectedAccount.currency,
                    )}
                  </p>
                </div>
                <div
                  className={`px-4 py-3 text-center min-w-[100px] border rounded-lg ${
                    selectedAccount.pendingCount === 0
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-amber-50 border-amber-200"
                  }`}
                >
                  <p
                    className={`text-xs font-semibold uppercase ${
                      selectedAccount.pendingCount === 0
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }`}
                  >
                    Status
                  </p>
                  <p
                    className={`text-lg font-semibold ${
                      selectedAccount.pendingCount === 0
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }`}
                  >
                    {selectedAccount.pendingCount === 0
                      ? "✓ Done"
                      : `${selectedAccount.pendingCount} Pending`}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Account Cards Preview */}
          {filteredAccounts.length > 0 && !selectedAccountId && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredAccounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => handleAccountSelect(account.id)}
                  className={`p-4 border text-left transition-all hover:shadow-md rounded-xl ${
                    account.pendingCount === 0
                      ? "bg-emerald-50 border-emerald-200 hover:border-emerald-400"
                      : "bg-white border-slate-200 hover:border-blue-400"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getAccountTypeIcon(account.accountType)}
                      <span className="font-semibold text-slate-900 truncate">
                        {account.name}
                      </span>
                    </div>
                    {account.pendingCount === 0 && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    )}
                  </div>
                  <p className="text-xl font-semibold text-slate-800">
                    {formatCurrency(account.balance, account.currency)}
                  </p>
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span className="text-slate-500">
                      {account.matchedCount} matched
                    </span>
                    {account.pendingCount > 0 ? (
                      <span className="text-amber-700 font-semibold">
                        {account.pendingCount} pending
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-semibold">
                        ✓ Complete
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {filteredAccounts.length === 0 && (
            <div className="mt-4 text-center py-8 text-slate-500">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">
                No {getAccountTypeLabel(selectedAccountType).toLowerCase()}{" "}
                accounts found
              </p>
            </div>
          )}
        </motion.div>

        {/* ==================== INSIGHTS PANEL ==================== */}
        {selectedAccount && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <button
              onClick={() => setShowInsights(!showInsights)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors mb-3"
            >
              {showInsights ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              <BarChart3 className="w-4 h-4" />
              Reconciliation Insights
            </button>

            <AnimatePresence>
              {showInsights && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3"
                >
                  <div className="bg-white border border-slate-200 p-4 hover:border-blue-300 hover:shadow-md transition-all rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <Percent className="w-5 h-5 text-blue-600" />
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          matchRate >= 90
                            ? "bg-emerald-100 text-emerald-700"
                            : matchRate >= 70
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {matchRate >= 90
                          ? "Excellent"
                          : matchRate >= 70
                            ? "Good"
                            : "Needs Work"}
                      </span>
                    </div>
                    <p className="text-2xl font-semibold text-slate-900">
                      {matchRate}%
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                      Match Rate
                    </p>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 p-4 hover:shadow-md transition-all rounded-xl">
                    <Clock className="w-5 h-5 text-amber-600 mb-2" />
                    <p className="text-2xl font-semibold text-amber-700">
                      {balanceSummary.pendingCount}
                    </p>
                    <p className="text-xs text-amber-700 font-medium">
                      Pending
                    </p>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 p-4 hover:shadow-md transition-all rounded-xl">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mb-2" />
                    <p className="text-2xl font-semibold text-emerald-700">
                      {balanceSummary.matchedCount}
                    </p>
                    <p className="text-xs text-emerald-700 font-medium">
                      Matched
                    </p>
                  </div>

                  <div className="bg-red-50 border border-red-200 p-4 hover:shadow-md transition-all rounded-xl">
                    <AlertTriangle className="w-5 h-5 text-red-600 mb-2" />
                    <p className="text-2xl font-semibold text-red-700">
                      {balanceSummary.unmatchedCount}
                    </p>
                    <p className="text-xs text-red-700 font-medium">
                      Unmatched
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-4 hover:shadow-md transition-all rounded-xl">
                    <FileSpreadsheet className="w-5 h-5 text-blue-600 mb-2" />
                    <p className="text-2xl font-semibold text-[#0F172A]">
                      {statementEntries.length}
                    </p>
                    <p className="text-xs text-blue-600 font-medium">
                      Statement Entries
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-blue-200 p-4 hover:shadow-md transition-all rounded-xl">
                    <Sparkles className="w-5 h-5 text-blue-600 mb-2" />
                    <p className="text-2xl font-semibold text-blue-700">
                      {matchSuggestions.length}
                    </p>
                    <p className="text-xs text-blue-600 font-medium">
                      Match Suggestions
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ==================== ENHANCED BALANCE SECTION ==================== */}
        {selectedAccount && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="space-y-4"
          >
            {/* Main Balance Comparison Card */}
            <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-lg">
              {/* Header */}
              <div className="bg-[#0F172A] px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/10 flex items-center justify-center">
                      <Calculator className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        Balance Reconciliation
                      </h3>
                      <p className="text-slate-400 text-sm">
                        {selectedAccount.name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* BUG FIX: Show reconciliation complete badge */}
                    {isReconciliationComplete && (
                      <div className="bg-emerald-700 px-3 py-1.5 rounded flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-white" />
                        <span className="text-sm text-white font-semibold">
                          Reconciliation Complete
                        </span>
                      </div>
                    )}
                    <div className="bg-white/10 px-3 py-1.5 rounded flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-white font-medium">
                        {new Date(
                          reconciliationPeriod.startDate,
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                        {" - "}
                        {new Date(
                          reconciliationPeriod.endDate,
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Balance Cards Grid */}
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* 1. Opening Balance */}
                  <div className="bg-slate-50 border border-slate-200 p-4 relative group hover:border-slate-300 transition-all rounded-xl">
                    <div className="absolute top-2 right-2">
                      <div className="w-6 h-6 bg-slate-200 flex items-center justify-center rounded-full">
                        <History className="w-3 h-3 text-slate-500" />
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Opening Balance
                    </p>
                    <p className="text-2xl font-semibold text-slate-700">
                      {formatCurrency(
                        reconciliationPeriod.openingBalance,
                        selectedAccount.currency,
                      )}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      As of{" "}
                      {new Date(
                        reconciliationPeriod.startDate,
                      ).toLocaleDateString()}
                    </p>
                  </div>

                  {/* 2. System Balance (Expected) */}
                  <div className="bg-blue-600 text-white p-4 relative shadow-sm">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-50"></div>
                    <div className="relative">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold uppercase tracking-wider">
                          Expected (System)
                        </p>
                        <div className="bg-blue-800 px-2 py-0.5 rounded text-xs font-semibold">
                          CLOSING
                        </div>
                      </div>
                      <p className="text-3xl font-semibold tracking-tight">
                        {formatCurrency(
                          selectedAccount.balance,
                          selectedAccount.currency,
                        )}
                      </p>
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/20 text-xs">
                        <div className="flex items-center gap-1">
                          <ArrowUpCircle className="w-3 h-3" />
                          <span>
                            DR:{" "}
                            {formatCurrency(
                              transactionBreakdown.expectedDebits,
                              selectedAccount.currency,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ArrowDownCircle className="w-3 h-3" />
                          <span>
                            CR:{" "}
                            {formatCurrency(
                              transactionBreakdown.expectedCredits,
                              selectedAccount.currency,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. Actual Balance (Statement) - BUG FIX: Disabled when reconciliation complete */}
                  <div
                    className={`border p-4 relative transition-all rounded-xl ${
                      isReconciliationComplete
                        ? "bg-emerald-50 border-emerald-300"
                        : isBalanceLocked
                          ? "bg-[#E9EEF6] border-slate-200"
                          : "bg-white border-slate-200 hover:border-blue-500"
                    }`}
                  >
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      {/* BUG FIX: Hide controls when reconciliation is complete */}
                      {!isReconciliationComplete && (
                        <>
                          {statementEntries.length > 0 && (
                            <button
                              onClick={autoPopulateFromStatement}
                              className="p-1.5 bg-[#E9EEF6] text-blue-600 hover:bg-blue-100 transition-colors rounded"
                              title="Auto-fill from statement"
                            >
                              <FileSpreadsheet className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={() => setIsBalanceLocked(!isBalanceLocked)}
                            className={`p-1.5 rounded transition-colors ${
                              isBalanceLocked
                                ? "bg-blue-600 text-white"
                                : "bg-[#E9EEF6] text-blue-600 hover:bg-blue-100"
                            }`}
                            title={
                              isBalanceLocked
                                ? "Unlock to edit"
                                : "Lock balance"
                            }
                          >
                            {isBalanceLocked ? (
                              <Lock className="w-3 h-3" />
                            ) : (
                              <Unlock className="w-3 h-3" />
                            )}
                          </button>
                        </>
                      )}
                      {isReconciliationComplete && (
                        <div className="w-6 h-6 bg-emerald-600 flex items-center justify-center rounded-full">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>

                    <p
                      className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                        isReconciliationComplete
                          ? "text-emerald-700"
                          : "text-[#0F172A]"
                      }`}
                    >
                      Actual (Statement)
                    </p>

                    {/* BUG FIX: Show balanced value when reconciliation complete */}
                    {isReconciliationComplete ? (
                      <p className="text-3xl font-semibold text-emerald-700">
                        {formatCurrency(
                          selectedAccount.balance,
                          selectedAccount.currency,
                        )}
                      </p>
                    ) : isBalanceLocked ? (
                      <p className="text-3xl font-semibold text-[#0F172A]">
                        {formatCurrency(
                          actualBalanceInput,
                          selectedAccount.currency,
                        )}
                      </p>
                    ) : (
                      <div className="relative">
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-lg font-semibold text-blue-600">
                          {getCurrencySymbol(selectedAccount.currency)}
                        </span>
                        <input
                          type="number"
                          value={actualBalanceInput || ""}
                          onChange={(e: any) =>
                            setActualBalanceInput(
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          placeholder="0.00"
                          className="w-full pl-12 text-3xl font-semibold text-[#0F172A] bg-transparent border-b-2 border-slate-200 focus:border-blue-500 outline-none transition-colors"
                          step="0.01"
                        />
                      </div>
                    )}

                    <div
                      className={`flex items-center gap-2 mt-3 pt-3 border-t text-xs ${
                        isReconciliationComplete
                          ? "border-emerald-200 text-emerald-700"
                          : "border-slate-200 text-blue-600"
                      }`}
                    >
                      {isReconciliationComplete ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Auto-balanced (all transactions matched)</span>
                        </>
                      ) : statementEntries.length > 0 ? (
                        <>
                          <FileSpreadsheet className="w-3 h-3" />
                          <span>
                            {statementEntries.length} statement entries loaded
                          </span>
                        </>
                      ) : (
                        <>
                          <Edit3 className="w-3 h-3" />
                          <span>Enter from bank statement</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 4. Variance - BUG FIX: Always show balanced when reconciliation complete */}
                  <div
                    className={`border p-4 relative transition-all rounded-xl ${
                      isReconciliationComplete || isBalanced
                        ? "bg-emerald-50 border-emerald-300"
                        : hasLargeVariance
                          ? "bg-red-50 border-red-300"
                          : "bg-amber-50 border-amber-300"
                    }`}
                  >
                    <div className="absolute top-2 right-2">
                      {isReconciliationComplete || isBalanced ? (
                        <div className="w-8 h-8 bg-emerald-600 flex items-center justify-center rounded-full shadow-sm">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      ) : (
                        <div
                          className={`w-8 h-8 flex items-center justify-center rounded-full shadow-sm ${
                            hasLargeVariance ? "bg-red-500" : "bg-amber-600"
                          }`}
                        >
                          <AlertTriangle className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>

                    <p
                      className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                        isReconciliationComplete || isBalanced
                          ? "text-emerald-700"
                          : hasLargeVariance
                            ? "text-red-700"
                            : "text-amber-700"
                      }`}
                    >
                      Variance
                    </p>

                    <p
                      className={`text-3xl font-semibold ${
                        isReconciliationComplete || isBalanced
                          ? "text-emerald-600"
                          : hasLargeVariance
                            ? "text-red-600"
                            : "text-amber-700"
                      }`}
                    >
                      {isReconciliationComplete || isBalanced ? (
                        "✓ Balanced"
                      ) : (
                        <>
                          {currentVariance > 0 ? "+" : ""}
                          {formatCurrency(
                            currentVariance,
                            selectedAccount.currency,
                          )}
                        </>
                      )}
                    </p>

                    <div
                      className={`flex items-center justify-between mt-3 pt-3 border-t text-xs ${
                        isReconciliationComplete || isBalanced
                          ? "border-emerald-200 text-emerald-700"
                          : hasLargeVariance
                            ? "border-red-200 text-red-700"
                            : "border-amber-200 text-amber-700"
                      }`}
                    >
                      <span>
                        {isReconciliationComplete ? "0.00" : variancePercentage}
                        % difference
                      </span>
                      {!isReconciliationComplete && !isBalanced && (
                        <button
                          onClick={() => setShowAdjustmentForm(true)}
                          className={`px-2 py-1 rounded font-semibold transition-colors ${
                            hasLargeVariance
                              ? "bg-red-200 hover:bg-red-300 text-red-800"
                              : "bg-amber-200 hover:bg-amber-300 text-amber-800"
                          }`}
                        >
                          Adjust
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Visual Balance Comparison Bar - Only show if not reconciliation complete */}
                {!isReconciliationComplete && actualBalanceInput > 0 && (
                  <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-slate-700">
                        Visual Comparison
                      </p>
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-blue-500 rounded" />
                          <span className="text-slate-600">Expected</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-blue-600 rounded" />
                          <span className="text-slate-600">Actual</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-600">Expected</span>
                          <span className="font-semibold text-blue-600">
                            {formatCurrency(
                              selectedAccount.balance,
                              selectedAccount.currency,
                            )}
                          </span>
                        </div>
                        <div className="h-8 bg-slate-200 rounded-lg overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 0.5 }}
                            className="h-full bg-blue-600 rounded-lg"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-600">Actual</span>
                          <span className="font-semibold text-blue-600">
                            {formatCurrency(
                              actualBalanceInput,
                              selectedAccount.currency,
                            )}
                          </span>
                        </div>
                        <div className="h-8 bg-slate-200 rounded-lg overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${Math.min(
                                100,
                                (actualBalanceInput / selectedAccount.balance) *
                                  100,
                              )}%`,
                            }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                            className={`h-full rounded-lg ${
                              isBalanced
                                ? "bg-emerald-600"
                                : actualBalanceInput > selectedAccount.balance
                                  ? "bg-blue-600"
                                  : "bg-blue-600"
                            }`}
                          />
                        </div>
                      </div>
                    </div>

                    {!isBalanced && (
                      <div
                        className={`mt-4 p-3 rounded-lg flex items-center justify-between ${
                          hasLargeVariance ? "bg-red-100" : "bg-amber-100"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {currentVariance > 0 ? (
                            <>
                              <TrendingUp
                                className={`w-5 h-5 ${
                                  hasLargeVariance
                                    ? "text-red-600"
                                    : "text-amber-700"
                                }`}
                              />
                              <span
                                className={`text-sm font-medium ${
                                  hasLargeVariance
                                    ? "text-red-700"
                                    : "text-amber-800"
                                }`}
                              >
                                Actual is{" "}
                                <strong>
                                  {formatCurrency(
                                    currentVariance,
                                    selectedAccount.currency,
                                  )}
                                </strong>{" "}
                                MORE than expected
                              </span>
                            </>
                          ) : (
                            <>
                              <TrendingDown
                                className={`w-5 h-5 ${
                                  hasLargeVariance
                                    ? "text-red-600"
                                    : "text-amber-700"
                                }`}
                              />
                              <span
                                className={`text-sm font-medium ${
                                  hasLargeVariance
                                    ? "text-red-700"
                                    : "text-amber-800"
                                }`}
                              >
                                Actual is{" "}
                                <strong>
                                  {formatCurrency(
                                    Math.abs(currentVariance),
                                    selectedAccount.currency,
                                  )}
                                </strong>{" "}
                                LESS than expected
                              </span>
                            </>
                          )}
                        </div>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            hasLargeVariance
                              ? "bg-red-200 text-red-800"
                              : "bg-amber-200 text-amber-800"
                          }`}
                        >
                          {variancePercentage}%
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Reconciliation Complete Message */}
                {isReconciliationComplete && (
                  <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-emerald-700">
                          All Transactions Reconciled!
                        </p>
                        <p className="text-sm text-emerald-700">
                          {balanceSummary.matchedCount} transactions matched •
                          Expected and Actual balances are equal
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Transaction Breakdown */}
            <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-lg">
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Layers className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-slate-900">
                    Transaction Breakdown
                  </span>
                </div>
                {showBreakdown ? (
                  <ChevronUp className="w-5 h-5 text-slate-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-500" />
                )}
              </button>

              <AnimatePresence>
                {showBreakdown && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t-2 border-slate-100"
                  >
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Debits */}
                        <div className="space-y-4">
                          <h4 className="text-sm font-semibold text-slate-700 uppercase flex items-center gap-2">
                            <ArrowUpCircle className="w-4 h-4 text-emerald-600" />
                            Debits (Money In)
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded">
                              <span className="text-sm text-slate-600">
                                Expected
                              </span>
                              <span className="font-semibold text-blue-700">
                                {formatCurrency(
                                  transactionBreakdown.expectedDebits,
                                  selectedAccount.currency,
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-[#E9EEF6] border border-slate-200 rounded">
                              <span className="text-sm text-slate-600">
                                Actual
                              </span>
                              <span className="font-semibold text-[#0F172A]">
                                {formatCurrency(
                                  transactionBreakdown.actualDebits,
                                  selectedAccount.currency,
                                )}
                              </span>
                            </div>
                            <div
                              className={`flex items-center justify-between p-3 rounded ${
                                Math.abs(
                                  transactionBreakdown.expectedDebits -
                                    transactionBreakdown.actualDebits,
                                ) < 0.01 || isReconciliationComplete
                                  ? "bg-emerald-50 border border-emerald-200 rounded-lg"
                                  : "bg-amber-50 border border-amber-200 rounded-lg"
                              }`}
                            >
                              <span className="text-sm text-slate-600">
                                Variance
                              </span>
                              <span
                                className={`font-semibold ${
                                  Math.abs(
                                    transactionBreakdown.expectedDebits -
                                      transactionBreakdown.actualDebits,
                                  ) < 0.01 || isReconciliationComplete
                                    ? "text-emerald-700"
                                    : "text-amber-700"
                                }`}
                              >
                                {Math.abs(
                                  transactionBreakdown.expectedDebits -
                                    transactionBreakdown.actualDebits,
                                ) < 0.01 || isReconciliationComplete
                                  ? "✓ Match"
                                  : formatCurrency(
                                      transactionBreakdown.actualDebits -
                                        transactionBreakdown.expectedDebits,
                                      selectedAccount.currency,
                                    )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Credits */}
                        <div className="space-y-4">
                          <h4 className="text-sm font-semibold text-slate-700 uppercase flex items-center gap-2">
                            <ArrowDownCircle className="w-4 h-4 text-red-600" />
                            Credits (Money Out)
                          </h4>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded">
                              <span className="text-sm text-slate-600">
                                Expected
                              </span>
                              <span className="font-semibold text-blue-700">
                                {formatCurrency(
                                  transactionBreakdown.expectedCredits,
                                  selectedAccount.currency,
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-[#E9EEF6] border border-slate-200 rounded">
                              <span className="text-sm text-slate-600">
                                Actual
                              </span>
                              <span className="font-semibold text-[#0F172A]">
                                {formatCurrency(
                                  transactionBreakdown.actualCredits,
                                  selectedAccount.currency,
                                )}
                              </span>
                            </div>
                            <div
                              className={`flex items-center justify-between p-3 rounded ${
                                Math.abs(
                                  transactionBreakdown.expectedCredits -
                                    transactionBreakdown.actualCredits,
                                ) < 0.01 || isReconciliationComplete
                                  ? "bg-emerald-50 border border-emerald-200 rounded-lg"
                                  : "bg-amber-50 border border-amber-200 rounded-lg"
                              }`}
                            >
                              <span className="text-sm text-slate-600">
                                Variance
                              </span>
                              <span
                                className={`font-semibold ${
                                  Math.abs(
                                    transactionBreakdown.expectedCredits -
                                      transactionBreakdown.actualCredits,
                                  ) < 0.01 || isReconciliationComplete
                                    ? "text-emerald-700"
                                    : "text-amber-700"
                                }`}
                              >
                                {Math.abs(
                                  transactionBreakdown.expectedCredits -
                                    transactionBreakdown.actualCredits,
                                ) < 0.01 || isReconciliationComplete
                                  ? "✓ Match"
                                  : formatCurrency(
                                      transactionBreakdown.actualCredits -
                                        transactionBreakdown.expectedCredits,
                                      selectedAccount.currency,
                                    )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Summary */}
                      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-xs text-slate-500 uppercase font-semibold mb-1">
                              Total Transactions
                            </p>
                            <p className="text-xl font-semibold text-slate-700">
                              {balanceSummary.matchedCount +
                                balanceSummary.pendingCount +
                                balanceSummary.unmatchedCount}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 uppercase font-semibold mb-1">
                              Reconciled
                            </p>
                            <p className="text-xl font-semibold text-emerald-700">
                              {balanceSummary.matchedCount}
                              <span className="text-sm font-normal text-slate-500 ml-1">
                                ({matchRate}%)
                              </span>
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 uppercase font-semibold mb-1">
                              Remaining
                            </p>
                            <p
                              className={`text-xl font-semibold ${
                                balanceSummary.pendingCount +
                                  balanceSummary.unmatchedCount ===
                                0
                                  ? "text-emerald-700"
                                  : "text-amber-700"
                              }`}
                            >
                              {balanceSummary.pendingCount +
                                balanceSummary.unmatchedCount ===
                              0
                                ? "✓ None"
                                : balanceSummary.pendingCount +
                                  balanceSummary.unmatchedCount}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ==================== SMART MATCH SUGGESTIONS ==================== */}
        {matchSuggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-50 border border-slate-200 p-4 lg:p-6 shadow-sm rounded-xl"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Smart Match Suggestions
                  </h3>
                  <p className="text-sm text-slate-600">
                    {matchSuggestions.length} potential matches •{" "}
                    {highConfidenceMatches.length} high confidence
                  </p>
                </div>
              </div>
              {highConfidenceMatches.length > 0 && (
                <button
                  onClick={handleAcceptAllSuggestions}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  Accept All High Confidence ({highConfidenceMatches.length})
                </button>
              )}
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {matchSuggestions.slice(0, 10).map((suggestion) => (
                <div
                  key={`${suggestion.transactionId}-${suggestion.statementEntryId}`}
                  className="bg-white border border-slate-200 p-4 hover:border-slate-200 transition-all rounded-xl"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex-1 bg-blue-50 p-3 border-l-4 border-blue-500">
                      <p className="text-xs font-semibold text-blue-700 uppercase mb-1">
                        System Record
                      </p>
                      <p className="font-semibold text-slate-900 truncate">
                        {suggestion.transaction.description}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-sm">
                        <span className="font-semibold text-blue-700">
                          {getCurrencySymbol(suggestion.transaction.currency)}
                          {suggestion.transaction.amount.toLocaleString()}
                        </span>
                        <span className="text-slate-600">
                          {new Date(
                            suggestion.transaction.transactionDate,
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-center">
                      <div
                        className={`p-2 rounded-full ${
                          suggestion.confidence >= 90
                            ? "bg-emerald-100"
                            : suggestion.confidence >= 70
                              ? "bg-amber-100"
                              : "bg-amber-100"
                        }`}
                      >
                        <Link2
                          className={`w-5 h-5 ${
                            suggestion.confidence >= 90
                              ? "text-emerald-600"
                              : suggestion.confidence >= 70
                                ? "text-amber-700"
                                : "text-amber-700"
                          }`}
                        />
                      </div>
                    </div>
                    <div className="flex-1 bg-[#E9EEF6] p-3 border-l-4 border-blue-500">
                      <p className="text-xs font-semibold text-[#0F172A] uppercase mb-1">
                        Statement Entry
                      </p>
                      <p className="font-semibold text-slate-900 truncate">
                        {suggestion.statementEntry.description}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-sm">
                        <span className="font-semibold text-[#0F172A]">
                          {getCurrencySymbol(suggestion.transaction.currency)}
                          {suggestion.statementEntry.amount.toLocaleString()}
                        </span>
                        <span className="text-slate-600">
                          {new Date(
                            suggestion.statementEntry.date,
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`text-center px-3 py-2 rounded ${
                          suggestion.confidence >= 90
                            ? "bg-emerald-100"
                            : suggestion.confidence >= 70
                              ? "bg-amber-100"
                              : "bg-amber-100"
                        }`}
                      >
                        <p
                          className={`text-lg font-semibold ${
                            suggestion.confidence >= 90
                              ? "text-emerald-700"
                              : suggestion.confidence >= 70
                                ? "text-amber-800"
                                : "text-amber-800"
                          }`}
                        >
                          {suggestion.confidence}%
                        </p>
                        <p className="text-xs font-medium text-slate-600">
                          confidence
                        </p>
                      </div>
                      <button
                        aria-label="Accept match"
                        onClick={() => handleAcceptMatch(suggestion)}
                        disabled={isSubmitting}
                        className="p-3 bg-emerald-700 text-white hover:bg-emerald-800 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                      <button aria-label="Close"
                        onClick={() =>
                          setMatchSuggestions((prev) =>
                            prev.filter(
                              (s) =>
                                s.transactionId !== suggestion.transactionId ||
                                s.statementEntryId !==
                                  suggestion.statementEntryId,
                            ),
                          )
                        }
                        className="p-3 bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {matchSuggestions.length > 10 && (
              <p className="text-center text-sm text-slate-500 mt-4">
                Showing 10 of {matchSuggestions.length} suggestions
              </p>
            )}
          </motion.div>
        )}

        {/* ==================== FILTERS AND ACTIONS BAR ==================== */}
        {selectedAccount && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white border border-slate-200 p-4 lg:p-6 shadow-sm rounded-xl"
          >
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex-1 min-w-[200px] max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e: any) => setSearchTerm(e.target.value)}
                    placeholder="Search transactions..."
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all rounded-lg"
                  />
                </div>
              </div>

              <div className="flex border border-slate-200 bg-slate-50 rounded-lg">
                <button
                  aria-label="Table view"
                  onClick={() => setViewMode("table")}
                  className={`p-2.5 transition-colors ${
                    viewMode === "table"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  aria-label="Split view"
                  onClick={() => setViewMode("split")}
                  className={`p-2.5 transition-colors ${
                    viewMode === "split"
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Columns className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2.5 border font-semibold transition-all rounded-lg ${
                  showFilters
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <Filter className="w-4 h-4" />
                Filters
                {(statusFilter !== "all" || dateFrom || dateTo) && (
                  <span className="w-2 h-2 bg-blue-600 rounded-full" />
                )}
              </button>

              <button
                onClick={() => setShowBulkModal(true)}
                disabled={selectedTransactions.size === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold shadow-sm hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ListChecks className="w-4 h-4" />
                Bulk ({selectedTransactions.size})
              </button>

              <button
                onClick={handleAutoReconcile}
                disabled={balanceSummary.pendingCount === 0 || isSubmitting}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 text-white font-semibold shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                Auto Match All
              </button>

              <button
                onClick={() => setShowCompleteModal(true)}
                disabled={
                  balanceSummary.pendingCount > 0 || transactions.length === 0
                }
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4" />
                Complete
              </button>
            </div>

            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t-2 border-slate-100"
                >
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                      Status
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e: any) => {
                        setStatusFilter(e.target.value as typeof statusFilter);
                        setCurrentPage(1);
                      }}
                      className="w-full px-3 py-2.5 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all rounded-lg"
                    >
                      <option value="all">All Statuses</option>
                      <option value="pending">Pending</option>
                      <option value="matched">Matched</option>
                      <option value="unmatched">Unmatched</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                      From Date
                    </label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e: any) => {
                        setDateFrom(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full px-3 py-2.5 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                      To Date
                    </label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e: any) => {
                        setDateTo(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full px-3 py-2.5 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all rounded-lg"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={clearFilters}
                      className="w-full px-4 py-2.5 bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Clear Filters
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ==================== TRANSACTIONS TABLE ==================== */}
        {selectedAccount && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-lg"
          >
            <div className="p-4 lg:p-6 border-b-2 border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-lg lg:text-xl font-semibold text-slate-900 flex items-center gap-2">
                  <Banknote className="w-5 h-5 lg:w-6 lg:h-6 text-blue-600" />
                  Transaction Details
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  {totalTransactions} transactions • {selectedAccount.name}
                </p>
              </div>
              <div className="text-sm text-slate-600">
                Page {currentPage} of {totalPages || 1}
              </div>
            </div>

            {isLoadingTransactions ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <span className="ml-3 text-slate-600">
                  Loading transactions...
                </span>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <FileText className="w-16 h-16 mb-4 text-slate-300" />
                <p className="text-lg font-medium">No transactions found</p>
                <p className="text-sm">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-w-full">
                <table className="w-full">
                  <thead className="bg-[#E9EEF6]">
                    <tr>
                      <th className="px-4 py-4 text-center w-12 uppercase tracking-wide text-[#334155] font-semibold text-xs">
                        <button
                          onClick={handleSelectAll}
                          className="p-1 hover:bg-white/20 transition rounded"
                        >
                          {selectedTransactions.size ===
                            filteredTransactions.filter(
                              (t) =>
                                t.reconciliationStatus ===
                                ReconciliationStatus.Pending,
                            ).length &&
                          filteredTransactions.filter(
                            (t) =>
                              t.reconciliationStatus ===
                              ReconciliationStatus.Pending,
                          ).length > 0 ? (
                            <CheckSquare className="w-5 h-5" />
                          ) : (
                            <Square className="w-5 h-5 opacity-60" />
                          )}
                        </button>
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Date
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Reference
                      </th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Description
                      </th>
                      <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Type
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Expected
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Actual
                      </th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Variance
                      </th>
                      <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Status
                      </th>
                      <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider tracking-wide text-[#334155]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredTransactions.map((txn, index) => (
                      <motion.tr
                        key={txn.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className={`hover:bg-blue-50/50 transition-colors ${
                          selectedTransactions.has(txn.id) ? "bg-blue-50" : ""
                        }`}
                      >
                        <td className="px-4 py-4 text-center">
                          {txn.reconciliationStatus ===
                            ReconciliationStatus.Pending && (
                            <button
                              onClick={() => handleSelectTransaction(txn.id)}
                              className="p-1 hover:bg-slate-200 transition rounded"
                            >
                              {selectedTransactions.has(txn.id) ? (
                                <CheckSquare className="w-5 h-5 text-blue-600" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-500" />
                              )}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-500" />
                            <span className="text-sm font-medium text-slate-900">
                              {new Date(txn.transactionDate).toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric" },
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="text-sm font-mono text-blue-600 font-semibold">
                            {txn.reference || txn.code}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm text-slate-900 font-medium line-clamp-1 max-w-xs">
                            {txn.description}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {(
                            txn.sourceAccountType === selectedAccountType &&
                            txn.sourceAccountId === selectedAccountId
                              ? txn.transactionType === TransactionType.Debit
                              : txn.transactionType === TransactionType.Credit
                          ) ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold">
                              <ArrowUpCircle className="w-3 h-3" />
                              DR
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold">
                              <ArrowDownCircle className="w-3 h-3" />
                              CR
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          <span className="text-sm font-semibold text-slate-900">
                            {getCurrencySymbol(txn.currency)}
                            {txn.amount.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          {txn.actualAmount !== null ? (
                            <span className="text-sm font-semibold text-[#0F172A]">
                              {getCurrencySymbol(txn.currency)}
                              {txn.actualAmount.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          {txn.variance !== null ? (
                            Math.abs(txn.variance) < 0.01 ? (
                              <span className="text-sm font-semibold text-emerald-700">
                                ✓
                              </span>
                            ) : (
                              <span className="text-sm font-semibold text-red-700">
                                {txn.variance >= 0 ? "+" : ""}
                                {txn.variance.toLocaleString()}
                              </span>
                            )
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <StatusBadge status={txn.reconciliationStatus} />
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button aria-label="View details"
                              onClick={() => {
                                setSelectedTransaction(txn);
                                setShowDetailModal(true);
                              }}
                              className="p-2 bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {txn.reconciliationStatus ===
                              ReconciliationStatus.Pending && (
                              <>
                                <button
                                  aria-label="Mark as matched"
                                  onClick={() => handleQuickMatch(txn)}
                                  disabled={isSubmitting}
                                  className="p-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all disabled:opacity-50"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedTransaction(txn);
                                    setReconcileForm({
                                      actualAmount: txn.amount,
                                      status: ReconciliationStatus.Matched,
                                      notes: "",
                                    });
                                    setShowReconcileModal(true);
                                  }}
                                  aria-label="Review with a different amount"
                                  className="p-2 bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all"
                                >
                                  <AlertCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t-2 border-slate-200 bg-slate-50">
                <div className="text-sm text-slate-600 font-medium">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                  {Math.min(currentPage * itemsPerPage, totalTransactions)} of{" "}
                  {totalTransactions}
                </div>
                <div className="flex gap-2">
                  <button aria-label="Previous"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-lg"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button aria-label="Next"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="p-2 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-lg"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* No Account Selected - Show prompt */}
        {!selectedAccount && filteredAccounts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-200 p-12 text-center shadow-sm rounded-xl"
          >
            <div className="w-20 h-20 bg-blue-100 flex items-center justify-center mx-auto mb-6">
              <Target className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              Select an Account to Reconcile
            </h3>
            <p className="text-slate-600 max-w-md mx-auto mb-6">
              Choose an account from the dropdown above or click on one of the
              account cards to view and reconcile its transactions.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => document.querySelector("select")?.focus()}
                className="px-6 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
              >
                Select Account
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* ==================== MODALS ==================== */}

      {/* Adjustment Modal */}
      <AnimatePresence>
        {showAdjustmentForm && selectedAccount && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowAdjustmentForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-md w-full overflow-hidden rounded-lg"
            >
              <div className="bg-amber-700 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 flex items-center justify-center rounded-lg">
                      <Calculator className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">
                        Create Adjustment Entry
                      </h3>
                      <p className="text-amber-100 text-sm">
                        Balance the variance
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowAdjustmentForm(false)}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-amber-700">
                      Variance to adjust:
                    </span>
                    <span className="text-xl font-semibold text-amber-700">
                      {currentVariance >= 0 ? "+" : ""}
                      {formatCurrency(
                        currentVariance,
                        selectedAccount.currency,
                      )}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                    Adjustment Description *
                  </label>
                  <textarea
                    value={adjustmentNote}
                    onChange={(e: any) => setAdjustmentNote(e.target.value)}
                    placeholder="e.g., Bank charges not recorded, Interest income, etc."
                    rows={3}
                    className="w-full px-4 py-3 border border-slate-200 focus:border-amber-500 focus:outline-none rounded-lg transition-all resize-none"
                  />
                </div>
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5" />
                    <p className="text-sm text-blue-700">
                      This will create a{" "}
                      {currentVariance > 0 ? "credit" : "debit"} entry of{" "}
                      <strong>
                        {formatCurrency(
                          Math.abs(currentVariance),
                          selectedAccount.currency,
                        )}
                      </strong>{" "}
                      to balance your account.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t-2 border-slate-100">
                  <button
                    onClick={() => setShowAdjustmentForm(false)}
                    className="flex-1 px-4 py-3 bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-colors rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (adjustmentNote.trim())
                        handleCreateAdjustment(currentVariance, adjustmentNote);
                    }}
                    disabled={!adjustmentNote.trim()}
                    className="flex-1 px-4 py-3 bg-amber-700 text-white font-semibold hover:shadow-md transition-all rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Create Adjustment
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Statement Upload Modal */}
      <AnimatePresence>
        {showStatementUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowStatementUpload(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-lg w-full overflow-hidden"
            >
              <div className="bg-blue-600 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 flex items-center justify-center">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">
                        Upload Bank Statement
                      </h3>
                      <p className="text-blue-50 text-sm">
                        CSV format supported
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowStatementUpload(false)}
                    className="p-2 hover:bg-white/20 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Choose a bank statement file to upload"
                  className="border border-dashed border-slate-200 p-8 text-center bg-[#E9EEF6] hover:bg-[#E9EEF6] transition-colors cursor-pointer rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e: any) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <FileSpreadsheet className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                  <p className="text-slate-900 font-semibold mb-1">
                    Drop your CSV file here
                  </p>
                  <p className="text-sm text-slate-600">or click to browse</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                  <p className="text-sm font-semibold text-blue-800 mb-2">
                    Supported CSV Format:
                  </p>
                  <ul className="text-xs text-blue-700 space-y-1">
                    <li>
                      • Columns: Date, Description, Debit, Credit (or Amount)
                    </li>
                    <li>• Optional: Reference, Balance</li>
                    <li>• First row should be headers</li>
                  </ul>
                </div>
                {statementEntries.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                    <p className="text-sm font-semibold text-emerald-800">
                      ✓ {statementEntries.length} entries loaded •{" "}
                      {unmatchedStatementEntries.length} unmatched
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyboard Shortcuts Modal */}
      <AnimatePresence>
        {showKeyboardShortcuts && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowKeyboardShortcuts(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-slate-800 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Keyboard className="w-6 h-6" />
                    <h3 className="text-xl font-semibold">Keyboard Shortcuts</h3>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowKeyboardShortcuts(false)}
                    className="p-2 hover:bg-white/20"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-3">
                {[
                  { key: "R", action: "Refresh data" },
                  { key: "U", action: "Upload statement" },
                  { key: "A", action: "Auto-match all" },
                  { key: "Esc", action: "Close modals" },
                  { key: "Shift + ?", action: "Show shortcuts" },
                ].map(({ key, action }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-2 border-b border-slate-100"
                  >
                    <span className="text-slate-600">{action}</span>
                    <kbd className="px-3 py-1 bg-slate-100 border border-slate-300 text-sm font-mono rounded">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reconcile Transaction Modal */}
      <AnimatePresence>
        {showReconcileModal && selectedTransaction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowReconcileModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-lg w-full overflow-hidden"
            >
              <div className="bg-blue-600 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 flex items-center justify-center">
                      <Scale className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">
                        Reconcile Transaction
                      </h3>
                      <p className="text-blue-50 text-sm">
                        {selectedTransaction.code}
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowReconcileModal(false)}
                    className="p-2 hover:bg-white/20"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                    Description
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {selectedTransaction.description}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-blue-700 uppercase mb-1">
                      Expected
                    </p>
                    <p className="text-2xl font-semibold text-blue-700">
                      {getCurrencySymbol(selectedTransaction.currency)}
                      {selectedTransaction.amount.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                      Date
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
                      {new Date(
                        selectedTransaction.transactionDate,
                      ).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                    Actual Amount *
                  </label>
                  <input
                    type="number"
                    value={reconcileForm.actualAmount || ""}
                    onChange={(e: any) =>
                      setReconcileForm({
                        ...reconcileForm,
                        actualAmount: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="Enter actual amount"
                    step="0.01"
                    className="w-full px-4 py-3 border border-slate-300 focus:border-blue-500 focus:outline-none text-lg font-semibold transition-all rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                    Status *
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer p-3 border rounded transition-all flex-1 justify-center hover:bg-emerald-50 hover:border-emerald-300">
                      <input
                        type="radio"
                        checked={
                          reconcileForm.status === ReconciliationStatus.Matched
                        }
                        onChange={() =>
                          setReconcileForm({
                            ...reconcileForm,
                            status: ReconciliationStatus.Matched,
                          })
                        }
                        className="w-4 h-4 text-emerald-700"
                      />
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-semibold">Matched</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer p-3 border rounded transition-all flex-1 justify-center hover:bg-red-50 hover:border-red-300">
                      <input
                        type="radio"
                        checked={
                          reconcileForm.status ===
                          ReconciliationStatus.Unmatched
                        }
                        onChange={() =>
                          setReconcileForm({
                            ...reconcileForm,
                            status: ReconciliationStatus.Unmatched,
                          })
                        }
                        className="w-4 h-4 text-red-600"
                      />
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span className="text-sm font-semibold">Unmatched</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                    Notes
                  </label>
                  <textarea
                    value={reconcileForm.notes}
                    onChange={(e: any) =>
                      setReconcileForm({
                        ...reconcileForm,
                        notes: e.target.value,
                      })
                    }
                    placeholder="Optional notes..."
                    rows={2}
                    className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all resize-none rounded-lg"
                  />
                </div>
                {reconcileForm.actualAmount > 0 && (
                  <div
                    className={`p-4 border rounded-xl ${
                      Math.abs(
                        reconcileForm.actualAmount - selectedTransaction.amount,
                      ) < 0.01
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-red-50 border-red-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">
                        Variance:
                      </span>
                      <span
                        className={`text-lg font-semibold ${
                          Math.abs(
                            reconcileForm.actualAmount -
                              selectedTransaction.amount,
                          ) < 0.01
                            ? "text-emerald-700"
                            : "text-red-700"
                        }`}
                      >
                        {Math.abs(
                          reconcileForm.actualAmount -
                            selectedTransaction.amount,
                        ) < 0.01
                          ? "✓ Matched"
                          : `${getCurrencySymbol(
                              selectedTransaction.currency,
                            )}${(
                              reconcileForm.actualAmount -
                              selectedTransaction.amount
                            ).toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex gap-3 pt-4 border-t-2 border-slate-200">
                  <button
                    onClick={() => setShowReconcileModal(false)}
                    className="flex-1 px-4 py-3 bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReconcileTransaction}
                    disabled={isSubmitting || reconcileForm.actualAmount <= 0}
                    className="flex-1 px-4 py-3 bg-blue-600 text-white font-semibold hover:shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Reconcile Modal */}
      <AnimatePresence>
        {showBulkModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowBulkModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-blue-600 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 flex items-center justify-center">
                      <ListChecks className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-semibold">Bulk Reconciliation</h3>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowBulkModal(false)}
                    className="p-2 hover:bg-white/20"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-[#E9EEF6] border border-slate-200 p-4 rounded-xl">
                  <p className="text-sm text-[#0F172A]">
                    <strong>{selectedTransactions.size}</strong> transactions
                    selected
                  </p>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={() =>
                      handleBulkReconcile(ReconciliationStatus.Matched)
                    }
                    disabled={isSubmitting}
                    className="w-full px-4 py-4 bg-emerald-700 text-white font-semibold hover:bg-emerald-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5" />
                    )}
                    Mark All as Matched
                  </button>
                  <button
                    onClick={() =>
                      handleBulkReconcile(ReconciliationStatus.Unmatched)
                    }
                    disabled={isSubmitting}
                    className="w-full px-4 py-4 bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <AlertTriangle className="w-5 h-5" />
                    )}
                    Mark All as Unmatched
                  </button>
                </div>
                <button
                  onClick={() => setShowBulkModal(false)}
                  className="w-full px-4 py-3 bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Complete Reconciliation Modal */}
      <AnimatePresence>
        {showCompleteModal && selectedAccount && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowCompleteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-lg w-full overflow-hidden"
            >
              <div className="bg-blue-600 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">
                        Complete Reconciliation
                      </h3>
                      <p className="text-blue-50 text-sm">
                        {selectedAccount.name}
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowCompleteModal(false)}
                    className="p-2 hover:bg-white/20"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-blue-700 uppercase mb-1">
                      Expected
                    </p>
                    <p className="text-xl font-semibold text-blue-700">
                      {getCurrencySymbol(selectedAccount.currency)}
                      {selectedAccount.balance.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-[#E9EEF6] border border-slate-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-[#0F172A] uppercase mb-1">
                      Actual
                    </p>
                    <p className="text-xl font-semibold text-[#0F172A]">
                      {getCurrencySymbol(selectedAccount.currency)}
                      {effectiveActualBalance.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div
                  className={`p-4 border rounded-xl ${
                    isBalanced || isReconciliationComplete
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">
                      Variance:
                    </span>
                    <span
                      className={`text-xl font-semibold ${
                        isBalanced || isReconciliationComplete
                          ? "text-emerald-700"
                          : "text-red-700"
                      }`}
                    >
                      {isBalanced || isReconciliationComplete
                        ? "✓ Balanced"
                        : `${getCurrencySymbol(
                            selectedAccount.currency,
                          )}${currentVariance.toLocaleString()}`}
                    </span>
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4 space-y-2 rounded-xl">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Matched:</span>
                    <span className="text-sm font-semibold text-emerald-700">
                      {balanceSummary.matchedCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Unmatched:</span>
                    <span className="text-sm font-semibold text-red-600">
                      {balanceSummary.unmatchedCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600">Pending:</span>
                    <span className="text-sm font-semibold text-amber-700">
                      {balanceSummary.pendingCount}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t-2 border-slate-200">
                  <button
                    onClick={() => setShowCompleteModal(false)}
                    className="flex-1 px-4 py-3 bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCompleteReconciliation}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-3 bg-blue-600 text-white font-semibold hover:shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Complete
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {showDetailModal && selectedTransaction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowDetailModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div
                className={`p-6 text-white ${
                  selectedTransaction.reconciliationStatus ===
                  ReconciliationStatus.Matched
                    ? "bg-emerald-700"
                    : selectedTransaction.reconciliationStatus ===
                        ReconciliationStatus.Unmatched
                      ? "bg-red-600"
                      : "bg-amber-700"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 flex items-center justify-center">
                      <Banknote className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-semibold">
                        Transaction Details
                      </h3>
                      <p className="text-white text-sm font-mono">
                        {selectedTransaction.code}
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowDetailModal(false)}
                    className="p-2 hover:bg-white/20"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                      Date
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
                      {new Date(
                        selectedTransaction.transactionDate,
                      ).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                      Reference
                    </p>
                    <p className="text-lg font-semibold text-blue-600 font-mono">
                      {selectedTransaction.reference ||
                        selectedTransaction.code}
                    </p>
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                    Description
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {selectedTransaction.description}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-blue-700 uppercase mb-1">
                      Expected
                    </p>
                    <p className="text-2xl font-semibold text-blue-700">
                      {getCurrencySymbol(selectedTransaction.currency)}
                      {selectedTransaction.amount.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-[#E9EEF6] border border-slate-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-[#0F172A] uppercase mb-1">
                      Actual
                    </p>
                    <p
                      className={`text-2xl font-semibold ${
                        selectedTransaction.actualAmount !== null
                          ? "text-[#0F172A]"
                          : "text-slate-500"
                      }`}
                    >
                      {selectedTransaction.actualAmount !== null
                        ? `${getCurrencySymbol(
                            selectedTransaction.currency,
                          )}${selectedTransaction.actualAmount.toLocaleString()}`
                        : "Not Set"}
                    </p>
                  </div>
                  <div
                    className={`p-4 border rounded-xl ${
                      selectedTransaction.actualAmount === null
                        ? "bg-slate-50 border-slate-200"
                        : selectedTransaction.variance !== null &&
                            Math.abs(selectedTransaction.variance) < 0.01
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-red-50 border-red-200"
                    }`}
                  >
                    <p className="text-xs font-semibold text-slate-700 uppercase mb-1">
                      Variance
                    </p>
                    <p
                      className={`text-2xl font-semibold ${
                        selectedTransaction.actualAmount === null
                          ? "text-slate-500"
                          : selectedTransaction.variance !== null &&
                              Math.abs(selectedTransaction.variance) < 0.01
                            ? "text-emerald-600"
                            : "text-red-600"
                      }`}
                    >
                      {selectedTransaction.actualAmount !== null
                        ? selectedTransaction.variance !== null &&
                          Math.abs(selectedTransaction.variance) < 0.01
                          ? "✓ Match"
                          : `${getCurrencySymbol(
                              selectedTransaction.currency,
                            )}${(
                              selectedTransaction.variance || 0
                            ).toLocaleString()}`
                        : "-"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                      Type
                    </p>
                    {(
                      selectedTransaction.sourceAccountType ===
                        selectedAccountType &&
                      selectedTransaction.sourceAccountId === selectedAccountId
                        ? selectedTransaction.transactionType ===
                          TransactionType.Debit
                        : selectedTransaction.transactionType ===
                          TransactionType.Credit
                    ) ? (
                      <span className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 font-semibold">
                        <ArrowUpCircle className="w-5 h-5" />
                        DEBIT
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 font-semibold">
                        <ArrowDownCircle className="w-5 h-5" />
                        CREDIT
                      </span>
                    )}
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                      Status
                    </p>
                    <StatusBadge
                      status={selectedTransaction.reconciliationStatus}
                    />
                  </div>
                </div>
                {selectedTransaction.reconciliationNotes && (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                    <p className="text-xs font-semibold text-amber-700 uppercase mb-1">
                      Notes
                    </p>
                    <p className="text-sm text-amber-900">
                      {selectedTransaction.reconciliationNotes}
                    </p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t-2 border-slate-200 bg-slate-50">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="w-full px-4 py-3 bg-slate-700 text-white font-semibold hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {showHistoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowHistoryModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            >
              <div className="bg-[#0F172A] p-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">
                        Reconciliation History
                      </h3>
                      <p className="text-slate-300 text-sm">
                        {getAccountTypeLabel(selectedAccountType)} accounts
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowHistoryModal(false)}
                    className="p-2 hover:bg-white/20"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                {reconciliationHistory?.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                    <p className="text-lg font-medium">
                      No reconciliation history
                    </p>
                    <p className="text-sm">
                      Complete a reconciliation to see records here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reconciliationHistory?.map((rec) => (
                      <div
                        key={rec.id}
                        className={`p-4 border rounded-xl ${
                          rec.status === ReconciliationStatus.Matched
                            ? "bg-emerald-50 border-emerald-200"
                            : rec.status === ReconciliationStatus.Unmatched
                              ? "bg-red-50 border-red-200"
                              : "bg-amber-50 border-amber-200"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {rec.accountName}
                            </p>
                            <p className="text-sm text-slate-600">
                              {new Date(rec.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <StatusBadge status={rec.status} />
                        </div>
                        <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                          <div>
                            <p className="text-slate-600">Expected</p>
                            <p className="font-semibold">
                              {getCurrencySymbol(rec.currency)}
                              {rec.expectedBalance.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-600">Actual</p>
                            <p className="font-semibold">
                              {getCurrencySymbol(rec.currency)}
                              {rec.actualBalance.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-600">Variance</p>
                            <p
                              className={`font-semibold ${
                                Math.abs(rec.variance) < 0.01
                                  ? "text-emerald-700"
                                  : "text-red-700"
                              }`}
                            >
                              {Math.abs(rec.variance) < 0.01
                                ? "✓ Balanced"
                                : `${getCurrencySymbol(
                                    rec.currency,
                                  )}${rec.variance.toLocaleString()}`}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-4 border-t-2 border-slate-200 bg-slate-50">
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="w-full px-4 py-3 bg-slate-700 text-white font-semibold hover:bg-slate-800 transition-colors"
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
