"use client";

import { AccountType, Currency, TransactionReconciliationDto, TransactionType, currencyCode } from "@/lib/api";
import { Building2, CreditCard, Smartphone, Wallet } from "lucide-react";

// ==================== TYPES ====================

export type { StatementEntry } from "@/lib/statement";
export { parseCSVStatement } from "@/lib/statement";
import type { StatementEntry } from "@/lib/statement";
export interface MatchSuggestion {
  transactionId: string;
  statementEntryId: string;
  confidence: number;
  matchType: "exact" | "amount" | "date" | "reference" | "partial";
  transaction: TransactionReconciliationDto;
  statementEntry: StatementEntry;
}
export interface ReconciliationPeriod {
  startDate: string;
  endDate: string;
  openingBalance: number;
  closingBalance: number;
}
export type ViewMode = "table" | "split" | "cards";
// ==================== HELPER FUNCTIONS ====================

export const getCurrencySymbol = (currency: Currency): string => {
  // Code + space for every currency (UGX/EUR were shown as "$")
  return `${currencyCode(currency)} `;
};
export const formatCurrency = (amount: number, currency: Currency): string => {
  return `${getCurrencySymbol(currency)}${Math.abs(amount).toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`;
};
export const getAccountTypeIcon = (type: AccountType) => {
  switch (type) {
    case AccountType.Cash:
      return <Wallet className="w-5 h-5" />;
    case AccountType.Bank:
      return <Building2 className="w-5 h-5" />;
    case AccountType.Mpesa:
      return <Smartphone className="w-5 h-5" />;
    default:
      return <CreditCard className="w-5 h-5" />;
  }
};
export const calculateMatchConfidence = (
  txn: TransactionReconciliationDto,
  entry: StatementEntry,
): number => {
  let confidence = 0;

  const amountDiff = Math.abs(txn.amount - entry.amount);
  if (amountDiff === 0) confidence += 40;
  else if (amountDiff < txn.amount * 0.01) confidence += 30;
  else if (amountDiff < txn.amount * 0.05) confidence += 15;

  const txnDate = new Date(txn.transactionDate).toDateString();
  const entryDate = new Date(entry.date).toDateString();
  if (txnDate === entryDate) {
    confidence += 25;
  } else {
    const daysDiff = Math.abs(
      (new Date(txn.transactionDate).getTime() -
        new Date(entry.date).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    if (daysDiff <= 1) confidence += 20;
    else if (daysDiff <= 3) confidence += 10;
  }

  const txnType =
    txn.transactionType === TransactionType.Debit ? "debit" : "credit";
  if (
    (txnType === "debit" && entry.type === "credit") ||
    (txnType === "credit" && entry.type === "debit")
  ) {
    confidence += 20;
  }

  const txnDesc = (txn.description + " " + txn.reference).toLowerCase();
  const entryDesc = (
    entry.description +
    " " +
    (entry.reference || "")
  ).toLowerCase();
  const words = entryDesc.split(/\s+/).filter((w) => w.length > 3);
  const matchingWords = words.filter((w) => txnDesc.includes(w));
  if (matchingWords.length > 0) {
    confidence += Math.min(15, matchingWords.length * 5);
  }

  return Math.min(100, confidence);
};
