// ==================== ENUMS ====================
export const UserRole = { SuperAdmin: 0, OfficeUser: 1, Client: 2 };
export const Currency = { KES: 0, USD: 1, UGX: 2, EUR: 3 };
// Display metadata per currency. Adding a currency later = one entry here.
export const CURRENCY_INFO: Record<number, { code: string; symbol: string; label: string }> = {
  0: { code: 'KES', symbol: 'KES ', label: 'Kenyan Shilling' },
  1: { code: 'USD', symbol: '$', label: 'US Dollar' },
  2: { code: 'UGX', symbol: 'USh ', label: 'Ugandan Shilling' },
  3: { code: 'EUR', symbol: '€', label: 'Euro' },
};
export const currencyCode = (c: number) => CURRENCY_INFO[c]?.code || 'KES';
/** Every supported currency, in enum order. */
export const ALL_CURRENCIES = [0, 1, 2, 3];
/** Foreign currencies tradable against KES (Kenyan bureaus). Prefer foreignCurrenciesFor(base). */
export const FOREIGN_CURRENCIES = [1, 2, 3];
/**
 * Currencies a bureau may use, by country (mirrors CurrencyInfo.AllowedFor on the API).
 * Kenya (KES home): KES, USD, EUR — no UGX. Uganda (UGX home): UGX, USD, KES, EUR.
 */
export const allowedCurrenciesFor = (base: number): number[] =>
  base === 2 ? [2, 1, 0, 3] : [base, ...[1, 3].filter((c) => c !== base)];
export const isCurrencyAllowed = (base: number, c: number) => allowedCurrenciesFor(base).includes(c);
/** Foreign currencies that trade against a given home currency (allowed ones except the home one). */
export const foreignCurrenciesFor = (base: number) => allowedCurrenciesFor(base).filter((c) => c !== base);
/** Every currency the float can hold, home currency first. */
export const floatCurrenciesFor = (base: number) => allowedCurrenciesFor(base);
/** Mobile money networks (agent.provider). */
export const MOBILE_MONEY_PROVIDERS = [
  { value: 0, label: 'M-Pesa' },
  { value: 1, label: 'MTN MoMo' },
  { value: 2, label: 'Airtel Money' },
];
export const providerLabel = (p?: number) =>
  MOBILE_MONEY_PROVIDERS.find((x) => x.value === (p ?? 0))?.label ?? 'M-Pesa';
/**
 * The currency a NEW wallet on this network holds (same rule as the server):
 * M-Pesa is Kenyan shillings even in a Ugandan bureau; MTN MoMo is MTN Uganda (UGX);
 * Airtel Money runs in both countries, so it follows the home currency.
 */
export const walletCurrency = (provider: number | undefined, home: number): number =>
  provider === 0 || provider === undefined ? Currency.KES : provider === 1 ? Currency.UGX : home;
/** Chip colours per currency (KES green, USD blue, UGX amber, EUR violet). */
export const CURRENCY_COLOR: Record<number, string> = { 0: '#059669', 1: '#2563EB', 2: '#D97706', 3: '#7C3AED' };
/** ChipGroup options for a list of currencies. */
export const currencyChips = (list: number[] = ALL_CURRENCIES) =>
  list.map((c) => ({ value: c, label: currencyCode(c), color: CURRENCY_COLOR[c] || '#475569' }));
/** Per-currency balance row (KES/USD fixed fields + otherBalances). */
export interface CurrencyBalanceRow { currency: number; code: string; balance: number; totalIn: number; totalOut: number }
export const balanceRowsFrom = (p: any, includeZeroKesUsd = false): CurrencyBalanceRow[] => {
  if (!p) return [];
  const rows: CurrencyBalanceRow[] = [
    { currency: 0, code: 'KES', balance: p.balanceKES || 0, totalIn: p.totalInKES || 0, totalOut: p.totalOutKES || 0 },
    { currency: 1, code: 'USD', balance: p.balanceUSD || 0, totalIn: p.totalInUSD || 0, totalOut: p.totalOutUSD || 0 },
    ...((p.otherBalances || []) as any[]).map((b) => ({
      currency: b.currency, code: b.currencyCode || currencyCode(b.currency),
      balance: b.balance || 0, totalIn: b.totalIn || 0, totalOut: b.totalOut || 0,
    })),
  ];
  return rows.filter((r) => (includeZeroKesUsd && r.currency <= 1) || r.balance || r.totalIn || r.totalOut);
};
export const TransactionType = { Debit: 0, Credit: 1 };
export const AccountType = { Cash: 0, Bank: 1, Mpesa: 2, Client: 3, Expense: 4 };
export const ClientType = { Permanent: 0, WalkIn: 1 };
export const ReconciliationStatus = { Pending: 0, Matched: 1, Unmatched: 2 };
export const ExchangeDirection = { UsdToKes: 0, KesToUsd: 1 };

// ==================== API RESPONSE ====================
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ==================== AUTH ====================
export interface UnifiedLoginDto {
  code: string;
  phoneNumber: string;
  password: string;
}

export interface OtpVerifyDto {
  code: string;
  phoneNumber: string;
  otp: string;
  deviceId?: string;
  deviceName?: string;
}

export interface LoginResponseDto {
  requiresOtp: boolean;
  token?: string;
  refreshToken?: string;
  user?: UserInfoDto;
}

export interface TokenResponseDto {
  accessToken: string;
}

export interface UserInfoDto {
  id: string;
  code: string;
  fullName: string;
  role: number;
  companyId?: string;
  companyName?: string;
}

// ==================== CLIENT ====================
export interface ClientDto {
  /** Linked to a phone login (one login, several bureaus). */
  phoneLoginLinked?: boolean;
  id: string;
  code: string;
  fullName: string;
  whatsAppNumber: string;
  email?: string;
  idPassport?: string;
  clientType: number;
  balanceKES: number;
  balanceUSD: number;
  /** UGX, EUR, ... balances */
  otherBalances?: { currency: number; currencyCode: string; balance: number; openingBalance?: number; totalIn?: number; totalOut?: number }[];
  isActive: boolean;
  createdAt: string;
}

export interface CreateClientDto {
  fullName: string;
  whatsAppNumber: string;
  email?: string;
  idPassport?: string;
  clientType: number;
  openingBalanceKES: number;
  openingBalanceUSD: number;
  /** Opening balance in the bureau's home currency when it isn't KES/USD (e.g. UGX). */
  openingBalanceHome?: number;
  password?: string;
}

// ==================== TRANSACTION ====================
export interface TransactionDto {
  id: string;
  code: string;
  transactionType: number;
  amount: number;
  currency: number;
  description: string;
  notes?: string;
  exchangeRate?: number;
  sourceAccountType: number;
  sourceAccountId?: string;
  sourceAccountName?: string;
  sourceBalanceBefore?: number;
  sourceBalanceAfter?: number;
  destAccountType: number;
  destAccountId?: string;
  destAccountName?: string;
  destBalanceBefore?: number;
  destBalanceAfter?: number;
  counterAmount?: number;
  counterCurrency?: number;
  isReversed?: boolean;
  isReversal?: boolean;
  createdAt: string;
  transactionDate: string;
  reference?: string;
}

export interface CreateTransactionDto {
  transactionType: number;
  sourceAccountType: number;
  sourceAccountId: string;
  destAccountType: number;
  destAccountId: string;
  amount: number;
  currency: number;
  counterAmount?: number;
  counterCurrency?: number;
  description: string;
  notes?: string;
  exchangeRate?: number;
  paymentMethod?: number;
  transactionDate?: string;
}

// ==================== ACCOUNTS ====================
export interface BankAccountDto {
  id: string;
  code: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  currency: number;
  balance: number;
  openingBalance: number;
  isActive: boolean;
}

export interface MpesaAgentDto {
  id: string;
  code: string;
  agentName: string;
  phoneNumber: string;
  agentNumber: string;
  storeNumber?: string;
  agentType: number;
  balance: number;
  openingBalance: number;
  isActive: boolean;
}

export interface CashAccountDto {
  id: string;
  currency: number;
  balance: number;
  openingBalance: number;
}

// ==================== EXCHANGE ====================
export interface ExchangeRateDto {
  id: string;
  buyRate: number;
  sellRate: number;
  isActive: boolean;
  effectiveFrom: string;
}

export interface ExchangeFloatDto {
  id: string;
  kesBalance: number;
  usdBalance: number;
  kesProfit: number;
  usdProfit: number;
  /** UGX, EUR, ... the float holds */
  otherBalances?: { currency: number; currencyCode: string; balance: number; averageCost: number }[];
}

export interface CreateExchangeDto {
  direction: number;
  exchangeType: number;
  clientId?: string;
  amount: number;
  customRate?: number;
  clientIdNumber?: string;
  clientName?: string;
  notes?: string;
  /** The non-KES side: USD (default), UGX or EUR */
  foreignCurrency?: number;
}

export interface ExchangeTransactionDto {
  id: string;
  code: string;
  direction: number;
  exchangeType: number;
  clientName?: string;
  clientType?: string;
  amountGiven: number;
  currencyGiven: number;
  amountReceived: number;
  currencyReceived: number;
  exchangeRate: number;
  profit: number;
  profitCurrency: number;
  notes?: string;
  status: string;
  date: string;
}

// ==================== DASHBOARD ====================
export interface DashboardStatsDto {
  cashKES: number;
  cashUSD: number;
  totalMpesa: number; // home-currency wallets only
  /** Mobile money per wallet currency (M-Pesa is KES even in a Ugandan bureau). */
  mobileMoneyByCurrency?: { currency: number; currencyCode: string; amount: number }[];
  totalBankKES: number;
  totalBankUSD: number;
  todayTransactions: {
    totalCount: number;
    totalDebitKES: number;
    totalDebitUSD: number;
    totalCreditKES: number;
    totalCreditUSD: number;
    netFlowKES: number;
    netFlowUSD: number;
    /** Every currency: totalDebit = money in, totalCredit = money out */
    byCurrency?: { currency: number; currencyCode: string; totalDebit: number; totalCredit: number; netFlow: number }[];
  };
  /** Cash & bank per currency (KES, USD, UGX, EUR) */
  byCurrency?: { currency: number; currencyCode: string; cash: number; bank: number }[];
  currentExchangeRate: {
    id: string;
    buyRate: number;
    sellRate: number;
    effectiveFrom: string;
    isActive: boolean;
  } | null;
  recentTransactions: TransactionDto[];
}

// ==================== CLIENT PORTAL ====================
export interface ClientDashboardDto {
  profile: {
    id: string;
    code: string;
    fullName: string;
    email?: string;
    whatsAppNumber: string;
    balanceKES: number;
    balanceUSD: number;
    totalInKES: number;
    totalOutKES: number;
    totalInUSD: number;
    totalOutUSD: number;
    isActive: boolean;
    createdAt: string;
    lastLoginAt?: string;
    otherBalances?: {
      currency: number;
      currencyCode: string;
      balance: number;
      openingBalance: number;
      totalIn: number;
      totalOut: number;
    }[];
  };
  recentTransactions: ClientTransactionDto[];
  recentAlerts: ClientAlertDto[];
  quickStats: {
    thisMonthInKES: number;
    thisMonthOutKES: number;
    thisMonthInUSD: number;
    thisMonthOutUSD: number;
    /** UGX, EUR, ... this month (income = in, expenses = out) */
    thisMonthOtherCurrencies?: { currency: number; currencyCode: string; income: number; expenses: number }[];
    transactionCount: number;
    unreadAlerts: number;
  };
}

export interface ClientTransactionDto {
  id: string;
  code: string;
  type: string;
  transactionType: number;
  amount: number;
  currency: number;
  description: string;
  date: string;
  time?: string;
  balanceBefore: number;
  balanceAfter: number;
  reference?: string;
  notes?: string;
  counterAccountName?: string;
  createdAt: string;
}

export interface ClientAlertDto {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

// ==================== EXPENSE ====================
export interface ExpenseDto {
  id: string;
  code: string;
  categoryId: string;
  categoryName: string;
  description: string;
  vendorPayee?: string;
  amount: number;
  currency: number;
  paymentMethod: number;
  paymentAccountName?: string;
  reference?: string;
  expenseDate: string;
  createdAt: string;
}

// ==================== INVOICE ====================
export interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  clientName: string;
  total: number;
  currency: number;
  status: number;
  dueDate: string;
  createdAt: string;
}

// ==================== HELPERS ====================
export const getCurrencyLabel = (c: number) => CURRENCY_INFO[c]?.code || 'KES';
// Was "USD ? '$' : 'KES'", which labelled UGX and EUR amounts as KES.
export const getCurrencySymbol = (c: number) => (CURRENCY_INFO[c]?.symbol ?? 'KES ').trim();
export const getTransactionTypeLabel = (t: number) => t === TransactionType.Debit ? 'Debit' : 'Credit';
export const getAccountTypeLabel = (t: number) => {
  switch (t) {
    case AccountType.Cash: return 'Cash';
    case AccountType.Bank: return 'Bank';
    case AccountType.Mpesa: return 'Mobile money';
    case AccountType.Client: return 'Client';
    case AccountType.Expense: return 'Expense';
    default: return 'Unknown';
  }
};
/** Sum amounts per currency (never add KES to UGX). Returns non-zero totals, home currency first. */
export const sumByCurrency = <T,>(rows: T[], amount: (r: T) => number, currency: (r: T) => number, base: number = Currency.KES) => {
  const m = new Map<number, number>();
  rows.forEach((r) => m.set(currency(r), (m.get(currency(r)) || 0) + (amount(r) || 0)));
  return [...m.entries()].filter(([, v]) => v).sort(([a], [b]) => (a === base ? -1 : b === base ? 1 : a - b)).map(([c, v]) => ({ currency: c, total: v }));
};
/** "KES 15,700.00 · USh 1,800,000.00" — or a zero in the home currency. */
export const formatTotals = (totals: { currency: number; total: number }[], base: number = Currency.KES, sep = '\n') =>
  totals.length ? totals.map((t) => formatCurrency(t.total, t.currency)).join(sep) : formatCurrency(0, base);
/** "Kenyan Shillings", "Ugandan Shillings", "US Dollars" */
export const currencyPlural = (c: number) => (CURRENCY_INFO[c]?.label ? CURRENCY_INFO[c].label + 's' : '');

/** The number alone, with the currency's decimals: "1,800,000" for UGX, "12.50" for USD. */
export const amountText = (amount: number, currency: number) => {
  const dp = currency === Currency.UGX ? 0 : 2;
  const v = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
export const formatCurrency = (amount: number, currency: number = Currency.KES) => {
  const symbol = CURRENCY_INFO[currency]?.symbol ?? 'KES ';
  const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  // Sign-preserving: negative amounts keep their minus sign (in front of the
  // symbol) so negative balances / net movements can never masquerade as
  // positive. Call sites that want an explicit "+" add it for val >= 0 only.
  const sign = val < 0 ? '-' : '';
  // Ugandan shillings have no cents (the web shows whole shillings too).
  const dp = currency === Currency.UGX ? 0 : 2;
  return `${sign}${symbol}${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
};
export const formatDate = (date: string) => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const formatDateTime = (date: string) => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
