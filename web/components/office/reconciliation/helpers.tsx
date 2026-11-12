"use client";

import { AccountType, Currency, TransactionReconciliationDto, TransactionType, currencyCode } from "@/lib/api";
import { Building2, CreditCard, Smartphone, Wallet } from "lucide-react";
import { localDate } from "@/lib/dates";

// ==================== TYPES ====================

export interface StatementEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
  reference?: string;
  balance?: number;
  matched?: boolean;
  matchedTransactionId?: string;
  confidence?: number;
}
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
export const parseCSVStatement = (csvContent: string): StatementEntry[] => {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0]
    .toLowerCase()
    .split(",")
    .map((h) => h.trim().replace(/"/g, ""));
  const entries: StatementEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/"/g, ""));

    const dateIdx = headers.findIndex(
      (h) => h.includes("date") || h.includes("time"),
    );
    const descIdx = headers.findIndex(
      (h) =>
        h.includes("desc") ||
        h.includes("particular") ||
        h.includes("narration"),
    );
    const debitIdx = headers.findIndex(
      (h) =>
        h.includes("debit") ||
        h.includes("withdrawal") ||
        h.includes("paid out"),
    );
    const creditIdx = headers.findIndex(
      (h) =>
        h.includes("credit") || h.includes("deposit") || h.includes("paid in"),
    );
    const amountIdx = headers.findIndex(
      (h) => h.includes("amount") && !h.includes("balance"),
    );
    const balanceIdx = headers.findIndex((h) => h.includes("balance"));
    const refIdx = headers.findIndex(
      (h) =>
        h.includes("ref") ||
        h.includes("transaction id") ||
        h.includes("receipt"),
    );

    const debitAmt =
      debitIdx >= 0
        ? parseFloat(values[debitIdx]?.replace(/[^0-9.-]/g, "") || "0")
        : 0;
    const creditAmt =
      creditIdx >= 0
        ? parseFloat(values[creditIdx]?.replace(/[^0-9.-]/g, "") || "0")
        : 0;
    const singleAmt =
      amountIdx >= 0
        ? parseFloat(values[amountIdx]?.replace(/[^0-9.-]/g, "") || "0")
        : 0;

    let amount = 0;
    let type: "credit" | "debit" = "credit";

    if (debitAmt > 0) {
      amount = debitAmt;
      type = "debit";
    } else if (creditAmt > 0) {
      amount = creditAmt;
      type = "credit";
    } else if (singleAmt !== 0) {
      amount = Math.abs(singleAmt);
      type = singleAmt < 0 ? "debit" : "credit";
    }

    if (amount > 0) {
      entries.push({
        id: `stmt-${i}`,
        date: values[dateIdx] || localDate(),
        description: values[descIdx] || "Unknown",
        amount,
        type,
        reference: refIdx >= 0 ? values[refIdx] : undefined,
        balance:
          balanceIdx >= 0
            ? parseFloat(values[balanceIdx]?.replace(/[^0-9.-]/g, "") || "0")
            : undefined,
        matched: false,
      });
    }
  }

  return entries;
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
