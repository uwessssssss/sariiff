import { AccountType, Currency, type CurrencyCountDto, type CurrencyDaySummaryDto, ExchangeDirection, ExchangeType } from "./enums";
import { type ApiResponse, type PagedResult, apiRequest } from "./core";

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
