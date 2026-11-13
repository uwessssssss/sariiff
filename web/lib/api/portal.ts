import { API_BASE_URL, type ApiResponse, type PagedResult, apiRequest, authorizedFetch } from "./core";
import { AccountType, ClientType, Currency, ReconciliationStatus, TransactionType } from "./enums";
import type { CurrencyBalanceDto } from "./clients";

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
  /** The bureau that holds this account (statements are issued in its name). */
  companyName?: string;
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
// CLIENT PORTAL API FUNCTIONS
// ==============================================

export const PORTAL_BASE = "/api/portal";
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
  const response = await authorizedFetch(`${API_BASE_URL}${PORTAL_BASE}/transactions/${transactionId}/receipt`);
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

  const response = await authorizedFetch(`${API_BASE_URL}${PORTAL_BASE}/transactions/export?${params}`);
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

  const response = await authorizedFetch(`${API_BASE_URL}${PORTAL_BASE}/statement/text?${params}`);
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
// Security
export async function changeClientPassword(
  dto: ChangePasswordDto,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`${PORTAL_BASE}/change-password`, {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
