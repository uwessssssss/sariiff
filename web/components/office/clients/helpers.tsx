"use client";

import { currencyCode, currencyDecimals } from "@/lib/api";

// ==============================================
// Additional DTOs matching backend
// ==============================================

export interface ClientStatsDto {
  totalClients: number;
  permanentClients: number;
  temporaryClients: number;
  clientsWithDebit: number;
  clientsWithCredit: number;
  totalBalanceKES: number;
  totalBalanceUSD: number;
  /** Totals for every currency in use (KES, USD, UGX, EUR) */
  byCurrency?: { currency: number; currencyCode: string; totalBalance: number }[] | null;
}
export interface ConvertClientDto {
  password: string;
}
// Local transaction type for display (matches backend StatementLineDto)
export interface DisplayTransaction {
  id: string;
  code: string;
  reference: string;
  transactionDate: string;
  transactionType: number;
  thisAccountAction: string; // "Credit" or "Debit"
  debit: number | null;
  credit: number | null;
  amount: number;
  currency: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  notes?: string;
  exchangeRate?: number;
  counterAmount?: number;
  counterCurrency?: number;
  reconciliationStatus: number;
  createdAt: string;
  isReversed?: boolean;
  isReversal?: boolean;
  // Related account info from API
  relatedAccount?: {
    accountId: string;
    accountType: number;
    accountName: string;
    accountCode: string;
    currency: number;
    action: string; // "Debit" or "Credit"
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    clientCode?: string;
    clientPhone?: string;
  };
}
// One line per currency a client uses: KES/USD from the fixed fields, UGX/EUR/...
// from otherBalances. "Money in" = credits to the client, "money out" = debits.
export interface ClientCurrencyLine {
  currency: number;
  code: string;
  moneyIn: number;
  moneyOut: number;
  balance: number;
}
export const fmtAmount = (n: number, c: number) =>
  (n || 0).toLocaleString("en-US", {
    minimumFractionDigits: currencyDecimals(c),
    maximumFractionDigits: currencyDecimals(c),
  });
export function clientCurrencyLines(client: any): ClientCurrencyLine[] {
  const lines: ClientCurrencyLine[] = [];
  const kesBal = (client.netMovementKES ?? 0) + (client.openingBalanceKES ?? 0);
  const usdBal = (client.netMovementUSD ?? 0) + (client.openingBalanceUSD ?? 0);
  if (kesBal || client.totalCreditKES || client.totalDebitKES)
    lines.push({ currency: 0, code: "KES", moneyIn: client.totalCreditKES ?? 0, moneyOut: client.totalDebitKES ?? 0, balance: kesBal });
  if (usdBal || client.totalCreditUSD || client.totalDebitUSD)
    lines.push({ currency: 1, code: "USD", moneyIn: client.totalCreditUSD ?? 0, moneyOut: client.totalDebitUSD ?? 0, balance: usdBal });
  for (const b of client.otherBalances || []) {
    if (b.balance || b.totalIn || b.totalOut)
      lines.push({
        currency: b.currency,
        code: b.currencyCode || currencyCode(b.currency),
        moneyIn: b.totalIn ?? 0,
        moneyOut: b.totalOut ?? 0,
        balance: b.balance ?? 0,
      });
  }
  return lines;
}
