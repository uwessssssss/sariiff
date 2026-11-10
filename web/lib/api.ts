const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// ==============================================
// Type Definitions
// ==============================================

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

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

// ==============================================
// Auth Types - Unified Login
// ==============================================

export interface UnifiedLoginDto {
  code: string;
  phoneNumber: string;
  password: string;
  deviceId?: string;
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
  tokens: TokenResponseDto | null;
  message: string;
}

export interface TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  role: number;
  name: string;
  code: string;
  companyId?: string;
  ownerName?: string;
  userId?: string;
  email?: string;
  whatsAppNumber?: string;
}

export interface AuthResponseDto {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  user: UserInfoDto;
}

export interface UserInfoDto {
  id: string;
  fullName: string;
  whatsAppNumber: string;
  email?: string;
  role: number;
  companyId?: string;
  companyName?: string;
  ownerName?: string;
  userCode?: string;
  mustChangePassword: boolean;
}

// ==============================================
// Client Types
// ==============================================

export interface ClientDto {
  /** True when the client has linked this account to a phone login (several bureaus, one login). */
  phoneLoginLinked?: boolean;
  id: string;
  code: string;
  fullName: string;
  whatsAppNumber: string;
  email?: string;
  idPassport?: string;
  clientType: ClientType;
  balanceKES: number;
  balanceUSD: number;
  openingBalanceKES: number;
  openingBalanceUSD: number;
  netMovementUSD: number;
  totalCreditUSD: number;
  totalDebitUSD: number;
  netMovementKES: number;
  totalCreditKES: number;
  totalDebitKES: number;
  isActive: boolean;
  expiresAt?: string;
  lastActivityAt?: string;
  createdAt: string;
  // Balances in currencies beyond KES/USD (UGX, EUR, ...)
  otherBalances?: CurrencyBalanceDto[];
}

export interface CurrencyBalanceDto {
  currency: number;
  currencyCode: string;
  balance: number;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
}

export interface CreateClientDto {
  fullName: string;
  whatsAppNumber: string;
  email?: string;
  idPassport?: string;
  clientType: ClientType;
  openingBalanceKES?: number;
  openingBalanceUSD?: number;
  /** Opening balance in the bureau's home currency when it isn't KES/USD (e.g. UGX). */
  openingBalanceHome?: number;
  password?: string;
}

export interface UpdateClientDto {
  fullName?: string;
  whatsAppNumber?: string;
  email?: string;
  idPassport?: string;
  isActive?: boolean;
}

// ==============================================
// Transaction Types
// ==============================================

export interface TransactionDto {
  id: string;
  code: string;
  reference: string;
  transactionDate: string;
  transactionType: TransactionType;
  amount: number;
  currency: Currency;
  description: string;
  notes?: string;
  exchangeRate?: number;
  /** The destination leg's amount/currency when the two sides differ (FX). */
  counterAmount?: number | null;
  counterCurrency?: Currency | null;
  sourceAccountType: AccountType;
  sourceAccountId: string;
  sourceAccountName: string;
  sourceBalanceBefore: number;
  sourceBalanceAfter: number;
  destAccountType: AccountType;
  destAccountId: string;
  destAccountName: string;
  destBalanceBefore: number;
  destBalanceAfter: number;
  reconciliationStatus: ReconciliationStatus;
  createdAt: string;
  createdByName?: string;
  isReversed?: boolean;
  isReversal?: boolean;
}

export interface CreateTransactionDto {
  transactionType: TransactionType;
  sourceAccountType: AccountType;
  sourceAccountId: string;
  destAccountType: AccountType;
  destAccountId: string;
  amount: number;
  currency: Currency;
  counterAmount?: number;
  counterCurrency?: Currency;
  description: string;
  notes?: string;
  exchangeRate?: number;
  paymentMethod: PaymentMethod;
}

export interface TransactionResponseDto {
  id: string;
  code: string;
  reference: string;
  transactionDate: string;
  transactionType: TransactionType;
  amount: number;
  currency: Currency;
  description: string;
  notes?: string;
  exchangeRate?: number;
  sourceAccountType: AccountType;
  sourceAccountId: string;
  sourceAccountName: string;
  sourceBalanceBefore: number;
  sourceBalanceAfter: number;
  destAccountType: AccountType;
  destAccountId: string;
  destAccountName: string;
  destBalanceBefore: number;
  destBalanceAfter: number;
  counterAmount?: number;
  counterCurrency?: Currency;
  reconciliationStatus: ReconciliationStatus;
  createdAt: string;
  isReversed?: boolean;
  isReversal?: boolean;
}

// ==============================================
// Bank Account Types
// ==============================================

export interface BankAccountDto {
  id: string;
  code: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  branchCode?: string;
  currency: Currency;
  balance: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  isActive: boolean;
  createdAt: string;
}

export interface CreateBankAccountDto {
  bankName: string;
  accountNumber: string;
  accountName: string;
  branchCode?: string;
  currency: Currency;
  openingBalance?: number;
}

// ==============================================
// M-Pesa Agent Types
// ==============================================

export interface MpesaAgentDto {
  id: string;
  code: string;
  agentName: string;
  agentNumber: string;
  phoneNumber: string;
  storeNumber?: string;
  agentType?: number;
  balance: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  isActive: boolean;
  createdAt: string;
  /** 0 = M-Pesa, 1 = MTN MoMo, 2 = Airtel Money */
  provider?: number;
  /** The wallet's own currency: M-Pesa = KES, MTN MoMo = UGX, Airtel = home. */
  currency?: Currency;
}

export interface CreateMpesaAgentDto {
  agentName: string;
  agentNumber: string;
  phoneNumber: string;
  storeNumber?: string;
  agentType?: number;
  openingBalance?: number;
  provider?: number;
}

/** Mobile money networks an agent can belong to. */
export const MOBILE_MONEY_PROVIDERS = [
  { value: 0, label: "M-Pesa" },
  { value: 1, label: "MTN MoMo" },
  { value: 2, label: "Airtel Money" },
];
export const providerLabel = (p?: number) =>
  MOBILE_MONEY_PROVIDERS.find((x) => x.value === (p ?? 0))?.label ?? "M-Pesa";

/**
 * The currency a NEW wallet on this network holds (same rule as the server):
 * M-Pesa is Kenyan shillings even in a Ugandan bureau; MTN MoMo is MTN Uganda (UGX);
 * Airtel Money runs in both countries, so it follows the bureau's home currency.
 */
export const walletCurrency = (provider: number | undefined, home: number): number =>
  provider === 0 || provider === undefined ? Currency.KES : provider === 1 ? Currency.UGX : home;

// ==============================================
// Cash Account Types
// ==============================================

export interface CashAccountDto {
  id: string;
  name: string;
  currency: Currency;
  balance: number;
  openingBalance: number;
  isActive: boolean;
}
// Response DTO - matches backend CashAccountResponseDto
export interface CashAccountResponseDto {
  id: string;
  currency: Currency;
  balance: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  createdAt: string;
}

// Create DTO - matches backend CreateCashAccountDto
export interface CreateCashAccountDto {
  currency: Currency;
  openingBalance: number;
}

// Update DTO - matches backend UpdateCashAccountDto
export interface UpdateCashAccountDto {
  openingBalance?: number;
}

// Stats DTO - matches backend CashStatsDto
export interface CashStatsDto {
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
  /** Every cash currency held (KES, USD, UGX, EUR) */
  byCurrency?: CurrencyAccountTotalsDto[] | null;
}
// ==============================================
// Exchange Rate Types
// ==============================================

export interface ExchangeRateDto {
  id: string;
  buyRate: number;
  sellRate: number;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive: boolean;
  createdAt: string;
  createdByName?: string;
  // Which foreign currency this rate quotes against KES (multi-currency rates)
  foreignCurrency?: number;
  foreignCurrencyCode?: string;
}

export interface SetExchangeRateDto {
  buyRate: number;
  sellRate: number;
  foreignCurrency?: number; // Currency enum of the foreign currency (default USD)
}

// ==============================================
// Exchange Float Types (Forex Bureau)
// ==============================================

export interface ExchangeFloatDto {
  id: string;
  kesBalance: number;
  usdBalance: number;
  kesProfit: number;
  usdProfit: number;
  usdAverageCost: number;
  lastUpdated: string;
  /** Currency of kesBalance/kesProfit: the company's base (KES or UGX) */
  baseCurrency?: Currency;
  /** UGX, EUR, ... — only currencies the float actually holds */
  otherBalances?: FloatCurrencyBalanceDto[] | null;
}

export interface FloatCurrencyBalanceDto {
  currency: Currency;
  currencyCode: string;
  balance: number;
  averageCost: number;
}

export interface FundFloatDto {
  currency: Currency;
  amount: number;
  sourceType: AccountType;
  sourceAccountId: string;
  purchaseRate?: number;
  notes?: string;
}

export interface WithdrawFloatDto {
  currency: Currency;
  amount: number;
  destinationType: AccountType;
  destinationAccountId: string;
  notes?: string;
}

export interface SettleProfitDto {
  currency: Currency;
  amount: number;
  destinationType: AccountType;
  destinationAccountId: string;
  notes?: string;
}

export interface CreateExchangeDto {
  clientId?: string | null;
  clientName?: string;
  exchangeType: ExchangeType;
  direction: ExchangeDirection;
  amount: number;
  customRate?: number;
  clientIdNumber?: string;
  notes?: string;
  /** The non-KES side: USD (default), UGX or EUR */
  foreignCurrency?: Currency;
}

export interface ExchangeResponseDto {
  id: string;
  code: string;
  date: string;
  clientId: string | null;
  clientName: string;
  clientType: string;
  exchangeType: ExchangeType;
  direction: ExchangeDirection;
  amountGiven: number;
  currencyGiven: Currency;
  amountReceived: number;
  currencyReceived: Currency;
  exchangeRate: number;
  profit: number;
  profitCurrency: Currency;
  notes?: string;
  status: string;
  isLargeTransaction: boolean;
}

export interface OpeningFloatDto {
  kesCount: number;
  usdCount: number;
  notes?: string;
  /** UGX, EUR, ... physical counts */
  otherCounts?: CurrencyCountDto[];
}

export interface ClosingFloatDto {
  kesCount: number;
  usdCount: number;
  notes?: string;
  /** UGX, EUR, ... physical counts */
  otherCounts?: CurrencyCountDto[];
}

export interface DailySummaryDto {
  date: string;
  totalTransactions: number;
  exchangeCount: number;
  kesVolumeIn: number;
  kesVolumeOut: number;
  usdVolumeIn: number;
  usdVolumeOut: number;
  kesProfit: number;
  usdProfit: number;
  openingKes: number;
  openingUsd: number;
  closingKes: number;
  closingUsd: number;
  kesVariance?: number;
  usdVariance?: number;
  isClosed: boolean;
  /** UGX, EUR, ... day figures */
  otherCurrencies?: CurrencyDaySummaryDto[] | null;
}

export interface ProfitReportDto {
  fromDate: string;
  toDate: string;
  totalKesProfit: number;
  totalUsdProfit: number;
  totalProfitInKes: number;
  totalTransactions: number;
  averageSpread: number;
  dailyBreakdown: DailyProfitDto[];
}

export interface DailyProfitDto {
  date: string;
  kesProfit: number;
  usdProfit: number;
  transactions: number;
}

export interface FloatMovementDto {
  id: string;
  date: string;
  type: string;
  currency: Currency;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  sourceOrDest?: string;
  notes?: string;
}

export interface LargeTransactionReportDto {
  transactionId: string;
  code: string;
  date: string;
  clientName: string;
  clientIdNumber: string;
  clientPhone?: string;
  amount: number;
  currency: Currency;
  kesEquivalent: number;
  transactionType: string;
}

export interface FloatAlertDto {
  alertType: string;
  message: string;
  currency?: Currency;
  currentBalance?: number;
  threshold?: number;
  timestamp: string;
}

export interface ClientExchangeHistoryDto {
  clientId: string | null;
  clientName: string;
  totalExchanges: number;
  totalKesExchanged: number;
  totalUsdExchanged: number;
  totalProfitGenerated: number;
  firstExchange?: string;
  lastExchange?: string;
  recentExchanges: ExchangeResponseDto[];
}

export interface UsdPositionDto {
  usdBalance: number;
  averageCostPerUsd: number;
  totalCostBasis: number;
  currentMarketRate: number;
  currentMarketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

export interface CalculateExchangeDto {
  amount: number;
  direction: ExchangeDirection;
  /** USD when omitted */
  foreignCurrency?: Currency;
}

export interface CalculationResultDto {
  inputAmount: number;
  inputCurrency: Currency;
  outputAmount: number;
  outputCurrency: Currency;
  rate: number;
  estimatedProfit: number;
}

export interface VoidExchangeDto {
  reason: string;
}

export interface UpdateAlertThresholdsDto {
  lowKesThreshold: number;
  lowUsdThreshold: number;
  largeTransactionThreshold: number;
}

// ==============================================
// Expense Types
// ==============================================

export interface ExpenseCategoryDto {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  totalKES: number;
  totalUSD: number;
  transactionCount: number;
  /** Every currency spent in this category */
  totalsByCurrency?: CurrencyAmountDto[] | null;
}

export interface ExpenseDto {
  id: string;
  code: string;
  categoryId: string;
  categoryName?: string;
  description: string;
  vendorPayee?: string;
  amount: number;
  currency: Currency;
  expenseDate: string;
  paymentMethod: PaymentMethod;
  paymentAccountName?: string;
  reference?: string;
  notes?: string;
  createdAt: string;
  createdByName?: string;
}

export interface CreateExpenseDto {
  categoryId: string;
  description: string;
  vendorPayee?: string;
  amount: number;
  currency: Currency;
  paymentMethod: PaymentMethod;
  paymentAccountType: AccountType;
  paymentAccountId: string;
  reference?: string;
  expenseDate: string;
}
export interface UpdateExpenseDto {
  description?: string;
  vendorPayee?: string;
  amount?: number;
  reference?: string;
}

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
// Invoice Types — Matches backend DTOs
// ==============================================

export const InvoiceStatus = {
  Draft: 0,
  Sent: 1,
  Paid: 2,
  Cancelled: 3,
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export interface InvoiceItemDto {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceItemResponseDto {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface CreateInvoiceDto {
  clientId?: string | null;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  dueDate: string;
  currency: Currency;
  items: InvoiceItemDto[];
  taxRate: number;
  discountAmount: number;
  notes?: string;
  terms?: string;
}

export interface InvoiceResponseDto {
  id: string;
  invoiceNumber: string;
  clientId: string | null;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  invoiceDate: string;
  dueDate: string;
  currency: Currency;
  status: InvoiceStatus;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  notes?: string;
  terms?: string;
  items: InvoiceItemResponseDto[];
}

// Legacy simple DTO (kept for backwards compatibility)
export interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  amount: number;
  currency: Currency;
  status: number;
  dueDate: string;
  createdAt: string;
}

// ==============================================
// Reconciliation Types - ALIGNED WITH BACKEND DTOs
// ==============================================

// Matches AccountReconciliationSummaryDto from backend
export interface AccountReconciliationSummaryDto {
  id: string;
  code: string;
  name: string;
  accountType: AccountType;
  currency: Currency;
  balance: number;
  pendingCount: number;
  matchedCount: number;
  unmatchedCount: number;
}

// Matches TransactionReconciliationDto from backend
export interface TransactionReconciliationDto {
  id: string;
  code: string;
  reference: string;
  transactionDate: string;
  transactionType: TransactionType;
  amount: number;
  actualAmount: number | null;
  variance: number | null;
  currency: Currency;
  description: string;
  reconciliationStatus: ReconciliationStatus;
  reconciledAt: string | null;
  reconciledByName: string | null;
  reconciliationNotes: string | null;
  sourceAccountType: AccountType;
  sourceAccountId: string;
}

// Matches AccountReconciliationBalanceDto from backend
export interface AccountReconciliationBalanceDto {
  expectedBalance: number;
  actualBalance: number;
  variance: number;
  pendingCount: number;
  matchedCount: number;
  unmatchedCount: number;
  pendingAmount: number;
  matchedAmount: number;
  unmatchedAmount: number;
}

// Matches ReconcileTransactionDto for PUT request
export interface ReconcileTransactionDto {
  actualAmount: number;
  status: ReconciliationStatus;
  notes?: string;
}

// Matches BulkReconcileDto for PUT request
export interface BulkReconcileDto {
  transactionIds: string[];
  status: ReconciliationStatus;
  notes?: string;
}

// Matches CreateReconciliationDto for POST request
export interface CreateReconciliationDto {
  accountType: AccountType;
  accountId: string;
  actualBalance: number;
  notes?: string;
}

// Matches ReconciliationResponseDto from backend
export interface ReconciliationResponseDto {
  id: string;
  accountType: AccountType;
  accountId: string;
  accountName: string;
  currency: Currency;
  expectedBalance: number;
  actualBalance: number;
  variance: number;
  status: ReconciliationStatus;
  notes: string | null;
  reconciledAt: string | null;
  createdAt: string;
}

// Reconciliation filter DTO
export interface ReconciliationFilterDto {
  status?: ReconciliationStatus;
  startDate?: string;
  endDate?: string;
}

// Legacy ReconciliationDto
export interface ReconciliationDto {
  id: string;
  accountType: AccountType;
  accountId: string;
  accountName: string;
  systemBalance: number;
  actualBalance: number;
  variance: number;
  status: ReconciliationStatus;
  reconciledAt?: string;
  reconciledByName?: string;
  notes?: string;
}

// ==============================================
// Company Types (for Super Admin)
// ==============================================

export interface CompanyDto {
  id: string;
  code: string;
  name: string;
  ownerName: string;
  whatsAppNumber: string;
  email?: string;
  logoUrl?: string;
  taxId?: string;
  website?: string;
  address?: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface CompanySummaryDto {
  company: CompanyDto;
  totalClients: number;
  totalTransactions: number;
  cashBalanceKES: number;
  cashBalanceUSD: number;
  bankBalanceKES: number;
  bankBalanceUSD: number;
  mpesaBalance: number;
}

// ==============================================
// Audit Log Types
// ==============================================

export interface AuditLogDto {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  companyId?: string;
  companyName?: string;
  action: string;
  details: string;
  entityType: string;
  entityId?: string;
  ipAddress: string;
}

export interface LoginHistoryDto {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  companyId?: string;
  companyName?: string;
  loginTime: string;
  logoutTime?: string;
  ipAddress: string;
  userAgent?: string;
  isSuccess: boolean;
  failureReason?: string;
}
// ============ CLIENT PORTAL DTOs ============

export interface ClientDashboardDto {
  profile: ClientProfileDto;
  recentTransactions: ClientTransactionDto[];
  recentAlerts: ClientAlertDto[];
  quickStats: QuickStatsDto;
}

export interface QuickStatsDto {
  thisMonthInKES: number;
  thisMonthOutKES: number;
  thisMonthInUSD: number;
  thisMonthOutUSD: number;
  /** UGX, EUR, ... (income = in, expenses = out) */
  thisMonthOtherCurrencies?: CurrencyFlowDto[];
  transactionCount: number;
  unreadAlerts: number;
}

export interface ClientProfileDto {
  id: string;
  code: string;
  fullName: string;
  email: string | null;
  whatsAppNumber: string;
  idPassport: string | null;
  clientType: ClientType;
  balanceKES: number;
  balanceUSD: number;
  openingBalanceKES: number;
  openingBalanceUSD: number;
  totalInKES: number;
  totalOutKES: number;
  totalInUSD: number;
  totalOutUSD: number;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  // Balances in currencies beyond KES/USD (UGX, EUR, ...)
  otherBalances?: CurrencyBalanceDto[];
}

export interface UpdateClientProfileDto {
  email?: string;
  whatsAppNumber?: string;
}

export interface ClientTransactionDto {
  id: string;
  code: string;
  date: string;
  time: string;
  type: string; // "Credit" or "Debit" from client's perspective
  transactionType: TransactionType;
  description: string;
  amount: number;
  currency: Currency;
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  notes: string | null;
  status: ReconciliationStatus;
  createdAt: string;
  counterAccountName: string | null;
  counterAccountType: AccountType | null;
  exchangeRate: number | null;
  counterAmount: number | null;
  counterCurrency: Currency | null;
}

export interface ClientStatementDto {
  accountName: string;
  accountCode: string;
  currency: Currency;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
  netMovement: number;
  transactions: ClientTransactionDto[];
}

export interface ClientAlertDto {
  id: string;
  type: string; // "success" | "info" | "warning" | "error"
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  relatedTransactionId: string | null;
}

export interface ClientAnalyticsDto {
  monthlyData: MonthlyDataDto[];
  categoryBreakdown: CategoryBreakdownDto[];
  weeklyActivity: WeeklyActivityDto[];
  totals: AnalyticsTotalsDto;
}

export interface CurrencyFlowDto {
  currency: number;
  currencyCode: string;
  income: number;
  expenses: number;
}

export interface MonthlyDataDto {
  month: string;
  incomeKES: number;
  expensesKES: number;
  incomeUSD: number;
  expensesUSD: number;
  balanceKES: number;
  balanceUSD: number;
  otherCurrencies?: CurrencyFlowDto[];
}

export interface CategoryBreakdownDto {
  category: string;
  count: number;
  totalKES: number;
  totalUSD: number;
  percentage: number;
}

export interface WeeklyActivityDto {
  day: string;
  transactions: number;
}

export interface AnalyticsTotalsDto {
  totalTransactions: number;
  avgTransactionKES: number;
  avgTransactionUSD: number;
  netIncomeKES: number;
  netIncomeUSD: number;
  growthPercentage: number;
  otherCurrencies?: CurrencyFlowDto[];
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface PortalTransactionFilters {
  startDate?: string;
  endDate?: string;
  currency?: Currency;
  type?: TransactionType;
  search?: string;
}

// ==============================================
// Auth Token Management
// ==============================================

export interface StoredAuth {
  token: string;
  refreshToken: string;
  user: UserInfoDto;
  expiresAt: string;
}

export function getStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;

  const authStr = localStorage.getItem("sariff_auth");
  if (!authStr) return null;

  try {
    return JSON.parse(authStr);
  } catch {
    return null;
  }
}

export function setStoredAuth(auth: StoredAuth): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("sariff_auth", JSON.stringify(auth));

  const expiryDate = auth.expiresAt
    ? new Date(auth.expiresAt)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const expires = expiryDate.toUTCString();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `auth_token=${auth.token}; path=/; expires=${expires}; SameSite=Lax${secure}`;

  const roleMap: Record<number, string> = {
    0: "super-admin",
    1: "office-user",
    2: "client",
  };
  const roleName = roleMap[auth.user.role] || "client";
  document.cookie = `user_role=${roleName}; path=/; expires=${expires}; SameSite=Lax${secure}`;
}

export function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("sariff_auth");
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
  document.cookie = `user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

export function getCompanyId(): string | undefined {
  const auth = getStoredAuth();
  return auth?.user?.companyId;
}

// ==============================================
// API Request Helper
// ==============================================

// Small delay helper used for retry backoff
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ---- Idempotency ---------------------------------------------------------
// Every POST/PUT/PATCH/DELETE carries an Idempotency-Key. The API stores the
// first response per key, so a retried or double-submitted request returns
// that response instead of recording the money movement twice.
export const newIdempotencyKey = (): string =>
  typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function"
    ? (crypto as any).randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

let pinnedKey: string | null = null;
/**
 * Run `fn` with one fixed key for its mutating request. A form keeps one key per
 * submission, so pressing Save again after a timeout returns the first result
 * (or "already processing") instead of creating a duplicate. New key after success.
 */
/**
 * Key for one form submission: stable for an identical re-press (so a retry
 * after a timeout is recognised), different as soon as the payload changes.
 */
export function submissionKey(sessionKey: string, payload: unknown): string {
  const text = JSON.stringify(payload) ?? "";
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${sessionKey}-${(h >>> 0).toString(36)}`;
}

export async function withIdempotencyKey<R>(key: string, fn: () => Promise<R>): Promise<R> {
  pinnedKey = key;
  try {
    return await fn();
  } finally {
    pinnedKey = null;
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const auth = getStoredAuth();
  const method = (options.method || "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (!isRead && !headers["Idempotency-Key"]) {
    // read synchronously, before any await, so concurrent calls can't swap keys
    headers["Idempotency-Key"] = pinnedKey ?? newIdempotencyKey();
  }

  if (auth?.token) {
    headers["Authorization"] = `Bearer ${auth.token}`;
  }

  // CompanyId and UserId are now extracted from JWT by the backend middleware.
  // Sending X-Company-Id / X-User-Id headers was removed as a security fix.

  const MAX_ATTEMPTS = 3; // total tries on a network failure / timeout / 5xx
  const TIMEOUT_MS = 30000; // per-attempt timeout (covers Render cold starts)

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Token expired -> refresh once, then replay the request
      if (response.status === 401 && auth?.refreshToken) {
        // Another request may already have refreshed while this one was in
        // flight: then just replay with the new token instead of spending the
        // (now revoked) old refresh token.
        const latest = getStoredAuth();
        const refreshed =
          latest?.token && latest.token !== auth.token
            ? { accessToken: latest.token }
            : await refreshAuthOnce(auth.refreshToken);
        if (refreshed) {
          headers["Authorization"] = `Bearer ${refreshed.accessToken}`;
          const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers,
          });
          return await retryResponse.json();
        } else {
          clearStoredAuth();
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
          return { success: false, message: "Session expired", data: null };
        }
      }

      // Server error (e.g. Render still waking) -> wait and retry.
      // Reads only: a write is never re-sent automatically (its key would make
      // a re-send safe, but the user should see the failure and decide).
      if (response.status >= 500 && isRead && attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 800);
        continue;
      }

      // Got a real response -> parse and return (don't retry 2xx/4xx)
      try {
        return await response.json();
      } catch {
        return {
          success: false,
          message:
            "The server returned an unexpected response. Please try again.",
          data: null,
        };
      }
    } catch (error: any) {
      // AbortError = timeout; TypeError = "failed to fetch" / connection closed.
      // Both are worth retrying on a slow or unstable connection.
      const isRetryable =
        error?.name === "AbortError" || error?.name === "TypeError";

      if (isRetryable && isRead && attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 800); // backoff: 0.8s, then 1.6s
        continue;
      }

      if (error?.name === "AbortError") {
        return {
          success: false,
          message: isRead
            ? "The server is taking too long to respond (it may be waking up). Please try again."
            : "No reply from the server yet — it may still have saved this. Check the list before trying again.",
          data: null,
        };
      }
      return {
        success: false,
        message:
          "Couldn't reach the server — your connection may be slow or offline. Please try again.",
        data: null,
      };
    }
  }

  return {
    success: false,
    message: "Network error — please check your connection and try again.",
    data: null,
  };
}

// Single-flight refresh: when the token expires, the dashboard's parallel
// requests all get 401 at once. The API rotates (revokes) the refresh token on
// use, so only ONE refresh may run; everyone else waits for its result.
let refreshInFlight: Promise<{ accessToken: string } | null> | null = null;
export function refreshAuthOnce(refreshTokenValue: string): Promise<{ accessToken: string } | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshToken(refreshTokenValue).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function refreshToken(
  refreshTokenValue: string,
): Promise<{ accessToken: string } | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshTokenValue }),
    });

    if (!response.ok) return null;

    const result: ApiResponse<TokenResponseDto> = await response.json();
    if (result.success && result.data?.accessToken) {
      // Backend returns flat TokenResponseDto — map to StoredAuth shape
      const data = result.data;
      setStoredAuth({
        token: data.accessToken,
        refreshToken: data.refreshToken || refreshTokenValue,
        user: {
          id: data.companyId || "",
          fullName: data.name,
          whatsAppNumber: "",
          role: data.role,
          companyId: data.companyId,
          companyName: data.name,
          ownerName: data.ownerName,
          userCode: data.code,
          mustChangePassword: false,
        },
        expiresAt: data.expiresAt || "",
      });
      return { accessToken: data.accessToken };
    }
    return null;
  } catch {
    return null;
  }
}

// ==============================================
// Auth API Functions
// ==============================================

export async function login(
  dto: UnifiedLoginDto,
): Promise<ApiResponse<LoginResponseDto>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dto),
    });
    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Network error — cannot reach server",
      data: null,
    };
  }
}

export async function verifyOtp(
  dto: OtpVerifyDto,
): Promise<ApiResponse<TokenResponseDto>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dto),
    });
    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Network error — cannot reach server",
      data: null,
    };
  }
}

export async function logout(): Promise<void> {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } finally {
    clearStoredAuth();
  }
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

// ==============================================
// Client API Functions
// ==============================================

/**
 * Every row of a paged list, fetched page by page (200 at a time).
 *
 * Before (Nov 2026) screens asked for "page 1 of 200/500/1000" and treated it as everything:
 * the client picker stopped at 200 clients and the month's profit was built from the first
 * 1,000 transactions. Returns the same shape as one page, holding all rows.
 */
export async function allPages<T = any>(
  fetchPage: (page: number, pageSize: number) => Promise<ApiResponse<any>>,
  pageSize: number = 200,
  maxRows: number = 50000,
): Promise<ApiResponse<PagedResult<T>>> {
  const items: T[] = [];
  let total = 0;
  for (let page = 1; items.length < maxRows; page++) {
    const r = await fetchPage(page, pageSize);
    if (!r.success || !r.data) return page === 1 ? (r as any) : { ...r, success: true, data: { items, totalCount: Math.max(total, items.length), page: 1, pageSize: items.length } as any };
    const rows: T[] = Array.isArray(r.data) ? r.data : r.data.items || [];
    total = Array.isArray(r.data) ? items.length + rows.length : r.data.totalCount ?? items.length + rows.length;
    items.push(...rows);
    if (rows.length < pageSize || items.length >= total) {
      return { ...r, data: { items, totalCount: Math.max(total, items.length), page: 1, pageSize: items.length } as any };
    }
  }
  return { success: true, message: "Success", data: { items, totalCount: total, page: 1, pageSize: items.length } as any } as any;
}

export async function getClients(
  page: number = 1,
  pageSize: number = 10,
  search?: string,
  filter?: string,
): Promise<ApiResponse<PagedResult<ClientDto>>> {
  let url = `/api/client?page=${page}&pageSize=${pageSize}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (filter) url += `&filter=${filter}`;
  return apiRequest(url);
}

// PERF: Lightweight client list for dropdowns — no balance calculations
export interface ClientLookupDto {
  id: string;
  code: string;
  fullName: string;
  whatsAppNumber: string;
  idPassport?: string;
  isActive: boolean;
}

export async function getClientLookup(
  search?: string,
): Promise<ApiResponse<ClientLookupDto[]>> {
  let url = "/api/client/lookup";
  if (search) url += `?search=${encodeURIComponent(search)}`;
  return apiRequest(url);
}

export async function getClientById(
  id: string,
): Promise<ApiResponse<ClientDto>> {
  return apiRequest(`/api/client/${id}`);
}

export async function createClient(
  dto: CreateClientDto,
): Promise<ApiResponse<ClientDto>> {
  return apiRequest("/api/client", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function updateClient(
  id: string,
  dto: UpdateClientDto,
): Promise<ApiResponse<ClientDto>> {
  return apiRequest(`/api/client/${id}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

export async function deleteClient(id: string): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/client/${id}`, { method: "DELETE" });
}

export async function getClientStatement(
  id: string,
  startDate?: string,
  endDate?: string,
  currency?: number,
): Promise<ApiResponse<any>> {
  let url = `/api/client/${id}/statement`;
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  if (currency !== undefined) params.append("currency", String(currency));
  if (params.toString()) url += `?${params.toString()}`;
  return apiRequest(url);
}

export async function getClientStats(): Promise<ApiResponse<any>> {
  return apiRequest("/api/client/stats");
}

// ==============================================
// Transaction API Functions
// ==============================================

export async function getTransactions(
  page: number = 1,
  pageSize: number = 10,
  filters?: {
    startDate?: string;
    endDate?: string;
    type?: number;
    currency?: number;
  },
): Promise<ApiResponse<PagedResult<TransactionDto>>> {
  let url = `/api/transaction?page=${page}&pageSize=${pageSize}`;
  if (filters) {
    if (filters.startDate) url += `&startDate=${filters.startDate}`;
    if (filters.endDate) url += `&endDate=${filters.endDate}`;
    if (filters.type !== undefined) url += `&type=${filters.type}`;
    if (filters.currency !== undefined) url += `&currency=${filters.currency}`;
  }
  return apiRequest(url);
}

export async function createTransaction(
  dto: CreateTransactionDto,
): Promise<ApiResponse<TransactionDto>> {
  return apiRequest("/api/transaction", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function getTransactionById(
  id: string,
): Promise<ApiResponse<TransactionDto>> {
  return apiRequest(`/api/transaction/${id}`);
}

export async function updateTransaction(
  id: string,
  dto: { description?: string; notes?: string },
): Promise<ApiResponse<TransactionDto>> {
  return apiRequest(`/api/transaction/${id}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

export async function deleteTransaction(
  id: string,
  reason: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/transaction/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

// Reverse a client transaction from the client statement.
// This is the ONLY way to delete transactions involving client accounts.
// The general deleteTransaction endpoint blocks client transactions.
export async function reverseClientTransaction(
  clientId: string,
  transactionId: string,
  reason: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/client/${clientId}/transaction/${transactionId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

export async function getTodayTransactionsSummary(): Promise<ApiResponse<any>> {
  return apiRequest("/api/transaction/today");
}

// ==============================================
// Bank Account API Functions
// ==============================================

export async function getBankAccounts(): Promise<
  ApiResponse<BankAccountDto[]>
> {
  return apiRequest("/api/bank");
}

export async function getBankAccountById(
  id: string,
): Promise<ApiResponse<BankAccountDto>> {
  return apiRequest(`/api/bank/${id}`);
}

export async function createBankAccount(
  dto: CreateBankAccountDto,
): Promise<ApiResponse<BankAccountDto>> {
  return apiRequest("/api/bank", { method: "POST", body: JSON.stringify(dto) });
}

export async function updateBankAccount(
  id: string,
  dto: Partial<BankAccountDto>,
): Promise<ApiResponse<BankAccountDto>> {
  return apiRequest(`/api/bank/${id}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

export async function deleteBankAccount(
  id: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/bank/${id}`, { method: "DELETE" });
}

export async function getBankAccountStatement(
  id: string,
  startDate?: string,
  endDate?: string,
): Promise<ApiResponse<any>> {
  let url = `/api/bank/${id}/statement`;
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  if (params.toString()) url += `?${params.toString()}`;
  return apiRequest(url);
}

export async function getBankStats(): Promise<ApiResponse<any>> {
  return apiRequest("/api/bank/stats");
}

// ==============================================
// M-Pesa Agent API Functions
// ==============================================

export async function getMpesaAgents(): Promise<ApiResponse<MpesaAgentDto[]>> {
  return apiRequest("/api/mpesa");
}

export async function getMpesaAgentById(
  id: string,
): Promise<ApiResponse<MpesaAgentDto>> {
  return apiRequest(`/api/mpesa/${id}`);
}

export async function createMpesaAgent(
  dto: CreateMpesaAgentDto,
): Promise<ApiResponse<MpesaAgentDto>> {
  return apiRequest("/api/mpesa", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function updateMpesaAgent(
  id: string,
  dto: Partial<MpesaAgentDto>,
): Promise<ApiResponse<MpesaAgentDto>> {
  return apiRequest(`/api/mpesa/${id}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

export async function deleteMpesaAgent(
  id: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/mpesa/${id}`, { method: "DELETE" });
}

export async function getMpesaAgentStatement(
  id: string,
  startDate?: string,
  endDate?: string,
): Promise<ApiResponse<any>> {
  let url = `/api/mpesa/${id}/statement`;
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  if (params.toString()) url += `?${params.toString()}`;
  return apiRequest(url);
}

export async function getMpesaStats(): Promise<ApiResponse<any>> {
  return apiRequest("/api/mpesa/stats");
}

// ==============================================
// Cash Account API Functions
// ==============================================

export async function getCashAccounts(): Promise<
  ApiResponse<CashAccountDto[]>
> {
  return apiRequest("/api/cash");
}

export async function getCashAccountStatement(
  currency: number,
  startDate?: string,
  endDate?: string,
): Promise<ApiResponse<any>> {
  let url = `/api/cash/statement/${currency}`;
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  if (params.toString()) url += `?${params.toString()}`;
  return apiRequest(url);
}

export async function getCashStats(): Promise<ApiResponse<any>> {
  return apiRequest("/api/cash/stats");
}

/**
 * Create a new cash account
 */
export async function createCashAccount(
  dto: CreateCashAccountDto,
): Promise<ApiResponse<CashAccountResponseDto>> {
  return apiRequest("/api/cash", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

/**
 * Get a specific cash account by ID
 */
export async function getCashAccountById(
  id: string,
): Promise<ApiResponse<CashAccountResponseDto>> {
  return apiRequest(`/api/cash/${id}`);
}

/**
 * Get cash account by currency
 */
export async function getCashAccountByCurrency(
  currency: Currency,
): Promise<ApiResponse<CashAccountResponseDto>> {
  return apiRequest(`/api/cash/currency/${currency}`);
}

/**
 * Update a cash account (opening balance)
 */
export async function updateCashAccount(
  id: string,
  dto: UpdateCashAccountDto,
): Promise<ApiResponse<CashAccountResponseDto>> {
  return apiRequest(`/api/cash/${id}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

/**
 * Delete a cash account (soft delete)
 */
export async function deleteCashAccount(
  id: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/cash/${id}`, {
    method: "DELETE",
  });
}

// ==============================================
// Exchange Rate API Functions (Legacy)
// ==============================================

export async function getCurrentExchangeRate(
  currency?: number, // Currency enum value of the foreign currency; default USD
): Promise<ApiResponse<ExchangeRateDto>> {
  const q = currency !== undefined ? `?currency=${currency}` : "";
  return apiRequest(`/api/exchange/rate${q}`);
}

export async function setExchangeRate(
  dto: SetExchangeRateDto,
): Promise<ApiResponse<ExchangeRateDto>> {
  return apiRequest("/api/exchange/rate", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function getExchangeRateHistory(
  days: number = 30,
): Promise<ApiResponse<ExchangeRateDto[]>> {
  return apiRequest(`/api/exchange/rate/history?days=${days}`);
}

export async function convertCurrency(
  fromCurrency: Currency,
  toCurrency: Currency,
  amount: number,
): Promise<ApiResponse<any>> {
  return apiRequest("/api/exchange-rate/convert", {
    method: "POST",
    body: JSON.stringify({ fromCurrency, toCurrency, amount }),
  });
}

// ==============================================
// Exchange Float API Functions (Forex Bureau)
// ==============================================

// Get current float balances
export async function getExchangeFloat(): Promise<
  ApiResponse<ExchangeFloatDto>
> {
  return apiRequest("/api/exchange/float");
}

// The currencies this company actually uses (for display — pickers still show all).
export interface CurrencyOptionDto {
  currency: number;
  code: string;
  value: number;
}
export interface CompanyCurrenciesDto {
  currencies: CurrencyOptionDto[];
  /** Home currency: rates are "base per 1 foreign", profit and mobile money are in it. */
  baseCurrency?: Currency;
  baseCurrencyCode?: string;
  /** Currencies the bureau's country may use for NEW accounts, trades, rates and invoices. */
  allowedCurrencies?: CurrencyOptionDto[];
}
export async function getCompanyCurrencies(): Promise<
  ApiResponse<CompanyCurrenciesDto>
> {
  return apiRequest("/api/dashboard/currencies");
}

// Fund the exchange float
export async function fundExchangeFloat(
  dto: FundFloatDto,
): Promise<ApiResponse<ExchangeFloatDto>> {
  return apiRequest("/api/exchange/float/fund", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

// Withdraw from exchange float
export async function withdrawExchangeFloat(
  dto: WithdrawFloatDto,
): Promise<ApiResponse<ExchangeFloatDto>> {
  return apiRequest("/api/exchange/float/withdraw", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

// Settle accumulated profit
export async function settleExchangeProfit(
  dto: SettleProfitDto,
): Promise<ApiResponse<ExchangeFloatDto>> {
  return apiRequest("/api/exchange/float/settle-profit", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

// Get float movement history
export async function getFloatMovements(
  from?: string,
  to?: string,
): Promise<ApiResponse<FloatMovementDto[]>> {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  const queryString = params.toString();
  return apiRequest(
    `/api/exchange/float/movements${queryString ? `?${queryString}` : ""}`,
  );
}

// Create exchange transaction
export async function createExchange(
  dto: CreateExchangeDto,
): Promise<ApiResponse<ExchangeResponseDto>> {
  return apiRequest("/api/exchange/transaction", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

// Get exchange transactions
export async function getExchangeTransactions(
  page: number = 1,
  pageSize: number = 15,
  search?: string,
  type?: ExchangeType,
  from?: string,
  to?: string,
): Promise<ApiResponse<PagedResult<ExchangeResponseDto>>> {
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("pageSize", pageSize.toString());
  if (search) params.append("search", search);
  if (type !== undefined) params.append("type", type.toString());
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  return apiRequest(`/api/exchange/transactions?${params.toString()}`);
}

// Get single exchange transaction
export async function getExchangeById(
  id: string,
): Promise<ApiResponse<ExchangeResponseDto>> {
  return apiRequest(`/api/exchange/transaction/${id}`);
}

// Void exchange transaction
export async function voidExchange(
  id: string,
  reason: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/exchange/transaction/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// Get today's summary
export async function getExchangeTodaySummary(): Promise<
  ApiResponse<DailySummaryDto>
> {
  return apiRequest("/api/exchange/daily/today");
}

// Record opening float
export async function recordOpeningFloat(
  dto: OpeningFloatDto,
): Promise<ApiResponse<DailySummaryDto>> {
  return apiRequest("/api/exchange/daily/opening", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

// Record closing float
export async function recordClosingFloat(
  dto: ClosingFloatDto,
): Promise<ApiResponse<DailySummaryDto>> {
  return apiRequest("/api/exchange/daily/closing", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

// Get daily summaries
export async function getExchangeDailySummaries(
  from: string,
  to: string,
): Promise<ApiResponse<DailySummaryDto[]>> {
  return apiRequest(`/api/exchange/daily/summaries?from=${from}&to=${to}`);
}

// Get profit report
export async function getExchangeProfitReport(
  from: string,
  to: string,
): Promise<ApiResponse<ProfitReportDto>> {
  return apiRequest(`/api/exchange/reports/profit?from=${from}&to=${to}`);
}

// Get large transactions report
export async function getLargeTransactions(
  from: string,
  to: string,
  threshold: number = 500000,
): Promise<ApiResponse<LargeTransactionReportDto[]>> {
  return apiRequest(
    `/api/exchange/reports/large-transactions?from=${from}&to=${to}&threshold=${threshold}`,
  );
}

// Get client exchange history
export async function getClientExchangeHistory(
  clientId: string,
): Promise<ApiResponse<ClientExchangeHistoryDto>> {
  return apiRequest(`/api/exchange/reports/client/${clientId}`);
}

// Get USD position
export async function getUsdPosition(): Promise<ApiResponse<UsdPositionDto>> {
  return apiRequest("/api/exchange/position/usd");
}

// Get float alerts
export async function getExchangeAlerts(): Promise<
  ApiResponse<FloatAlertDto[]>
> {
  return apiRequest("/api/exchange/alerts");
}

// Update alert thresholds
export async function updateExchangeAlertThresholds(
  dto: UpdateAlertThresholdsDto,
): Promise<ApiResponse<boolean>> {
  return apiRequest("/api/exchange/alerts/thresholds", {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

// Calculate exchange (without creating transaction)
export async function calculateExchange(
  dto: CalculateExchangeDto,
): Promise<ApiResponse<CalculationResultDto>> {
  return apiRequest("/api/exchange/calculate", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

// ==============================================
// Expense API Functions
// ==============================================

export async function getExpenseCategories(): Promise<
  ApiResponse<ExpenseCategoryDto[]>
> {
  return apiRequest("/api/expense/category");
}

export async function createExpenseCategory(dto: {
  name: string;
  description?: string;
}): Promise<ApiResponse<ExpenseCategoryDto>> {
  return apiRequest("/api/expense/category", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function updateExpenseCategory(
  id: string,
  dto: { name: string; description?: string },
): Promise<ApiResponse<ExpenseCategoryDto>> {
  return apiRequest(`/api/expense/category/${id}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

export async function deleteExpenseCategory(
  id: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/expense/category/${id}`, { method: "DELETE" });
}

export async function getExpenses(
  page: number = 1,
  pageSize: number = 10,
  filters?: { startDate?: string; endDate?: string; currency?: number },
): Promise<ApiResponse<PagedResult<ExpenseDto>>> {
  let url = `/api/expense?page=${page}&pageSize=${pageSize}`;
  if (filters) {
    if (filters.startDate) url += `&startDate=${filters.startDate}`;
    if (filters.endDate) url += `&endDate=${filters.endDate}`;
    if (filters.currency !== undefined) url += `&currency=${filters.currency}`;
  }
  return apiRequest(url);
}

export async function createExpense(
  dto: CreateExpenseDto,
): Promise<ApiResponse<ExpenseDto>> {
  return apiRequest("/api/expense", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function getExpenseStats(): Promise<ApiResponse<any>> {
  return apiRequest("/api/expense/stats");
}
export async function updateExpense(
  id: string,
  data: UpdateExpenseDto,
): Promise<ApiResponse<ExpenseDto>> {
  return apiRequest<ExpenseDto>(`/api/expense/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteExpense(id: string): Promise<ApiResponse<boolean>> {
  return apiRequest<boolean>(`/api/expense/${id}`, {
    method: "DELETE",
  });
}
// ==============================================
// Invoice API Functions
// ==============================================

export async function getInvoices(
  page: number = 1,
  pageSize: number = 100,
): Promise<ApiResponse<PagedResult<InvoiceResponseDto>>> {
  return apiRequest(`/api/invoice?page=${page}&pageSize=${pageSize}`);
}

export async function createInvoice(
  dto: CreateInvoiceDto,
): Promise<ApiResponse<InvoiceResponseDto>> {
  return apiRequest("/api/invoice", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function getInvoiceById(
  id: string,
): Promise<ApiResponse<InvoiceResponseDto>> {
  return apiRequest(`/api/invoice/${id}`);
}

export async function updateInvoiceStatus(
  id: string,
  status: InvoiceStatus,
): Promise<ApiResponse<InvoiceResponseDto>> {
  return apiRequest(`/api/invoice/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export async function deleteInvoice(id: string): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/invoice/${id}`, {
    method: "DELETE",
  });
}

export async function downloadInvoicePdf(id: string): Promise<Blob> {
  const auth = getStoredAuth();
  const headers: Record<string, string> = {};
  if (auth?.token) headers["Authorization"] = `Bearer ${auth.token}`;

  const response = await fetch(`${API_BASE_URL}/api/invoice/${id}/pdf`, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`Failed to download invoice PDF (${response.status})`);
  }
  return response.blob();
}

// ==============================================
// Reconciliation API Functions - FULL IMPLEMENTATION
// ==============================================

// Get all accounts with reconciliation stats
export async function getReconciliationAccounts(): Promise<
  ApiResponse<AccountReconciliationSummaryDto[]>
> {
  return apiRequest("/api/reconciliation/accounts");
}

// Get transactions for a specific account
export async function getAccountTransactionsForReconciliation(
  accountType: AccountType,
  accountId: string,
  filter?: ReconciliationFilterDto,
  page: number = 1,
  pageSize: number = 50,
): Promise<ApiResponse<PagedResult<TransactionReconciliationDto>>> {
  const params = new URLSearchParams();
  if (filter?.status !== undefined)
    params.append("status", filter.status.toString());
  if (filter?.startDate) params.append("startDate", filter.startDate);
  if (filter?.endDate) params.append("endDate", filter.endDate);
  params.append("page", page.toString());
  params.append("pageSize", pageSize.toString());

  return apiRequest(
    `/api/reconciliation/account/${accountType}/${accountId}/transactions?${params.toString()}`,
  );
}

// Get account balance summary for reconciliation
export async function getAccountReconciliationSummary(
  accountType: AccountType,
  accountId: string,
): Promise<ApiResponse<AccountReconciliationBalanceDto>> {
  return apiRequest(
    `/api/reconciliation/account/${accountType}/${accountId}/summary`,
  );
}

// Reconcile a single transaction
export async function reconcileTransaction(
  transactionId: string,
  dto: ReconcileTransactionDto,
): Promise<ApiResponse<TransactionReconciliationDto>> {
  return apiRequest(`/api/reconciliation/transaction/${transactionId}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

// Bulk reconcile multiple transactions
export async function bulkReconcileTransactions(
  dto: BulkReconcileDto,
): Promise<ApiResponse<number>> {
  return apiRequest("/api/reconciliation/bulk", {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

// Create/complete a reconciliation record
export async function createReconciliationRecord(
  dto: CreateReconciliationDto,
): Promise<ApiResponse<ReconciliationResponseDto>> {
  return apiRequest("/api/reconciliation", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

// Get reconciliation history
export async function getReconciliationHistory(
  accountType?: AccountType,
  page: number = 1,
  pageSize: number = 20,
): Promise<ApiResponse<PagedResult<ReconciliationResponseDto>>> {
  const params = new URLSearchParams();
  if (accountType !== undefined)
    params.append("accountType", accountType.toString());
  params.append("page", page.toString());
  params.append("pageSize", pageSize.toString());

  return apiRequest(`/api/reconciliation?${params.toString()}`);
}

// Complete a reconciliation (mark as finalized)
export async function completeReconciliation(
  reconciliationId: string,
): Promise<ApiResponse<ReconciliationResponseDto>> {
  return apiRequest(`/api/reconciliation/${reconciliationId}/complete`, {
    method: "POST",
  });
}

// Legacy function - kept for backwards compatibility
export async function getReconciliations(
  page: number = 1,
  pageSize: number = 10,
): Promise<ApiResponse<PagedResult<ReconciliationDto>>> {
  return apiRequest(`/api/reconciliation?page=${page}&pageSize=${pageSize}`);
}

// Legacy function - kept for backwards compatibility
export async function createReconciliation(
  dto: any,
): Promise<ApiResponse<ReconciliationDto>> {
  return apiRequest("/api/reconciliation", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
// ==============================================
// CLIENT PORTAL API FUNCTIONS
// ==============================================

const PORTAL_BASE = "/api/portal";

// Dashboard
export async function getClientDashboard(): Promise<
  ApiResponse<ClientDashboardDto>
> {
  return apiRequest(`${PORTAL_BASE}/dashboard`);
}

// Profile
export async function getClientProfile(): Promise<
  ApiResponse<ClientProfileDto>
> {
  return apiRequest(`${PORTAL_BASE}/profile`);
}

export async function updateClientProfile(
  dto: UpdateClientProfileDto,
): Promise<ApiResponse<ClientProfileDto>> {
  return apiRequest(`${PORTAL_BASE}/profile`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

// Transactions
export async function getClientTransactions(
  page: number = 1,
  pageSize: number = 20,
  filters?: Partial<PortalTransactionFilters>,
): Promise<ApiResponse<PagedResult<ClientTransactionDto>>> {
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("pageSize", pageSize.toString());
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.currency !== undefined)
    params.append("currency", filters.currency.toString());
  if (filters?.type !== undefined)
    params.append("type", filters.type.toString());
  if (filters?.search) params.append("search", filters.search);
  return apiRequest(`${PORTAL_BASE}/transactions?${params}`);
}

export async function getClientTransactionById(
  transactionId: string,
): Promise<ApiResponse<ClientTransactionDto>> {
  return apiRequest(`${PORTAL_BASE}/transactions/${transactionId}`);
}

export async function downloadTransactionReceipt(
  transactionId: string,
): Promise<Blob> {
  const auth = getStoredAuth();
  const headers: Record<string, string> = {};
  if (auth?.token) headers["Authorization"] = `Bearer ${auth.token}`;

  const response = await fetch(
    `${API_BASE_URL}${PORTAL_BASE}/transactions/${transactionId}/receipt`,
    { headers },
  );
  if (!response.ok) {
    throw new Error(`Failed to download receipt (${response.status})`);
  }
  return response.blob();
}

export async function exportTransactionsCsv(
  startDate?: string,
  endDate?: string,
  currency?: Currency,
): Promise<Blob> {
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  if (currency !== undefined) params.append("currency", currency.toString());

  const auth = getStoredAuth();
  const headers: Record<string, string> = {};
  if (auth?.token) headers["Authorization"] = `Bearer ${auth.token}`;
  // Auth headers extracted from JWT by backend

  const response = await fetch(
    `${API_BASE_URL}${PORTAL_BASE}/transactions/export?${params}`,
    { headers },
  );
  if (!response.ok) {
    throw new Error(`Failed to export transactions (${response.status})`);
  }
  return response.blob();
}

// Statement
export async function getClientPortalStatement(
  startDate: string,
  endDate: string,
  currency?: Currency,
): Promise<ApiResponse<ClientStatementDto>> {
  const params = new URLSearchParams();
  params.append("startDate", startDate);
  params.append("endDate", endDate);
  if (currency !== undefined) params.append("currency", currency.toString());
  return apiRequest(`${PORTAL_BASE}/statement?${params}`);
}

/** Plain-text statement from the API (despite the old name, not a PDF).
 *  The web and mobile apps build real PDFs client-side (StatementModal). */
export async function downloadStatementPdf(
  startDate: string,
  endDate: string,
  currency?: Currency,
): Promise<Blob> {
  const params = new URLSearchParams();
  params.append("startDate", startDate);
  params.append("endDate", endDate);
  if (currency !== undefined) params.append("currency", currency.toString());

  const auth = getStoredAuth();
  const headers: Record<string, string> = {};
  if (auth?.token) headers["Authorization"] = `Bearer ${auth.token}`;
  // Auth headers extracted from JWT by backend

  const response = await fetch(
    `${API_BASE_URL}${PORTAL_BASE}/statement/text?${params}`,
    { headers },
  );
  if (!response.ok) {
    throw new Error(`Failed to download statement PDF (${response.status})`);
  }
  return response.blob();
}

// Alerts
export async function getClientAlerts(
  page: number = 1,
  pageSize: number = 20,
  unreadOnly: boolean = false,
): Promise<ApiResponse<PagedResult<ClientAlertDto>>> {
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("pageSize", pageSize.toString());
  params.append("unreadOnly", unreadOnly.toString());
  return apiRequest(`${PORTAL_BASE}/alerts?${params}`);
}

export async function getUnreadAlertsCount(): Promise<ApiResponse<number>> {
  return apiRequest(`${PORTAL_BASE}/alerts/unread-count`);
}

export async function markAlertAsRead(
  alertId: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`${PORTAL_BASE}/alerts/${alertId}/read`, {
    method: "POST",
  });
}

export async function markAllAlertsAsRead(): Promise<ApiResponse<boolean>> {
  return apiRequest(`${PORTAL_BASE}/alerts/read-all`, { method: "POST" });
}

// Analytics
export async function getClientAnalytics(
  months: number = 6,
): Promise<ApiResponse<ClientAnalyticsDto>> {
  return apiRequest(`${PORTAL_BASE}/analytics?months=${months}`);
}
// Reset client password (Office user action)
// =====================================================
// ADD THIS TO YOUR api.ts FILE
// =====================================================

// DTO for reset password request
export interface ResetClientPasswordDto {
  newPassword: string;
}

// Reset client password (Office user action)
// Endpoint: POST /api/client/{id}/reset-password
export async function resetClientPassword(
  clientId: string,
  newPassword: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest<boolean>(`/api/client/${clientId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
}
// Security
export async function changeClientPassword(
  dto: ChangePasswordDto,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`${PORTAL_BASE}/change-password`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

// ==============================================
// Report API Functions
// ==============================================

export async function getDailyReport(date: string): Promise<ApiResponse<any>> {
  return apiRequest(`/api/report/daily?date=${date}`);
}

export async function getMonthlyReport(
  year: number,
  month: number,
): Promise<ApiResponse<any>> {
  // Backend has no monthly endpoint. Use transaction report with month date range.
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
  return apiRequest(
    `/api/report/transactions?startDate=${startDate}&endDate=${endDate}`,
  );
}

export async function getClientStatementReport(
  clientId: string,
  startDate: string,
  endDate: string,
): Promise<ApiResponse<any>> {
  // Backend has no /api/report/client-statement. Use the client statement endpoint.
  return apiRequest(
    `/api/client/${clientId}/statement?startDate=${startDate}&endDate=${endDate}`,
  );
}

// ==============================================
// Company API Functions (Super Admin)
// ==============================================

export async function getCompanies(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
}): Promise<ApiResponse<PagedResult<CompanyDto>>> {
  const { page = 1, pageSize = 10, search, status } = params || {};
  let url = `/api/admin/companies?page=${page}&pageSize=${pageSize}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (status && status !== "all") url += `&status=${encodeURIComponent(status)}`;
  return apiRequest(url);
}

export async function getCompanyById(
  id: string,
): Promise<ApiResponse<CompanyDto>> {
  return apiRequest(`/api/company/${id}`);
}

export async function createCompany(
  dto: any,
): Promise<ApiResponse<CompanyDto>> {
  return apiRequest("/api/company", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function updateCompany(
  id: string,
  dto: any,
): Promise<ApiResponse<CompanyDto>> {
  return apiRequest(`/api/company/${id}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}

export async function activateCompany(
  id: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/company/${id}/activate`, { method: "POST" });
}

export async function deactivateCompany(
  id: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/company/${id}/deactivate`, { method: "POST" });
}

export async function getCompanySummary(
  id: string,
): Promise<ApiResponse<CompanySummaryDto>> {
  return apiRequest(`/api/company/${id}/summary`);
}

export async function getAllCompanySummaries(): Promise<
  ApiResponse<CompanySummaryDto[]>
> {
  return apiRequest("/api/company/summaries");
}

// ==============================================
// Audit Log API Functions (Super Admin)
// ==============================================

export async function getAuditLogs(params?: {
  page?: number;
  pageSize?: number;
  companyId?: string;
  action?: string;
}): Promise<ApiResponse<PagedResult<AuditLogDto>>> {
  const { page = 1, pageSize = 50, companyId, action } = params || {};
  let url = `/api/admin/audit-logs?page=${page}&pageSize=${pageSize}`;
  if (companyId) url += `&companyId=${companyId}`;
  if (action && action !== "all") url += `&action=${encodeURIComponent(action)}`;
  return apiRequest(url);
}

export async function getLoginHistory(params?: {
  page?: number;
  pageSize?: number;
  companyId?: string;
  userId?: string;
}): Promise<ApiResponse<PagedResult<LoginHistoryDto>>> {
  const { page = 1, pageSize = 50, companyId, userId } = params || {};
  let url = `/api/admin/login-history?page=${page}&pageSize=${pageSize}`;
  if (companyId) url += `&companyId=${companyId}`;
  if (userId) url += `&userId=${userId}`;
  return apiRequest(url);
}

// ==============================================
// SuperAdmin Console API
// (These back every tab of the SuperAdmin dashboard; the component
// was calling them but they were never implemented here.)
// ==============================================

export async function getDashboard(): Promise<ApiResponse<any>> {
  return apiRequest("/api/admin/dashboard/extended");
}

export async function getSystemHealth(): Promise<ApiResponse<any>> {
  return apiRequest("/api/admin/system/health");
}

export async function getSecurityOverview(): Promise<ApiResponse<any>> {
  return apiRequest("/api/admin/security/overview");
}

export async function getSecurityAlerts(params?: {
  page?: number;
  pageSize?: number;
  resolved?: boolean;
}): Promise<ApiResponse<any>> {
  const { page = 1, pageSize = 10, resolved } = params || {};
  let url = `/api/admin/security/alerts?page=${page}&pageSize=${pageSize}`;
  if (resolved !== undefined) url += `&resolved=${resolved}`;
  return apiRequest(url);
}

export async function resolveAlert(
  id: string,
  notes?: string,
): Promise<ApiResponse<any>> {
  return apiRequest(`/api/admin/security/alerts/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ notes: notes || null }),
  });
}

export async function blockIP(data: {
  ipAddress: string;
  reason: string;
  [key: string]: any;
}): Promise<ApiResponse<any>> {
  return apiRequest("/api/admin/security/block-ip", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getIPWhitelist(): Promise<ApiResponse<any>> {
  return apiRequest("/api/admin/security/ip-whitelist");
}

export async function addIPToWhitelist(data: {
  [key: string]: any;
}): Promise<ApiResponse<any>> {
  return apiRequest("/api/admin/security/ip-whitelist", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function removeIPFromWhitelist(
  id: string,
): Promise<ApiResponse<any>> {
  return apiRequest(`/api/admin/security/ip-whitelist/${id}`, {
    method: "DELETE",
  });
}

export async function getFinancialOverview(): Promise<ApiResponse<any>> {
  return apiRequest("/api/admin/financials/overview");
}

export async function getPayments(params?: {
  page?: number;
  pageSize?: number;
  companyId?: string;
}): Promise<ApiResponse<any>> {
  const { page = 1, pageSize = 10, companyId } = params || {};
  let url = `/api/admin/financials/payments?page=${page}&pageSize=${pageSize}`;
  if (companyId) url += `&companyId=${companyId}`;
  return apiRequest(url);
}

export async function recordPayment(data: {
  [key: string]: any;
}): Promise<ApiResponse<any>> {
  return apiRequest("/api/admin/financials/payments", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getAnalytics(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<ApiResponse<any>> {
  let url = "/api/admin/analytics/overview";
  const q: string[] = [];
  if (params?.startDate) q.push(`startDate=${params.startDate}`);
  if (params?.endDate) q.push(`endDate=${params.endDate}`);
  if (q.length) url += `?${q.join("&")}`;
  return apiRequest(url);
}

export async function getSystemLogs(params?: {
  page?: number;
  pageSize?: number;
  level?: string;
}): Promise<ApiResponse<any>> {
  const { page = 1, pageSize = 20, level } = params || {};
  let url = `/api/admin/system-logs?page=${page}&pageSize=${pageSize}`;
  if (level && level !== "all") url += `&level=${encodeURIComponent(level)}`;
  return apiRequest(url);
}

export async function getCompanyDetails(id: string): Promise<ApiResponse<any>> {
  return apiRequest(`/api/admin/companies/${id}/details`);
}

export async function suspendCompany(
  id: string,
  reason: string,
): Promise<ApiResponse<any>> {
  return apiRequest(`/api/admin/companies/${id}/suspend`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function resetPassword(
  id: string,
  newPassword: string,
): Promise<ApiResponse<any>> {
  return apiRequest(`/api/admin/companies/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
}

export async function updateSubscription(
  id: string,
  data: { [key: string]: any },
): Promise<ApiResponse<any>> {
  return apiRequest(`/api/admin/companies/${id}/subscription`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function exportAuditLogs(): Promise<Blob | null> {
  try {
    const authStr = localStorage.getItem("sariff_auth");
    const token = authStr ? JSON.parse(authStr)?.token : null;
    const res = await fetch(`${API_BASE_URL}/api/admin/audit-logs/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

// ==============================================
// Helper Functions
// ==============================================

export function formatCurrency(
  amount: number,
  currency: Currency | string,
): string {
  const currencyCode =
    typeof currency === "number"
      ? CURRENCY_META[currency]?.code || "KES"
      : currency;
  // UGX has no minor unit in practice — show whole shillings.
  const decimals = currencyCode === "UGX" ? 0 : 2;
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-KE").format(num);
}

export function getCurrencyLabel(currency: Currency): string {
  return CURRENCY_META[currency as number]?.code || "KES";
}

export function getTransactionTypeLabel(type: TransactionType): string {
  return type === TransactionType.Debit
    ? "Debit (Money In)"
    : "Credit (Money Out)";
}

export function getAccountTypeLabel(type: AccountType): string {
  const labels: Record<AccountType, string> = {
    [AccountType.Cash]: "Cash",
    [AccountType.Bank]: "Bank",
    [AccountType.Mpesa]: "Mobile money",
    [AccountType.Client]: "Client",
    [AccountType.Expense]: "Expense",
  };
  return labels[type] || "Unknown";
}

export function getPaymentMethodLabel(method: PaymentMethod): string {
  const labels: Record<PaymentMethod, string> = {
    [PaymentMethod.Cash]: "Cash",
    [PaymentMethod.Bank]: "Bank Transfer",
    [PaymentMethod.Mpesa]: "Mobile money",
    [PaymentMethod.AccountTransfer]: "Account Transfer",
  };
  return labels[method] || "Unknown";
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    [UserRole.SuperAdmin]: "Super Admin",
    [UserRole.OfficeUser]: "Office User",
    [UserRole.Client]: "Client",
  };
  return labels[role] || "Unknown";
}

export function getClientTypeLabel(type: ClientType): string {
  return type === ClientType.Permanent ? "Permanent" : "Temporary";
}

export function getReconciliationStatusLabel(
  status: ReconciliationStatus,
): string {
  const labels: Record<ReconciliationStatus, string> = {
    [ReconciliationStatus.Pending]: "Pending",
    [ReconciliationStatus.Matched]: "Matched",
    [ReconciliationStatus.Unmatched]: "Unmatched",
  };
  return labels[status] || "Unknown";
}

export function getExchangeTypeLabel(type: ExchangeType): string {
  return type === ExchangeType.Cash ? "Cash" : "From Account";
}

/** "UGX → KES" / "KES → EUR" — pass the exchange's foreign currency (USD when omitted). */
export function getExchangeDirectionLabel(
  direction: ExchangeDirection,
  foreignCurrency: number = Currency.USD,
): string {
  const fx = currencyCode(foreignCurrency);
  return direction === ExchangeDirection.UsdToKes ? `${fx} → KES` : `KES → ${fx}`;
}

// ==================== BALANCE ALERTS ====================
export async function getBalanceAlerts(clientId?: string) {
  return apiRequest<any>(
    `/api/balance-alerts${clientId ? `?clientId=${clientId}` : ""}`,
  );
}

export async function createBalanceAlert(dto: {
  clientId?: string;
  currency: number;
  direction: number;
  threshold: number;
  notifyAllOfficeUsers?: boolean;
}) {
  return apiRequest<any>("/api/balance-alerts", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function toggleBalanceAlert(id: string) {
  return apiRequest<any>(`/api/balance-alerts/${id}/toggle`, { method: "PUT" });
}

export async function deleteBalanceAlert(id: string) {
  return apiRequest<any>(`/api/balance-alerts/${id}`, { method: "DELETE" });
}

// ==================== TRANSACTION PIN (for PinModal) ====================
export async function getTransactionPinStatus() {
  return apiRequest<{ isEnabled: boolean; hasPin: boolean }>(
    "/api/transaction-pin/status",
  );
}

export async function verifyTransactionPin(pin: string) {
  return apiRequest<boolean>("/api/transaction-pin/verify", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}


// ==============================================
// Phone login: one login, several bureaus
// (switched on by the server flag Features__ClientIdentity)
// ==============================================

export interface IdentityBureauDto {
  companyId: string;
  companyName: string;
  logoUrl?: string | null;
  clientCode: string;
  clientName: string;
  baseCurrency: number;
}

export interface IdentityTokenDto {
  accessToken: string; // limited: only lists, links and picks bureaus (15 minutes)
  expiresAt: string;
  phone: string;
  deviceTrusted: boolean;
  bureaus: IdentityBureauDto[];
}

/** Calls made with the short phone-login token (before a bureau is picked). */
async function identityFetch<T>(path: string, method: string, token?: string, body?: unknown): Promise<ApiResponse<T>> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (method !== "GET") headers["Idempotency-Key"] = newIdempotencyKey();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 404) return { success: false, message: "Phone login is not available yet.", data: null };
    if (response.status === 401) return { success: false, message: "Your phone sign-in expired. Start again.", data: null };
    return await response.json();
  } catch (error: any) {
    return { success: false, message: error?.message || "Network error — cannot reach server", data: null };
  }
}

/** Is phone login switched on? False on any error, so the classic login always works. */
export async function identityEnabled(): Promise<boolean> {
  const r = await identityFetch<{ enabled: boolean }>("/api/identity/enabled", "GET");
  return !!(r.success && r.data?.enabled);
}

export const identityRequestCode = (phone: string) =>
  identityFetch<boolean>("/api/identity/request-code", "POST", undefined, { phone });

export const identityVerifyCode = (phone: string, code: string, deviceId?: string, deviceName?: string) =>
  identityFetch<IdentityTokenDto>("/api/identity/verify-code", "POST", undefined, { phone, code, deviceId, deviceName });

export const identityLink = (token: string, clientCode: string, password: string) =>
  identityFetch<IdentityBureauDto>("/api/identity/link", "POST", token, { clientCode, password });

export const identityPick = (token: string, companyId: string) =>
  identityFetch<TokenResponseDto>("/api/identity/select", "POST", token, { companyId });

/** The phone login behind the signed-in bureau token, or null for a code+password sign-in. */
export function phoneLoginId(): string | null {
  const token = getStoredAuth()?.token;
  if (!token) return null;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const id = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "="))).identity_id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

/** Did this bureau session come from a phone login? (Then "Switch bureau" is offered.) */
export const hasPhoneLogin = (): boolean => phoneLoginId() !== null;

// From inside the portal: the normal bureau token carries the phone login, so these
// go through apiRequest (refresh included).
export const getLinkedBureaus = () => apiRequest<IdentityBureauDto[]>("/api/identity/bureaus");

export const linkBureau = (clientCode: string, password: string) =>
  apiRequest<IdentityBureauDto>("/api/identity/link", { method: "POST", body: JSON.stringify({ clientCode, password }) });

export const switchBureau = (companyId: string) =>
  apiRequest<TokenResponseDto>("/api/identity/select", { method: "POST", body: JSON.stringify({ companyId }) });

export const unlinkBureau = (companyId: string) =>
  apiRequest<boolean>(`/api/identity/bureaus/${companyId}`, { method: "DELETE" });

export const signOutEverywhere = () =>
  apiRequest<boolean>("/api/identity/sign-out-everywhere", { method: "POST" });

/** Office: cut a client's phone-login link (lost phone). Money and history stay. */
export const unlinkClientPhoneLogin = (clientId: string) =>
  apiRequest<boolean>(`/api/client/${clientId}/unlink-phone-login`, { method: "POST" });
