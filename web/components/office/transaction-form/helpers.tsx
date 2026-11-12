"use client";

import { AccountType, Currency, currencyCode } from "@/lib/api";

export interface TransactionFormProps {
  onClose: () => void;
  onSuccess?: () => void;
}
// Combined account interface for unified selection
export interface AccountOption {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: number;
  isActive: boolean;
  accountNumber?: string;
  agentNumber?: string;
  clientId?: string;
  currencyType?: string;
}
// ============================================================
// CURRENCY CONVERSION (any pair)
// When one side is the bureau's home currency (KES in Kenya, UGX in Uganda) the
// rate is "home per 1 unit of the other currency" (how bureaus quote). For two
// foreign currencies (e.g. USD → EUR) the rate is "units of the receiving
// currency per 1 unit of the giving currency".
// ============================================================
export function convertAmount(amount: number, from: number, to: number, rate: number, base: number): number {
  if (from === to) return amount;
  if (to === base) return amount * rate; // foreign → home
  if (from === base) return amount / rate; // home → foreign
  return amount * rate; // foreign → foreign
}
export function rateLabel(base: number, from?: number, to?: number): string {
  if (from === undefined || to === undefined) return "rate";
  if (from === base) return `1 ${currencyCode(to)} = ? ${currencyCode(base)}`;
  if (to === base) return `1 ${currencyCode(from)} = ? ${currencyCode(base)}`;
  return `1 ${currencyCode(from)} = ? ${currencyCode(to)}`;
}
// ============================================================
// TRADITIONAL ACCOUNTING RULES
// ============================================================
// ASSET accounts (Cash, Bank, M-Pesa):
//   - DEBIT = Balance INCREASES (money comes IN)
//   - CREDIT = Balance DECREASES (money goes OUT)
//
// LIABILITY accounts (Client - we hold their money):
//   - DEBIT = Balance DECREASES (client withdraws)
//   - CREDIT = Balance INCREASES (client deposits)
// ============================================================

export const isAssetAccount = (accountType: AccountType): boolean => {
  return (
    accountType === AccountType.Cash ||
    accountType === AccountType.Bank ||
    accountType === AccountType.Mpesa
  );
};
