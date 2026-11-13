"use client";

import { Account } from "../helpers";
import { AccountType, ClientLookupDto, Currency, DailySummaryDto, ExchangeDirection, ExchangeFloatDto, ExchangeRateDto, ExchangeResponseDto, ExchangeType, FloatAlertDto, UsdPositionDto, createExchange, currencyCode, formatNumber, fundExchangeFloat, getBankAccounts, getCashAccounts, getClientLookup, getCurrentExchangeRate, getExchangeAlerts, getExchangeFloat, getExchangeRateHistory, getExchangeTodaySummary, getExchangeTransactions, getMpesaAgents, getUsdPosition, newIdempotencyKey, providerLabel, setExchangeRate, submissionKey, withIdempotencyKey } from "@/lib/api";
import { buildExchangeMessage } from "@/lib/whatsapp";
import { foreignCurrenciesFor, useBaseCurrency } from "@/lib/useBaseCurrency";
import { localDate } from "@/lib/dates";
import { toast } from "sonner";
import { useCallback, useRef, useState } from "react";

/** ExchangeSection: state (part 1 of 2 of useExchangeSection). */
export function useExchangeSectionState() {
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
        // switched-off accounts are refused for float moves by the API
        bankRes.data.filter((b) => b.isActive !== false).forEach((b) => {
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
        mpesaRes.data.filter((m) => m.isActive !== false).forEach((m) => {
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
        // The Current Rate card is the USD rate: a EUR rate must not land there.
        if (foreignCurrency === Currency.USD) setCurrentRate(res.data);
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
    client?: ClientLookupDto;
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
        if (data.clientId) {
          const client = data.client ?? clients.find((c) => c.id === data.clientId);
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

  return {
    submitSession,
    base,
    baseCode,
    loading,
    setLoading,
    actionLoading,
    setActionLoading,
    currentRate,
    setCurrentRate,
    ratesByCurrency,
    setRatesByCurrency,
    rateHistory,
    setRateHistory,
    exchangeFloat,
    setExchangeFloat,
    transactions,
    setTransactions,
    totalCount,
    setTotalCount,
    todaySummary,
    setTodaySummary,
    floatHistory,
    setFloatHistory,
    showFloatHistory,
    setShowFloatHistory,
    usdPosition,
    setUsdPosition,
    alerts,
    setAlerts,
    clients,
    setClients,
    accounts,
    setAccounts,
    page,
    setPage,
    pageSize,
    searchTerm,
    setSearchTerm,
    dateFilter,
    setDateFilter,
    showSetRateModal,
    setShowSetRateModal,
    showNewExchangeModal,
    setShowNewExchangeModal,
    exchShareModal,
    setExchShareModal,
    showPin,
    setShowPin,
    pendingExchange,
    setPendingExchange,
    showFundFloatModal,
    setShowFundFloatModal,
    showWithdrawFloatModal,
    setShowWithdrawFloatModal,
    showSettleProfitModal,
    setShowSettleProfitModal,
    showUsdPositionModal,
    setShowUsdPositionModal,
    showCalculatorModal,
    setShowCalculatorModal,
    showDayCloseModal,
    setShowDayCloseModal,
    showRateHistoryModal,
    setShowRateHistoryModal,
    showTransactionModal,
    setShowTransactionModal,
    selectedTransaction,
    setSelectedTransaction,
    loadData,
    loadTransactions,
    handleSetRate,
    handleNewExchange,
    handleFundFloat,
  };
}
