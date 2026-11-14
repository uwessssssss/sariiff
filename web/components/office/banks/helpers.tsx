"use client";



// Updated Transaction interface to match backend StatementLineDto
export interface Transaction {
  id: string;
  code: string;
  date: string;
  reference: string;
  description: string;
  transactionType: number;
  thisAccountAction: string; // "Debit" or "Credit"
  debit: number | null;
  credit: number | null;
  amount: number;
  currency: number;
  balanceBefore: number;
  balanceAfter: number;
  exchangeRate?: number | null;
  counterAmount?: number | null;
  counterCurrency?: number | null;
  notes?: string | null;
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
    clientCode?: string | null;
    clientPhone?: string | null;
  };
}
// Updated BankAccount interface to match backend BankAccountDto
export interface BankAccount {
  id: string;
  code: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  branchCode?: string;
  currency: number;
  balance: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  isActive: boolean;
  createdAt: string;
}
// Updated Stats interface matching backend BankAccountStatsDto
export interface BankStats {
  totalAccounts: number;
  totalBalanceKES: number;
  totalBalanceUSD: number;
  totalDebitKES: number;
  totalDebitUSD: number;
  totalCreditKES: number;
  totalCreditUSD: number;
  netMovementKES: number;
  netMovementUSD: number;
  /** Every bank currency (KES, USD, UGX, EUR) — from the API when available */
  byCurrency?: any[] | null;
}
// Form data interface for creating bank account
export interface BankAccountFormData {
  bankName: string;
  accountNumber: string;
  accountName: string;
  branchCode: string;
  currency: "KES" | "USD" | "UGX" | "EUR";
  openingBalance: number;
}
// Form data interface for editing bank account
export interface EditBankAccountFormData {
  bankName: string;
  accountName: string;
  branchCode: string;
  isActive: boolean;
}
