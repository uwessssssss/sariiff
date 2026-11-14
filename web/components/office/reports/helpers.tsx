"use client";

import { type FlowKind, bureauFlow } from "@/lib/moneyflow";
import { foreignCurrenciesFor, useBaseCurrency } from "@/lib/useBaseCurrency";
import { formatMoney, getCurrentExchangeRate } from "@/lib/api";

export type ReportType =
  | "transactions"
  | "clients"
  | "exchange"
  | "cashflow"
  | "accounts"
  | "daily"
  | "profit";
export type ExportFormat = "pdf" | "excel" | "csv";
// Account-aware cashflow, per business rule:
//   Money IN  = Client Credits + Asset (Cash/Bank/M-Pesa) Debits
//   Money OUT = Client Debits  + Asset Credits
// Computed from the daily report's transaction list (per currency).
// AccountType: 3 = Client; TransactionType: 0 = Debit, 1 = Credit; Currency: 0 = KES, 1 = USD.
export function computeCashflow(txns: any[]): {
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
export const CURRENCY_CODES: Record<number, string> = {
  0: "KES",
  1: "USD",
  2: "UGX",
  3: "EUR",
};
/** Cash & bank per currency from the daily report (falls back to KES/USD fields). */
export function dailyBalancesByCurrency(d: any): DailyCurrencyBalances[] {
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
export function clientBalanceMap(client: any): Record<number, number> {
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
export let REPORT_BASE = 0;
export let KES_RATES: Record<number, number> = { 0: 1 };
export async function loadKesRates(base: number = REPORT_BASE): Promise<Record<number, number>> {
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
export let RATES_LOADED = false;
/** Forget the cached rates so the next ensureRates() reloads them. */
export function resetRatesLoaded() {
  RATES_LOADED = false;
}
export async function ensureRates() {
  if (RATES_LOADED) return KES_RATES;
  const r = await loadKesRates().catch(() => KES_RATES);
  RATES_LOADED = true;
  return r;
}
/** Net money in − out across every currency, in the home currency at today's rates. */
export function netKesEquivalent(txns: any[]): number {
  return computeCashflowByCurrency(txns).reduce((sum, b) => {
    const r = KES_RATES[b.currency];
    return r ? sum + (b.in - b.out) * r : sum;
  }, 0);
}
export const toCurrencyNum = (c: any): number =>
  typeof c === "number"
    ? c
    : Number(Object.entries(CURRENCY_CODES).find(([, code]) => code === c)?.[0] ?? 0);
/** Home-currency value of an amount, or null when that currency has no rate today. */
export const toKes = (amount: number, c: any): number | null => {
  const r = KES_RATES[toCurrencyNum(c)];
  return r ? amount * r : null;
};
/** "UGX 2,400,000" — code + amount, shillings without cents. */
export const money = (n: number, c: number) => formatMoney(n, c);
/** "KES 1,000,000 · UGX 2,400,000" for a per-currency total map. */
export const totalsLine = (t: Record<number, number>) =>
  Object.entries(t)
    .filter(([c, v]) => v !== 0 || Number(c) === 0)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([c, v]) => formatMoney(v, Number(c)))
    .join(" · ") || "0";
export function TotalsByCurrency({ totals }: { totals: Record<number, number> }) {
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
export function computeCashflowByCurrency(
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
export interface DailyReportData {
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
export interface DailyCurrencyBalances {
  currency: number;
  openingCash: number;
  openingBank: number;
  closingCash: number;
  closingBank: number;
}
export interface ClientBalance {
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
export interface AccountSummary {
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
export interface ExchangeSummaryData {
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
export interface ProfitLossData {
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
export function DailyBalanceList({ report, side }: { report: DailyReportData; side: "opening" | "closing" }) {
  const { base } = useBaseCurrency();
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
