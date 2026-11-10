"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { buildExchangeMessage } from "@/lib/whatsapp";
import { SuccessShareModal } from "@/components/ui/SuccessShareModal";
import { PinModal, checkPinStatus } from "@/components/ui/PinModal";
import {
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  RefreshCw,
  Plus,
  Minus,
  Eye,
  X,
  Calculator,
  Clock,
  AlertTriangle,
  CheckCircle,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Copy,
  Share2,
  FileText,
  Users,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Settings,
  Download,
  BarChart3,
  PiggyBank,
  Banknote,
  Building2,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import {
  Currency,
  AccountType,
  ExchangeType,
  ExchangeDirection,
  ClientLookupDto,
  ExchangeRateDto,
  ExchangeFloatDto,
  ExchangeResponseDto,
  DailySummaryDto,
  UsdPositionDto,
  FloatAlertDto,
  BankAccountDto,
  MpesaAgentDto,
  CashAccountDto,
  PagedResult,
  // API Functions
  getCurrentExchangeRate,
  setExchangeRate,
  getExchangeRateHistory,
  getExchangeFloat,
  fundExchangeFloat,
  withdrawExchangeFloat,
  settleExchangeProfit,
  getFloatMovements,
  createExchange,
  getExchangeTransactions,
  getExchangeById,
  voidExchange,
  getExchangeTodaySummary,
  getExchangeDailySummaries,
  recordOpeningFloat,
  recordClosingFloat,
  getUsdPosition,
  getExchangeAlerts,
  calculateExchange,
  getClientLookup,
  getBankAccounts,
  getMpesaAgents,
  getCashAccounts,
  formatCurrency,
  formatNumber,
  currencyCode,
  providerLabel,
  type CurrencyCountDto,
  withIdempotencyKey,
  submissionKey,
  newIdempotencyKey,
} from "@/lib/api";
import {
  useBaseCurrency,
  floatCurrenciesFor,
  foreignCurrenciesFor,
} from "@/lib/useBaseCurrency";
import { localDate } from "@/lib/dates";

// ==============================================
// Types
// ==============================================

interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: Currency;
}

// ==============================================
// Helper Functions
// ==============================================

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatTime = (dateString: string) => {
  return new Date(dateString).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateTime = (dateString: string) => {
  return `${formatDate(dateString)} ${formatTime(dateString)}`;
};

// ==============================================
// Main Component
// ==============================================

export function ExchangeSection() {
  // One idempotency session per open form; renewed after each successful save.
  const submitSession = useRef(newIdempotencyKey());
  const { base, baseCode } = useBaseCurrency();
  // Loading states
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Data states
  const [currentRate, setCurrentRate] = useState<ExchangeRateDto | null>(null);
  // Active rate per foreign currency (USD, UGX, EUR) — only those that are set.
  const [ratesByCurrency, setRatesByCurrency] = useState<Record<number, ExchangeRateDto>>({});
  const [rateHistory, setRateHistory] = useState<ExchangeRateDto[]>([]);
  const [exchangeFloat, setExchangeFloat] = useState<ExchangeFloatDto | null>(
    null,
  );
  const [transactions, setTransactions] = useState<ExchangeResponseDto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [todaySummary, setTodaySummary] = useState<DailySummaryDto | null>(
    null,
  );
  const [floatHistory, setFloatHistory] = useState<DailySummaryDto[]>([]);
  const [showFloatHistory, setShowFloatHistory] = useState(false);
  const [usdPosition, setUsdPosition] = useState<UsdPositionDto | null>(null);
  const [alerts, setAlerts] = useState<FloatAlertDto[]>([]);
  const [clients, setClients] = useState<ClientLookupDto[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // UI states
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<
    "today" | "week" | "month" | "all"
  >("today");

  // Modal states
  const [showSetRateModal, setShowSetRateModal] = useState(false);
  const [showNewExchangeModal, setShowNewExchangeModal] = useState(false);
  const [exchShareModal, setExchShareModal] = useState<{
    show: boolean;
    title: string;
    details: { label: string; value: string }[];
    phone: string;
    message: string;
  }>({ show: false, title: "", details: [], phone: "", message: "" });
  const [showPin, setShowPin] = useState(false);
  const [pendingExchange, setPendingExchange] = useState<any>(null);
  const [showFundFloatModal, setShowFundFloatModal] = useState(false);
  const [showWithdrawFloatModal, setShowWithdrawFloatModal] = useState(false);
  const [showSettleProfitModal, setShowSettleProfitModal] = useState(false);
  const [showUsdPositionModal, setShowUsdPositionModal] = useState(false);
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [showDayCloseModal, setShowDayCloseModal] = useState(false);
  const [showRateHistoryModal, setShowRateHistoryModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] =
    useState<ExchangeResponseDto | null>(null);

  // ==============================================
  // Data Loading
  // ==============================================

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load all data in parallel
      const [
        rateRes,
        rateHistoryRes,
        floatRes,
        summaryRes,
        positionRes,
        alertsRes,
        clientsRes,
        bankRes,
        mpesaRes,
        cashRes,
      ] = await Promise.all([
        getCurrentExchangeRate(),
        getExchangeRateHistory(30),
        getExchangeFloat(),
        getExchangeTodaySummary(),
        getUsdPosition(),
        getExchangeAlerts(),
        getClientLookup(),
        getBankAccounts(),
        getMpesaAgents(),
        getCashAccounts(),
      ]);

      if (rateRes.success && rateRes.data) setCurrentRate(rateRes.data);
      // Other foreign rates (UGX/EUR in Kenya, KES/EUR in Uganda) are optional —
      // a currency without a rate just isn't offered.
      const otherForeign = foreignCurrenciesFor(base).filter((c) => c !== Currency.USD);
      const otherRates = await Promise.all(
        otherForeign.map((c) => getCurrentExchangeRate(c).catch(() => null)),
      );
      const nextRates: Record<number, ExchangeRateDto> = {};
      if (rateRes.success && rateRes.data) nextRates[Currency.USD] = rateRes.data;
      otherForeign.forEach((c, i) => {
        const r = otherRates[i];
        if (r && r.success && r.data) nextRates[c] = r.data;
      });
      setRatesByCurrency(nextRates);
      if (rateHistoryRes.success && rateHistoryRes.data)
        setRateHistory(rateHistoryRes.data);
      if (floatRes.success && floatRes.data) setExchangeFloat(floatRes.data);
      if (summaryRes.success && summaryRes.data)
        setTodaySummary(summaryRes.data);
      if (positionRes.success && positionRes.data)
        setUsdPosition(positionRes.data);
      if (alertsRes.success && alertsRes.data) setAlerts(alertsRes.data);
      if (clientsRes.success && clientsRes.data) setClients(clientsRes.data);

      // Build accounts list
      const allAccounts: Account[] = [];
      if (bankRes.success && bankRes.data) {
        bankRes.data.forEach((b) => {
          allAccounts.push({
            id: b.id,
            name: `${b.bankName} - ${b.accountNumber}`,
            type: AccountType.Bank,
            balance: b.balance,
            currency: b.currency,
          });
        });
      }
      if (mpesaRes.success && mpesaRes.data) {
        mpesaRes.data.forEach((m) => {
          allAccounts.push({
            id: m.id,
            name: `${providerLabel(m.provider)} - ${m.agentName}`,
            type: AccountType.Mpesa,
            balance: m.balance,
            currency: m.currency ?? base,
          });
        });
      }
      if (cashRes.success && cashRes.data) {
        cashRes.data.forEach((c) => {
          allAccounts.push({
            id: c.id,
            name: `Cash ${currencyCode(c.currency)}`,
            type: AccountType.Cash,
            balance: c.balance,
            currency: c.currency,
          });
        });
      }
      setAccounts(allAccounts);

      // Load transactions
      await loadTransactions();
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load exchange data");
    } finally {
      setLoading(false);
    }
  }, [base]);

  const loadTransactions = useCallback(async () => {
    try {
      let from: string | undefined;
      let to: string | undefined;
      const now = new Date();

      if (dateFilter === "today") {
        from = localDate(now);
        to = from;
      } else if (dateFilter === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        from = localDate(weekAgo);
        to = localDate(now);
      } else if (dateFilter === "month") {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        from = localDate(monthAgo);
        to = localDate(now);
      }

      const res = await getExchangeTransactions(
        page,
        pageSize,
        searchTerm || undefined,
        undefined,
        from,
        to,
      );
      if (res.success && res.data) {
        setTransactions(res.data.items);
        setTotalCount(res.data.totalCount);
      }
    } catch (error) {
      console.error("Error loading transactions:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, [page, pageSize, searchTerm, dateFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  // ==============================================
  // Handlers
  // ==============================================

  const handleSetRate = async (
    buyRate: number,
    sellRate: number,
    foreignCurrency: number = 1,
  ) => {
    setActionLoading(true);
    try {
      const res = await setExchangeRate({ buyRate, sellRate, foreignCurrency });
      if (res.success && res.data) {
        setCurrentRate(res.data);
        toast.success(
          `${currencyCode(foreignCurrency)} exchange rate updated successfully`,
        );
        setShowSetRateModal(false);
        loadData();
      } else {
        toast.error(res.message || "Failed to set exchange rate");
      }
    } catch (error) {
      toast.error("Failed to set exchange rate");
    } finally {
      setActionLoading(false);
    }
  };

  const handleNewExchange = async (data: {
    clientId?: string;
    clientName?: string;
    exchangeType: ExchangeType;
    direction: ExchangeDirection;
    amount: number;
    foreignCurrency?: Currency;
    clientIdNumber?: string;
    notes?: string;
  }) => {
    setActionLoading(true);
    try {
      // Ensure clientId is properly formatted — send undefined instead of null/empty
      const dto: any = {
        exchangeType: data.exchangeType,
        direction: data.direction,
        amount: data.amount,
        foreignCurrency: data.foreignCurrency ?? Currency.USD,
        clientIdNumber: data.clientIdNumber || undefined,
        notes: data.notes || undefined,
      };

      // Only include clientId if it's a real GUID, otherwise send clientName for walk-ins
      if (data.clientId && data.clientId.length > 10) {
        dto.clientId = data.clientId;
      } else if (data.clientName) {
        dto.clientName = data.clientName;
      }

      // One key per submission: pressing again after a timeout can't record it twice.
      const res = await withIdempotencyKey(submissionKey(submitSession.current, dto), () => createExchange(dto));
      if (res.success && res.data) {
        submitSession.current = newIdempotencyKey();
        const exchCode = res.data.code || "";
        const givenCode = currencyCode(res.data.currencyGiven);
        const receivedCode = currencyCode(res.data.currencyReceived);
        const dirLabel = `${givenCode} → ${receivedCode}`;
        toast.success(`Exchange completed! Code: ${exchCode}`);
        setShowNewExchangeModal(false);
        loadData();

        // WhatsApp share if client was involved
        if (data.clientId && clients.length > 0) {
          const client = clients.find((c) => c.id === data.clientId);
          if (client?.whatsAppNumber) {
            setExchShareModal({
              show: true,
              title: "Exchange Completed",
              details: [
                { label: "Reference", value: exchCode },
                {
                  label: "Client",
                  value: client.fullName || "",
                },
                { label: "Direction", value: dirLabel },
                {
                  label: "Given",
                  value: `${givenCode} ${formatNumber(res.data.amountGiven || data.amount)}`,
                },
                {
                  label: "Received",
                  value: `${receivedCode} ${formatNumber(res.data.amountReceived || 0)}`,
                },
                { label: "Rate", value: String(res.data.exchangeRate || "") },
                {
                  label: "Profit",
                  value: `${baseCode} ${formatNumber(res.data.profit || 0)}`,
                },
              ],
              phone: client.whatsAppNumber,
              message: buildExchangeMessage({
                clientName: client.fullName || "Client",
                direction: dirLabel,
                amountGiven: formatNumber(res.data.amountGiven || data.amount),
                currencyGiven: givenCode,
                amountReceived: formatNumber(res.data.amountReceived || 0),
                currencyReceived: receivedCode,
                rate: String(res.data.exchangeRate || ""),
                code: exchCode,
                date: new Date().toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              }),
            });
          }
        }
      } else {
        toast.error(res.message || "Failed to create exchange");
      }
    } catch (error: any) {
      console.error("Exchange error:", error);
      toast.error(error?.message || "Failed to create exchange");
    } finally {
      setActionLoading(false);
    }
  };

  const handleFundFloat = async (data: {
    currency: Currency;
    amount: number;
    sourceType: AccountType;
    sourceAccountId: string;
    purchaseRate?: number;
    notes?: string;
  }) => {
    setActionLoading(true);
    try {
      const res = await fundExchangeFloat(data);
      if (res.success && res.data) {
        setExchangeFloat(res.data);
        toast.success("Float funded successfully");
        setShowFundFloatModal(false);
        loadData();
      } else {
        toast.error(res.message || "Failed to fund float");
      }
    } catch (error) {
      toast.error("Failed to fund float");
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdrawFloat = async (data: {
    currency: Currency;
    amount: number;
    destinationType: AccountType;
    destinationAccountId: string;
    notes?: string;
  }) => {
    setActionLoading(true);
    try {
      const res = await withdrawExchangeFloat(data);
      if (res.success && res.data) {
        setExchangeFloat(res.data);
        toast.success("Withdrawal successful");
        setShowWithdrawFloatModal(false);
        loadData();
      } else {
        toast.error(res.message || "Failed to withdraw from float");
      }
    } catch (error) {
      toast.error("Failed to withdraw from float");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSettleProfit = async (data: {
    currency: Currency;
    amount: number;
    destinationType: AccountType;
    destinationAccountId: string;
    notes?: string;
  }) => {
    setActionLoading(true);
    try {
      const res = await settleExchangeProfit(data);
      if (res.success && res.data) {
        setExchangeFloat(res.data);
        toast.success("Profit settled successfully");
        setShowSettleProfitModal(false);
        loadData();
      } else {
        toast.error(res.message || "Failed to settle profit");
      }
    } catch (error) {
      toast.error("Failed to settle profit");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordOpening = async (
    kesCount: number,
    usdCount: number,
    notes?: string,
    otherCounts?: CurrencyCountDto[],
  ) => {
    setActionLoading(true);
    try {
      const res = await recordOpeningFloat({ kesCount, usdCount, notes, otherCounts });
      if (res.success) {
        toast.success("Opening float recorded successfully");
        setShowDayCloseModal(false);
        loadData();
      } else {
        toast.error(res.message || "Failed to record opening");
      }
    } catch {
      toast.error("Failed to record opening");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordClosing = async (
    kesCount: number,
    usdCount: number,
    notes?: string,
    otherCounts?: CurrencyCountDto[],
  ) => {
    setActionLoading(true);
    try {
      const res = await recordClosingFloat({ kesCount, usdCount, notes, otherCounts });
      if (res.success && res.data) {
        setTodaySummary(res.data);
        toast.success("Day closed successfully");
        setShowDayCloseModal(false);
        loadData();
      } else {
        toast.error(res.message || "Failed to close day");
      }
    } catch (error) {
      toast.error("Failed to close day");
    } finally {
      setActionLoading(false);
    }
  };

  const handleVoidTransaction = async (id: string, reason: string) => {
    // Check PIN first
    const status = await checkPinStatus();
    if (status.isEnabled && status.hasPin) {
      setPendingVoid({ id, reason });
      setShowPin(true);
      return;
    }
    executeVoid(id, reason);
  };

  const [pendingVoid, setPendingVoid] = useState<{
    id: string;
    reason: string;
  } | null>(null);

  const executeVoid = async (id: string, reason: string) => {
    setActionLoading(true);
    try {
      const res = await voidExchange(id, reason);
      if (res.success) {
        toast.success("Transaction voided");
        setShowTransactionModal(false);
        setSelectedTransaction(null);
        loadData();
      } else {
        toast.error(res.message || "Failed to void transaction");
      }
    } catch (error) {
      toast.error("Failed to void transaction");
    } finally {
      setActionLoading(false);
    }
  };

  // ==============================================
  // Computed Values
  // ==============================================

  const spread = currentRate ? currentRate.sellRate - currentRate.buyRate : 0;
  const marginPercent =
    currentRate && currentRate.buyRate > 0
      ? ((spread / currentRate.buyRate) * 100).toFixed(2)
      : "0";
  const totalPages = Math.ceil(totalCount / pageSize);

  // ==============================================
  // Loading State
  // ==============================================

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading Exchange Account...</p>
        </div>
      </div>
    );
  }

  // ==============================================
  // Render
  // ==============================================

  return (
    <div className="min-w-0">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Exchange
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Buy and sell foreign currency, rates and float
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowCalculatorModal(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Calculator className="w-4 h-4" />
              Calculator
            </button>
            <button
              onClick={() => setShowRateHistoryModal(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <TrendingUp className="w-4 h-4" />
              Rate history
            </button>
            <button
              onClick={async () => {
                const now = new Date();
                const from = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
                const to = localDate(now);
                const res = await getExchangeDailySummaries(from, to);
                if (res.success) setFloatHistory(res.data || []);
                setShowFloatHistory(true);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Calendar className="w-4 h-4" />
              Float history
            </button>
            <button
              onClick={() => setShowDayCloseModal(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Clock className="w-4 h-4" />
              Day close
            </button>
            <button
              onClick={() => setShowNewExchangeModal(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeftRight className="w-4 h-4" />
              New exchange
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((alert, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg"
            >
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Current Rate Card */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <div className="lg:col-span-1  rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <span className="text-blue-50 text-sm font-medium">
              Current Rate
            </span>
            <button aria-label="Settings"
              onClick={() => setShowSetRateModal(true)}
              className="rounded-lg p-1.5 hover:bg-white/10 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
          {currentRate ? (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-blue-50 text-xs mb-1">Buy Rate</p>
                  <p className="text-2xl font-semibold">
                    {currentRate.buyRate.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-blue-50 text-xs mb-1">Sell Rate</p>
                  <p className="text-2xl font-semibold">
                    {currentRate.sellRate.toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-blue-50">
                  Spread: {spread.toFixed(2)}
                </span>
                <span className="bg-blue-800 px-2 py-0.5 text-xs font-medium">
                  {marginPercent}% margin
                </span>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-blue-50 text-sm mb-2">No rate set</p>
              <button
                onClick={() => setShowSetRateModal(true)}
                className="rounded-lg text-white underline text-sm"
              >
                Set Rate
              </button>
            </div>
          )}
        </div>

        {/* Float Balances */}
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-500 text-sm font-medium">{baseCode} Float</span>
            <Wallet className="w-5 h-5 text-gray-500" />
          </div>
          <p className="text-2xl font-semibold text-gray-900 mb-1">
            {formatCurrency(exchangeFloat?.kesBalance || 0, base)}
          </p>
          {exchangeFloat && exchangeFloat.kesBalance < (base === Currency.UGX ? 1400000 : 50000) && (
            <p className="text-xs text-amber-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Low balance
            </p>
          )}
        </div>

        <div
          role="button"
          tabIndex={0}
          className="rounded-xl bg-white border border-gray-200 p-5 cursor-pointer hover:border-blue-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          onClick={() => setShowUsdPositionModal(true)}
          onKeyDown={(e: any) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setShowUsdPositionModal(true);
            }
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-500 text-sm font-medium">
              {(exchangeFloat?.otherBalances || []).length > 0 ? "Foreign float" : "USD Float"}
            </span>
            <DollarSign className="w-5 h-5 text-gray-500" />
          </div>
          <p className="text-2xl font-semibold text-gray-900 mb-1">
            ${formatNumber(exchangeFloat?.usdBalance || 0)}
          </p>
          {usdPosition && (
            <p className="text-xs text-gray-500">
              Avg Cost: {usdPosition.averageCostPerUsd.toFixed(2)} {baseCode}
            </p>
          )}
          {/* Other currencies the float holds (UGX, EUR) — shown only when held */}
          {(exchangeFloat?.otherBalances || []).length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
              {(exchangeFloat?.otherBalances || []).map((b) => (
                <div
                  key={b.currency}
                  className="flex items-baseline justify-between text-sm"
                >
                  <span className="text-gray-500">{b.currencyCode}</span>
                  <span className="font-semibold text-gray-900 tabular-nums">
                    {formatNumber(b.balance)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Today's Stats */}
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-500 text-sm font-medium">Today</span>
            <span
              className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                todaySummary?.isClosed
                  ? "bg-emerald-100 text-emerald-700"
                  : todaySummary?.openingKes
                    ? "bg-amber-100 text-amber-700"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              {todaySummary?.isClosed
                ? "✅ Closed"
                : todaySummary?.openingKes
                  ? "☀️ Open"
                  : "⏳ Not Started"}
            </span>
          </div>
          <p className="text-2xl font-semibold text-emerald-600 mb-1">
            {formatCurrency(todaySummary?.kesProfit || 0, base)}
          </p>
          <p className="text-xs text-gray-500 mb-1">
            {todaySummary?.exchangeCount || 0} exchanges | $
            {formatNumber(todaySummary?.usdProfit || 0)} USD profit
          </p>
          {todaySummary?.kesVariance != null &&
            todaySummary.kesVariance !== 0 && (
              <p className="text-xs text-amber-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Variance: {baseCode} {formatNumber(todaySummary.kesVariance)}
              </p>
            )}
        </div>
      </div>

      {/* Quick Actions & Profit Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <button
          onClick={() => setShowFundFloatModal(true)}
          className="rounded-lg flex items-center gap-3 p-4 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
        >
          <div className="w-10 h-10 bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
            <Plus className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">Fund Float</p>
            <p className="text-xs text-gray-500">Add {baseCode} or foreign currency</p>
          </div>
        </button>

        <button
          onClick={() => setShowWithdrawFloatModal(true)}
          className="rounded-lg flex items-center gap-3 p-4 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
        >
          <div className="w-10 h-10 bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
            <Minus className="w-5 h-5 text-amber-700" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">Withdraw</p>
            <p className="text-xs text-gray-500">Transfer out</p>
          </div>
        </button>

        <button
          onClick={() => setShowSettleProfitModal(true)}
          className="rounded-lg flex items-center gap-3 p-4 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
        >
          <div className="w-10 h-10 bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
            <PiggyBank className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">Settle Profit</p>
            <p className="text-xs text-gray-500">
              {baseCode} {formatNumber(exchangeFloat?.kesProfit || 0)}
            </p>
          </div>
        </button>

        <button
          onClick={() => setShowUsdPositionModal(true)}
          className="rounded-lg flex items-center gap-3 p-4 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
        >
          <div className="w-10 h-10 bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
            <BarChart3 className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">USD Position</p>
            <p className="text-xs text-gray-500">View P&L</p>
          </div>
        </button>
      </div>

      {/* Transactions Table */}
      <div className="rounded-xl bg-white border border-gray-200">
        {/* Table Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Exchange Transactions
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e: any) => setSearchTerm(e.target.value)}
                  className="rounded-lg pl-9 pr-4 py-2 border border-gray-200 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {/* Date Filter */}
              <select
                value={dateFilter}
                onChange={(e: any) => setDateFilter(e.target.value as any)}
                className="rounded-lg px-3 py-2 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="all">All Time</option>
              </select>
              {/* Refresh */}
              <button aria-label="Refresh"
                onClick={loadTransactions}
                className="rounded-lg p-2 hover:bg-gray-100 transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-w-full">
          <table className="w-full">
            <thead className="border-gray-200 bg-[#E9EEF6]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Client
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Given
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Received
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Rate
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Profit
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-gray-500"
                  >
                    No transactions found
                  </td>
                </tr>
              ) : (
                transactions.map((txn) => (
                  <tr
                    key={txn.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      txn.isLargeTransaction ? "bg-amber-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {txn.isLargeTransaction && (
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                        )}
                        {txn.code}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {formatDateTime(txn.date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {txn.clientName}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 text-xs font-medium ${
                          txn.exchangeType === ExchangeType.Cash
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {txn.exchangeType === ExchangeType.Cash
                          ? "Cash"
                          : "Account"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-sm text-right text-emerald-700 font-medium">
                      +{formatCurrency(txn.amountGiven, txn.currencyGiven)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-sm text-right text-red-600 font-medium">
                      -
                      {formatCurrency(txn.amountReceived, txn.currencyReceived)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-sm text-right text-gray-900">
                      {txn.exchangeRate.toFixed(2)}
                    </td>
                    {/* Buys book no profit (average cost): show a dash, not "KES 0". A sale
                        below cost is a loss and shows red. */}
                    <td className={`px-4 py-3 whitespace-nowrap tabular-nums text-sm text-right font-medium ${
                      txn.profit > 0 ? "text-emerald-700" : txn.profit < 0 ? "text-red-600" : "text-slate-500"
                    }`}>
                      {txn.profit ? `${txn.profit > 0 ? "+" : "−"}${formatCurrency(Math.abs(txn.profit), txn.profitCurrency)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button aria-label="View details"
                        onClick={() => {
                          setSelectedTransaction(txn);
                          setShowTransactionModal(true);
                        }}
                        className="rounded-lg p-1 hover:bg-gray-200 transition-colors"
                      >
                        <Eye className="w-4 h-4 text-gray-500" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * pageSize + 1} to{" "}
              {Math.min(page * pageSize, totalCount)} of {totalCount}{" "}
              transactions
            </p>
            <div className="flex items-center gap-2">
              <button aria-label="Previous"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg p-2 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button aria-label="Next"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg p-2 border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {/* Set Rate Modal */}
        {showSetRateModal && (
          <SetRateModal
            currentRate={currentRate}
            onClose={() => setShowSetRateModal(false)}
            onSubmit={handleSetRate}
            loading={actionLoading}
          />
        )}

        {/* New Exchange Modal */}
        {showNewExchangeModal && (
          <NewExchangeModal
            rates={ratesByCurrency}
            clients={clients}
            onClose={() => setShowNewExchangeModal(false)}
            onSubmit={async (data: any) => {
              const status = await checkPinStatus();
              if (status.isEnabled && status.hasPin) {
                setPendingExchange(data);
                setShowPin(true);
              } else {
                handleNewExchange(data);
              }
            }}
            loading={actionLoading}
          />
        )}

        {/* Fund Float Modal */}
        {showFundFloatModal && (
          <FundFloatModal
            accounts={accounts}
            onClose={() => setShowFundFloatModal(false)}
            onSubmit={handleFundFloat}
            loading={actionLoading}
          />
        )}

        {/* Withdraw Float Modal */}
        {showWithdrawFloatModal && (
          <WithdrawFloatModal
            accounts={accounts}
            exchangeFloat={exchangeFloat}
            onClose={() => setShowWithdrawFloatModal(false)}
            onSubmit={handleWithdrawFloat}
            loading={actionLoading}
          />
        )}

        {/* Settle Profit Modal */}
        {showSettleProfitModal && (
          <SettleProfitModal
            accounts={accounts}
            exchangeFloat={exchangeFloat}
            onClose={() => setShowSettleProfitModal(false)}
            onSubmit={handleSettleProfit}
            loading={actionLoading}
          />
        )}

        {/* USD Position Modal */}
        {showUsdPositionModal && usdPosition && (
          <UsdPositionModal
            position={usdPosition}
            onClose={() => setShowUsdPositionModal(false)}
          />
        )}

        {/* Calculator Modal */}
        {showCalculatorModal && Object.keys(ratesByCurrency).length > 0 && (
          <CalculatorModal
            rates={ratesByCurrency}
            onClose={() => setShowCalculatorModal(false)}
          />
        )}

        {/* Float History Modal */}
        {showFloatHistory && (
          <ModalWrapper onClose={() => setShowFloatHistory(false)}>
            <div className="bg-white w-full max-w-2xl">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  📅 Float History — This Month
                </h3>
                <button aria-label="Close"
                  onClick={() => setShowFloatHistory(false)}
                  className="rounded-lg p-1 hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-4 max-h-96 overflow-y-auto">
                {floatHistory.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    No daily records this month. Start by recording an opening
                    float.
                  </p>
                ) : (
                  <div className="overflow-x-auto max-w-full">
                    <table className="w-full text-sm">
                      <thead className="bg-[#E9EEF6]">
                        <tr className="text-left">
                          <th className="py-2 px-2 font-semibold uppercase tracking-wide text-[#334155] text-xs">
                            Date
                          </th>
                          <th className="py-2 px-2 font-semibold text-center uppercase tracking-wide text-[#334155] text-xs">
                            Status
                          </th>
                          <th className="py-2 px-2 font-semibold text-right uppercase tracking-wide text-[#334155] text-xs">
                            Exchanges
                          </th>
                          <th className="py-2 px-2 font-semibold text-emerald-700 text-right uppercase tracking-wide text-[#334155] text-xs">
                            {baseCode} Profit
                          </th>
                          <th className="py-2 px-2 font-semibold text-blue-600 text-right uppercase tracking-wide text-[#334155] text-xs">
                            USD Profit
                          </th>
                          <th className="py-2 px-2 font-semibold text-right uppercase tracking-wide text-[#334155] text-xs">
                            {baseCode} Var
                          </th>
                          <th className="py-2 px-2 font-semibold text-right uppercase tracking-wide text-[#334155] text-xs">
                            USD Var
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {floatHistory.map((day: any, i: number) => (
                          <tr
                            key={i}
                            className={`border-b border-gray-100 ${i === 0 ? "bg-[#E9EEF6]" : ""}`}
                          >
                            <td className="py-2 px-2 text-gray-700 font-medium">
                              {new Date(day.date).toLocaleDateString("en-GB", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              })}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span
                                className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                  day.isClosed
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {day.isClosed ? "Closed" : "Open"}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right text-gray-700">
                              {day.exchangeCount || 0}
                            </td>
                            <td className="py-2 px-2 text-right text-emerald-700 font-medium">
                              {formatNumber(day.kesProfit || 0)}
                            </td>
                            <td className="py-2 px-2 text-right text-blue-700 font-medium">
                              ${formatNumber(day.usdProfit || 0)}
                            </td>
                            <td
                              className={`py-2 px-2 text-right font-medium ${(day.kesVariance || 0) === 0 ? "text-gray-600" : (day.kesVariance || 0) > 0 ? "text-blue-600" : "text-red-700"}`}
                            >
                              {(day.kesVariance || 0) === 0
                                ? "—"
                                : formatNumber(day.kesVariance)}
                            </td>
                            <td
                              className={`py-2 px-2 text-right font-medium ${(day.usdVariance || 0) === 0 ? "text-gray-600" : (day.usdVariance || 0) > 0 ? "text-blue-600" : "text-red-700"}`}
                            >
                              {(day.usdVariance || 0) === 0
                                ? "—"
                                : formatNumber(day.usdVariance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-300 font-semibold bg-gray-50">
                          <td className="py-2 px-2 text-gray-700">Total</td>
                          <td className="py-2 px-2 text-center text-gray-500 text-xs">
                            {floatHistory.filter((d: any) => d.isClosed).length}
                            /{floatHistory.length} closed
                          </td>
                          <td className="py-2 px-2 text-right text-gray-700">
                            {floatHistory.reduce(
                              (s: number, d: any) => s + (d.exchangeCount || 0),
                              0,
                            )}
                          </td>
                          <td className="py-2 px-2 text-right text-emerald-700">
                            {formatNumber(
                              floatHistory.reduce(
                                (s: number, d: any) => s + (d.kesProfit || 0),
                                0,
                              ),
                            )}
                          </td>
                          <td className="py-2 px-2 text-right text-blue-700">
                            $
                            {formatNumber(
                              floatHistory.reduce(
                                (s: number, d: any) => s + (d.usdProfit || 0),
                                0,
                              ),
                            )}
                          </td>
                          <td className="py-2 px-2"></td>
                          <td className="py-2 px-2"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* Rate History Modal */}
        {showRateHistoryModal && (
          <ModalWrapper onClose={() => setShowRateHistoryModal(false)}>
            <div className="bg-white w-full max-w-lg">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Exchange Rate History
                </h3>
                <button aria-label="Close"
                  onClick={() => setShowRateHistoryModal(false)}
                  className="rounded-lg p-1 hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-4 max-h-96 overflow-y-auto">
                {rateHistory.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    No rate history available
                  </p>
                ) : (
                  <div className="overflow-x-auto max-w-full">
                    <table className="w-full text-sm">
                      <thead className="bg-[#E9EEF6]">
                        <tr className="">
                          <th className="text-left py-2 px-2 font-semibold uppercase tracking-wide text-[#334155] text-xs">
                            Date
                          </th>
                          <th className="text-right py-2 px-2 font-semibold text-emerald-700 uppercase tracking-wide text-[#334155] text-xs">
                            Buy Rate
                          </th>
                          <th className="text-right py-2 px-2 font-semibold text-blue-600 uppercase tracking-wide text-[#334155] text-xs">
                            Sell Rate
                          </th>
                          <th className="text-right py-2 px-2 font-semibold text-blue-600 uppercase tracking-wide text-[#334155] text-xs">
                            Spread
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rateHistory.slice(0, 30).map((r: any, i: number) => (
                          <tr
                            key={i}
                            className={`border-b border-gray-100 ${i === 0 ? "bg-blue-50 font-semibold" : ""}`}
                          >
                            <td className="py-2 px-2 text-gray-700">
                              {new Date(
                                r.effectiveFrom || r.createdAt,
                              ).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                              <span className="text-xs text-gray-600 ml-1">
                                {new Date(
                                  r.effectiveFrom || r.createdAt,
                                ).toLocaleTimeString("en-GB", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right text-emerald-700">
                              {(r.buyRate || 0).toFixed(2)}
                            </td>
                            <td className="py-2 px-2 text-right text-blue-700">
                              {(r.sellRate || 0).toFixed(2)}
                            </td>
                            <td className="py-2 px-2 text-right text-blue-700">
                              {((r.sellRate || 0) - (r.buyRate || 0)).toFixed(
                                2,
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* Day Close Modal */}
        {showDayCloseModal && (
          <DayCloseModal
            exchangeFloat={exchangeFloat}
            todaySummary={todaySummary}
            onClose={() => setShowDayCloseModal(false)}
            onOpening={handleRecordOpening}
            onClosing={handleRecordClosing}
            loading={actionLoading}
          />
        )}

        {/* Transaction Detail Modal */}
        {showTransactionModal && selectedTransaction && (
          <TransactionDetailModal
            transaction={selectedTransaction}
            onClose={() => {
              setShowTransactionModal(false);
              setSelectedTransaction(null);
            }}
            onVoid={handleVoidTransaction}
            loading={actionLoading}
          />
        )}
      </AnimatePresence>
      <SuccessShareModal
        isOpen={exchShareModal.show}
        onClose={() => setExchShareModal((s) => ({ ...s, show: false }))}
        title={exchShareModal.title}
        details={exchShareModal.details}
        whatsappPhone={exchShareModal.phone}
        whatsappMessage={exchShareModal.message}
      />
      <PinModal
        isOpen={showPin}
        onClose={() => {
          setShowPin(false);
          setPendingExchange(null);
        }}
        onVerified={() => {
          setShowPin(false);
          if (pendingVoid) {
            executeVoid(pendingVoid.id, pendingVoid.reason);
            setPendingVoid(null);
          } else if (pendingExchange) {
            handleNewExchange(pendingExchange);
            setPendingExchange(null);
          }
        }}
        title="Enter Transaction PIN"
      />
    </div>
  );
}

// ==============================================
// Modal Components
// ==============================================

// Set Rate Modal
function SetRateModal({
  currentRate,
  onClose,
  onSubmit,
  loading,
}: {
  currentRate: ExchangeRateDto | null;
  onClose: () => void;
  onSubmit: (buyRate: number, sellRate: number, foreignCurrency: number) => void;
  loading: boolean;
}) {
  // Which foreign currency this rate quotes against the home currency
  // (rates are "home per 1 foreign"), so the home currency isn't an option.
  const { base, baseCode } = useBaseCurrency();
  const FOREIGN_CURRENCIES = foreignTradeCurrencies(base);
  const [foreignCurrency, setForeignCurrency] = useState(1); // default USD
  const activeCode =
    FOREIGN_CURRENCIES.find((c) => c.value === foreignCurrency)?.code || "USD";

  const [buyRate, setBuyRate] = useState(
    currentRate?.buyRate?.toString() || "130",
  );
  const [sellRate, setSellRate] = useState(
    currentRate?.sellRate?.toString() || "140",
  );

  const spread = parseFloat(sellRate || "0") - parseFloat(buyRate || "0");
  const isValid =
    parseFloat(buyRate) > 0 && parseFloat(sellRate) > parseFloat(buyRate);

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Set Exchange Rate
          </h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency (vs {baseCode})
            </label>
            <div className="grid grid-cols-3 gap-2">
              {FOREIGN_CURRENCIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForeignCurrency(c.value)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold border transition-colors ${
                    foreignCurrency === c.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  {c.code}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Each currency keeps its own independent rate.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buy Rate ({baseCode} per {activeCode})
            </label>
            <input
              type="number"
              step="0.01"
              value={buyRate}
              onChange={(e: any) => setBuyRate(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="130.00"
            />
            <p className="text-xs text-gray-500 mt-1">
              Rate when client sells {activeCode} to you
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sell Rate ({baseCode} per {activeCode})
            </label>
            <input
              type="number"
              step="0.01"
              value={sellRate}
              onChange={(e: any) => setSellRate(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="140.00"
            />
            <p className="text-xs text-gray-500 mt-1">
              Rate when client buys {activeCode} from you
            </p>
          </div>
          {spread > 0 && (
            <div className="bg-blue-50 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Spread:</span>
                <span className="font-semibold text-blue-700">
                  {spread.toFixed(2)} {baseCode}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Your profit per {activeCode} exchanged
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit(parseFloat(buyRate), parseFloat(sellRate), foreignCurrency)
            }
            disabled={!isValid || loading}
            className="rounded-lg px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Set Rate
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// UPDATED: New Exchange Modal - supports walk-in clients for Cash type
// Every currency the float can hold, home currency first.
const allFloatCurrencies = (base: number) =>
  floatCurrenciesFor(base).map((v) => ({ value: v, code: currencyCode(v) }));

// Float balance in any currency. kesBalance holds the company's BASE currency
// (KES in Kenya, UGX in Uganda — the field name is historical), USD has its own
// field, everything else comes from otherBalances.
const floatBalanceOf = (f: ExchangeFloatDto | null, c: number, base: number): number =>
  !f
    ? 0
    : c === base
      ? f.kesBalance
      : c === Currency.USD
        ? f.usdBalance
        : (f.otherBalances || []).find((b) => b.currency === c)?.balance || 0;

// Currencies that trade against the home currency. Each needs its own active rate.
const foreignTradeCurrencies = (base: number) =>
  foreignCurrenciesFor(base).map((v) => ({ value: v, code: currencyCode(v) }));

// UGX trades at ~0.03 KES (and KES at ~28 UGX), so small rates need more decimals.
const formatRate = (r: number) => (r < 1 ? r.toFixed(4) : r.toFixed(2));

function NewExchangeModal({
  rates,
  clients,
  onClose,
  onSubmit,
  loading,
}: {
  rates: Record<number, ExchangeRateDto>;
  clients: ClientLookupDto[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const { base, baseCode } = useBaseCurrency();
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState(""); // NEW: For walk-in clients
  const [exchangeType, setExchangeType] = useState<ExchangeType>(
    ExchangeType.Cash,
  );
  const [direction, setDirection] = useState<ExchangeDirection>(
    ExchangeDirection.UsdToKes,
  );
  // Foreign side of the trade — only currencies with an active rate are offered.
  const rateCurrencies = foreignTradeCurrencies(base).filter((c) => rates[c.value]);
  const [foreignCurrency, setForeignCurrency] = useState<number>(
    rateCurrencies[0]?.value ?? Currency.USD,
  );
  const fx = foreignTradeCurrencies(base).find((c) => c.value === foreignCurrency)?.code ?? "USD";
  const currentRate = rates[foreignCurrency] ?? null;
  const [amount, setAmount] = useState("");
  const [clientIdNumber, setClientIdNumber] = useState("");
  const [notes, setNotes] = useState("");

  const selectedClient = clients.find((c) => c.id === clientId);
  const rate =
    direction === ExchangeDirection.UsdToKes
      ? currentRate?.buyRate
      : currentRate?.sellRate;
  const spread = currentRate ? currentRate.sellRate - currentRate.buyRate : 0;

  const amountNum = parseFloat(amount) || 0;
  // Mirrors the server: 2dp, half away from zero.
  const receivedAmount =
    Math.round(
      (direction === ExchangeDirection.UsdToKes
        ? amountNum * (rate || 0)
        : amountNum / (rate || 1)) * 100,
    ) / 100;
  const profit =
    direction === ExchangeDirection.UsdToKes
      ? spread * amountNum
      : spread * receivedAmount;

  // UPDATED: Validation logic - Cash can use clientName, Account requires clientId
  const isValid =
    (exchangeType === ExchangeType.Cash
      ? clientId || clientName.trim()
      : clientId) &&
    amountNum > 0 &&
    currentRate;

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">New Exchange</h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* Exchange Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Exchange Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setExchangeType(ExchangeType.Cash);
                  // Don't clear clientId - user might want to select existing client
                }}
                className={`rounded-lg px-4 py-2 border text-sm font-medium ${
                  exchangeType === ExchangeType.Cash
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Banknote className="w-4 h-4 inline mr-2" />
                Cash
              </button>
              <button
                type="button"
                onClick={() => {
                  setExchangeType(ExchangeType.FromAccount);
                  setClientName(""); // Clear clientName when switching to Account
                }}
                className={`rounded-lg px-4 py-2 border text-sm font-medium ${
                  exchangeType === ExchangeType.FromAccount
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Users className="w-4 h-4 inline mr-2" />
                From Account
              </button>
            </div>
          </div>

          {/* Client Selection - UPDATED */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client{" "}
              {exchangeType === ExchangeType.FromAccount && (
                <span className="text-red-600">*</span>
              )}
              {exchangeType === ExchangeType.Cash && (
                <span className="text-gray-500 text-xs ml-1">(Optional)</span>
              )}
            </label>
            <select
              value={clientId}
              onChange={(e: any) => {
                setClientId(e.target.value);
                const c = clients.find((cl) => cl.id === e.target.value);
                if (c?.idPassport) setClientIdNumber(c.idPassport);
                if (e.target.value) setClientName(""); // Clear clientName if selecting a client
              }}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">
                {exchangeType === ExchangeType.Cash
                  ? "Select client or enter name below..."
                  : "Select client..."}
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {/* NEW: Walk-in Client Name - Only for Cash when no client selected */}
          {exchangeType === ExchangeType.Cash && !clientId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e: any) => setClientName(e.target.value)}
                className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter walk-in client name"
              />
              <p className="text-xs text-gray-500 mt-1">
                Required for walk-in cash customers without an account
              </p>
            </div>
          )}

          {/* Currency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            <div className="grid grid-cols-3 gap-2">
              {foreignTradeCurrencies(base).map((c) => {
                const has = !!rates[c.value];
                return (
                  <button
                    key={c.value}
                    type="button"
                    disabled={!has}
                    title={has ? undefined : `Set a ${c.code} rate first`}
                    onClick={() => setForeignCurrency(c.value)}
                    className={`rounded-lg px-3 py-2 border text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                      foreignCurrency === c.value
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {c.code}
                  </button>
                );
              })}
            </div>
            {rateCurrencies.length === 0 && (
              <p className="text-xs text-red-600 mt-1">
                No exchange rate is set. Set a rate before trading.
              </p>
            )}
          </div>

          {/* Direction */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Direction
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection(ExchangeDirection.UsdToKes)}
                className={`rounded-lg px-4 py-2 border text-sm font-medium ${
                  direction === ExchangeDirection.UsdToKes
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {fx} → {baseCode}
              </button>
              <button
                type="button"
                onClick={() => setDirection(ExchangeDirection.KesToUsd)}
                className={`rounded-lg px-4 py-2 border text-sm font-medium ${
                  direction === ExchangeDirection.KesToUsd
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {baseCode} → {fx}
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount the client gives (
              {direction === ExchangeDirection.UsdToKes ? fx : baseCode})
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e: any) => setAmount(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>

          {/* ID Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client ID Number
            </label>
            <input
              type="text"
              value={clientIdNumber}
              onChange={(e: any) => setClientIdNumber(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ID/Passport number"
            />
          </div>

          {/* Calculation Preview */}
          {amountNum > 0 && rate && (
            <div className="bg-gray-50 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Rate:</span>
                <span className="font-medium">{formatRate(rate)} {baseCode} per {fx}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Client Receives:</span>
                <span className="font-semibold text-emerald-700">
                  {direction === ExchangeDirection.UsdToKes
                    ? `${baseCode} ${formatNumber(receivedAmount)}`
                    : `${fx} ${formatNumber(receivedAmount)}`}
                </span>
              </div>
              <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-2">
                <span className="text-gray-600">Your Profit:</span>
                <span className="font-semibold text-blue-600">
                  {baseCode} {formatNumber(profit)}
                </span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e: any) => setNotes(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="Additional notes..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                clientId: clientId || undefined,
                clientName:
                  !clientId && exchangeType === ExchangeType.Cash
                    ? clientName.trim()
                    : undefined,
                exchangeType,
                direction,
                foreignCurrency,
                amount: amountNum,
                clientIdNumber: clientIdNumber || undefined,
                notes: notes || undefined,
              })
            }
            disabled={!isValid || loading}
            className="rounded-lg px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Complete Exchange
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// Fund Float Modal
function FundFloatModal({
  accounts,
  onClose,
  onSubmit,
  loading,
}: {
  accounts: Account[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const { base, baseCode } = useBaseCurrency();
  const [currency, setCurrency] = useState<Currency>(base);
  const [amount, setAmount] = useState("");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [purchaseRate, setPurchaseRate] = useState("");
  const [notes, setNotes] = useState("");

  // Funding always pays in the home currency (foreign float is bought with it at the
  // purchase rate), so the source account must hold the home currency.
  const filteredAccounts = accounts.filter((a) => a.currency === base);
  const selectedAccount = accounts.find((a) => a.id === sourceAccountId);

  const amountNum = parseFloat(amount) || 0;
  const deductAmount =
    currency !== base && purchaseRate
      ? amountNum * parseFloat(purchaseRate)
      : amountNum;

  const isValid =
    amountNum > 0 &&
    sourceAccountId &&
    (currency === base || purchaseRate);

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Fund Float</h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            <div className="grid grid-cols-4 gap-2">
              {allFloatCurrencies(base).map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCurrency(c.value as Currency)}
                  className={`rounded-lg px-3 py-2 border text-sm font-medium ${
                    currency === c.value
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {c.code}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e: any) => setAmount(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>

          {currency !== base && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Purchase Rate
              </label>
              <input
                type="number"
                step="any"
                value={purchaseRate}
                onChange={(e: any) => setPurchaseRate(e.target.value)}
                className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`${baseCode} paid per 1 ${currencyCode(currency)}`}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source Account
            </label>
            <select
              value={sourceAccountId}
              onChange={(e: any) => setSourceAccountId(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select source...</option>
              {filteredAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} - {formatCurrency(a.balance, a.currency)}
                </option>
              ))}
            </select>
          </div>

          {amountNum > 0 && selectedAccount && (
            <div className="bg-gray-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Will deduct:</span>
                <span className="font-medium">
                  {baseCode} {formatNumber(deductAmount)}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e: any) => setNotes(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional notes"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                currency,
                amount: amountNum,
                sourceType: selectedAccount?.type,
                sourceAccountId,
                purchaseRate:
                  currency !== base
                    ? parseFloat(purchaseRate)
                    : undefined,
                notes: notes || undefined,
              })
            }
            disabled={!isValid || loading}
            className="rounded-lg px-4 py-2 bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Fund Float
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// Withdraw Float Modal
function WithdrawFloatModal({
  accounts,
  exchangeFloat,
  onClose,
  onSubmit,
  loading,
}: {
  accounts: Account[];
  exchangeFloat: ExchangeFloatDto | null;
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const { base, baseCode } = useBaseCurrency();
  const [currency, setCurrency] = useState<Currency>(base);
  const [amount, setAmount] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [notes, setNotes] = useState("");

  const availableBalance = floatBalanceOf(exchangeFloat, currency, base);

  // FIXED: Only allow accounts that match the withdrawal currency
  // This prevents currency mismatch issues
  const filteredAccounts = accounts.filter((a) => a.currency === currency);

  const selectedAccount = accounts.find((a) => a.id === destinationAccountId);

  // Reset destination when currency changes (to avoid mismatched selection)
  useEffect(() => {
    setDestinationAccountId("");
  }, [currency]);

  const amountNum = parseFloat(amount) || 0;

  // FIXED: Enhanced validation
  const isValid =
    amountNum > 0 &&
    amountNum <= availableBalance &&
    destinationAccountId &&
    selectedAccount &&
    selectedAccount.currency === currency; // Ensure currency match

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Withdraw from Float
          </h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            <div className="grid grid-cols-4 gap-2">
              {allFloatCurrencies(base).map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCurrency(c.value as Currency)}
                  className={`rounded-lg px-3 py-2 border text-sm font-medium ${
                    currency === c.value
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {c.code} ({formatNumber(floatBalanceOf(exchangeFloat, c.value, base))})
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount (Available: {currencyCode(currency)}{" "}
              {formatNumber(availableBalance)})
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e: any) => setAmount(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
            {amountNum > availableBalance && (
              <p className="text-xs text-red-600 mt-1">
                Amount exceeds available balance
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Destination Account ({currencyCode(currency)}{" "}
              accounts only)
            </label>
            <select
              value={destinationAccountId}
              onChange={(e: any) => setDestinationAccountId(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select destination...</option>
              {filteredAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (Balance: {currencyCode(currency)}{" "}
                  {formatNumber(a.balance)})
                </option>
              ))}
            </select>
            {filteredAccounts.length === 0 && (
              <p className="text-xs text-amber-700 mt-1">
                No {currencyCode(currency)} accounts
                available
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e: any) => setNotes(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional notes"
            />
          </div>

          {/* Summary */}
          {selectedAccount && amountNum > 0 && (
            <div className="bg-amber-50 border border-amber-200 p-3 space-y-1 rounded-lg">
              <p className="text-sm font-medium text-amber-800">
                Transfer Summary
              </p>
              <p className="text-xs text-amber-700">
                From: Exchange Float (
                {currencyCode(currency)})
              </p>
              <p className="text-xs text-amber-700">
                To: {selectedAccount.name}
              </p>
              <p className="text-xs text-amber-700 font-medium">
                Amount: {currencyCode(currency)}{" "}
                {formatNumber(amountNum)}
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!selectedAccount) {
                toast.error("Please select a valid destination account");
                return;
              }
              onSubmit({
                currency,
                amount: amountNum,
                destinationType: selectedAccount.type,
                destinationAccountId,
                notes: notes || undefined,
              });
            }}
            disabled={!isValid || loading}
            className="rounded-lg px-4 py-2 bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Withdraw
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// Settle Profit Modal
function SettleProfitModal({
  accounts,
  exchangeFloat,
  onClose,
  onSubmit,
  loading,
}: {
  accounts: Account[];
  exchangeFloat: ExchangeFloatDto | null;
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const { base, baseCode } = useBaseCurrency();
  const [currency, setCurrency] = useState<Currency>(base);
  const [amount, setAmount] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [notes, setNotes] = useState("");

  const availableProfit =
    currency === base
      ? exchangeFloat?.kesProfit || 0
      : exchangeFloat?.usdProfit || 0;

  const filteredAccounts = accounts.filter((a) => a.currency === currency);
  const selectedAccount = accounts.find((a) => a.id === destinationAccountId);

  const amountNum = parseFloat(amount) || 0;
  const isValid =
    amountNum > 0 && amountNum <= availableProfit && destinationAccountId;

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Settle Profit</h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-emerald-50 p-4">
            <p className="text-sm text-emerald-700 mb-2">Available Profit</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-emerald-700">{baseCode}</p>
                <p className="text-xl font-semibold text-emerald-700">
                  {formatNumber(exchangeFloat?.kesProfit || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-emerald-700">USD</p>
                <p className="text-xl font-semibold text-emerald-700">
                  ${formatNumber(exchangeFloat?.usdProfit || 0)}
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCurrency(base)}
                className={`rounded-lg px-4 py-2 border text-sm font-medium ${
                  currency === base
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {baseCode}
              </button>
              <button
                type="button"
                onClick={() => setCurrency(Currency.USD)}
                className={`rounded-lg px-4 py-2 border text-sm font-medium ${
                  currency === Currency.USD
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                USD
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount (Available: {currencyCode(currency)}{" "}
              {formatNumber(availableProfit)})
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e: any) => setAmount(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
            <button
              type="button"
              onClick={() => setAmount(availableProfit.toString())}
              className="rounded-lg text-xs text-blue-600 mt-1 hover:underline"
            >
              Settle all
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Destination Account
            </label>
            <select
              value={destinationAccountId}
              onChange={(e: any) => setDestinationAccountId(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select destination...</option>
              {filteredAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e: any) => setNotes(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional notes"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                currency,
                amount: amountNum,
                destinationType: selectedAccount?.type,
                destinationAccountId,
                notes: notes || undefined,
              })
            }
            disabled={!isValid || loading}
            className="rounded-lg px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Settle Profit
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// USD Position Modal
function UsdPositionModal({
  position,
  onClose,
}: {
  position: UsdPositionDto;
  onClose: () => void;
}) {
  const { base, baseCode } = useBaseCurrency();
  const isProfitable = position.unrealizedPnL >= 0;

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">USD Position</h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-3">
              <p className="text-xs text-gray-500 mb-1">USD Balance</p>
              <p className="text-xl font-semibold text-gray-900">
                ${formatNumber(position.usdBalance)}
              </p>
            </div>
            <div className="bg-gray-50 p-3">
              <p className="text-xs text-gray-500 mb-1">Average Cost</p>
              <p className="text-xl font-semibold text-gray-900">
                {position.averageCostPerUsd.toFixed(2)} {baseCode}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Cost Basis</span>
              <span className="font-medium">
                {baseCode} {formatNumber(position.totalCostBasis)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Current Market Rate</span>
              <span className="font-medium">
                {position.currentMarketRate.toFixed(2)} {baseCode}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Current Market Value</span>
              <span className="font-medium">
                {baseCode} {formatNumber(position.currentMarketValue)}
              </span>
            </div>
          </div>

          <div
            className={`p-4 ${isProfitable ? "bg-emerald-50" : "bg-red-50"}`}
          >
            <div className="flex justify-between items-center">
              <span
                className={`text-sm ${
                  isProfitable ? "text-emerald-700" : "text-red-700"
                }`}
              >
                Unrealized P&L
              </span>
              <div className="text-right">
                <p
                  className={`text-xl font-semibold ${
                    isProfitable ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {isProfitable ? "+" : ""}{baseCode}{" "}
                  {formatNumber(position.unrealizedPnL)}
                </p>
                <p
                  className={`text-sm ${
                    isProfitable ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  ({isProfitable ? "+" : ""}
                  {position.unrealizedPnLPercent.toFixed(2)}%)
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// Calculator Modal
function CalculatorModal({
  rates,
  onClose,
}: {
  rates: Record<number, ExchangeRateDto>;
  onClose: () => void;
}) {
  const { base, baseCode } = useBaseCurrency();
  const rateCurrencies = foreignTradeCurrencies(base).filter((c) => rates[c.value]);
  const [foreignCurrency, setForeignCurrency] = useState<number>(
    rateCurrencies[0]?.value ?? Currency.USD,
  );
  const fx = foreignTradeCurrencies(base).find((c) => c.value === foreignCurrency)?.code ?? "USD";
  const currentRate: ExchangeRateDto = rates[foreignCurrency] ?? { buyRate: 0, sellRate: 0 } as ExchangeRateDto;
  const [direction, setDirection] = useState<ExchangeDirection>(
    ExchangeDirection.UsdToKes,
  );
  const [amount, setAmount] = useState("");

  const rate =
    direction === ExchangeDirection.UsdToKes
      ? currentRate.buyRate
      : currentRate.sellRate;
  const spread = currentRate.sellRate - currentRate.buyRate;
  const amountNum = parseFloat(amount) || 0;

  const receivedAmount =
    Math.round(
      (direction === ExchangeDirection.UsdToKes
        ? amountNum * rate
        : amountNum / (rate || 1)) * 100,
    ) / 100;

  const profit =
    direction === ExchangeDirection.UsdToKes
      ? spread * amountNum
      : spread * receivedAmount;

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Quick Calculator
          </h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {foreignTradeCurrencies(base).map((c) => (
              <button
                key={c.value}
                disabled={!rates[c.value]}
                title={rates[c.value] ? undefined : `No ${c.code} rate set`}
                onClick={() => setForeignCurrency(c.value)}
                className={`rounded-lg px-3 py-2 border text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                  foreignCurrency === c.value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-gray-200 text-gray-700"
                }`}
              >
                {c.code}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDirection(ExchangeDirection.UsdToKes)}
              className={`rounded-lg px-4 py-3 border text-sm font-medium ${
                direction === ExchangeDirection.UsdToKes
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-700"
              }`}
            >
              {fx} → {baseCode}
            </button>
            <button
              onClick={() => setDirection(ExchangeDirection.KesToUsd)}
              className={`rounded-lg px-4 py-3 border text-sm font-medium ${
                direction === ExchangeDirection.KesToUsd
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-700"
              }`}
            >
              {baseCode} → {fx}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {direction === ExchangeDirection.UsdToKes
                ? `${fx} amount`
                : "{baseCode} amount"}
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e: any) => setAmount(e.target.value)}
              className="rounded-lg w-full px-3 py-3 border border-gray-200 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>

          <div className="bg-gray-50 p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Rate</span>
              <span className="font-semibold">{formatRate(rate)}</span>
            </div>
            <div className="flex justify-between text-lg">
              <span className="text-gray-600">Client Receives</span>
              <span className="font-semibold text-blue-600">
                {direction === ExchangeDirection.UsdToKes
                  ? `${baseCode} ${formatNumber(receivedAmount)}`
                  : `${fx} ${formatNumber(receivedAmount)}`}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-200">
              <span className="text-gray-600">Your Profit</span>
              <span className="font-semibold text-emerald-700">
                {baseCode} {formatNumber(profit)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex justify-end p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// Day Close Modal
function DayCloseModal({
  exchangeFloat,
  todaySummary,
  onClose,
  onOpening,
  onClosing,
  loading,
}: {
  exchangeFloat: ExchangeFloatDto | null;
  todaySummary: DailySummaryDto | null;
  onClose: () => void;
  onOpening: (kesCount: number, usdCount: number, notes?: string, otherCounts?: CurrencyCountDto[]) => void;
  onClosing: (kesCount: number, usdCount: number, notes?: string, otherCounts?: CurrencyCountDto[]) => void;
  loading: boolean;
}) {
  const { base, baseCode } = useBaseCurrency();
  const [mode, setMode] = useState<"opening" | "closing">("opening");
  const [kesCount, setKesCount] = useState("");
  const [usdCount, setUsdCount] = useState("");
  const [notes, setNotes] = useState("");
  // UGX, EUR, ... the float holds — each needs its own physical count
  const others = exchangeFloat?.otherBalances || [];
  const [otherCounts, setOtherCounts] = useState<Record<number, string>>({});
  const otherCountList: CurrencyCountDto[] = others.map((o) => ({
    currency: o.currency,
    count: parseFloat(otherCounts[o.currency] ?? "") || 0,
  }));
  const otherVariances = others.map((o) => ({
    code: o.currencyCode,
    currency: o.currency,
    variance: (parseFloat(otherCounts[o.currency] ?? "") || 0) - o.balance,
    entered: (otherCounts[o.currency] ?? "") !== "",
  }));

  const expectedKes = exchangeFloat?.kesBalance || 0;
  const expectedUsd = exchangeFloat?.usdBalance || 0;

  const kesCountNum = parseFloat(kesCount) || 0;
  const usdCountNum = parseFloat(usdCount) || 0;

  const kesVariance = kesCountNum - expectedKes;
  const usdVariance = usdCountNum - expectedUsd;

  const isValid =
    kesCount !== "" && usdCount !== "" && others.every((o) => (otherCounts[o.currency] ?? "") !== "");

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Daily Float Verification
          </h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* Opening / Closing Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode("opening")}
              className={`rounded-lg flex items-center justify-center gap-2 px-4 py-3 border text-sm font-medium transition-colors ${
                mode === "opening"
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              ☀️ Record Opening
            </button>
            <button
              onClick={() => setMode("closing")}
              className={`rounded-lg flex items-center justify-center gap-2 px-4 py-3 border text-sm font-medium transition-colors ${
                mode === "closing"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              🌙 Record Closing
            </button>
          </div>

          <p className="text-xs text-gray-500">
            {mode === "opening"
              ? "Count physical cash at the start of the day to verify overnight integrity."
              : "Count physical cash at end of day and compare with system balances."}
          </p>

          {/* Today's Summary — only show for closing */}
          {mode === "closing" && todaySummary && (
            <div className="bg-blue-50 p-4 space-y-2">
              <h4 className="text-sm font-medium text-blue-900">
                Today's Activity
              </h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-blue-600">Exchanges</p>
                  <p className="font-semibold text-blue-900">
                    {todaySummary.exchangeCount}
                  </p>
                </div>
                <div>
                  <p className="text-blue-600">{baseCode} Profit</p>
                  <p className="font-semibold text-blue-900">
                    {formatNumber(todaySummary.kesProfit)}
                  </p>
                </div>
                <div>
                  <p className="text-blue-600">USD Profit</p>
                  <p className="font-semibold text-blue-900">
                    ${formatNumber(todaySummary.usdProfit)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Expected vs Actual */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {baseCode} Physical Count *
              </label>
              <input
                type="number"
                value={kesCount}
                onChange={(e: any) => setKesCount(e.target.value)}
                className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`Count physical ${baseCode}`}
              />
              <p className="text-xs text-gray-500 mt-1">
                System: {baseCode} {formatNumber(expectedKes)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                USD Physical Count *
              </label>
              <input
                type="number"
                value={usdCount}
                onChange={(e: any) => setUsdCount(e.target.value)}
                className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Count physical USD"
              />
              <p className="text-xs text-gray-500 mt-1">
                System: ${formatNumber(expectedUsd)}
              </p>
            </div>
            {others.map((o) => (
              <div key={o.currency}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {o.currencyCode} Physical Count *
                </label>
                <input
                  type="number"
                  value={otherCounts[o.currency] ?? ""}
                  onChange={(e: any) =>
                    setOtherCounts((prev) => ({ ...prev, [o.currency]: e.target.value }))
                  }
                  className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`Count physical ${o.currencyCode}`}
                />
                <p className="text-xs text-gray-500 mt-1">
                  System: {o.currencyCode} {formatNumber(o.balance)}
                </p>
              </div>
            ))}
          </div>

          {/* Variance — show for closing mode */}
          {mode === "closing" && kesCount !== "" && usdCount !== "" && (
            <div
              className={`p-4 ${kesVariance === 0 && usdVariance === 0 && otherVariances.every((v) => !v.entered || v.variance === 0) ? "bg-emerald-50" : "bg-amber-50"}`}
            >
              <h4 className="text-sm font-medium mb-2">Variance</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex justify-between">
                  <span className="text-sm">{baseCode}:</span>
                  <span
                    className={`font-medium ${kesVariance === 0 ? "text-emerald-700" : kesVariance > 0 ? "text-blue-600" : "text-red-600"}`}
                  >
                    {kesVariance > 0 ? "+" : ""}
                    {formatNumber(kesVariance)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">USD:</span>
                  <span
                    className={`font-medium ${usdVariance === 0 ? "text-emerald-700" : usdVariance > 0 ? "text-blue-600" : "text-red-600"}`}
                  >
                    {usdVariance > 0 ? "+" : ""}
                    {formatNumber(usdVariance)}
                  </span>
                </div>
                {otherVariances
                  .filter((v) => v.entered)
                  .map((v) => (
                    <div key={v.currency} className="flex justify-between">
                      <span className="text-sm">{v.code}:</span>
                      <span
                        className={`font-medium ${v.variance === 0 ? "text-emerald-700" : v.variance > 0 ? "text-blue-600" : "text-red-600"}`}
                      >
                        {v.variance > 0 ? "+" : ""}
                        {formatNumber(v.variance)}
                      </span>
                    </div>
                  ))}
              </div>
              {(kesVariance !== 0 || usdVariance !== 0 || otherVariances.some((v) => v.entered && v.variance !== 0)) && (
                <p className="text-xs text-amber-700 mt-2">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  Variance detected. Please verify your count.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e: any) => setNotes(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder={
                mode === "opening"
                  ? "Opening notes..."
                  : "Closing notes, discrepancies..."
              }
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              mode === "opening"
                ? onOpening(kesCountNum, usdCountNum, notes || undefined, otherCountList)
                : onClosing(kesCountNum, usdCountNum, notes || undefined, otherCountList)
            }
            disabled={!isValid || loading}
            className={`rounded-lg px-6 py-2 text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2 ${
              mode === "opening"
                ? "bg-amber-700 hover:bg-amber-800"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            {mode === "opening" ? "☀️ Record Opening" : "🌙 Record Closing"}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// Transaction Detail Modal
function TransactionDetailModal({
  transaction,
  onClose,
  onVoid,
  loading,
}: {
  transaction: ExchangeResponseDto;
  onClose: () => void;
  onVoid: (id: string, reason: string) => void;
  loading: boolean;
}) {
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  const handleCopy = () => {
    const text = `Exchange: ${transaction.code}\nDate: ${formatDateTime(
      transaction.date,
    )}\nClient: ${transaction.clientName}\nGiven: ${formatCurrency(
      transaction.amountGiven,
      transaction.currencyGiven,
    )}\nReceived: ${formatCurrency(
      transaction.amountReceived,
      transaction.currencyReceived,
    )}\nRate: ${transaction.exchangeRate}\nProfit: ${formatCurrency(
      transaction.profit,
      transaction.profitCurrency,
    )}`;
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {transaction.code}
          </h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {transaction.isLargeTransaction && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4" />
              Large Transaction (Compliance Required)
            </div>
          )}

          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Date</span>
              <span className="font-medium">
                {formatDateTime(transaction.date)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Client</span>
              <span className="font-medium">{transaction.clientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Type</span>
              <span
                className={`px-2 py-0.5 text-xs font-medium ${
                  transaction.exchangeType === ExchangeType.Cash
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {transaction.exchangeType === ExchangeType.Cash
                  ? "Cash"
                  : "From Account"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Direction</span>
              <span className="font-medium">
                {currencyCode(transaction.currencyGiven)} →{" "}
                {currencyCode(transaction.currencyReceived)}
              </span>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Given</span>
              <span className="font-medium text-emerald-700">
                +
                {formatCurrency(
                  transaction.amountGiven,
                  transaction.currencyGiven,
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Received</span>
              <span className="font-medium text-red-600">
                -
                {formatCurrency(
                  transaction.amountReceived,
                  transaction.currencyReceived,
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Rate</span>
              <span className="font-medium">
                {transaction.exchangeRate.toFixed(2)}
              </span>
            </div>
            <div className={`flex justify-between p-2 -mx-2 ${transaction.profit < 0 ? "bg-red-50" : transaction.profit > 0 ? "bg-emerald-50" : "bg-slate-50"}`}>
              <span className={`font-medium ${transaction.profit < 0 ? "text-red-700" : transaction.profit > 0 ? "text-emerald-700" : "text-slate-600"}`}>
                {transaction.profit < 0 ? "Loss" : "Profit"}
              </span>
              <span className={`font-semibold ${transaction.profit < 0 ? "text-red-700" : transaction.profit > 0 ? "text-emerald-700" : "text-slate-600"}`}>
                {transaction.profit
                  ? `${transaction.profit > 0 ? "+" : "−"}${formatCurrency(Math.abs(transaction.profit), transaction.profitCurrency)}`
                  : "None on a purchase — profit is booked when the currency is sold"}
              </span>
            </div>
          </div>

          {transaction.notes && (
            <div className="border-t border-gray-200 pt-3">
              <p className="text-sm text-gray-500">Notes</p>
              <p className="text-sm">{transaction.notes}</p>
            </div>
          )}

          {transaction.status === "Voided" && (
            <div className="bg-red-50 p-3 text-red-800 text-sm">
              <p className="font-medium">This transaction has been voided</p>
            </div>
          )}

          {showVoidForm && transaction.status !== "Voided" && (
            <div className="border-t border-gray-200 pt-3 space-y-3">
              <p className="text-sm font-medium text-red-600">
                Void this transaction?
              </p>
              <input
                type="text"
                value={voidReason}
                onChange={(e: any) => setVoidReason(e.target.value)}
                className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Reason for voiding..."
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowVoidForm(false)}
                  className="rounded-lg flex-1 px-3 py-2 text-gray-700 hover:bg-gray-100 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onVoid(transaction.id, voidReason)}
                  disabled={!voidReason || loading}
                  className="rounded-lg flex-1 px-3 py-2 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm Void
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-between p-4 border-t border-gray-200">
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="rounded-lg p-2 hover:bg-gray-100 transition-colors"
              title="Copy"
            >
              <Copy className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="flex gap-2">
            {transaction.status !== "Voided" && !showVoidForm && (
              <button
                onClick={() => setShowVoidForm(true)}
                className="rounded-lg px-3 py-2 text-red-600 hover:bg-red-50 text-sm font-medium"
              >
                Void
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}

// Modal Wrapper
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
        className="w-full max-w-lg"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
