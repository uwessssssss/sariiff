// ==============================================
// Enums (matching backend) with Type Exports
// ==============================================

export const UserRole = {
  SuperAdmin: 0,
  OfficeUser: 1,
  Client: 2,
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const ClientType = {
  Permanent: 0,
  Temporary: 1,
} as const;
export type ClientType = (typeof ClientType)[keyof typeof ClientType];
export const Currency = {
  KES: 0,
  USD: 1,
  UGX: 2,
  EUR: 3,
} as const;
// Display metadata per currency — adding a currency later is one entry here.
export const CURRENCY_META: Record<number, { code: string; label: string }> = {
  0: { code: "KES", label: "Kenyan Shilling" },
  1: { code: "USD", label: "US Dollar" },
  2: { code: "UGX", label: "Ugandan Shilling" },
  3: { code: "EUR", label: "Euro" },
};
export const currencyCode = (c: number | string): string =>
  typeof c === "number" ? CURRENCY_META[c]?.code || "KES" : c;
/** Every supported currency, in enum order. */
export const ALL_CURRENCIES = [0, 1, 2, 3] as const;
/** Shillings are shown without cents; dollars and euros with cents. */
export const currencyDecimals = (c: number | string): number => {
  const code = currencyCode(c);
  return code === "KES" || code === "UGX" ? 0 : 2;
};
/** "UGX 2,400,000" / "USD 7,750.00" — code + number, never a guessed symbol. */
export const formatMoney = (amount: number, c: number | string): string => {
  const d = currencyDecimals(c);
  return `${currencyCode(c)} ${(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })}`;
};
// ---- Per-currency figures sent by the API (every currency in use) ----
export interface CurrencyAmountDto {
  currency: Currency;
  currencyCode: string;
  amount: number;
}
export interface CurrencyAccountTotalsDto {
  currency: Currency;
  currencyCode: string;
  balance: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
}
export interface CurrencyFlowTotalsDto {
  currency: Currency;
  currencyCode: string;
  totalDebit: number;
  totalCredit: number;
  netFlow: number;
}
export interface CurrencyCashBankDto {
  currency: Currency;
  currencyCode: string;
  cash: number;
  bank: number;
}
export interface CurrencyClientTotalsDto {
  currency: Currency;
  currencyCode: string;
  totalBalance: number;
  totalDebit: number;
  totalCredit: number;
  clientsOwing: number;
  clientsOwed: number;
}
export interface CurrencyExpenseTotalsDto {
  currency: Currency;
  currencyCode: string;
  total: number;
  thisMonth: number;
}
export interface CurrencyCountDto {
  currency: Currency;
  count: number;
}
export interface CurrencyDaySummaryDto {
  currency: Currency;
  currencyCode: string;
  opening: number;
  closing: number;
  volumeIn: number;
  volumeOut: number;
  actualCount?: number | null;
  variance?: number | null;
}
export type Currency = (typeof Currency)[keyof typeof Currency];
export const TransactionType = {
  Debit: 0, // Money IN (increases asset accounts)
  Credit: 1, // Money OUT (decreases asset accounts)
} as const;
export type TransactionType =
  (typeof TransactionType)[keyof typeof TransactionType];
export const AccountType = {
  Cash: 0,
  Bank: 1,
  Mpesa: 2,
  Client: 3,
  Expense: 4,
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];
export const ReconciliationStatus = {
  Pending: 0,
  Matched: 1,
  Unmatched: 2,
} as const;
export type ReconciliationStatus =
  (typeof ReconciliationStatus)[keyof typeof ReconciliationStatus];
export const PaymentMethod = {
  Cash: 0,
  Bank: 1,
  Mpesa: 2,
  AccountTransfer: 3,
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
// Exchange Enums
export const ExchangeType = {
  Cash: 0,
  FromAccount: 1,
} as const;
export type ExchangeType = (typeof ExchangeType)[keyof typeof ExchangeType];
export const ExchangeDirection = {
  // Historical names: "Usd" means the exchange's foreign currency (USD, UGX, EUR).
  UsdToKes: 0, // client gives foreign, receives KES
  KesToUsd: 1, // client gives KES, receives foreign
  ForeignToKes: 0,
  KesToForeign: 1,
} as const;
export type ExchangeDirection =
  (typeof ExchangeDirection)[keyof typeof ExchangeDirection];
export const FloatMovementType = {
  Fund: 0,
  Withdraw: 1,
  ExchangeIn: 2,
  ExchangeOut: 3,
  ProfitSettlement: 4,
  Adjustment: 5,
} as const;
export type FloatMovementType =
  (typeof FloatMovementType)[keyof typeof FloatMovementType];
