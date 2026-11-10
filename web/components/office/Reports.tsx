"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Download,
  Printer,
  Calendar,
  TrendingUp,
  TrendingDown,
  Users,
  ArrowLeftRight,
  Wallet,
  BarChart3,
  PieChart,
  Filter,
  Search,
  RefreshCw,
  Eye,
  DollarSign,
  Building2,
  Smartphone,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  ArrowDown,
  ArrowUp,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  FileSpreadsheet,
  Send,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Banknote,
  CircleDollarSign,
  Receipt,
  Target,
  Percent,
  Scale,
  Coins,
} from "lucide-react";
import { toast } from "sonner";
import {
  getDailyReport,
  getMonthlyReport,
  getClientStatementReport,
  getClients,
  getBankAccounts,
  getCashAccounts,
  getMpesaAgents,
  getExchangeTransactions,
  getExchangeTodaySummary,
  getCurrentExchangeRate,
  getExchangeFloat,
  formatCurrency,
  formatNumber,
  Currency,
  ExchangeDirection,
  apiRequest,
  getStoredAuth,
  formatMoney,
  currencyCode,
} from "@/lib/api";
import { useBaseCurrency, foreignCurrenciesFor, useAllowedCurrencies } from "@/lib/useBaseCurrency";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { bureauFlow, flowLabel, type FlowKind } from "@/lib/moneyflow";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { localDate } from "@/lib/dates";

type ReportType =
  | "transactions"
  | "clients"
  | "exchange"
  | "cashflow"
  | "accounts"
  | "daily"
  | "profit";
type ExportFormat = "pdf" | "excel" | "csv";

// Account-aware cashflow, per business rule:
//   Money IN  = Client Credits + Asset (Cash/Bank/M-Pesa) Debits
//   Money OUT = Client Debits  + Asset Credits
// Computed from the daily report's transaction list (per currency).
// AccountType: 3 = Client; TransactionType: 0 = Debit, 1 = Credit; Currency: 0 = KES, 1 = USD.
function computeCashflow(txns: any[]): {
  inKES: number;
  outKES: number;
  inUSD: number;
  outUSD: number;
} {
  let inKES = 0,
    outKES = 0,
    inUSD = 0,
    outUSD = 0;
  for (let t of txns || []) {
    // Mapped rows carry their flow; raw API rows are worked out here.
    const f = t.flowKind ? { kind: t.flowKind as FlowKind, amount: Math.abs(t.amount || 0), currency: t.currency } : bureauFlow(t);
    const amt = f.amount;
    if (!amt || (f.kind !== "in" && f.kind !== "out")) continue; // transfers move no money in or out
    const isIn = f.kind === "in";
    t = { ...t, currency: f.currency };
    // Explicit buckets: these figures are KES/USD; other currencies
    // (UGX, EUR, ...) are excluded rather than miscounted as KES.
    const isUSD = t.currency === 1 || t.currency === "USD";
    const isKES =
      t.currency === 0 || t.currency === "KES" ||
      t.currency === undefined || t.currency === null;
    if (isUSD) {
      if (isIn) inUSD += amt;
      else outUSD += amt;
    } else if (isKES) {
      if (isIn) inKES += amt;
      else outKES += amt;
    }
  }
  return { inKES, outKES, inUSD, outUSD };
}

// Per-currency cashflow: one { in, out } bucket per currency that has activity.
// Same account-aware rule (Money In = client credits + asset debits). Used by
// the Reports stat cards so a UGX/USD bureau sees real UGX/USD figures instead
// of a single mislabeled "KES" number that silently drops other currencies.
const CURRENCY_CODES: Record<number, string> = {
  0: "KES",
  1: "USD",
  2: "UGX",
  3: "EUR",
};
/** Cash & bank per currency from the daily report (falls back to KES/USD fields). */
function dailyBalancesByCurrency(d: any): DailyCurrencyBalances[] {
  const map = new Map<number, DailyCurrencyBalances>();
  const slot = (c: number) => {
    if (!map.has(c)) map.set(c, { currency: c, openingCash: 0, openingBank: 0, closingCash: 0, closingBank: 0 });
    return map.get(c)!;
  };
  const o = d?.openingBalances || {};
  const c = d?.closingBalances || {};
  if (Array.isArray(o.byCurrency) && o.byCurrency.length > 0) {
    for (const r of o.byCurrency) {
      slot(r.currency).openingCash += r.cash || 0;
      slot(r.currency).openingBank += r.bank || 0;
    }
  } else {
    slot(0).openingCash += o.cashKES || 0;
    slot(0).openingBank += o.bankKES || 0;
    slot(1).openingCash += o.cashUSD || 0;
    slot(1).openingBank += o.bankUSD || 0;
  }
  if (Array.isArray(c.byCurrency) && c.byCurrency.length > 0) {
    for (const r of c.byCurrency) {
      slot(r.currency).closingCash += r.cash || 0;
      slot(r.currency).closingBank += r.bank || 0;
    }
  } else {
    slot(0).closingCash += c.cashKES || 0;
    slot(0).closingBank += c.bankKES || 0;
    slot(1).closingCash += c.cashUSD || 0;
    slot(1).closingBank += c.bankUSD || 0;
  }
  return [...map.values()].sort((a, b) => a.currency - b.currency);
}

/** A client's balance in every currency: KES/USD fields + otherBalances. */
function clientBalanceMap(client: any): Record<number, number> {
  const m: Record<number, number> = { 0: client.balanceKES || 0, 1: client.balanceUSD || 0 };
  for (const b of client.otherBalances || []) m[b.currency] = b.balance || 0;
  return m;
}

// ---- Today's rates (home currency per 1 unit), for home-currency totals -----
// "Home" = the company base currency (KES in Kenya, UGX in Uganda). The
// KES_RATES name is historical: it maps currency -> home-currency value of 1 unit.
// Amounts in different currencies are never added raw; they are converted at
// the mid of today's buy/sell rate. A currency without a rate is left out and
// reported as excluded (never guessed — the old code used a fixed 130).
let REPORT_BASE = 0;
let KES_RATES: Record<number, number> = { 0: 1 };
async function loadKesRates(base: number = REPORT_BASE): Promise<Record<number, number>> {
  REPORT_BASE = base;
  const foreign = foreignCurrenciesFor(base);
  const res = await Promise.all(foreign.map((c) => getCurrentExchangeRate(c).catch(() => null)));
  const next: Record<number, number> = { [base]: 1 };
  foreign.forEach((c, i) => {
    const r: any = res[i];
    if (r && r.success && r.data && r.data.buyRate > 0) next[c] = (r.data.buyRate + r.data.sellRate) / 2;
  });
  KES_RATES = next;
  return next;
}
let RATES_LOADED = false;
async function ensureRates() {
  if (RATES_LOADED) return KES_RATES;
  const r = await loadKesRates().catch(() => KES_RATES);
  RATES_LOADED = true;
  return r;
}
/** Net money in − out across every currency, in the home currency at today's rates. */
function netKesEquivalent(txns: any[]): number {
  return computeCashflowByCurrency(txns).reduce((sum, b) => {
    const r = KES_RATES[b.currency];
    return r ? sum + (b.in - b.out) * r : sum;
  }, 0);
}
const toCurrencyNum = (c: any): number =>
  typeof c === "number"
    ? c
    : Number(Object.entries(CURRENCY_CODES).find(([, code]) => code === c)?.[0] ?? 0);
/** Home-currency value of an amount, or null when that currency has no rate today. */
const toKes = (amount: number, c: any): number | null => {
  const r = KES_RATES[toCurrencyNum(c)];
  return r ? amount * r : null;
};

/** "UGX 2,400,000" — code + amount, shillings without cents. */
const money = (n: number, c: number) => formatMoney(n, c);

/** "KES 1,000,000 · UGX 2,400,000" for a per-currency total map. */
const totalsLine = (t: Record<number, number>) =>
  Object.entries(t)
    .filter(([c, v]) => v !== 0 || Number(c) === 0)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([c, v]) => formatMoney(v, Number(c)))
    .join(" · ") || "0";

function TotalsByCurrency({ totals }: { totals: Record<number, number> }) {
  const rows = Object.entries(totals)
    .filter(([c, v]) => v !== 0 || Number(c) === 0)
    .sort(([a], [b]) => Number(a) - Number(b));
  return (
    <>
      {rows.map(([c, v]) => (
        <div key={c} className="font-semibold text-slate-900 tabular-nums">
          {formatMoney(v, Number(c))}
        </div>
      ))}
    </>
  );
}

function computeCashflowByCurrency(
  txns: any[],
): { code: string; currency: number; in: number; out: number }[] {
  const buckets: Record<number, { in: number; out: number }> = {};
  for (const t of txns || []) {
    const f = t.flowKind ? { kind: t.flowKind as FlowKind, amount: Math.abs(t.amount || 0), currency: t.currency } : bureauFlow(t);
    const amt = f.amount;
    if (!amt || (f.kind !== "in" && f.kind !== "out")) continue;
    // Normalize currency to a numeric enum value.
    let cur: any = f.currency;
    if (typeof cur === "string") {
      const found = Object.entries(CURRENCY_CODES).find(([, c]) => c === cur);
      cur = found ? Number(found[0]) : 0;
    }
    if (cur === undefined || cur === null) cur = 0;
    const isIn = f.kind === "in";
    if (!buckets[cur]) buckets[cur] = { in: 0, out: 0 };
    if (isIn) buckets[cur].in += amt;
    else buckets[cur].out += amt;
  }
  return Object.keys(buckets)
    .map(Number)
    .sort((a, b) => a - b)
    .map((cur) => ({
      code: CURRENCY_CODES[cur] || String(cur),
      currency: cur,
      in: buckets[cur].in,
      out: buckets[cur].out,
    }));
}

interface DailyReportData {
  date: string;
  openingBalances: {
    cashKES: number;
    cashUSD: number;
    bankKES: number;
    bankUSD: number;
    mpesa: number;
  };
  transactionSummary: {
    totalDebits: number;
    totalCredits: number;
    transactionCount: number;
  };
  closingBalances: {
    cashKES: number;
    cashUSD: number;
    bankKES: number;
    bankUSD: number;
    mpesa: number;
  };
  transactions: any[];
  /** Cash & bank per currency (KES, USD, UGX, EUR) */
  byCurrency: DailyCurrencyBalances[];
  /** Mobile money per wallet currency (M-Pesa is KES even in a Ugandan bureau). */
  mobileMoney: { currency: number; opening: number; closing: number }[];
}

interface DailyCurrencyBalances {
  currency: number;
  openingCash: number;
  openingBank: number;
  closingCash: number;
  closingBank: number;
}

interface ClientBalance {
  id: string;
  code: string;
  name: string;
  whatsAppNumber: string;
  balanceKES: number;
  balanceUSD: number;
  balanceType: string;
  /** Balance per currency (KES, USD, UGX, EUR) */
  balances: Record<number, number>;
}

interface AccountSummary {
  cashAccounts: any[];
  bankAccounts: any[];
  mpesaAgents: any[];
  totalCashKES: number;
  totalCashUSD: number;
  totalBankKES: number;
  totalBankUSD: number;
  totalMpesa: number; // home-currency wallets only
  /** Totals per currency (KES, USD, UGX, EUR) */
  cashByCurrency: Record<number, number>;
  bankByCurrency: Record<number, number>;
  /** Mobile money per wallet currency: an M-Pesa wallet is KES even in a Ugandan bureau. */
  mpesaByCurrency: Record<number, number>;
}

interface ExchangeSummaryData {
  totalExchanges: number;
  totalUsdBought: number;
  totalUsdSold: number;
  /** Per foreign currency (USD, UGX, EUR): bought = sold to clients for KES, sold = bought from clients */
  volumeByCurrency: Record<number, { bought: number; sold: number }>;
  /** Float in UGX, EUR, ... */
  floatOther: { currency: number; balance: number }[];
  totalKesVolume: number;
  totalProfit: number;
  averageBuyRate: number;
  averageSellRate: number;
  currentBuyRate: number;
  currentSellRate: number;
  floatKES: number;
  floatUSD: number;
  kesProfit: number;
  usdProfit: number;
  transactions: any[];
}

interface ProfitLossData {
  /** Currencies left out of the home-currency totals because no rate is set */
  excludedCurrencies?: string[];
  period: string;
  exchangeProfit: number;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  profitByCategory: { category: string; amount: number; color: string }[];
  dailyProfits: { date: string; profit: number }[];
}

/** Opening or closing balances: cash & bank for every currency, plus mobile money (home currency). */
function DailyBalanceList({ report, side }: { report: DailyReportData; side: "opening" | "closing" }) {
  const { base, baseCode } = useBaseCurrency();
  const lines: { label: string; value: number; currency: number }[] = [];
  for (const r of report.byCurrency) {
    const cash = side === "opening" ? r.openingCash : r.closingCash;
    const bank = side === "opening" ? r.openingBank : r.closingBank;
    const code = CURRENCY_CODES[r.currency] || String(r.currency);
    // KES/USD always shown; other currencies only when there is something to show
    const always = r.currency === 0 || r.currency === 1;
    if (always || r.openingCash || r.closingCash) lines.push({ label: `Cash ${code}`, value: cash, currency: r.currency });
    if (always || r.openingBank || r.closingBank) lines.push({ label: `Bank ${code}`, value: bank, currency: r.currency });
  }
  // One line per wallet currency (an M-Pesa wallet is KES even in a Ugandan bureau).
  const wallets = report.mobileMoney?.length
    ? report.mobileMoney
    : [{ currency: base, opening: report.openingBalances.mpesa, closing: report.closingBalances.mpesa }];
  for (const w of wallets)
    lines.push({
      label: wallets.length > 1 ? `Mobile money ${CURRENCY_CODES[w.currency] || w.currency}` : "Mobile money",
      value: side === "opening" ? w.opening : w.closing,
      currency: w.currency,
    });
  return (
    <div className="space-y-2">
      {lines.map((l) => (
        <div key={l.label} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <span className="text-sm font-medium text-slate-700">{l.label}</span>
          <span className="text-sm font-semibold text-slate-900 tabular-nums">{money(l.value, l.currency)}</span>
        </div>
      ))}
    </div>
  );
}

export function Reports() {
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
  useEffect(() => { setDailyShown(50); }, [dailyReport]);
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
      const response = await apiRequest<any[]>(
        "/api/report/transactions?page=1&pageSize=500",
      );

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
      const response = await getClients(1, 200); // Get all clients with pagination
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
        getExchangeTransactions(1, 100),
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

  // Fetch profit and loss data
  const fetchProfitLoss = useCallback(async () => {
    try {
      await loadKesRates();
      const excluded = new Set<string>();
      // Fetch all required data for P&L calculation
      const [exchangeRes, summaryRes, floatRes, txnRes] = await Promise.all([
        getExchangeTransactions(1, 500),
        getExchangeTodaySummary(),
        getExchangeFloat(),
        // This month only, and all of it: the endpoint's default page is 10 rows,
        // so the P&L used to be built from the last 10 transactions.
        apiRequest<any[]>(
          `/api/report/transactions?page=1&pageSize=1000&startDate=${(() => {
            const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
            return encodeURIComponent(d.toISOString());
          })()}`,
        ),
      ]);

      const exchangeTransactions =
        exchangeRes.success && exchangeRes.data
          ? exchangeRes.data.items || exchangeRes.data
          : [];
      const todaySummary =
        summaryRes.success && summaryRes.data ? summaryRes.data : null;
      const floatData =
        floatRes.success && floatRes.data ? floatRes.data : null;
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

      let exchangeProfit = 0;
      if (Array.isArray(exchangeTransactions)) {
        exchangeProfit = exchangeTransactions
          .filter((x: any) => inMonth(x.transactionDate || x.createdAt))
          .reduce((sum: number, x: any) => sum + (x.profit || 0), 0);
      }

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

      // Generate daily profit trend (last 7 days mock for now)
      const dailyProfits = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dailyProfits.push({
          date: date.toLocaleDateString("en-KE", { weekday: "short" }),
          profit: 0, // Historical daily data requires daily summaries API
        });
      }

      // Use today's actual summary if available
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

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

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

    return matchesSearch && matchesCurrency && matchesType;
  });

  // Currencies any client holds (KES and USD always shown)
  const clientCurrencies: number[] = (() => {
    const set = new Set<number>([0, 1]);
    for (const c of clientBalances) for (const [k, v] of Object.entries(c.balances)) if (v) set.add(Number(k));
    return [...set].sort((a, b) => a - b);
  })();

  // Today's rates for home-currency charts (re-render once loaded)
  const [, setRatesLoaded] = useState(0);
  useEffect(() => {
    RATES_LOADED = false;
    loadKesRates(base).then(() => setRatesLoaded((n) => n + 1)).catch(() => {});
  }, [base]);

  // Pagination logic
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredTransactions.slice(
    indexOfFirstItem,
    indexOfLastItem,
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, currencyFilter, transactionTypeFilter, reportType]);

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

  const COLORS = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
  ];

  const handleExport = (format: ExportFormat) => {
    if (format === "pdf") {
      try {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Get company info from auth
        const auth = getStoredAuth();
        const companyName = auth?.user?.companyName || "Money Exchange";

        // Report title based on type
        const reportTitle =
          reportType === "transactions"
            ? "Transaction Report"
            : reportType === "clients"
              ? "Client Balances Report"
              : reportType === "exchange"
                ? "Exchange Summary Report"
                : reportType === "cashflow"
                  ? "Cash Flow Report"
                  : reportType === "accounts"
                    ? "Accounts Summary Report"
                    : reportType === "daily"
                      ? "Daily Report"
                      : reportType === "profit"
                        ? "Profit & Loss Report"
                        : "Report";

        // ========== CORPORATE HEADER ==========
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, pageWidth, 4, "F");

        doc.setFillColor(250, 250, 250);
        doc.rect(0, 4, pageWidth, 36, "F");

        doc.setFillColor(37, 99, 235);
        doc.rect(14, 10, 24, 24, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(companyName.charAt(0).toUpperCase(), 26, 26, {
          align: "center",
        });

        doc.setTextColor(17, 24, 39);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text(companyName, 44, 18);

        doc.setTextColor(107, 114, 128);
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        doc.text(reportTitle, 44, 26);

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
        doc.text("Period", pageWidth - 14, 28, { align: "right" });
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(selectedDate || "Today", pageWidth - 14, 35, {
          align: "right",
        });

        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.5);
        doc.line(14, 42, pageWidth - 14, 42);

        // ========== OVERVIEW STATISTICS ==========
        let yPos = 50;
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("OVERVIEW", 14, yPos);

        yPos += 6;
        const cardWidth = (pageWidth - 42) / 4;

        // Per-currency cash flow rows (only currencies with activity), so a
        // UGX/USD bureau's PDF shows real UGX/USD figures, not a KES-only line.
        const pdfByCurrency = computeCashflowByCurrency(
          dailyReport?.transactions || [],
        );
        const pdfCurrencies =
          pdfByCurrency.length > 0
            ? pdfByCurrency
            : [{ code: "USD", currency: 1, in: 0, out: 0 }];

        pdfCurrencies.forEach((c) => {
          const net = c.in - c.out;
          const netPositive = net >= 0;

          // Money In
          doc.setDrawColor(229, 231, 235);
          doc.rect(14, yPos, cardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text(`Money In (${c.code})`, 16, yPos + 6);
          doc.setFontSize(11);
          doc.setTextColor(22, 163, 74);
          doc.setFont("helvetica", "bold");
          doc.text(`${c.code} ${c.in.toLocaleString()}`, 16, yPos + 14);

          // Money Out
          doc.setDrawColor(229, 231, 235);
          doc.rect(14 + cardWidth + 4, yPos, cardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text(`Money Out (${c.code})`, 18 + cardWidth, yPos + 6);
          doc.setFontSize(11);
          doc.setTextColor(220, 38, 38);
          doc.setFont("helvetica", "bold");
          doc.text(
            `${c.code} ${c.out.toLocaleString()}`,
            18 + cardWidth,
            yPos + 14,
          );

          // Net Position
          doc.setDrawColor(229, 231, 235);
          doc.rect(14 + (cardWidth + 4) * 2, yPos, cardWidth * 2 + 4, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text(`Net Position (${c.code})`, 18 + (cardWidth + 4) * 2, yPos + 6);
          doc.setFontSize(11);
          doc.setTextColor(
            netPositive ? 22 : 185,
            netPositive ? 163 : 28,
            netPositive ? 74 : 28,
          );
          doc.setFont("helvetica", "bold");
          doc.text(
            `${netPositive ? "+" : ""}${c.code} ${net.toLocaleString()}`,
            18 + (cardWidth + 4) * 2,
            yPos + 14,
          );

          yPos += 24;
        });

        // Transactions (currency-agnostic)
        doc.setDrawColor(229, 231, 235);
        doc.rect(14, yPos, cardWidth, 20, "S");
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.setFont("helvetica", "normal");
        doc.text("Transactions", 16, yPos + 6);
        doc.setFontSize(11);
        doc.setTextColor(17, 24, 39);
        doc.setFont("helvetica", "bold");
        doc.text(
          String(
            dailyReport?.transactionSummary?.transactionCount ||
              (dailyReport?.transactions || []).length ||
              0,
          ),
          16,
          yPos + 14,
        );
        yPos += 24;

        // ========== BALANCES TABLE ==========
        yPos += 30;
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("ACCOUNT BALANCES", 14, yPos);

        // Cash & bank for every currency (KES, USD, UGX, EUR), then M-Pesa (KES)
        const balanceData: string[][] = [
          ...(dailyReport?.byCurrency || []).flatMap((r) => {
            const code = CURRENCY_CODES[r.currency];
            const always = r.currency === 0 || r.currency === 1;
            const rows: string[][] = [];
            if (always || r.openingCash || r.closingCash)
              rows.push([`Cash (${code})`, money(r.openingCash, r.currency), money(r.closingCash, r.currency)]);
            if (always || r.openingBank || r.closingBank)
              rows.push([`Bank (${code})`, money(r.openingBank, r.currency), money(r.closingBank, r.currency)]);
            return rows;
          }),
          // Was always printed as KES; each wallet currency now gets its own row.
          ...(dailyReport?.mobileMoney || []).map((w) => [
            `Mobile money (${CURRENCY_CODES[w.currency] || w.currency})`,
            money(w.opening, w.currency),
            money(w.closing, w.currency),
          ]),
        ];

        autoTable(doc, {
          startY: yPos + 4,
          head: [["Account", "Opening Balance", "Closing Balance"]],
          body: balanceData,
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
            0: { cellWidth: 50, fontStyle: "bold" },
            1: { cellWidth: 55, halign: "right" },
            2: { cellWidth: 55, halign: "right" },
          },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          margin: { left: 14, right: 14 },
        });

        // ========== EXCHANGE SUMMARY (if applicable) ==========
        if (
          exchangeSummary &&
          (reportType === "exchange" || reportType === "daily")
        ) {
          const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
          yPos = finalY + 12;

          doc.setTextColor(17, 24, 39);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("EXCHANGE SUMMARY", 14, yPos);

          yPos += 6;
          const exchCardWidth = (pageWidth - 38) / 3;

          // USD Bought
          doc.setDrawColor(229, 231, 235);
          doc.rect(14, yPos, exchCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Foreign bought", 16, yPos + 6);
          doc.setFontSize(11);
          doc.setTextColor(37, 99, 235);
          doc.setFont("helvetica", "bold");
          doc.text(
            Object.entries(exchangeSummary.volumeByCurrency)
              .map(([c, v]) => money(v.bought, Number(c)))
              .join(" · ") || "0",
            16,
            yPos + 14,
          );

          // USD Sold
          doc.rect(14 + exchCardWidth + 5, yPos, exchCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Foreign sold", 18 + exchCardWidth + 5, yPos + 6);
          doc.setFontSize(11);
          doc.setTextColor(202, 138, 4);
          doc.setFont("helvetica", "bold");
          doc.text(
            Object.entries(exchangeSummary.volumeByCurrency)
              .map(([c, v]) => money(v.sold, Number(c)))
              .join(" · ") || "0",
            18 + exchCardWidth + 5,
            yPos + 14,
          );

          // Profit
          const profitPositive = (exchangeSummary.totalProfit || 0) >= 0;
          doc.rect(14 + (exchCardWidth + 5) * 2, yPos, exchCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Total Profit", 18 + (exchCardWidth + 5) * 2, yPos + 6);
          doc.setFontSize(11);
          doc.setTextColor(
            profitPositive ? 22 : 185,
            profitPositive ? 163 : 28,
            profitPositive ? 74 : 28,
          );
          doc.setFont("helvetica", "bold");
          doc.text(
            `${baseCode} ${(exchangeSummary.totalProfit || 0).toLocaleString()}`,
            18 + (exchCardWidth + 5) * 2,
            yPos + 14,
          );
        }

        // ========== CLIENT BALANCES (if applicable) ==========
        if (clientBalances.length > 0 && reportType === "clients") {
          const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
          yPos = finalY + 12;

          doc.setTextColor(17, 24, 39);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("CLIENT BALANCES", 14, yPos);

          const clientData = clientBalances.map((client) => [
            client.code,
            client.name,
            client.whatsAppNumber,
            ...clientCurrencies.map((c) => money(client.balances[c] || 0, c)),
          ]);

          autoTable(doc, {
            startY: yPos + 4,
            head: [["Code", "Name", "Phone", ...clientCurrencies.map((c) => `${CURRENCY_CODES[c]} Balance`)]],
            body: clientData,
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
              0: { cellWidth: 22 },
              1: { cellWidth: clientCurrencies.length > 2 ? 34 : 45 },
              2: { cellWidth: clientCurrencies.length > 2 ? 28 : 35 },
              // one right-aligned column per currency (KES, USD, UGX, EUR)
              ...Object.fromEntries(clientCurrencies.map((_, i) => [3 + i, { halign: "right" as const }])),
            },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            margin: { left: 14, right: 14 },
            didParseCell: (data: any) => {
              if (
                data.section === "body" &&
                data.column.index >= 3
              ) {
                // "KES -82,000" — the sign follows the currency code
                const isNegative = /(^|\s)-/.test(String(data.cell.raw));
                data.cell.styles.textColor = isNegative
                  ? [185, 28, 28]
                  : [22, 163, 74];
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
              doc.text("Confidential", pageWidth - 14, pageHeight - 12, {
                align: "right",
              });
            },
          });
        }

        // ========== TRANSACTIONS TABLE (if applicable) ==========
        if (transactions.length > 0 && reportType === "transactions") {
          const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
          yPos = finalY + 12;

          doc.setTextColor(17, 24, 39);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("TRANSACTIONS", 14, yPos);

          const txnData = transactions
            .slice(0, 50)
            .map((txn: any) => [
              new Date(txn.transactionDate || txn.date).toLocaleDateString(
                "en-GB",
                { day: "2-digit", month: "short" },
              ),
              txn.code || txn.reference || "-",
              (txn.description || "").substring(0, 25) +
                ((txn.description?.length || 0) > 25 ? "..." : ""),
              // Mapped rows: type "debit" = money in, "credit" = money out (the raw
              // transactionType isn't on them, so this always printed "CR" before).
              txn.type === "debit" ? "IN" : txn.type === "credit" ? "OUT" : "TRF",
              typeof txn.currency === "string" ? txn.currency : CURRENCY_CODES[txn.currency] || "KES",
              `${txn.type === "debit" ? "+" : txn.type === "credit" ? "-" : ""}${(txn.amount || 0).toLocaleString()}`,
            ]);

          autoTable(doc, {
            startY: yPos + 4,
            head: [["Date", "Code", "Description", "Type", "Curr", "Amount"]],
            body: txnData,
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
              0: { cellWidth: 22 },
              1: { cellWidth: 26 },
              2: { cellWidth: 55 },
              3: { cellWidth: 14, halign: "center" },
              4: { cellWidth: 14, halign: "center" },
              5: { cellWidth: 28, halign: "right" },
            },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            margin: { left: 14, right: 14 },
            didParseCell: (data: any) => {
              if (data.section === "body" && data.column.index === 3) {
                data.cell.styles.textColor =
                  data.cell.raw === "CR" ? [22, 163, 74] : [220, 38, 38];
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
              doc.text(
                "Computer-generated report",
                pageWidth - 14,
                pageHeight - 12,
                { align: "right" },
              );
            },
          });
        }

        // ========== ACCOUNTS SUMMARY (if applicable) ==========
        if (accountSummary && reportType === "accounts") {
          const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
          yPos = finalY + 12;

          doc.setTextColor(17, 24, 39);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("ACCOUNTS SUMMARY", 14, yPos);

          yPos += 6;
          const acctCardWidth = (pageWidth - 38) / 3;

          // Total Cash
          doc.setDrawColor(229, 231, 235);
          doc.rect(14, yPos, acctCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Total Cash", 16, yPos + 6);
          doc.setFontSize(10);
          doc.setTextColor(17, 24, 39);
          doc.setFont("helvetica", "bold");
          doc.text(totalsLine(accountSummary.cashByCurrency), 16, yPos + 14);

          // Total Bank
          doc.rect(14 + acctCardWidth + 5, yPos, acctCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Total Bank", 18 + acctCardWidth + 5, yPos + 6);
          doc.setFontSize(10);
          doc.setTextColor(17, 24, 39);
          doc.setFont("helvetica", "bold");
          doc.text(totalsLine(accountSummary.bankByCurrency), 18 + acctCardWidth + 5, yPos + 14);

          // Total M-Pesa
          doc.rect(14 + (acctCardWidth + 5) * 2, yPos, acctCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Total mobile money", 18 + (acctCardWidth + 5) * 2, yPos + 6);
          doc.setFontSize(10);
          doc.setTextColor(17, 24, 39);
          doc.setFont("helvetica", "bold");
          doc.text(
            totalsLine(accountSummary.mpesaByCurrency || { [base]: accountSummary.totalMpesa || 0 }),
            18 + (acctCardWidth + 5) * 2,
            yPos + 14,
          );
        }

        // ========== PROFIT & LOSS (if applicable) ==========
        if (profitLossData && reportType === "profit") {
          const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
          yPos = finalY + 12;

          doc.setTextColor(17, 24, 39);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("PROFIT & LOSS SUMMARY", 14, yPos);

          yPos += 6;
          const plCardWidth = (pageWidth - 42) / 4;

          // Exchange Profit
          const exchProfitPositive = (profitLossData.exchangeProfit || 0) >= 0;
          doc.setDrawColor(229, 231, 235);
          doc.rect(14, yPos, plCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Exchange Profit", 16, yPos + 6);
          doc.setFontSize(10);
          doc.setTextColor(
            exchProfitPositive ? 22 : 185,
            exchProfitPositive ? 163 : 28,
            exchProfitPositive ? 74 : 28,
          );
          doc.setFont("helvetica", "bold");
          doc.text(
            `${baseCode} ${(profitLossData.exchangeProfit || 0).toLocaleString()}`,
            16,
            yPos + 14,
          );

          // Total Income
          doc.rect(14 + plCardWidth + 4, yPos, plCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Total Income", 18 + plCardWidth, yPos + 6);
          doc.setFontSize(10);
          doc.setTextColor(22, 163, 74);
          doc.setFont("helvetica", "bold");
          doc.text(
            `${baseCode} ${(profitLossData.totalIncome || 0).toLocaleString()}`,
            18 + plCardWidth,
            yPos + 14,
          );

          // Total Expenses
          doc.rect(14 + (plCardWidth + 4) * 2, yPos, plCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Total Expenses", 18 + (plCardWidth + 4) * 2, yPos + 6);
          doc.setFontSize(10);
          doc.setTextColor(220, 38, 38);
          doc.setFont("helvetica", "bold");
          doc.text(
            `${baseCode} ${(profitLossData.totalExpenses || 0).toLocaleString()}`,
            18 + (plCardWidth + 4) * 2,
            yPos + 14,
          );

          // Net Profit
          const netProfitPositive = (profitLossData.netProfit || 0) >= 0;
          doc.rect(14 + (plCardWidth + 4) * 3, yPos, plCardWidth, 20, "S");
          doc.setFontSize(7);
          doc.setTextColor(107, 114, 128);
          doc.setFont("helvetica", "normal");
          doc.text("Net Profit", 18 + (plCardWidth + 4) * 3, yPos + 6);
          doc.setFontSize(10);
          doc.setTextColor(
            netProfitPositive ? 22 : 185,
            netProfitPositive ? 163 : 28,
            netProfitPositive ? 74 : 28,
          );
          doc.setFont("helvetica", "bold");
          doc.text(
            `${baseCode} ${(profitLossData.netProfit || 0).toLocaleString()}`,
            18 + (plCardWidth + 4) * 3,
            yPos + 14,
          );
        }

        // ========== FOOTER ==========
        const lastY = (doc as any).lastAutoTable?.finalY || yPos + 30;
        if (lastY < pageHeight - 40) {
          doc.setDrawColor(229, 231, 235);
          doc.line(14, lastY + 12, pageWidth - 14, lastY + 12);

          doc.setFontSize(7);
          doc.setTextColor(156, 163, 175);
          doc.text(
            "This is a computer-generated report and does not require a signature.",
            pageWidth / 2,
            lastY + 20,
            { align: "center" },
          );
          doc.text(
            `${companyName} • Generated on ${new Date().toLocaleString()}`,
            pageWidth / 2,
            lastY + 26,
            { align: "center" },
          );
        }

        const fileName = `${companyName.replace(
          /\s+/g,
          "_",
        )}_${reportTitle.replace(/\s+/g, "_")}_${
          localDate()
        }.pdf`;
        doc.save(fileName);
        toast.success("Report exported successfully!");
      } catch (error) {
        console.error("Error generating PDF:", error);
        toast.error("Failed to generate PDF");
      }
    } else if (format === "csv" || format === "excel") {
      // CSV/Excel export
      let csvData: string[][] = [];

      if (reportType === "clients" && clientBalances.length > 0) {
        csvData = [
          [
            "Code",
            "Name",
            "Phone",
            ...clientCurrencies.map((c) => `${CURRENCY_CODES[c]} Balance`),
            "Balance Type",
          ],
          ...clientBalances.map((client) => [
            client.code,
            client.name,
            client.whatsAppNumber,
            ...clientCurrencies.map((c) => String(client.balances[c] || 0)),
            client.balanceType,
          ]),
        ];
      } else if (dailyReport) {
        // Per-currency Money In/Out rows (only currencies with activity).
        const csvByCurrency = computeCashflowByCurrency(
          dailyReport.transactions || [],
        );
        const cashflowRows: string[][] = csvByCurrency.flatMap((c) => [
          [`Money In (${c.code})`, c.in.toString()],
          [`Money Out (${c.code})`, c.out.toString()],
          [`Net Flow (${c.code})`, (c.in - c.out).toString()],
        ]);
        csvData = [
          ["Metric", "Value"],
          ["Report Date", dailyReport.date || new Date().toLocaleDateString()],
          ...cashflowRows,
          [
            "Transaction Count",
            dailyReport.transactionSummary?.transactionCount?.toString() ||
              (dailyReport.transactions || []).length.toString(),
          ],
          // Cash & bank, opening and closing, for every currency held
          ...(dailyReport.byCurrency || []).flatMap((r) => {
            const code = CURRENCY_CODES[r.currency];
            return [
              [`Cash ${code} (Opening)`, String(r.openingCash)],
              [`Cash ${code} (Closing)`, String(r.closingCash)],
              [`Bank ${code} (Opening)`, String(r.openingBank)],
              [`Bank ${code} (Closing)`, String(r.closingBank)],
            ];
          }),
          ...(dailyReport.mobileMoney || []).flatMap((w) => [
            [`Mobile money ${CURRENCY_CODES[w.currency]} (Opening)`, String(w.opening)],
            [`Mobile money ${CURRENCY_CODES[w.currency]} (Closing)`, String(w.closing)],
          ]),
        ];
      }

      if (csvData.length > 0) {
        const csv = csvData
          .map((row) => row.map((cell) => `"${cell}"`).join(","))
          .join("\n");
        const blob = new Blob([csv], {
          type: format === "csv" ? "text/csv" : "application/vnd.ms-excel",
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `report_${reportType}_${
          localDate()
        }.${format === "csv" ? "csv" : "xls"}`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success(`Report exported as ${format.toUpperCase()}!`);
      } else {
        toast.error("No data to export");
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header — stacks on phones (the buttons used to push the page past the screen edge) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Reports & Analytics
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Comprehensive business intelligence and insights
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            onClick={() => fetchReportData()}
            disabled={loading}
            className="px-4 py-2 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center gap-2 text-sm font-semibold text-slate-700 disabled:opacity-50 rounded-lg"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-white border border-slate-200 hover:border-slate-200 hover:bg-[#E9EEF6] transition-all flex items-center gap-2 text-sm font-semibold text-slate-700 print:hidden rounded-lg"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <div className="relative group">
            <button className="px-6 py-2 bg-blue-600 text-white font-semibold hover:shadow-md transition-all flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-white shadow-sm border border-slate-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 rounded-lg">
              <button
                onClick={() => handleExport("pdf")}
                className="w-full px-4 py-3 hover:bg-blue-50 text-left flex items-center gap-2 text-sm font-medium text-slate-700"
              >
                <FileText className="w-4 h-4" />
                Export as PDF
              </button>
              <button
                onClick={() => handleExport("excel")}
                className="w-full px-4 py-3 hover:bg-emerald-50 text-left flex items-center gap-2 text-sm font-medium text-slate-700"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export as Excel
              </button>
              <button
                onClick={() => handleExport("csv")}
                className="w-full px-4 py-3 hover:bg-[#E9EEF6] text-left flex items-center gap-2 text-sm font-medium text-slate-700"
              >
                <FileText className="w-4 h-4" />
                Export as CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Overview — per currency (only currencies with activity) */}
      {(() => {
        const byCurrency = computeCashflowByCurrency(
          dailyReport?.transactions || [],
        );
        // Colors per currency for a little visual distinction.
        const tint: Record<
          number,
          { net: string; border: string; from: string }
        > = {
          0: {
            net: "text-emerald-700",
            border: "border-emerald-200",
            from: "bg-emerald-50",
          },
          1: {
            net: "text-blue-700",
            border: "border-blue-200",
            from: "bg-slate-50",
          },
          2: {
            net: "text-amber-700",
            border: "border-amber-200",
            from: "bg-amber-50",
          },
          3: {
            net: "text-[#0F172A]",
            border: "border-slate-200",
            from: "bg-slate-50",
          },
        };
        return (
          <div className="space-y-4">
            {byCurrency.length === 0 && (
              <div className="bg-slate-50 border border-slate-200 p-6 text-center text-slate-500 rounded-xl">
                No transaction activity for this period.
              </div>
            )}
            {byCurrency.map((c) => {
              const net = c.in - c.out;
              const t = tint[c.currency] || tint[0];
              return (
                <div key={c.currency}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      {c.code} Cash Flow
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-emerald-50 border border-emerald-200 p-6 shadow-sm rounded-xl">
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 bg-emerald-600 flex items-center justify-center">
                          <ArrowUpRight className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xs font-semibold text-emerald-700 uppercase">
                          Money In
                        </span>
                      </div>
                      <div className="text-3xl font-semibold text-emerald-700 mb-1">
                        {c.in.toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}
                      </div>
                      <div className="text-sm text-slate-600">
                        Total inflows ({c.code})
                      </div>
                    </div>
                    <div className="bg-red-50 border border-red-200 p-6 shadow-sm rounded-xl">
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 bg-red-600 flex items-center justify-center">
                          <ArrowDownRight className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xs font-semibold text-red-700 uppercase">
                          Money Out
                        </span>
                      </div>
                      <div className="text-3xl font-semibold text-red-700 mb-1">
                        {c.out.toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}
                      </div>
                      <div className="text-sm text-slate-600">
                        Total outflows ({c.code})
                      </div>
                    </div>
                    <div
                      className={` ${t.from} to-white border rounded-lg ${t.border} p-6 shadow-sm`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 bg-slate-700 flex items-center justify-center">
                          <TrendingUp className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 uppercase">
                          Net Flow
                        </span>
                      </div>
                      <div className={`text-3xl font-semibold mb-1 ${t.net}`}>
                        {net >= 0 ? "+" : ""}
                        {net.toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}
                      </div>
                      <div className="text-sm text-slate-600">
                        Inflows - Outflows ({c.code})
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Transactions count (currency-agnostic) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 border border-slate-200 p-6 shadow-sm rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 bg-blue-600 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-[#0F172A] uppercase">
                    Transactions
                  </span>
                </div>
                <div className="text-3xl font-semibold text-[#0F172A] mb-1">
                  {statistics.totalTransactions}
                </div>
                <div className="text-sm text-slate-600">
                  Total transactions count
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Report Type Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {reportCards.map((report) => (
          <motion.button
            key={report.id}
            onClick={() => setReportType(report.id)}
            whileHover={{ scale: 1.02, y: -2 }}
            aria-pressed={reportType === report.id}
            className={`rounded-xl border bg-white p-4 text-left shadow-sm transition-all ${
              reportType === report.id
                ? "border-blue-600 ring-2 ring-blue-600/15"
                : "border-slate-200 hover:border-slate-300 hover:shadow-md"
            }`}
          >
            <div
              className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${
                reportType === report.id ? "bg-[#0F172A] text-white" : "bg-[#E9EEF6] text-[#0F172A]"
              }`}
            >
              <report.icon className="h-4 w-4" />
            </div>
            <h4 className="mb-1 text-sm font-semibold text-slate-900">
              {report.title}
            </h4>
            <p className="mb-2 text-xs text-slate-500">{report.description}</p>
            <p className="text-xs font-semibold text-[#0F172A]">{report.count}</p>
          </motion.button>
        ))}
      </div>

      {/* Date Range & Filters */}
      <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Report Date (for daily report) */}
          {reportType === "daily" && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                Report Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e: any) => setSelectedDate(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
              />
            </div>
          )}

          {/* Date Range */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
              Date Range
            </label>
            <select
              value={dateRange}
              onChange={(e: any) => setDateRange(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e: any) => setSearchTerm(e.target.value)}
                placeholder="Search transactions..."
                className="w-full pl-10 pr-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
              />
            </div>
          </div>

          {/* Currency Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
              Currency
            </label>
            <select
              value={currencyFilter}
              onChange={(e: any) => setCurrencyFilter(e.target.value as any)}
              className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
            >
              <option value="all">All Currencies</option>
              <option value="KES">KES only</option>
              <option value="USD">USD only</option>
              {currencyOk("UGX") && <option value="UGX">UGX only</option>}
              <option value="EUR">EUR only</option>
            </select>
          </div>

          {/* Transaction Type Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
              Type
            </label>
            <select
              value={transactionTypeFilter}
              onChange={(e: any) =>
                setTransactionTypeFilter(e.target.value as any)
              }
              className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
            >
              <option value="all">All Types</option>
              <option value="debit">Debits Only</option>
              <option value="credit">Credits Only</option>
            </select>
          </div>
        </div>

        {/* Custom Date Range */}
        {dateRange === "custom" && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                From Date
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e: any) => setDateFrom(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                To Date
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e: any) => setDateTo(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
              />
            </div>
          </div>
        )}
      </div>

      {/* Daily Report Content */}
      {reportType === "daily" && dailyReport && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Opening Balances */}
          <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-blue-600" />
              Opening Balances
            </h3>
            <DailyBalanceList report={dailyReport} side="opening" />
          </div>

          {/* Closing Balances */}
          <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600" />
              Closing Balances
            </h3>
            <DailyBalanceList report={dailyReport} side="closing" />
          </div>
        </div>
      )}

      {/* Charts Section */}
      {(reportType === "transactions" ||
        reportType === "cashflow" ||
        reportType === "daily") && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart */}
          <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Weekly Transaction Volume
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={transactionChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "2px solid #e2e8f0",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                  }}
                />
                <Legend />
                <Bar dataKey="debits" fill="#10b981" name={`Debits (${baseCode} equivalent)`} />
                <Bar dataKey="credits" fill="#ef4444" name={`Credits (${baseCode} equivalent)`} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-blue-600" />
              Account Type Distribution
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={accountTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: any) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {accountTypeData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "2px solid #e2e8f0",
                    borderRadius: "8px",
                  }}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Report Content */}
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-lg">
        <div className="p-6 border-b-2 border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {(() => {
                const currentReport = reportCards.find(
                  (r) => r.id === reportType,
                );
                const IconComponent = currentReport?.icon;
                return (
                  <>
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F172A]"
                    >
                      {IconComponent && (
                        <IconComponent className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {currentReport?.title}
                      </h3>
                      <p className="text-sm text-slate-600 mt-1">
                        {reportType === "transactions" &&
                          `Showing ${filteredTransactions.length} results`}
                        {reportType === "clients" &&
                          `Showing ${clientBalances.length} clients`}
                        {reportType === "accounts" &&
                          accountSummary &&
                          `Showing ${
                            accountSummary.cashAccounts.length +
                            accountSummary.bankAccounts.length +
                            accountSummary.mpesaAgents.length
                          } accounts`}
                        {reportType === "daily" &&
                          dailyReport &&
                          `Report for ${new Date(
                            dailyReport.date,
                          ).toLocaleDateString()}`}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600">Generated on</p>
              <p className="text-sm font-semibold text-slate-900">
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-slate-600">Loading report data...</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto max-w-full">
            {/* Transactions Report */}
            {reportType === "transactions" && (
              <table className="w-full">
                <thead className="bg-[#E9EEF6]">
                  <tr className="">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Account
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Flow
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Currency
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {currentItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center">
                        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-600">No transactions found</p>
                      </td>
                    </tr>
                  ) : (
                    currentItems.map((txn) => (
                      <tr
                        key={txn.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-4 text-sm text-slate-900">
                          <div className="font-semibold">
                            {new Date(txn.date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {new Date(txn.date).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-900">
                          <div>{txn.description}</div>
                          {txn.reference && (
                            <div className="text-xs text-blue-600 font-mono mt-0.5">
                              {txn.reference}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700">
                          <div className="font-medium">
                            {txn.sourceAccountName || "—"}
                          </div>
                          {txn.destAccountName && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              → {txn.destAccountName}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold uppercase rounded-lg border ${
                              txn.type === "debit"
                                ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                : txn.type === "credit"
                                  ? "bg-red-100 text-red-700 border-red-200"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {txn.type === "debit" ? (
                              <ArrowDown className="w-3 h-3" />
                            ) : txn.type === "credit" ? (
                              <ArrowUp className="w-3 h-3" />
                            ) : null}
                            {flowLabel[(txn.flowKind as FlowKind) || (txn.type === "debit" ? "in" : "out")]}
                          </span>
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-semibold tabular-nums ${
                          txn.type === "debit" ? "text-emerald-700" : txn.type === "credit" ? "text-red-700" : "text-slate-700"
                        }`}>
                          {txn.type === "debit" ? "+" : txn.type === "credit" ? "−" : ""}
                          {txn.amount.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-semibold">
                          {txn.currency}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {currentItems.length > 0 && (
                  <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-4 text-right font-semibold text-slate-900"
                      >
                        TOTALS:
                      </td>
                      <td className="px-6 py-4 text-right">
                        {/* Per currency: KES and USD are never added together. */}
                        {computeCashflowByCurrency(filteredTransactions).map((b) => (
                          <div key={b.currency} className="text-sm font-semibold tabular-nums">
                            <span className="text-emerald-700">In {formatMoney(b.in, b.currency)}</span>
                            <span className="mx-1 text-slate-500">·</span>
                            <span className="text-red-600">Out {formatMoney(b.out, b.currency)}</span>
                          </div>
                        ))}
                      </td>
                      <td colSpan={1}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}

            {/* Daily Report Transactions */}
            {reportType === "daily" && dailyReport && (
              <div className="overflow-x-auto max-w-full">
                <table className="w-full">
                  <thead className="bg-[#E9EEF6]">
                    <tr className="">
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Time
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Account
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Flow
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Currency
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {dailyReport.transactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center">
                          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <p className="text-slate-600">
                            No transactions for this date
                          </p>
                        </td>
                      </tr>
                    ) : (
                      dailyReport.transactions.slice(0, dailyShown).map(
                        (txn: any, index: number) => {
                          const flow = bureauFlow(txn);

                          const isMoneyIn = flow.kind === "in";
                          return (
                            <tr
                              key={txn.id || index}
                              className="hover:bg-slate-50 transition-colors"
                            >
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                                {new Date(
                                  txn.transactionDate || txn.createdAt,
                                ).toLocaleTimeString("en-GB", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })}
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-900">
                                <div>{txn.description || txn.notes || ""}</div>
                                {(txn.reference || txn.code) && (
                                  <div className="text-xs text-blue-600 font-mono mt-0.5">
                                    {txn.reference || txn.code}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-700">
                                <div className="font-medium">
                                  {txn.sourceAccountName || "—"}
                                </div>
                                {txn.destAccountName && (
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    → {txn.destAccountName}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold uppercase rounded-lg border ${
                                    isMoneyIn
                                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                      : flow.kind === "out"
                                        ? "bg-red-100 text-red-700 border-red-200"
                                        : "bg-slate-100 text-slate-600 border-slate-200"
                                  }`}
                                >
                                  {isMoneyIn ? (
                                    <ArrowDown className="w-3 h-3" />
                                  ) : flow.kind === "out" ? (
                                    <ArrowUp className="w-3 h-3" />
                                  ) : null}
                                  {flowLabel[flow.kind]}
                                </span>
                              </td>
                              <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-semibold tabular-nums ${
                                isMoneyIn ? "text-emerald-700" : flow.kind === "out" ? "text-red-700" : "text-slate-700"
                              }`}>
                                {isMoneyIn ? "+" : flow.kind === "out" ? "−" : ""}
                                {flow.amount.toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-semibold">
                                {CURRENCY_CODES[flow.currency] || "KES"}
                              </td>
                            </tr>
                          );
                        },
                      )
                    )}
                  </tbody>
                </table>
                {dailyReport.transactions.length > dailyShown && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-3">
                    <p className="text-sm text-slate-600">
                      Showing {dailyShown.toLocaleString()} of {dailyReport.transactions.length.toLocaleString()} transactions. Exports include all of them.
                    </p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setDailyShown((n) => n + 100)} className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Show 100 more
                      </button>
                      <button type="button" onClick={() => setDailyShown(dailyReport.transactions.length)} className="border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Show all
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Client Balances Report */}
            {reportType === "clients" && (
              <div className="overflow-x-auto max-w-full">
                <table className="w-full">
                  <thead className="bg-[#E9EEF6]">
                    <tr className="">
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Code
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Client Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Contact
                      </th>
                      {clientCurrencies.map((c) => (
                        <th key={c} className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                          Balance {CURRENCY_CODES[c]}
                        </th>
                      ))}
                      <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {clientBalances.length === 0 ? (
                      <tr>
                        <td colSpan={4 + clientCurrencies.length} className="px-6 py-12 text-center">
                          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <p className="text-slate-600 font-medium">
                            No clients found
                          </p>
                          <p className="text-slate-500 text-sm mt-1">
                            Client data will appear here once loaded
                          </p>
                        </td>
                      </tr>
                    ) : (
                      clientBalances.map((client) => (
                        <tr
                          key={client.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-mono font-semibold text-blue-600 bg-[#E9EEF6] px-2 py-1">
                              {client.code ||
                                client.id.slice(0, 8).toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">
                            {client.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                            {client.whatsAppNumber || "-"}
                          </td>
                          {clientCurrencies.map((c) => {
                            const v = client.balances[c] || 0;
                            return (
                              <td
                                key={c}
                                className={`px-6 py-4 whitespace-nowrap text-right text-sm font-semibold tabular-nums ${
                                  v > 0 ? "text-emerald-700" : v < 0 ? "text-red-600" : "text-slate-500"
                                }`}
                              >
                                {v > 0 ? "+" : ""}
                                {money(v, c)}
                              </td>
                            );
                          })}
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold uppercase ${
                                // colour follows the balance like everywhere else: holding the
                                // client's money (positive) green, client in debt (negative) red
                                client.balanceType === "Owes Us"
                                  ? "bg-red-100 text-red-700 border border-red-200 rounded-lg"
                                  : client.balanceType === "We Owe"
                                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg"
                                    : "bg-slate-100 text-slate-600 border border-slate-200 rounded-lg"
                              }`}
                            >
                              {client.balanceType === "Owes Us" ? (
                                <ArrowUpRight className="w-3 h-3" />
                              ) : client.balanceType === "We Owe" ? (
                                <ArrowDownRight className="w-3 h-3" />
                              ) : (
                                <CheckCircle className="w-3 h-3" />
                              )}
                              {client.balanceType}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {clientBalances.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-4 font-semibold text-slate-900 text-right"
                        >
                          TOTALS:
                        </td>
                        {clientCurrencies.map((c) => {
                          const total = clientBalances.reduce((sum, cl) => sum + (cl.balances[c] || 0), 0);
                          return (
                            <td key={c} className="px-6 py-4 text-right">
                              <span className={`font-semibold tabular-nums ${total >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                                {money(total, c)}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm font-medium text-slate-600">
                            {clientBalances.length} clients
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* Account Summary Report */}
            {reportType === "accounts" && accountSummary && (
              <div className="p-6 space-y-6">
                {/* Cash Accounts */}
                <div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-emerald-600" />
                    Cash Accounts
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {accountSummary.cashAccounts.map((account: any) => (
                      <div
                        key={account.id}
                        className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl"
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-slate-700">
                            {account.currency === 0 ? "KES" : account.currency === 2 ? "UGX" : account.currency === 3 ? "EUR" : "USD"} Account
                          </span>
                          <span className="text-lg font-semibold text-emerald-700">
                            {money(account.balance, account.currency)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 p-3 bg-emerald-100 border border-emerald-300 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-900">
                        Total Cash
                      </span>
                      <div className="text-right">
                        <TotalsByCurrency totals={accountSummary.cashByCurrency} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bank Accounts */}
                <div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    Bank Accounts
                  </h4>
                  <div className="overflow-x-auto max-w-full">
                    <table className="w-full border border-slate-200 rounded-lg">
                      <thead className="bg-[#E9EEF6]">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                            Bank
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                            Account
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                            Currency
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                            Balance
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {accountSummary.bankAccounts.map((account: any) => (
                          <tr key={account.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                              {account.bankName}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {account.accountNumber}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700">
                              {account.currency === 0 ? "KES" : account.currency === 2 ? "UGX" : account.currency === 3 ? "EUR" : "USD"}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-right text-blue-700">
                              {currencyCode(account.currency)}{" "}
                              {account.balance.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-3 font-semibold text-slate-900"
                          >
                            Total Bank
                          </td>
                          <td className="px-4 py-3 text-right">
                            <TotalsByCurrency totals={accountSummary.bankByCurrency} />
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* M-Pesa Agents */}
                <div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-blue-600" />
                    Mobile money agents
                  </h4>
                  <div className="overflow-x-auto max-w-full">
                    <table className="w-full border border-slate-200 rounded-lg">
                      <thead className="bg-[#E9EEF6]">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                            Agent Name
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                            Phone
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-[#334155]">
                            Balance ({baseCode})
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {accountSummary.mpesaAgents.map((agent: any) => (
                          <tr key={agent.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                              {agent.agentName}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">
                              {agent.phoneNumber}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-right text-[#0F172A]">
                              {formatMoney(agent.balance || 0, agent.currency ?? base)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-[#E9EEF6] border-t-2 border-slate-200">
                        <tr>
                          <td
                            colSpan={2}
                            className="px-4 py-3 font-semibold text-slate-900"
                          >
                            Total mobile money
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-[#0F172A]">
                            {totalsLine(accountSummary.mpesaByCurrency || { [base]: accountSummary.totalMpesa })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Cash Flow Report */}
            {reportType === "cashflow" && accountSummary && (
              <div className="p-6 space-y-6">
                {(() => {
                  const byCurrency = computeCashflowByCurrency(
                    dailyReport?.transactions || [],
                  );
                  if (byCurrency.length === 0) {
                    return (
                      <div className="p-6 bg-slate-50 border border-slate-200 text-center text-slate-500 rounded-xl">
                        No cash flow activity for this period.
                      </div>
                    );
                  }
                  return byCurrency.map((c) => {
                    const net = c.in - c.out;
                    return (
                      <div key={c.currency}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            {c.code}
                          </span>
                          <div className="flex-1 h-px bg-slate-200" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl">
                            <h4 className="text-sm font-semibold text-slate-700 uppercase mb-2">
                              Total Inflows ({c.code})
                            </h4>
                            <p className="text-3xl font-semibold text-emerald-700">
                              {c.code} {c.in.toLocaleString()}
                            </p>
                          </div>
                          <div className="p-6 bg-red-50 border border-red-200 rounded-xl">
                            <h4 className="text-sm font-semibold text-slate-700 uppercase mb-2">
                              Total Outflows ({c.code})
                            </h4>
                            <p className="text-3xl font-semibold text-red-700">
                              {c.code} {c.out.toLocaleString()}
                            </p>
                          </div>
                          <div className="p-6 bg-blue-50 border border-blue-200 rounded-xl">
                            <h4 className="text-sm font-semibold text-slate-700 uppercase mb-2">
                              Net Cash Flow ({c.code})
                            </h4>
                            <p
                              className={`text-3xl font-semibold ${
                                net >= 0 ? "text-blue-700" : "text-red-700"
                              }`}
                            >
                              {net >= 0 ? "+" : ""}
                              {c.code} {net.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}

                <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="text-lg font-semibold text-slate-900 mb-4">
                    Current Holdings
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      ...Object.entries(accountSummary.cashByCurrency).map(([c, v]) => ({ label: "Cash", c: Number(c), v })),
                      ...Object.entries(accountSummary.bankByCurrency).map(([c, v]) => ({ label: "Bank", c: Number(c), v })),
                    ]
                      .filter((h) => h.v !== 0 || h.c === 0)
                      .map((h) => (
                        <div key={`${h.label}-${h.c}`} className="p-4 bg-white border border-slate-200 rounded-xl">
                          <p className="text-sm text-slate-600 mb-1">
                            {h.label} {CURRENCY_CODES[h.c]}
                          </p>
                          <p className="text-xl font-semibold text-slate-900 tabular-nums">{money(h.v, h.c)}</p>
                        </div>
                      ))}
                    <div className="p-4 bg-white border border-slate-200 rounded-xl">
                      <p className="text-sm text-slate-600 mb-1">Mobile money</p>
                      <p className="text-xl font-semibold text-[#0F172A]">
                        {totalsLine(accountSummary.mpesaByCurrency || { [base]: accountSummary.totalMpesa })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Other report types placeholder */}
            {/* Exchange Summary Report */}
            {reportType === "exchange" && (
              <div className="p-6 space-y-6">
                {!exchangeSummary ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
                    <p className="text-slate-600">Loading exchange data...</p>
                  </div>
                ) : (
                  <>
                    {/* Exchange Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Current Rates Card */}
                      <div className="relative overflow-hidden bg-emerald-700 p-5 text-white">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-3">
                            <Scale className="w-5 h-5 text-emerald-100" />
                            <span className="text-sm font-medium text-emerald-100">
                              Current Rates
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-emerald-100 text-sm">
                                Buy:
                              </span>
                              <span className="text-xl font-semibold">
                                {exchangeSummary.currentBuyRate.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-emerald-100 text-sm">
                                Sell:
                              </span>
                              <span className="text-xl font-semibold">
                                {exchangeSummary.currentSellRate.toFixed(2)}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t border-white/20">
                            <span className="text-xs text-emerald-100">
                              Spread:{" "}
                              {(
                                exchangeSummary.currentSellRate -
                                exchangeSummary.currentBuyRate
                              ).toFixed(2)}{" "}
                              {baseCode}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Float Balances Card */}
                      <div className="relative overflow-hidden bg-blue-600 p-5 text-white">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-3">
                            <Wallet className="w-5 h-5 text-blue-200" />
                            <span className="text-sm font-medium text-blue-50">
                              Float Balance
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-blue-50 text-sm">
                                {baseCode}:
                              </span>
                              <span className="text-xl font-semibold">
                                {exchangeSummary.floatKES.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-blue-50 text-sm">
                                USD:
                              </span>
                              <span className="text-xl font-semibold">
                                ${exchangeSummary.floatUSD.toLocaleString()}
                              </span>
                            </div>
                            {exchangeSummary.floatOther.map((f) => (
                              <div key={f.currency} className="flex justify-between items-center">
                                <span className="text-blue-50 text-sm">{CURRENCY_CODES[f.currency]}:</span>
                                <span className="text-xl font-semibold">{f.balance.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Total Volume Card */}
                      <div className="relative overflow-hidden bg-blue-600 p-5 text-white">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-3">
                            <ArrowLeftRight className="w-5 h-5 text-blue-200" />
                            <span className="text-sm font-medium text-blue-50">
                              Volume
                            </span>
                          </div>
                          <div className="space-y-2">
                            {Object.entries(exchangeSummary.volumeByCurrency).length === 0 && (
                              <span className="text-blue-50 text-sm">No exchanges</span>
                            )}
                            {Object.entries(exchangeSummary.volumeByCurrency)
                              .sort(([a], [b]) => Number(a) - Number(b))
                              .map(([c, v]) => (
                                <div key={c} className="space-y-1">
                                  <div className="flex justify-between items-center">
                                    <span className="text-blue-50 text-sm">{CURRENCY_CODES[Number(c)]} bought:</span>
                                    <span className="text-lg font-semibold">{money(v.bought, Number(c))}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-blue-50 text-sm">{CURRENCY_CODES[Number(c)]} sold:</span>
                                    <span className="text-lg font-semibold">{money(v.sold, Number(c))}</span>
                                  </div>
                                </div>
                              ))}
                          </div>
                          <div className="mt-3 pt-3 border-t border-white/20">
                            <span className="text-xs text-blue-50">
                              {exchangeSummary.totalExchanges} transactions
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Profit Card */}
                      <div className="relative overflow-hidden bg-amber-700 p-5 text-white">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-3">
                            <TrendingUp className="w-5 h-5 text-amber-50" />
                            <span className="text-sm font-medium text-amber-100">
                              Profit
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-amber-100 text-sm">
                                {baseCode}:
                              </span>
                              <span className="text-xl font-semibold">
                                {baseCode} {exchangeSummary.kesProfit.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-amber-100 text-sm">
                                USD:
                              </span>
                              <span className="text-xl font-semibold">
                                ${exchangeSummary.usdProfit.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Exchange Transactions Table */}
                    <div className="bg-white border border-slate-200 overflow-hidden rounded-lg">
                      <div className="px-6 py-4 bg-emerald-50 border-b-2 border-slate-200">
                        <h4 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                          <ArrowLeftRight className="w-5 h-5 text-emerald-600" />
                          Recent Exchange Transactions
                        </h4>
                      </div>
                      <div className="overflow-x-auto max-w-full">
                        <table className="w-full">
                          <thead className="bg-[#E9EEF6]">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                                Date
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                                Code
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                                Client
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                                Direction
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
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {exchangeSummary.transactions.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={8}
                                  className="px-6 py-12 text-center"
                                >
                                  <ArrowLeftRight className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                  <p className="text-slate-600">
                                    No exchange transactions found
                                  </p>
                                </td>
                              </tr>
                            ) : (
                              exchangeSummary.transactions
                                .slice(0, 20)
                                .map((txn: any, index: number) => (
                                  <tr
                                    key={txn.id || index}
                                    className="hover:bg-slate-50 transition-colors"
                                  >
                                    <td className="px-4 py-3 text-sm text-slate-600">
                                      {new Date(
                                        txn.date || txn.createdAt,
                                      ).toLocaleDateString("en-KE", {
                                        month: "short",
                                        day: "numeric",
                                      })}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className="text-sm font-mono text-slate-700">
                                        {txn.code}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                                      {txn.clientName || "Walk-in"}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span
                                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold ${
                                          txn.direction ===
                                            ExchangeDirection.UsdToKes ||
                                          txn.direction === 0
                                            ? "bg-emerald-100 text-emerald-700"
                                            : "bg-blue-100 text-blue-700"
                                        }`}
                                      >
                                        {CURRENCY_CODES[txn.currencyGiven] ?? txn.currencyGiven} →{" "}
                                        {CURRENCY_CODES[txn.currencyReceived] ?? txn.currencyReceived}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right font-medium text-emerald-700">
                                      +{money(txn.amountGiven || 0, txn.currencyGiven)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right font-medium text-red-600">
                                      -{money(txn.amountReceived || 0, txn.currencyReceived)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right text-slate-700 font-medium">
                                      {(txn.exchangeRate || 0) < 1
                                        ? (txn.exchangeRate || 0).toFixed(4)
                                        : (txn.exchangeRate || 0).toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right font-semibold text-emerald-700">
                                      {baseCode} {(txn.profit || 0).toLocaleString()}
                                    </td>
                                  </tr>
                                ))
                            )}
                          </tbody>
                          {exchangeSummary.transactions.length > 0 && (
                            <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                              <tr>
                                <td
                                  colSpan={7}
                                  className="px-4 py-3 text-right font-semibold text-slate-900"
                                >
                                  Total Profit:
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-emerald-700 text-lg">
                                  {baseCode}{" "}
                                  {exchangeSummary.transactions
                                    .reduce(
                                      (sum: number, t: any) =>
                                        sum + (t.profit || 0),
                                      0,
                                    )
                                    .toLocaleString()}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Profit & Loss Report */}
            {reportType === "profit" && (
              <div className="p-6 space-y-6">
                {!profitLossData ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                    <p className="text-slate-600">
                      Loading profit & loss data...
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-slate-600">
                      All figures in {baseCode}. Other currencies are converted at the mid of today&apos;s
                      buy and sell rate.
                    </p>
                    {(profitLossData.excludedCurrencies || []).length > 0 && (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        {profitLossData.excludedCurrencies!.join(" and ")} transactions are left out —
                        set {profitLossData.excludedCurrencies!.length === 1 ? "a rate" : "rates"} on the
                        Exchange page to include them.
                      </p>
                    )}
                    {/* P&L Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Total Income */}
                      <div className="relative overflow-hidden bg-emerald-700 p-6 text-white">
                        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full" />
                        <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-white/5 rounded-full" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-2">
                            <ArrowUpRight className="w-5 h-5 text-emerald-100" />
                            <span className="text-sm font-medium text-emerald-100">
                              Total Income
                            </span>
                          </div>
                          <p className="text-3xl font-semibold">
                            {baseCode} {profitLossData.totalIncome.toLocaleString()}
                          </p>
                          <div className="mt-2 flex items-center gap-1 text-emerald-100 text-sm">
                            <TrendingUp className="w-4 h-4" />
                            <span>All revenue sources</span>
                          </div>
                        </div>
                      </div>

                      {/* Total Expenses */}
                      <div className="relative overflow-hidden bg-red-600 p-6 text-white">
                        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full" />
                        <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-white/5 rounded-full" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-2">
                            <ArrowDownRight className="w-5 h-5 text-red-200" />
                            <span className="text-sm font-medium text-white">
                              Total Expenses
                            </span>
                          </div>
                          <p className="text-3xl font-semibold">
                            {baseCode} {profitLossData.totalExpenses.toLocaleString()}
                          </p>
                          <div className="mt-2 flex items-center gap-1 text-white text-sm">
                            <TrendingDown className="w-4 h-4" />
                            <span>All outflows</span>
                          </div>
                        </div>
                      </div>

                      {/* Exchange Profit */}
                      <div className="relative overflow-hidden bg-amber-700 p-6 text-white">
                        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full" />
                        <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-white/5 rounded-full" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-2">
                            <ArrowLeftRight className="w-5 h-5 text-amber-50" />
                            <span className="text-sm font-medium text-amber-100">
                              Exchange Profit
                            </span>
                          </div>
                          <p className="text-3xl font-semibold">
                            {baseCode} {profitLossData.exchangeProfit.toLocaleString()}
                          </p>
                          <div className="mt-2 flex items-center gap-1 text-amber-100 text-sm">
                            <Coins className="w-4 h-4" />
                            <span>Currency exchange</span>
                          </div>
                        </div>
                      </div>

                      {/* Net Profit */}
                      <div
                        className={`relative overflow-hidden p-6 text-white ${
                          profitLossData.netProfit >= 0
                            ? "bg-blue-600"
                            : "bg-red-700"
                        }`}
                      >
                        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full" />
                        <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-white/5 rounded-full" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="w-5 h-5 text-white" />
                            <span className="text-sm font-medium text-white">
                              Net Profit
                            </span>
                          </div>
                          <p className="text-3xl font-semibold">
                            {profitLossData.netProfit >= 0 ? "+" : "−"}{baseCode}{" "}
                            {Math.abs(profitLossData.netProfit).toLocaleString()}
                          </p>
                          <div className="mt-2 flex items-center gap-1 text-white text-sm">
                            {profitLossData.netProfit >= 0 ? (
                              <>
                                <CheckCircle className="w-4 h-4" />
                                <span>Profitable</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-4 h-4" />
                                <span>Loss</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Charts Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Profit Trend Chart */}
                      <div className="bg-white border border-slate-200 p-6 rounded-xl">
                        <h4 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                          <BarChart3 className="w-5 h-5 text-blue-600" />
                          Daily Profit Trend
                        </h4>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={profitLossData.dailyProfits}>
                              <defs>
                                <linearGradient
                                  id="profitGradient"
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop
                                    offset="5%"
                                    stopColor="#10B981"
                                    stopOpacity={0.3}
                                  />
                                  <stop
                                    offset="95%"
                                    stopColor="#10B981"
                                    stopOpacity={0}
                                  />
                                </linearGradient>
                              </defs>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#E2E8F0"
                              />
                              <XAxis
                                dataKey="date"
                                stroke="#64748B"
                                fontSize={12}
                              />
                              <YAxis
                                stroke="#64748B"
                                fontSize={12}
                                tickFormatter={(v: any) =>
                                  `${(v / 1000).toFixed(0)}k`
                                }
                              />
                              <Tooltip
                                formatter={(value: number) => [
                                  `${baseCode} ${value.toLocaleString()}`,
                                  "Profit",
                                ]}
                                contentStyle={{
                                  backgroundColor: "#1E293B",
                                  border: "none",
                                  borderRadius: "8px",
                                  color: "#fff",
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="profit"
                                stroke="#10B981"
                                strokeWidth={2}
                                fill="url(#profitGradient)"
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Profit by Category */}
                      <div className="bg-white border border-slate-200 p-6 rounded-xl">
                        <h4 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                          <PieChart className="w-5 h-5 text-blue-600" />
                          Profit by Category
                        </h4>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsPieChart>
                              <Pie
                                data={profitLossData.profitByCategory.filter(
                                  (c) => c.amount > 0,
                                )}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={90}
                                paddingAngle={2}
                                dataKey="amount"
                                nameKey="category"
                              >
                                {profitLossData.profitByCategory
                                  .filter((c) => c.amount > 0)
                                  .map((entry, index) => (
                                    <Cell
                                      key={`cell-${index}`}
                                      fill={entry.color}
                                    />
                                  ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number) => [
                                  `${baseCode} ${value.toLocaleString()}`,
                                  "",
                                ]}
                                contentStyle={{
                                  backgroundColor: "#1E293B",
                                  border: "none",
                                  borderRadius: "8px",
                                  color: "#fff",
                                }}
                              />
                              <Legend
                                layout="vertical"
                                align="right"
                                verticalAlign="middle"
                                formatter={(value: any) => (
                                  <span className="text-sm text-slate-700">
                                    {value}
                                  </span>
                                )}
                              />
                            </RechartsPieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>

                    {/* Detailed Breakdown Table */}
                    <div className="bg-white border border-slate-200 overflow-hidden rounded-lg">
                      <div className="px-6 py-4 bg-slate-50 border-b-2 border-slate-200">
                        <h4 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                          <Receipt className="w-5 h-5 text-blue-600" />
                          Profit & Loss Breakdown
                        </h4>
                      </div>
                      <div className="p-6">
                        <div className="overflow-x-auto max-w-full">
                          <table className="w-full">
                            <thead className="bg-[#E9EEF6]">
                              <tr className="">
                                <th className="pb-3 text-left text-sm font-semibold uppercase tracking-wide text-[#334155]">
                                  Category
                                </th>
                                <th className="pb-3 text-right text-sm font-semibold uppercase tracking-wide text-[#334155]">
                                  Amount ({baseCode})
                                </th>
                                <th className="pb-3 text-right text-sm font-semibold uppercase tracking-wide text-[#334155]">
                                  % of Total
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {/* Income Section */}
                              <tr className="bg-emerald-50">
                                <td
                                  colSpan={3}
                                  className="px-3 py-2 font-semibold text-emerald-700 text-sm uppercase"
                                >
                                  Income
                                </td>
                              </tr>
                              <tr>
                                <td className="py-3 pl-6 text-slate-700">
                                  Exchange Profit
                                </td>
                                <td className="py-3 text-right font-medium text-emerald-700">
                                  +
                                  {profitLossData.exchangeProfit.toLocaleString()}
                                </td>
                                <td className="py-3 text-right text-slate-500">
                                  {profitLossData.totalIncome > 0
                                    ? (
                                        (profitLossData.exchangeProfit /
                                          profitLossData.totalIncome) *
                                        100
                                      ).toFixed(1)
                                    : 0}
                                  %
                                </td>
                              </tr>
                              <tr>
                                <td className="py-3 pl-6 text-slate-700">
                                  Other Income
                                </td>
                                <td className="py-3 text-right font-medium text-emerald-700">
                                  +
                                  {(
                                    profitLossData.totalIncome -
                                    profitLossData.exchangeProfit
                                  ).toLocaleString()}
                                </td>
                                <td className="py-3 text-right text-slate-500">
                                  {profitLossData.totalIncome > 0
                                    ? (
                                        ((profitLossData.totalIncome -
                                          profitLossData.exchangeProfit) /
                                          profitLossData.totalIncome) *
                                        100
                                      ).toFixed(1)
                                    : 0}
                                  %
                                </td>
                              </tr>
                              <tr className="bg-emerald-100 font-semibold">
                                <td className="py-3 pl-3 text-emerald-800">
                                  Total Income
                                </td>
                                <td className="py-3 text-right text-emerald-700">
                                  {profitLossData.totalIncome.toLocaleString()}
                                </td>
                                <td className="py-3 text-right text-emerald-700">
                                  100%
                                </td>
                              </tr>

                              {/* Expenses Section */}
                              <tr className="bg-red-50">
                                <td
                                  colSpan={3}
                                  className="px-3 py-2 font-semibold text-red-700 text-sm uppercase"
                                >
                                  Expenses
                                </td>
                              </tr>
                              <tr>
                                <td className="py-3 pl-6 text-slate-700">
                                  Operating Expenses
                                </td>
                                <td className="py-3 text-right font-medium text-red-600">
                                  -
                                  {profitLossData.totalExpenses.toLocaleString()}
                                </td>
                                <td className="py-3 text-right text-slate-500">
                                  100%
                                </td>
                              </tr>
                              <tr className="bg-red-100 font-semibold">
                                <td className="py-3 pl-3 text-red-800">
                                  Total Expenses
                                </td>
                                <td className="py-3 text-right text-red-700">
                                  -
                                  {profitLossData.totalExpenses.toLocaleString()}
                                </td>
                                <td className="py-3 text-right text-red-700">
                                  100%
                                </td>
                              </tr>

                              {/* Net Profit */}
                              <tr
                                className={`font-semibold text-lg ${
                                  profitLossData.netProfit >= 0
                                    ? "bg-[#E9EEF6]"
                                    : "bg-slate-200"
                                }`}
                              >
                                <td
                                  className={`py-4 pl-3 ${
                                    profitLossData.netProfit >= 0
                                      ? "text-[#0F172A]"
                                      : "text-slate-800"
                                  }`}
                                >
                                  NET PROFIT / (LOSS)
                                </td>
                                <td
                                  className={`py-4 text-right ${
                                    profitLossData.netProfit >= 0
                                      ? "text-[#0F172A]"
                                      : "text-red-700"
                                  }`}
                                >
                                  {profitLossData.netProfit >= 0 ? "+" : ""}
                                  {profitLossData.netProfit.toLocaleString()}
                                </td>
                                <td
                                  className={`py-4 text-right ${
                                    profitLossData.netProfit >= 0
                                      ? "text-blue-700"
                                      : "text-red-700"
                                  }`}
                                >
                                  {profitLossData.totalIncome > 0
                                    ? (
                                        (profitLossData.netProfit /
                                          profitLossData.totalIncome) *
                                        100
                                      ).toFixed(1)
                                    : 0}
                                  %
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {reportType === "transactions" && totalPages > 1 && (
        <div className="flex justify-center mt-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center gap-2 text-sm font-semibold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <div className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg">
              <p className="text-sm font-semibold text-slate-700">
                Page {currentPage} of {totalPages}
              </p>
            </div>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center gap-2 text-sm font-semibold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
