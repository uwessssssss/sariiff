"use client";

import { AccountSummary, CURRENCY_CODES, ClientBalance, DailyReportData, ExchangeSummaryData, ProfitLossData, ReportType, clientBalanceMap, computeCashflow, dailyBalancesByCurrency, ensureRates, netKesEquivalent, toCurrencyNum } from "../helpers";
import { ExchangeDirection, allPages, apiRequest, getBankAccounts, getCashAccounts, getClients, getCurrentExchangeRate, getDailyReport, getExchangeFloat, getExchangeTodaySummary, getExchangeTransactions, getMpesaAgents } from "@/lib/api";
import { bureauFlow } from "@/lib/moneyflow";
import { localDate } from "@/lib/dates";
import { toast } from "sonner";
import { useAllowedCurrencies, useBaseCurrency } from "@/lib/useBaseCurrency";
import { useCallback, useState } from "react";

/** Reports: state (part 1 of 3 of useReports). */
export function useReportsState() {
  // Kenyan bureaus don't use UGX; Ugandan ones use KES too (lib/useBaseCurrency).
  const { has: currencyOk } = useAllowedCurrencies();
  const { base, baseCode } = useBaseCurrency();
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [dateRange, setDateRange] = useState("today");
  const [selectedDate, setSelectedDate] = useState(
    localDate(),
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<string>(
    "all",
  );
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<
    "all" | "debit" | "credit"
  >("all");
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  // Data states
  const [dailyReport, setDailyReport] = useState<DailyReportData | null>(null);
  // The day's table shows 50 rows at a time (a busy day has thousands; exports still take all).
  const [dailyShown, setDailyShown] = useState(50);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [clientBalances, setClientBalances] = useState<ClientBalance[]>([]);
  const [accountSummary, setAccountSummary] = useState<AccountSummary | null>(
    null,
  );
  const [exchangeSummary, setExchangeSummary] =
    useState<ExchangeSummaryData | null>(null);
  const [profitLossData, setProfitLossData] = useState<ProfitLossData | null>(
    null,
  );
  const [statistics, setStatistics] = useState({
    totalTransactions: 0,
    totalDebits: 0,
    totalCredits: 0,
    totalClients: 0,
    totalRevenue: 0,
    activeAccounts: 0,
    kesTotal: 0,
    usdTotal: 0,
  });
  // Fetch daily report
  const fetchDailyReport = useCallback(async (date: string) => {
    try {
      await ensureRates();
      const response = await getDailyReport(date);
      if (response.success && response.data) {
        // Account-aware cashflow computed once from the transaction list
        // (the summary DTO is per-currency raw sums with no aggregate fields).
        const cfDaily = computeCashflow(response.data.transactions || []);
        setDailyReport({
          date: response.data.date,
          openingBalances: {
            cashKES: response.data.openingBalances?.cashKES || 0,
            cashUSD: response.data.openingBalances?.cashUSD || 0,
            bankKES: response.data.openingBalances?.bankKES || 0,
            bankUSD: response.data.openingBalances?.bankUSD || 0,
            mpesa: response.data.openingBalances?.mpesa || 0,
          },
          transactionSummary: {
            totalDebits: cfDaily.outKES, // Money OUT (KES)
            totalCredits: cfDaily.inKES, // Money IN (KES)
            transactionCount:
              response.data.transactionSummary?.totalCount ||
              (response.data.transactions || []).length,
          },
          closingBalances: {
            cashKES: response.data.closingBalances?.cashKES || 0,
            cashUSD: response.data.closingBalances?.cashUSD || 0,
            bankKES: response.data.closingBalances?.bankKES || 0,
            bankUSD: response.data.closingBalances?.bankUSD || 0,
            mpesa: response.data.closingBalances?.mpesa || 0,
          },
          transactions: response.data.transactions || [],
          byCurrency: dailyBalancesByCurrency(response.data),
          mobileMoney: (() => {
            const open: any[] = response.data.openingBalances?.mobileMoneyByCurrency || [];
            const close: any[] = response.data.closingBalances?.mobileMoneyByCurrency || [];
            const curs = [...new Set([...open, ...close].map((r) => r.currency as number))].sort((a, b) => a - b);
            if (curs.length === 0)
              return [{ currency: base, opening: response.data.openingBalances?.mpesa || 0, closing: response.data.closingBalances?.mpesa || 0 }];
            return curs.map((c) => ({
              currency: c,
              opening: open.find((r) => r.currency === c)?.amount || 0,
              closing: close.find((r) => r.currency === c)?.amount || 0,
            }));
          })(),
        });

        // Statistics cards are KES-labelled, so KES figures are used here.
        setStatistics((prev) => ({
          ...prev,
          totalDebits: cfDaily.outKES, // Money OUT
          totalCredits: cfDaily.inKES, // Money IN
          totalTransactions:
            response.data.transactionSummary?.totalCount ||
            (response.data.transactions || []).length,
          totalRevenue: netKesEquivalent(response.data.transactions || []), // Net flow, all currencies in KES
        }));

        // Set transactions from daily report
        if (response.data.transactions) {
          setTransactions(
            response.data.transactions.map((txn: any) => {
              // The bureau's side: which till moved, which way, in its own amount and

              // currency (see lib/moneyflow.ts). "debit" = money in, "credit" = money out.

              const flow = bureauFlow(txn);

              return {
                id: txn.id || txn.code,
                date: txn.transactionDate || txn.createdAt,
                description: txn.description || txn.notes || "",
                type: flow.kind === "in" ? "debit" : flow.kind === "out" ? "credit" : "transfer",
                flowKind: flow.kind,
                amount: flow.amount,
                currency: CURRENCY_CODES[flow.currency] || "KES",
                category: txn.category || "General",
                reference: txn.reference || txn.code,
                sourceAccountName: txn.sourceAccountName,
                destAccountName: txn.destAccountName,
                sourceAccountType: txn.sourceAccountType,
                destAccountType: txn.destAccountType,
                rawTransactionType: txn.transactionType,
              };
            }),
          );
        }
      }
    } catch (error) {
      console.error("Error fetching daily report:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, []);
  // Fetch transactions - using /api/report/transactions endpoint
  const fetchTransactions = useCallback(async () => {
    try {
      await ensureRates();
      // Use the correct report endpoint
      const response = await allPages((p, n) => apiRequest<any>(`/api/report/transactions?page=${p}&pageSize=${n}`));

      if (response.success && response.data) {
        const txnData = Array.isArray(response.data)
          ? response.data
          : (response.data as any).items || [];

        const mappedTransactions = txnData.map((txn: any) => {
          // The bureau's side: which till moved, which way, in its own amount and

          // currency (see lib/moneyflow.ts). "debit" = money in, "credit" = money out.

          const flow = bureauFlow(txn);

          return {
            id: txn.id || txn.code,
            date: txn.transactionDate || txn.createdAt,
            description: txn.description || txn.notes || "",
            type: flow.kind === "in" ? "debit" : flow.kind === "out" ? "credit" : "transfer",
            flowKind: flow.kind,
            amount: flow.amount,
            currency: CURRENCY_CODES[flow.currency] || "KES",
            category: txn.category || "General",
            reference: txn.reference || txn.code,
            sourceAccountName: txn.sourceAccountName,
            destAccountName: txn.destAccountName,
            sourceAccountType: txn.sourceAccountType,
            destAccountType: txn.destAccountType,
            rawTransactionType: txn.transactionType,
          };
        });
        setTransactions(mappedTransactions);

        // Calculate statistics
        // Account-aware cashflow (Money In = client credits + asset debits),
        // same rule as the daily report path. KES figures for KES-labelled cards.
        const cfTxns = computeCashflow(mappedTransactions);

        setStatistics((prev) => ({
          ...prev,
          totalTransactions: mappedTransactions.length,
          totalDebits: cfTxns.outKES, // Money OUT
          totalCredits: cfTxns.inKES, // Money IN
          totalRevenue: netKesEquivalent(mappedTransactions), // Net flow, all currencies in KES
        }));
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, []);
  // Fetch client balances
  const fetchClientBalances = useCallback(async () => {
    try {
      const response = await allPages((p, n) => getClients(p, n)); // every client, page by page
      if (response.success && response.data) {
        // Handle paginated response - data has .items array
        const clientList = response.data.items || response.data;
        if (Array.isArray(clientList)) {
          const clients = clientList.map((client: any) => ({
            id: client.id,
            code: client.code || "",
            name: client.fullName || client.name || "Unknown",
            whatsAppNumber: client.whatsAppNumber || client.phoneNumber || "",
            balanceKES: client.balanceKES || 0,
            balanceUSD: client.balanceUSD || 0,
            balances: clientBalanceMap(client),
            // A client's POSITIVE balance is money the bureau holds for them (a deposit
            // raises it) — "We Owe". NEGATIVE means the client owes the bureau — "Owes Us".
            // In ANY currency. (This was reversed until Nov 2026: depositors showed as debtors.)
            balanceType: Object.values(clientBalanceMap(client)).some((v) => v < 0)
              ? "Owes Us"
              : Object.values(clientBalanceMap(client)).some((v) => v > 0)
                ? "We Owe"
                : "Settled",
          }));
          setClientBalances(clients);
          setStatistics((prev) => ({
            ...prev,
            totalClients: clients.length,
          }));
        }
      }
    } catch (error) {
      console.error("Error fetching client balances:", error);
      toast.error("Failed to load client balances");
    }
  }, []);
  // Fetch account summary
  const fetchAccountSummary = useCallback(async () => {
    try {
      const [cashRes, bankRes, mpesaRes] = await Promise.all([
        getCashAccounts(),
        getBankAccounts(),
        getMpesaAgents(),
      ]);

      const cashAccounts = cashRes.success && cashRes.data ? cashRes.data : [];
      const bankAccounts = bankRes.success && bankRes.data ? bankRes.data : [];
      const mpesaAgents =
        mpesaRes.success && mpesaRes.data ? mpesaRes.data : [];

      // Calculate totals
      const totalCashKES = cashAccounts
        .filter((a: any) => a.currency === 0 || a.currency === "KES")
        .reduce((sum: number, a: any) => sum + (a.balance || 0), 0);
      const totalCashUSD = cashAccounts
        .filter((a: any) => a.currency === 1 || a.currency === "USD")
        .reduce((sum: number, a: any) => sum + (a.balance || 0), 0);
      const totalBankKES = bankAccounts
        .filter((a: any) => a.currency === 0 || a.currency === "KES")
        .reduce((sum: number, a: any) => sum + (a.balance || 0), 0);
      const totalBankUSD = bankAccounts
        .filter((a: any) => a.currency === 1 || a.currency === "USD")
        .reduce((sum: number, a: any) => sum + (a.balance || 0), 0);
      // Each wallet carries its own currency; never add KES and UGX wallets together.
      const mpesaAgentsWithCur = mpesaAgents.map((a: any) => ({ ...a, currency: a.currency ?? base }));
      const totalMpesa = mpesaAgentsWithCur
        .filter((a: any) => a.currency === base)
        .reduce((sum: number, a: any) => sum + (a.balance || 0), 0);

      const byCur = (list: any[]) =>
        list.reduce((m: Record<number, number>, a: any) => {
          const c = typeof a.currency === "number" ? a.currency : Number(
            Object.entries(CURRENCY_CODES).find(([, code]) => code === a.currency)?.[0] ?? 0,
          );
          m[c] = (m[c] || 0) + (a.balance || 0);
          return m;
        }, {});

      setAccountSummary({
        cashAccounts,
        bankAccounts,
        mpesaAgents,
        totalCashKES,
        totalCashUSD,
        totalBankKES,
        totalBankUSD,
        totalMpesa,
        cashByCurrency: byCur(cashAccounts),
        bankByCurrency: byCur(bankAccounts),
        mpesaByCurrency: byCur(mpesaAgentsWithCur),
      });

      setStatistics((prev) => ({
        ...prev,
        activeAccounts:
          cashAccounts.length + bankAccounts.length + mpesaAgents.length,
        kesTotal: totalCashKES + totalBankKES + (byCur(mpesaAgentsWithCur)[0] || 0), // KES wallets (M-Pesa) count as KES
        usdTotal: totalCashUSD + totalBankUSD,
      }));
    } catch (error) {
      console.error("Error fetching account summary:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, [base]);
  // Fetch exchange summary
  const fetchExchangeSummary = useCallback(async () => {
    try {
      const [exchangeRes, rateRes, floatRes, summaryRes] = await Promise.all([
        allPages((p, n) => getExchangeTransactions(p, n)),
        getCurrentExchangeRate(),
        getExchangeFloat(),
        getExchangeTodaySummary(),
      ]);

      const exchangeTransactions =
        exchangeRes.success && exchangeRes.data
          ? exchangeRes.data.items || exchangeRes.data
          : [];

      // Calculate exchange statistics
      let totalUsdBought = 0;
      let totalUsdSold = 0;
      let totalKesVolume = 0;
      let totalProfit = 0;
      let buyRateSum = 0;
      let sellRateSum = 0;
      let buyCount = 0;
      let sellCount = 0;

      const volumeByCurrency: Record<number, { bought: number; sold: number }> = {};
      if (Array.isArray(exchangeTransactions)) {
        exchangeTransactions.forEach((txn: any) => {
          // The non-KES side of the trade (USD, UGX, EUR)
          const foreign = toCurrencyNum(txn.currencyGiven) === base ? txn.currencyReceived : txn.currencyGiven;
          const fx = typeof foreign === "number" ? foreign : 1;
          if (!volumeByCurrency[fx]) volumeByCurrency[fx] = { bought: 0, sold: 0 };
          if (txn.direction === 1) volumeByCurrency[fx].bought += txn.amountReceived || 0;
          else volumeByCurrency[fx].sold += txn.amountGiven || 0;
          // Totals/averages below are USD-only: UGX rates (~0.03) can't be averaged with USD (~129)
          if (fx !== 1) {
            totalProfit += txn.profit || 0;
            totalKesVolume += txn.direction === 1 ? txn.amountGiven || 0 : txn.amountReceived || 0;
            return;
          }
          if (
            txn.direction === ExchangeDirection.KesToUsd ||
            txn.direction === 1
          ) {
            // Buying USD (client gives KES, receives USD)
            totalUsdBought += txn.amountReceived || 0;
            totalKesVolume += txn.amountGiven || 0;
            buyRateSum += txn.exchangeRate || 0;
            buyCount++;
          } else {
            // Selling USD (client gives USD, receives KES)
            totalUsdSold += txn.amountGiven || 0;
            totalKesVolume += txn.amountReceived || 0;
            sellRateSum += txn.exchangeRate || 0;
            sellCount++;
          }
          totalProfit += txn.profit || 0;
        });
      }

      const currentRate = rateRes.success && rateRes.data ? rateRes.data : null;
      const floatData =
        floatRes.success && floatRes.data ? floatRes.data : null;
      const todaySummary =
        summaryRes.success && summaryRes.data ? summaryRes.data : null;

      setExchangeSummary({
        totalExchanges: Array.isArray(exchangeTransactions)
          ? exchangeTransactions.length
          : 0,
        totalUsdBought,
        totalUsdSold,
        volumeByCurrency,
        floatOther: (floatData?.otherBalances || []).map((b: any) => ({ currency: b.currency, balance: b.balance || 0 })),
        totalKesVolume,
        totalProfit: todaySummary?.kesProfit || totalProfit,
        averageBuyRate: buyCount > 0 ? buyRateSum / buyCount : 0,
        averageSellRate: sellCount > 0 ? sellRateSum / sellCount : 0,
        currentBuyRate: currentRate?.buyRate || 0,
        currentSellRate: currentRate?.sellRate || 0,
        floatKES: floatData?.kesBalance || 0,
        floatUSD: floatData?.usdBalance || 0,
        kesProfit: floatData?.kesProfit || 0,
        usdProfit: floatData?.usdProfit || 0,
        transactions: Array.isArray(exchangeTransactions)
          ? exchangeTransactions
          : [],
      });
    } catch (error) {
      console.error("Error fetching exchange summary:", error);
      toast.error("Failed to load exchange summary");
    }
  }, [base]);

  return {
    currencyOk,
    base,
    baseCode,
    reportType,
    setReportType,
    dateRange,
    setDateRange,
    selectedDate,
    setSelectedDate,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    loading,
    setLoading,
    searchTerm,
    setSearchTerm,
    currencyFilter,
    setCurrencyFilter,
    transactionTypeFilter,
    setTransactionTypeFilter,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    dailyReport,
    setDailyReport,
    dailyShown,
    setDailyShown,
    transactions,
    setTransactions,
    clientBalances,
    setClientBalances,
    accountSummary,
    setAccountSummary,
    exchangeSummary,
    setExchangeSummary,
    profitLossData,
    setProfitLossData,
    statistics,
    setStatistics,
    fetchDailyReport,
    fetchTransactions,
    fetchClientBalances,
    fetchAccountSummary,
    fetchExchangeSummary,
  };
}
