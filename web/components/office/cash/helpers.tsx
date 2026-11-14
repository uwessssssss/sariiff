"use client";



// Transaction interface to match backend StatementLineDto
export interface Transaction {
  id: string;
  code: string;
  date: string;
  reference: string;
  description: string;
  transactionType: number;
  thisAccountAction: string;
  debit: number | null;
  credit: number | null;
  amount: number;
  currency: number;
  balanceBefore: number;
  balanceAfter: number;
  exchangeRate?: number;
  counterAmount?: number;
  counterCurrency?: number;
  notes?: string;
  reconciliationStatus: number;
  relatedAccount?: {
    accountId: string;
    accountType: number;
    accountName: string;
    accountCode: string;
    currency: number;
    action: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    clientCode?: string;
    clientPhone?: string;
  };
}
// CashStats interface to match backend CashStatsDto
export interface CashStats {
  balanceKES: number;
  openingBalanceKES: number;
  totalDebitKES: number;
  totalCreditKES: number;
  netMovementKES: number;
  balanceUSD: number;
  openingBalanceUSD: number;
  totalDebitUSD: number;
  totalCreditUSD: number;
  netMovementUSD: number;
  /** Every cash currency (KES, USD, UGX, EUR) — from the API when available */
  byCurrency?: any[] | null;
}
// CashAccount interface to match backend CashAccountResponseDto
export interface CashAccount {
  id: string;
  currency: number;
  balance: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  createdAt: string;
}
// Modal types
export type ModalType = "add" | "edit" | "delete" | "view" | null;
/** Money in for the OTHER account? A client (liability) gains on Credit; a till on Debit. */
export const relatedIn = (r: { action?: string; accountType?: number }) =>
  r.accountType === 3 ? r.action === "Credit" : r.action === "Debit";
