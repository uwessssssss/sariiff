"use client";

import { Activity, ArrowLeftRight, BarChart3, Building2, TrendingUp, Users, Wallet } from "lucide-react";
import { CURRENCY_CODES, loadKesRates, toKes } from "../helpers";
import { allPages, apiRequest, getExchangeTodaySummary, getExchangeTransactions } from "@/lib/api";
import { bureauFlow } from "@/lib/moneyflow";
import { exchangeProfitBetween } from "@/lib/exchangeProfit";
import { inDateRange, localDate } from "@/lib/dates";
import { toast } from "sonner";
import { useCallback, useState } from "react";
import { type useReportsState } from "./useReportsState";

/** Reports: data (part 2 of 3 of useReports). */
export function useReportsData(prev: ReturnType<typeof useReportsState>) {
  const { accountSummary, baseCode, clientBalances, currencyFilter, dateFrom, dateRange, dateTo, currentPage, dailyReport, exchangeSummary, fetchAccountSummary, fetchClientBalances, fetchDailyReport, fetchExchangeSummary, fetchTransactions, itemsPerPage, profitLossData, reportType, searchTerm, selectedDate, setCurrentPage, setLoading, setProfitLossData, statistics, transactionTypeFilter, transactions } = prev;
  // Fetch profit and loss data
  const fetchProfitLoss = useCallback(async () => {
    try {
      await loadKesRates();
      const excluded = new Set<string>();
      // Fetch all required data for P&L calculation
      // This month's trades only (the P&L below is for this month); it used to download every
      // trade the bureau ever made and throw most of them away.
      const now = new Date();
      const monthFirst = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      // The 7-day trend below can reach back into last month, so fetch from whichever is earlier.
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      const tradesFrom = weekStart < new Date(now.getFullYear(), now.getMonth(), 1) ? localDate(weekStart) : monthFirst;
      const [exchangeRes, summaryRes, txnRes] = await Promise.all([
        allPages((p, n) => getExchangeTransactions(p, n, undefined, undefined, tradesFrom)),
        getExchangeTodaySummary(),
        // This month only, and all of it: the endpoint's default page is 10 rows,
        // so the P&L used to be built from the last 10 transactions.
        allPages((p, n) => apiRequest<any>(
          `/api/report/transactions?page=${p}&pageSize=${n}&startDate=${(() => {
            const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
            return encodeURIComponent(d.toISOString());
          })()}`,
        )),
      ]);

      const exchangeTransactions =
        exchangeRes.success && exchangeRes.data
          ? exchangeRes.data.items || exchangeRes.data
          : [];
      const todaySummary =
        summaryRes.success && summaryRes.data ? summaryRes.data : null;
      const allTransactions =
        txnRes.success && txnRes.data
          ? Array.isArray(txnRes.data)
            ? txnRes.data
            : (txnRes.data as any).items || []
          : [];

      // PROFIT & LOSS, this calendar month, in the home currency.
      //   Income   = realised exchange profit (booked on sales, average cost).
      //   Expenses = recorded expenses (EXP- postings, less any reversed).
      // Client deposits and withdrawals are NOT income or expenses — the bureau
      // holds that money for the client (a liability). This report used to count
      // every deposit as income and every withdrawal as an expense.
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const inMonth = (d: any) => d && new Date(d) >= monthStart;

      const exchangeProfit = exchangeProfitBetween(
        Array.isArray(exchangeTransactions) ? exchangeTransactions : [],
        monthStart,
      );

      let totalIncome = 0;
      let totalExpenses = 0;
      const categoryMap: { [key: string]: number } = {};

      if (Array.isArray(allTransactions)) {
        allTransactions.forEach((txn: any) => {
          const ref: string = txn.reference || "";
          const isExpense = ref.startsWith("EXP-");
          const isExpenseReversal = ref.startsWith("REV-EXP-");
          if (!isExpense && !isExpenseReversal) return;
          if (!inMonth(txn.transactionDate || txn.createdAt)) return;

          const flow = bureauFlow(txn);
          const kes = toKes(flow.amount, flow.currency);
          if (kes === null) {
            excluded.add(CURRENCY_CODES[flow.currency] || String(flow.currency));
            return;
          }
          // An expense takes money out of a till; its reversal puts it back.
          const signed = flow.kind === "out" ? kes : flow.kind === "in" ? -kes : 0;
          totalExpenses += signed;
          const category = txn.destAccountName && txn.destAccountName !== "Unknown" ? txn.destAccountName : "Expenses";
          categoryMap[category] = (categoryMap[category] || 0) - signed; // shown as a loss
        });
      }

      totalIncome += exchangeProfit;

      // Create profit by category with colors
      const categoryColors = [
        "#10B981",
        "#3B82F6",
        "#8B5CF6",
        "#F59E0B",
        "#EF4444",
        "#EC4899",
        "#06B6D4",
      ];
      const profitByCategory = Object.entries(categoryMap)
        .filter(([_, amount]) => amount !== 0)
        .map(([category, amount], idx) => ({
          category,
          amount,
          color: categoryColors[idx % categoryColors.length],
        }))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

      // Add exchange profit as a category
      if (exchangeProfit > 0) {
        profitByCategory.unshift({
          category: "Exchange Profit",
          amount: exchangeProfit,
          color: "#10B981",
        });
      }

      // Daily profit, last 7 days, from the trades themselves. It used to chart six
      // days of 0 (a placeholder) plus today, so every past day read as no profit.
      const dailyProfits = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const profit = exchangeProfitBetween(
          Array.isArray(exchangeTransactions) ? exchangeTransactions : [],
          date,
          new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1),
        );
        dailyProfits.push({
          date: date.toLocaleDateString("en-KE", { weekday: "short" }),
          profit,
        });
      }
      // Today's figure: the server's own summary when it has one.
      if (todaySummary) {
        dailyProfits[dailyProfits.length - 1].profit =
          todaySummary.kesProfit || 0;
      }

      setProfitLossData({
        period: "This Month",
        exchangeProfit, // this month's realised profit — the same figure inside totalIncome
        totalIncome,
        totalExpenses,
        netProfit: totalIncome - totalExpenses,
        profitByCategory,
        dailyProfits,
        excludedCurrencies: [...excluded],
      });
    } catch (error) {
      console.error("Error fetching profit/loss data:", error);
      toast.error("Failed to load profit & loss data");
    }
  }, []);
  // Main fetch function
  const fetchReportData = useCallback(async () => {
    setLoading(true);
    try {
      switch (reportType) {
        case "daily":
          await fetchDailyReport(selectedDate);
          break;
        case "transactions":
          await fetchTransactions();
          break;
        case "clients":
          await fetchClientBalances();
          break;
        case "accounts":
          await fetchAccountSummary();
          break;
        case "cashflow":
          await Promise.all([fetchAccountSummary(), fetchTransactions()]);
          break;
        case "exchange":
          await fetchExchangeSummary();
          break;
        case "profit":
          await Promise.all([fetchProfitLoss(), fetchExchangeSummary()]);
          break;
        default:
          await Promise.all([
            fetchDailyReport(selectedDate),
            fetchTransactions(),
            fetchClientBalances(),
            fetchAccountSummary(),
          ]);
      }
    } catch (error) {
      console.error("Error fetching report data:", error);
      toast.error("Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [
    reportType,
    selectedDate,
    fetchDailyReport,
    fetchTransactions,
    fetchClientBalances,
    fetchAccountSummary,
    fetchExchangeSummary,
    fetchProfitLoss,
  ]);
  const reportCards = [
    {
      id: "daily" as const,
      title: "Daily Summary",
      description: "Today's activity overview",
      icon: Activity,
      gradient: "bg-red-600",
      count: dailyReport
        ? `${dailyReport.transactionSummary.transactionCount} transactions`
        : "Daily report",
      bgColor: "bg-red-50",
      borderColor: "border-red-200",
    },
    {
      id: "transactions" as const,
      title: "Transaction Report",
      description: "All debit & credit transactions",
      icon: ArrowLeftRight,
      gradient: "bg-blue-600",
      count: `${statistics.totalTransactions} transactions`,
      bgColor: "bg-slate-50",
      borderColor: "border-blue-200",
    },
    {
      id: "clients" as const,
      title: "Client Balances",
      description: "Client account balances",
      icon: Users,
      gradient: "bg-blue-600",
      count: `${statistics.totalClients} clients`,
      bgColor: "bg-slate-50",
      borderColor: "border-slate-200",
    },
    {
      id: "accounts" as const,
      title: "Account Summary",
      description: "All account balances",
      icon: Building2,
      gradient: "bg-blue-600",
      count: `${statistics.activeAccounts} accounts`,
      bgColor: "bg-slate-50",
      borderColor: "border-slate-200",
    },
    {
      id: "cashflow" as const,
      title: "Cash Flow Report",
      description: "Money in vs money out",
      icon: Wallet,
      gradient: "bg-amber-600",
      count:
        statistics.totalRevenue >= 0
          ? `+${baseCode} ${Math.round(statistics.totalRevenue).toLocaleString()}`
          : `-${baseCode} ${Math.round(Math.abs(statistics.totalRevenue)).toLocaleString()}`,
      bgColor: "bg-amber-50",
      borderColor: "border-amber-200",
    },
    {
      id: "exchange" as const,
      title: "Exchange Summary",
      description: "Currency exchange analysis",
      icon: TrendingUp,
      gradient: "bg-emerald-600",
      count: exchangeSummary
        ? `${exchangeSummary.totalExchanges} exchanges`
        : "Exchange data",
      bgColor: "bg-emerald-50",
      borderColor: "border-emerald-200",
    },
    {
      id: "profit" as const,
      title: "Profit & Loss",
      description: "Revenue and expenses",
      icon: BarChart3,
      gradient: "bg-emerald-600",
      count: profitLossData
        ? `${
            profitLossData.netProfit >= 0 ? "+" : ""
          }{baseCode} ${profitLossData.netProfit.toLocaleString()}`
        : "P&L Statement",
      bgColor: "bg-emerald-50",
      borderColor: "border-green-200",
    },
  ];
  // Filter transactions
  const filteredTransactions = transactions.filter((txn) => {
    const matchesSearch =
      txn.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.reference?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCurrency =
      currencyFilter === "all" || txn.currency === currencyFilter;
    const matchesType =
      transactionTypeFilter === "all" || txn.type === transactionTypeFilter;
    // The "Date Range" picker (Today by default) filtered nothing: every transaction ever
    // was listed and exported under it.
    const matchesDate = inDateRange(txn.date, dateRange, dateFrom, dateTo);

    return matchesSearch && matchesCurrency && matchesType && matchesDate;
  });
  // Currencies any client holds (KES and USD always shown)
  const clientCurrencies: number[] = (() => {
    const set = new Set<number>([0, 1]);
    for (const c of clientBalances) for (const [k, v] of Object.entries(c.balances)) if (v) set.add(Number(k));
    return [...set].sort((a, b) => a - b);
  })();
  // Today's rates for home-currency charts (re-render once loaded)
  const [, setRatesLoaded] = useState(0);
  // Pagination logic
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredTransactions.slice(
    indexOfFirstItem,
    indexOfLastItem,
  );
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // Prepare chart data from real data
  const transactionChartData = (() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const chartData = days.map((day) => ({ name: day, debits: 0, credits: 0 }));

    transactions.forEach((txn) => {
      const date = new Date(txn.date);
      const dayIndex = date.getDay();
      // Different currencies are converted to KES, never added raw
      const kes = toKes(txn.amount, txn.currency);
      if (kes === null) return;
      if (txn.type === "debit") {
        chartData[dayIndex].debits += kes;
      } else if (txn.type === "credit") {
        chartData[dayIndex].credits += kes; // transfers between tills are neither
      }
    });

    return chartData;
  })();
  const accountTypeData = (() => {
    const data: { name: string; value: number }[] = [];
    if (accountSummary) {
      if (accountSummary.cashAccounts.length > 0) {
        data.push({ name: "Cash", value: accountSummary.cashAccounts.length });
      }
      if (accountSummary.bankAccounts.length > 0) {
        data.push({ name: "Bank", value: accountSummary.bankAccounts.length });
      }
      if (accountSummary.mpesaAgents.length > 0) {
        data.push({ name: "Mobile money", value: accountSummary.mpesaAgents.length });
      }
    }
    return data;
  })();

  return {
    fetchProfitLoss,
    fetchReportData,
    reportCards,
    filteredTransactions,
    clientCurrencies,
    setRatesLoaded,
    totalPages,
    indexOfLastItem,
    indexOfFirstItem,
    currentItems,
    handlePageChange,
    transactionChartData,
    accountTypeData,
  };
}
