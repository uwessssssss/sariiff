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
// Updated MPesaAgent interface to match backend MpesaAgentDto
export interface MPesaAgent {
  id: string;
  code: string;
  agentName: string;
  phoneNumber: string;
  agentNumber: string;
  storeNumber: string;
  agentType: number;
  provider: number; // 0 M-Pesa, 1 MTN MoMo, 2 Airtel Money
  currency: number; // the wallet's own currency (M-Pesa = KES even in Uganda)
  balance: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  isActive: boolean;
  createdAt: string;
}
// Updated MpesaStats interface to match backend
export interface MpesaStats {
  totalAgents: number;
  totalBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  /** Every wallet currency held; the totals above are the home currency only. */
  byCurrency?: { currency: number; currencyCode: string; balance: number; totalDebit: number; totalCredit: number; netMovement: number }[];
}
export interface FormData {
  agentName: string;
  phoneNumber: string;
  agentNumber: string;
  storeNumber: string;
  agentType: number;
  provider: number;
  openingBalance: number;
}
export interface EditFormData {
  agentName: string;
  storeNumber: string;
  agentType: number;
  provider: number;
  isActive: boolean;
}
