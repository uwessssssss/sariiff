"use client";

import { AccountReconciliationBalanceDto, AccountReconciliationSummaryDto, AccountType, ReconcileTransactionDto, ReconciliationFilterDto, ReconciliationResponseDto, ReconciliationStatus, TransactionReconciliationDto, getAccountReconciliationSummary, getAccountTransactionsForReconciliation, getReconciliationAccounts, getReconciliationHistory, reconcileTransaction } from "@/lib/api";
import { MatchSuggestion, ReconciliationPeriod, StatementEntry, ViewMode, calculateMatchConfidence, parseCSVStatement } from "../helpers";
import { localDate } from "@/lib/dates";
import { toast } from "sonner";
import { useCallback, useRef, useState } from "react";

/** Reconciliation: state (part 1 of 3 of useReconciliation). */
export function useReconciliationState() {
  // Account states
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType>(
    AccountType.Bank,
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
 // BUG FIX: Start empty, no auto-select
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

  return {
    selectedAccountType,
    setSelectedAccountType,
    selectedAccountId,
    setSelectedAccountId,
    accounts,
    setAccounts,
    transactions,
    setTransactions,
    totalTransactions,
    setTotalTransactions,
    selectedTransactions,
    setSelectedTransactions,
    statementEntries,
    setStatementEntries,
    matchSuggestions,
    setMatchSuggestions,
    showStatementUpload,
    setShowStatementUpload,
    balanceSummary,
    setBalanceSummary,
    reconciliationHistory,
    setReconciliationHistory,
    isLoading,
    setIsLoading,
    isLoadingTransactions,
    setIsLoadingTransactions,
    isSubmitting,
    setIsSubmitting,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    actualBalanceInput,
    setActualBalanceInput,
    viewMode,
    setViewMode,
    showFilters,
    setShowFilters,
    showKeyboardShortcuts,
    setShowKeyboardShortcuts,
    showInsights,
    setShowInsights,
    varianceThreshold,
    setVarianceThreshold,
    showBreakdown,
    setShowBreakdown,
    isBalanceLocked,
    setIsBalanceLocked,
    showAdjustmentForm,
    setShowAdjustmentForm,
    adjustmentNote,
    setAdjustmentNote,
    reconciliationPeriod,
    setReconciliationPeriod,
    showReconcileModal,
    setShowReconcileModal,
    showDetailModal,
    setShowDetailModal,
    showBulkModal,
    setShowBulkModal,
    showCompleteModal,
    setShowCompleteModal,
    showHistoryModal,
    setShowHistoryModal,
    selectedTransaction,
    setSelectedTransaction,
    reconcileForm,
    setReconcileForm,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    fileInputRef,
    selectedAccount,
    isReconciliationComplete,
    effectiveActualBalance,
    currentVariance,
    isBalanced,
    hasLargeVariance,
    variancePercentage,
    transactionBreakdown,
    matchRate,
    unmatchedStatementEntries,
    highConfidenceMatches,
    filteredAccounts,
    filteredTransactions,
    totalPages,
    fetchAccounts,
    fetchTransactions,
    fetchBalanceSummary,
    fetchReconciliationHistoryData,
    autoPopulateFromStatement,
    handleFileUpload,
    generateMatchSuggestions,
    handleAcceptMatch,
  };
}
