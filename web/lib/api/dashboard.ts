import { type ApiResponse, apiRequest } from "./core";
import type { CompanyDto } from "./admin";
import { type CurrencyFlowTotalsDto, currencyCode } from "./enums";
import type { TransactionDto } from "./transactions";
import { getCompanyCurrencies } from "./exchange";

// ==============================================
// Dashboard Types
// ==============================================

/** One currency's holdings across account types (dashboard ledger row). */
export interface DashboardHolding {
  currency: number;
  code: string;
  cash: number;
  bank: number;
  mpesa: number;
  fx: number;
}
export interface DashboardFlow {
  currency: number;
  code: string;
  credits: number;
  debits: number;
  net: number;
}
export interface DashboardStatsDto {
  /** Every currency held, KES/USD/UGX/EUR */
  holdings: DashboardHolding[];
  /** Today's money in/out per currency */
  flows: DashboardFlow[];
  cash: { kes: number; usd: number };
  banks: { kes: number; usd: number };
  mpesa: { total: number };
  exchange: { kes: number; usd: number };
  clients: { kes: number; usd: number };
  walkin: { kes: number; usd: number };
  daily: {
    credits: number;
    debits: number;
    net: number;
    byCurrency: {
      kes: { credits: number; debits: number; net: number };
      usd: { credits: number; debits: number; net: number };
    };
  };
  totalAccounts: number;
  totalTransactions: number;
  todayTransactions: number;
}
// ==============================================
// Dashboard API Functions
// ==============================================

// OfficeUser: Get own company info (does NOT need SuperAdmin)
export async function getMyCompanyInfo(): Promise<ApiResponse<CompanyDto>> {
  return apiRequest("/api/dashboard/company");
}
// OfficeUser: Update own company settings (does NOT need SuperAdmin)
export async function updateMyCompanySettings(dto: {
  name?: string;
  ownerName?: string;
  email?: string;
  address?: string;
  logoUrl?: string;
  taxId?: string;
  website?: string;
}): Promise<ApiResponse<CompanyDto>> {
  return apiRequest("/api/dashboard/settings", {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}
export async function getDashboardStats(): Promise<
  ApiResponse<DashboardStatsDto>
> {
  // Call the single backend dashboard endpoint instead of 5 separate calls,
  // plus the FX float in parallel so total holdings include exchange money.
  const [result, floatResult] = await Promise.all([
    apiRequest<any>("/api/dashboard"),
    apiRequest<any>("/api/exchange/float").catch(() => null),
  ]);

  if (!result.success || !result.data) {
    return {
      success: false,
      message: result.message || "Failed to load dashboard",
      data: null,
    };
  }

  const d = result.data;
  const today = d.todayTransactions || {};
  const fx = floatResult?.success ? floatResult.data : null;

  // ---- Per-currency holdings: cash + bank (API), mobile money and FX float.
  // The float's kesBalance is in the company's BASE currency (KES in Kenya, UGX in
  // Uganda — field names are historical). Mobile money comes per wallet currency.
  // Home currency: from the float reply, or (if that call failed) from the company's
  // settings — never assume KES, or a Ugandan bureau's UGX money lists second.
  let base: number = fx?.baseCurrency ?? -1;
  if (base < 0) {
    const cur = await getCompanyCurrencies().catch(() => null);
    base = cur?.success && cur.data?.baseCurrency !== undefined ? Number(cur.data.baseCurrency) : 0;
  }
  const byCur = new Map<number, DashboardHolding>();
  const slot = (c: number): DashboardHolding => {
    if (!byCur.has(c)) byCur.set(c, { currency: c, code: currencyCode(c), cash: 0, bank: 0, mpesa: 0, fx: 0 });
    return byCur.get(c)!;
  };
  if (Array.isArray(d.byCurrency) && d.byCurrency.length > 0) {
    for (const r of d.byCurrency) {
      slot(r.currency).cash += r.cash || 0;
      slot(r.currency).bank += r.bank || 0;
    }
  } else {
    // Older API without byCurrency: KES/USD only
    slot(0).cash += d.cashKES || 0;
    slot(0).bank += d.totalBankKES || 0;
    slot(1).cash += d.cashUSD || 0;
    slot(1).bank += d.totalBankUSD || 0;
  }
  // Mobile money per wallet currency (an M-Pesa wallet is KES even in a Ugandan bureau).
  if (Array.isArray(d.mobileMoneyByCurrency) && d.mobileMoneyByCurrency.length > 0) {
    for (const w of d.mobileMoneyByCurrency) slot(w.currency).mpesa += w.amount || 0;
  } else {
    slot(base).mpesa += d.totalMpesa || 0; // older API: home-currency wallets only
  }
  if (fx) {
    slot(base).fx += fx.kesBalance || 0;
    slot(1).fx += fx.usdBalance || 0;
    for (const o of fx.otherBalances || []) slot(o.currency).fx += o.balance || 0;
  }
  // Home currency first, then the rest in enum order.
  const holdings = [...byCur.values()].sort((a, b) =>
    a.currency === base ? -1 : b.currency === base ? 1 : a.currency - b.currency);

  // ---- Today's flows per currency
  const flows: DashboardFlow[] =
    Array.isArray(today.byCurrency) && today.byCurrency.length > 0
      ? today.byCurrency.map((f: CurrencyFlowTotalsDto) => ({
          currency: f.currency,
          code: currencyCode(f.currency),
          debits: f.totalDebit || 0,
          credits: f.totalCredit || 0,
          net: f.netFlow || 0,
        }))
      : [
          { currency: 0, code: "KES", debits: today.totalDebitKES || 0, credits: today.totalCreditKES || 0, net: today.netFlowKES || 0 },
          { currency: 1, code: "USD", debits: today.totalDebitUSD || 0, credits: today.totalCreditUSD || 0, net: today.netFlowUSD || 0 },
        ];

  const stats: DashboardStatsDto = {
    holdings,
    flows,
    cash: { kes: d.cashKES || 0, usd: d.cashUSD || 0 },
    banks: { kes: d.totalBankKES || 0, usd: d.totalBankUSD || 0 },
    mpesa: { total: d.totalMpesa || 0 },
    exchange: { kes: fx?.kesBalance || 0, usd: fx?.usdBalance || 0 },
    clients: { kes: 0, usd: 0 },
    walkin: { kes: 0, usd: 0 },
    daily: {
      credits: (today.totalCreditKES || 0) + (today.totalCreditUSD || 0),
      debits: (today.totalDebitKES || 0) + (today.totalDebitUSD || 0),
      net: (today.netFlowKES || 0) + (today.netFlowUSD || 0),
      byCurrency: {
        kes: {
          credits: today.totalCreditKES || 0,
          debits: today.totalDebitKES || 0,
          net: today.netFlowKES || 0,
        },
        usd: {
          credits: today.totalCreditUSD || 0,
          debits: today.totalDebitUSD || 0,
          net: today.netFlowUSD || 0,
        },
      },
    },
    totalAccounts: 0,
    totalTransactions: 0,
    todayTransactions: today.totalCount || 0,
  };

  return { success: true, message: "Dashboard stats loaded", data: stats };
}
export async function getRecentTransactions(
  count: number = 10,
): Promise<ApiResponse<TransactionDto[]>> {
  return apiRequest(`/api/transaction/recent?count=${count}`);
}
