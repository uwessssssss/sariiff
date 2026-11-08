import * as SecureStore from "expo-secure-store";
import {
  ApiResponse,
  PagedResult,
  UnifiedLoginDto,
  OtpVerifyDto,
  LoginResponseDto,
  TokenResponseDto,
  DashboardStatsDto,
  ClientDto,
  CreateClientDto,
  TransactionDto,
  CreateTransactionDto,
  BankAccountDto,
  MpesaAgentDto,
  CashAccountDto,
  ExchangeRateDto,
  ExchangeFloatDto,
  CreateExchangeDto,
  ExchangeTransactionDto,
  ClientDashboardDto,
  ClientTransactionDto,
  ClientAlertDto,
  ExpenseDto,
} from "../types";
import { Platform } from "react-native";

import Constants from 'expo-constants';

// Production / any build that sets a real extra.apiBaseUrl uses it on BOTH platforms.
// A placeholder or non-http value is ignored so local dev falls back to the dev URLs below.
const RAW_CONFIG_URL = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;
const CONFIG_URL =
  RAW_CONFIG_URL && RAW_CONFIG_URL.startsWith("http") && !RAW_CONFIG_URL.includes("YOUR-BACKEND")
    ? RAW_CONFIG_URL
    : undefined;

// Local dev fallbacks:
//   physical Android device  -> your machine's LAN IP
//   Android emulator         -> set extra.apiBaseUrl to "http://10.0.2.2:8080"
//   iOS simulator            -> localhost
const API_BASE =
  CONFIG_URL ??
  (Platform.OS === "android" ? "http://192.168.0.122:8080" : "http://localhost:8080");

// Guard: in a release build the local fallback can never reach a real device,
// so every request would fail with a confusing "network request failed".
// Surface the misconfiguration loudly instead of failing silently.
if (!CONFIG_URL && !__DEV__) {
  console.warn(
    "[SARIFF] No apiBaseUrl configured — using a LOCAL dev URL that will not work on a real device. Set extra.apiBaseUrl in app config.",
  );
}

// ==================== SESSION EXPIRED CALLBACK ====================
let _onSessionExpired: (() => void) | null = null;
export function setSessionExpiredCallback(cb: () => void) { _onSessionExpired = cb; }

// ==================== AUTH STORAGE ====================
const TOKEN_KEY = "sariff_token";
const REFRESH_KEY = "sariff_refresh";
const USER_KEY = "sariff_user";

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function getStoredUser() {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function storeAuth(
  token: string,
  refreshToken: string,
  user: any
) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function clearAuth() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

// ==================== HTTP CLIENT ====================
// ---- Idempotency (see the web app's lib/api.ts) ---------------------------
export const newIdempotencyKey = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/** Stable for an identical re-press, new as soon as the payload changes. */
export function submissionKey(sessionKey: string, payload: unknown): string {
  const text = JSON.stringify(payload) ?? "";
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${sessionKey}-${(h >>> 0).toString(36)}`;
}

let pinnedKey: string | null = null;
/** Run `fn` with one fixed Idempotency-Key for its write (one per form submission). */
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
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const method = (options.method || "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD";
  const key = isRead ? null : pinnedKey ?? newIdempotencyKey(); // read before any await
  const token = await getToken();

  const controller = new AbortController();
  // Writes get longer: a Render cold start can take ~30 s, and timing out early
  // made people press Save again while the first save was still running.
  const timeoutId = setTimeout(() => controller.abort(), isRead ? 15000 : 30000);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (key) headers["Idempotency-Key"] = key;

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Token expired — try refresh
    if (response.status === 401 && token) {
      // Another request may already have refreshed: replay with the new token.
      const latest = await getToken();
      const refreshed = latest && latest !== token ? latest : await refreshAuthOnce();
      if (refreshed) {
        headers["Authorization"] = `Bearer ${refreshed}`;
        const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers,
          signal: controller.signal,
        });
        return retryResponse.json();
      }
      // Refresh failed — clear stale auth, force re-login
      await clearAuth();
      if (_onSessionExpired) _onSessionExpired();
      return {
        success: false,
        message: "Session expired. Please login again.",
        data: null as any,
      };
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      return {
        success: false,
        message: isRead
          ? "Request timed out. Check your connection."
          : "No reply from the server yet — it may still have saved this. Check the list before trying again.",
        data: null as any,
      };
    }

    return {
      success: false,
      message: error.message || "Network error",
      data: null as any,
    };
  }
}

// Single-flight: the API rotates the refresh token on use, so parallel 401s
// must share ONE refresh instead of each spending the same token.
let refreshInFlight: Promise<string | null> | null = null;
function refreshAuthOnce(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshTokenRequest().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function refreshTokenRequest(): Promise<string | null> {
  try {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.success && data.data?.accessToken) {
      await SecureStore.setItemAsync(TOKEN_KEY, data.data.accessToken);
      // Backend issues a new refresh token — must store it or next refresh fails
      if (data.data.refreshToken) {
        await SecureStore.setItemAsync(REFRESH_KEY, data.data.refreshToken);
      }
      return data.data.accessToken;
    }

    return null;
  } catch {
    return null;
  }
}

// ==================== AUTH ====================
export async function login(
  dto: UnifiedLoginDto
): Promise<ApiResponse<LoginResponseDto>> {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

export async function verifyOtp(
  dto: OtpVerifyDto
): Promise<ApiResponse<LoginResponseDto>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${API_BASE}/api/auth/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dto),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      return {
        success: false,
        message: "Request timed out. Check your connection.",
        data: null as any,
      };
    }

    return {
      success: false,
      message: error.message || "Network error",
      data: null as any,
    };
  }
}

export async function logout(): Promise<void> {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } catch {}
  await clearAuth();
}

// ==================== DASHBOARD ====================
export const getDashboardStats = () =>
  apiRequest<DashboardStatsDto>("/api/dashboard");

// Currencies this company actually uses (for display — pickers still show all),
// so a Ugandan (UGX/USD) bureau never sees empty KES blocks, etc.
export const getCompanyCurrencies = () =>
  apiRequest<{
    currencies: { currency: number; code: string; value: number }[];
    /** Home currency: rates are "base per 1 foreign" and profit is in it (wallets hold their network's currency) */
    baseCurrency?: number;
    baseCurrencyCode?: string;
  }>("/api/dashboard/currencies");

export const getRecentTransactions = (count = 50) =>
  apiRequest<TransactionDto[]>(
    `/api/transaction/recent?count=${count}`
  );

// ==================== CLIENTS ====================
export const getClients = (page = 1, pageSize = 20, search = "") =>
  apiRequest<PagedResult<ClientDto>>(
    `/api/client?page=${page}&pageSize=${pageSize}${
      search ? `&search=${search}` : ""
    }`
  );

export const getClientById = (id: string) =>
  apiRequest<ClientDto>(`/api/client/${id}`);

export const createClient = (dto: CreateClientDto) =>
  apiRequest<ClientDto>("/api/client", {
    method: "POST",
    body: JSON.stringify(dto),
  });

export const deleteClient = (id: string) =>
  apiRequest<boolean>(`/api/client/${id}`, { method: "DELETE" });

export const getClientLookup = (search = "") =>
  apiRequest<ClientDto[]>(
    `/api/client/lookup${search ? `?search=${search}` : ""}`
  );

export const getClientStatement = (id: string, from?: string, to?: string, currency?: number) => {
  let url = `/api/client/${id}/statement`;
  const params: string[] = [];

  if (from) params.push(`startDate=${from}`);
  if (to) params.push(`endDate=${to}`);
  if (currency !== undefined) params.push(`currency=${currency}`);
  if (params.length) url += `?${params.join("&")}`;

  return apiRequest<any>(url);
};

// ==================== TRANSACTIONS ====================
export const getTransactions = (page = 1, pageSize = 20, filters?: { startDate?: string; endDate?: string; type?: number; currency?: number; search?: string }) => {
  const params = [`page=${page}`, `pageSize=${pageSize}`];
  if (filters?.startDate) params.push(`startDate=${filters.startDate}`);
  if (filters?.endDate) params.push(`endDate=${filters.endDate}`);
  if (filters?.type !== undefined) params.push(`type=${filters.type}`);
  if (filters?.currency !== undefined) params.push(`currency=${filters.currency}`);
  if (filters?.search) params.push(`search=${encodeURIComponent(filters.search)}`);
  return apiRequest<PagedResult<TransactionDto>>(`/api/transaction?${params.join('&')}`);
};

export const createTransaction = (dto: CreateTransactionDto) =>
  apiRequest<TransactionDto>("/api/transaction", {
    method: "POST",
    body: JSON.stringify(dto),
  });

// ==================== BANK ACCOUNTS ====================
export const getBankAccounts = () => apiRequest<BankAccountDto[]>("/api/bank");

export const getBankStatement = (id: string) =>
  apiRequest<any>(`/api/bank/${id}/statement`);

// ==================== MPESA ====================
export const getMpesaAgents = () => apiRequest<MpesaAgentDto[]>("/api/mpesa");

export const getMpesaStatement = (id: string) =>
  apiRequest<any>(`/api/mpesa/${id}/statement`);

// ==================== CASH ====================
export const getCashAccounts = () => apiRequest<CashAccountDto[]>("/api/cash");

export const getCashStatement = (currency: number) =>
  apiRequest<any>(`/api/cash/statement/${currency}`);

// ==================== EXCHANGE ====================
/** Active rate for a foreign currency (USD by default). */
export const getCurrentExchangeRate = (currency?: number) =>
  apiRequest<ExchangeRateDto>(`/api/exchange/rate${currency !== undefined ? `?currency=${currency}` : ""}`);

/** Rates are per foreign currency (KES per 1 unit); USD when omitted. */
export const setExchangeRate = (buyRate: number, sellRate: number, foreignCurrency?: number) =>
  apiRequest<ExchangeRateDto>("/api/exchange/rate", {
    method: "POST",
    body: JSON.stringify({ buyRate, sellRate, foreignCurrency }),
  });

export const getExchangeFloat = () =>
  apiRequest<ExchangeFloatDto>("/api/exchange/float");

export const createExchange = (dto: CreateExchangeDto) =>
  apiRequest<ExchangeTransactionDto>("/api/exchange/transaction", {
    method: "POST",
    body: JSON.stringify(dto),
  });

export const getExchangeTransactions = (page = 1, pageSize = 20) =>
  apiRequest<PagedResult<ExchangeTransactionDto>>(
    `/api/exchange/transactions?page=${page}&pageSize=${pageSize}`
  );

// ==================== EXPENSES ====================
export const getExpenses = (page = 1, pageSize = 20) =>
  apiRequest<PagedResult<ExpenseDto>>(
    `/api/expense?page=${page}&pageSize=${pageSize}`
  );

// ==================== CLIENT PORTAL ====================
export const getClientDashboard = () =>
  apiRequest<ClientDashboardDto>("/api/portal/dashboard");

export const getClientProfile = () => apiRequest<any>("/api/portal/profile");

export const updateClientProfile = (dto: any) =>
  apiRequest<any>("/api/portal/profile", {
    method: "PUT",
    body: JSON.stringify(dto),
  });

export const getClientTransactions = (
  page = 1,
  pageSize = 20,
  currency?: number,
  type?: number
) => {
  let url = `/api/portal/transactions?page=${page}&pageSize=${pageSize}`;
  if (currency !== undefined) url += `&currency=${currency}`;
  if (type !== undefined) url += `&type=${type}`;
  return apiRequest<PagedResult<ClientTransactionDto>>(url);
};

export const getClientAlerts = (page = 1, pageSize = 20) =>
  apiRequest<PagedResult<ClientAlertDto>>(
    `/api/portal/alerts?page=${page}&pageSize=${pageSize}`
  );

export const getClientAnalytics = () =>
  apiRequest<any>("/api/portal/analytics");

export const changeClientPassword = (
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
) =>
  apiRequest<boolean>("/api/portal/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });

// ==================== REPORTS ====================
export const getDailyReport = (date: string) =>
  apiRequest<any>(`/api/report/daily?date=${date}`);

export const getExchangeSummary = (date: string) =>
  apiRequest<any>(`/api/exchange/daily/summaries?from=${date}&to=${date}`);


// ==================== INVOICES ====================
export const getInvoices = (page = 1, pageSize = 50) =>
  apiRequest<PagedResult<any>>(`/api/invoice?page=${page}&pageSize=${pageSize}`);

// ==================== RECONCILIATION ====================
export const getReconciliations = (page = 1, pageSize = 20) =>
  apiRequest<any>('/api/reconciliation');
export const getReconciliationAccounts = () =>
  apiRequest<any>('/api/reconciliation/accounts');

// ==================== REPORTS ====================
export const getAccountSummary = () => apiRequest<any>('/api/report/account-summary');
export const getProfitLoss = (from: string, to: string) =>
  apiRequest<any>(`/api/exchange/reports/profit?from=${from}&to=${to}`);

// ==================== BANK ACCOUNTS (CRUD) ====================
export const createBankAccount = (dto: any) =>
  apiRequest<BankAccountDto>('/api/bank', { method: 'POST', body: JSON.stringify(dto) });
export const updateBankAccount = (id: string, dto: any) =>
  apiRequest<BankAccountDto>(`/api/bank/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
export const deleteBankAccount = (id: string) =>
  apiRequest<boolean>(`/api/bank/${id}`, { method: 'DELETE' });
export const getBankAccountById = (id: string) =>
  apiRequest<BankAccountDto>(`/api/bank/${id}`);
export const getBankAccountStatement = (id: string, from?: string, to?: string) => {
  let url = `/api/bank/${id}/statement`;
  const p: string[] = [];
  if (from) p.push(`startDate=${from}`);
  if (to) p.push(`endDate=${to}`);
  if (p.length) url += `?${p.join('&')}`;
  return apiRequest<any>(url);
};
export const getBankStats = () => apiRequest<any>('/api/bank/stats');

// ==================== MPESA (CRUD) ====================
export const createMpesaAgent = (dto: any) =>
  apiRequest<MpesaAgentDto>('/api/mpesa', { method: 'POST', body: JSON.stringify(dto) });
export const updateMpesaAgent = (id: string, dto: any) =>
  apiRequest<MpesaAgentDto>(`/api/mpesa/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
export const deleteMpesaAgent = (id: string) =>
  apiRequest<boolean>(`/api/mpesa/${id}`, { method: 'DELETE' });
export const getMpesaAgentById = (id: string) =>
  apiRequest<MpesaAgentDto>(`/api/mpesa/${id}`);
export const getMpesaAgentStatement = (id: string, from?: string, to?: string) => {
  let url = `/api/mpesa/${id}/statement`;
  const p: string[] = [];
  if (from) p.push(`startDate=${from}`);
  if (to) p.push(`endDate=${to}`);
  if (p.length) url += `?${p.join('&')}`;
  return apiRequest<any>(url);
};
export const getMpesaStats = () => apiRequest<any>('/api/mpesa/stats');

// ==================== CASH (CRUD) ====================
export const createCashAccount = (dto: any) =>
  apiRequest<CashAccountDto>('/api/cash', { method: 'POST', body: JSON.stringify(dto) });
export const updateCashAccount = (id: string, dto: any) =>
  apiRequest<CashAccountDto>(`/api/cash/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
export const deleteCashAccount = (id: string) =>
  apiRequest<boolean>(`/api/cash/${id}`, { method: 'DELETE' });
export const getCashAccountById = (id: string) =>
  apiRequest<CashAccountDto>(`/api/cash/${id}`);
export const getCashAccountStatement = (currency: number, from?: string, to?: string) => {
  let url = `/api/cash/statement/${currency}`;
  const p: string[] = [];
  if (from) p.push(`startDate=${from}`);
  if (to) p.push(`endDate=${to}`);
  if (p.length) url += `?${p.join('&')}`;
  return apiRequest<any>(url);
};
export const getCashStats = () => apiRequest<any>('/api/cash/stats');

// ==================== CLIENTS (full CRUD) ====================
export const updateClient = (id: string, dto: any) =>
  apiRequest<any>(`/api/client/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
export const resetClientPassword = (id: string, newPassword: string) =>
  apiRequest<boolean>(`/api/client/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) });
export const reverseClientTransaction = (clientId: string, transactionId: string, reason: string) =>
  apiRequest<boolean>(`/api/client/${clientId}/transaction/${transactionId}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
export const getClientStats = () => apiRequest<any>('/api/client/stats');
export const convertClientToPermanent = (id: string, password: string) =>
  apiRequest<any>(`/api/client/${id}/convert`, { method: 'POST', body: JSON.stringify({ password }) });

// ==================== TRANSACTIONS (full CRUD) ====================
export const getTransactionById = (id: string) =>
  apiRequest<TransactionDto>(`/api/transaction/${id}`);
export const deleteTransaction = (id: string, reason?: string) =>
  apiRequest<boolean>(`/api/transaction/${id}`, { method: 'DELETE', body: JSON.stringify({ reason: reason || 'Reversed' }) });
export const updateTransaction = (id: string, dto: { description?: string; notes?: string }) =>
  apiRequest<TransactionDto>(`/api/transaction/${id}`, { method: 'PUT', body: JSON.stringify(dto) });

// ==================== EXCHANGE (full operations) ====================
export const voidExchange = (id: string, reason: string) =>
  apiRequest<any>(`/api/exchange/transaction/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
export const fundExchangeFloat = (dto: any) =>
  apiRequest<any>('/api/exchange/float/fund', { method: 'POST', body: JSON.stringify(dto) });
export const withdrawExchangeFloat = (dto: any) =>
  apiRequest<any>('/api/exchange/float/withdraw', { method: 'POST', body: JSON.stringify(dto) });
export const settleExchangeProfit = (dto: any) =>
  apiRequest<any>('/api/exchange/float/settle-profit', { method: 'POST', body: JSON.stringify(dto) });
export const getUsdPosition = () => apiRequest<any>('/api/exchange/position/usd');
// endpoint not available: export const getExchangeAlerts = () => apiRequest<any>('/api/exchange/alerts');
export const getExchangeRateHistory = () => apiRequest<any>('/api/exchange/rate/history');
export const getExchangeById = (id: string) => apiRequest<any>(`/api/exchange/transaction/${id}`);
export const calculateExchange = (direction: number, amount: number, foreignCurrency?: number) =>
  apiRequest<any>('/api/exchange/calculate', { method: 'POST', body: JSON.stringify({ direction, amount, foreignCurrency }) });
export const getExchangeDailySummaries = (from?: string, to?: string) => {
  let url = '/api/exchange/daily/summaries';
  const p: string[] = [];
  if (from) p.push(`startDate=${from}`);
  if (to) p.push(`endDate=${to}`);
  if (p.length) url += `?${p.join('&')}`;
  return apiRequest<any>(url);
};
export const getExchangeTodaySummary = () => apiRequest<any>('/api/exchange/daily/today');
export const getExchangeProfitReport = (from: string, to: string) =>
  apiRequest<any>(`/api/exchange/reports/profit?from=${from}&to=${to}`);
export const getFloatMovements = (page = 1, pageSize = 20) =>
  apiRequest<any>(`/api/exchange/float/movements?page=${page}&pageSize=${pageSize}`);
export const recordOpeningFloat = (dto: any) =>
  apiRequest<any>('/api/exchange/daily/opening', { method: 'POST', body: JSON.stringify(dto) });
export const recordClosingFloat = (dto: any) =>
  apiRequest<any>('/api/exchange/daily/closing', { method: 'POST', body: JSON.stringify(dto) });
export const updateExchangeAlertThresholds = (dto: any) =>
  apiRequest<any>('/api/exchange/alerts/thresholds', { method: 'PUT', body: JSON.stringify(dto) });

// ==================== EXPENSES (full CRUD) ====================
export const createExpense = (dto: any) =>
  apiRequest<ExpenseDto>('/api/expense', { method: 'POST', body: JSON.stringify(dto) });
export const updateExpense = (id: string, dto: any) =>
  apiRequest<ExpenseDto>(`/api/expense/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
export const deleteExpense = (id: string) =>
  apiRequest<boolean>(`/api/expense/${id}`, { method: 'DELETE' });
export const getExpenseCategories = () => apiRequest<any[]>('/api/expense/category');
export const createExpenseCategory = (dto: any) =>
  apiRequest<any>('/api/expense/category', { method: 'POST', body: JSON.stringify(dto) });
export const updateExpenseCategory = (id: string, dto: any) =>
  apiRequest<any>(`/api/expense/category/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
export const deleteExpenseCategory = (id: string) =>
  apiRequest<boolean>(`/api/expense/category/${id}`, { method: 'DELETE' });
export const getExpenseStats = () => apiRequest<any>('/api/expense/stats');

// ==================== INVOICES (full CRUD) ====================
export const createInvoice = (dto: any) =>
  apiRequest<any>('/api/invoice', { method: 'POST', body: JSON.stringify(dto) });
export const getInvoiceById = (id: string) => apiRequest<any>(`/api/invoice/${id}`);
export const deleteInvoice = (id: string) =>
  apiRequest<boolean>(`/api/invoice/${id}`, { method: 'DELETE' });
export const updateInvoiceStatus = (id: string, status: number) =>
  apiRequest<any>(`/api/invoice/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });

// ==================== RECONCILIATION (full operations) ====================
export const createReconciliation = (dto: any) =>
  apiRequest<any>('/api/reconciliation', { method: 'POST', body: JSON.stringify(dto) });
export const reconcileTransaction = (transactionId: string, dto: any) =>
  apiRequest<any>(`/api/reconciliation/transaction/${transactionId}`, { method: 'PUT', body: JSON.stringify(dto) });
export const bulkReconcileTransactions = (dto: any) =>
  apiRequest<any>('/api/reconciliation/bulk', { method: 'PUT', body: JSON.stringify(dto) });
export const getAccountReconciliationSummary = (accountType: number, accountId: string) =>
  apiRequest<any>(`/api/reconciliation/account/${accountType}/${accountId}/summary`);
export const getAccountTransactionsForReconciliation = (accountType: number, accountId: string, page = 1, pageSize = 20) =>
  apiRequest<any>(`/api/reconciliation/account/${accountType}/${accountId}/transactions?page=${page}&pageSize=${pageSize}`);
export const getReconciliationHistory = (page = 1, pageSize = 20) =>
  apiRequest<any>('/api/reconciliation');

// ==================== REPORTS (all types) ====================
export const getMonthlyReport = (year: number, month: number) =>
  apiRequest<any>(`/api/report/daily?date=${year}-${String(month).padStart(2,'0')}-01`);
export const getLargeTransactions = (from: string, to: string, threshold = 500000) =>
  apiRequest<any>(`/api/exchange/reports/large-transactions?from=${from}&to=${to}&threshold=${threshold}`);
export const getTodayTransactionsSummary = () => apiRequest<any>('/api/transaction/today');

// ==================== CLIENT PORTAL (full operations) ====================
export const getClientPortalStatement = (from?: string, to?: string, currency?: number) => {
  let url = '/api/portal/statement';
  const p: string[] = [];
  if (from) p.push(`startDate=${from}`);
  if (to) p.push(`endDate=${to}`);
  if (currency !== undefined) p.push(`currency=${currency}`);
  if (p.length) url += `?${p.join('&')}`;
  return apiRequest<any>(url);
};
export const getUnreadAlertsCount = () => apiRequest<number>('/api/portal/alerts/unread-count');
export const markAlertAsRead = (id: string) =>
  apiRequest<boolean>(`/api/portal/alerts/${id}/read`, { method: 'POST' });
export const markAllAlertsAsRead = () =>
  apiRequest<boolean>('/api/portal/alerts/read-all', { method: 'POST' });
export const getClientTransactionById = (id: string) =>
  apiRequest<any>(`/api/portal/transactions/${id}`);

// ==================== SETTINGS ====================
export const getMyCompanyInfo = () => apiRequest<any>('/api/dashboard/company');
export const updateMyCompanySettings = (dto: any) =>
  apiRequest<any>('/api/dashboard/settings', { method: 'PUT', body: JSON.stringify(dto) });

// ==================== FILE DOWNLOADS ====================
export function getApiBaseUrl() { return API_BASE; }
export async function getAuthHeaders() {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Download a file using auth headers — returns { success, base64?, text?, contentType }
export async function downloadFile(endpoint: string): Promise<{ success: boolean; base64?: string; text?: string; contentType?: string; error?: string }> {
  try {
    const token = await getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${endpoint}`, { headers });
    if (!response.ok) return { success: false, error: `Server returned ${response.status}` };

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('json')) {
      const json = await response.json();
      return { success: true, text: JSON.stringify(json, null, 2), contentType };
    }
    // For binary (PDF, CSV), read as base64
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string)?.split(',')[1] || '';
        resolve({ success: true, base64, contentType });
      };
      reader.onerror = () => resolve({ success: false, error: 'Failed to read file' });
      reader.readAsDataURL(blob);
    });
  } catch (e: any) {
    return { success: false, error: e.message || 'Download failed' };
  }
}

// Download and share a file (PDF, CSV) using expo-file-system + expo-sharing
export async function downloadAndShareFile(endpoint: string, filename: string): Promise<{ success: boolean; error?: string }> {
  try {
    // SDK 54 (expo-file-system 19) moved these functions to /legacy; the main import throws for them.
    const FileSystem = require('expo-file-system/legacy');
    const Sharing = require('expo-sharing');
    const token = await getToken();

    const fileUri = FileSystem.cacheDirectory + filename;
    const downloadResult = await FileSystem.downloadAsync(
      `${API_BASE}${endpoint}`,
      fileUri,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );

    if (downloadResult.status !== 200) {
      return { success: false, error: `Server returned ${downloadResult.status}` };
    }

    // Verify the file actually has content. A 200 with an empty body would
    // otherwise "succeed" and share an empty file — the exact symptom of
    // "it exports but there's nothing".
    const info = await FileSystem.getInfoAsync(downloadResult.uri, { size: true });
    if (!info.exists || !info.size || info.size < 64) {
      return {
        success: false,
        error: 'The server returned an empty file — there may be no data for the selected range.',
      };
    }

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: filename.endsWith('.pdf') ? 'application/pdf' : filename.endsWith('.csv') ? 'text/csv' : 'application/octet-stream',
        dialogTitle: filename,
      });
    } else {
      return { success: false, error: 'Sharing is not available on this device.' };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'Download failed' };
  }
}

// ==================== DEVICE TOKENS (Push Notifications) ====================
export const registerDeviceToken = (token: string, platform: string) =>
  apiRequest<any>('/api/device-token', { method: 'POST', body: JSON.stringify({ token, platform, deviceName: `${platform} device` }) });

export const removeDeviceToken = (token: string) =>
  apiRequest<any>('/api/device-token', { method: 'DELETE', body: JSON.stringify({ token }) });

// ==================== BALANCE ALERTS ====================
export const getBalanceAlerts = (clientId?: string) =>
  apiRequest<any>(`/api/balance-alerts${clientId ? `?clientId=${clientId}` : ''}`);

export const createBalanceAlert = (dto: { clientId?: string; currency: number; direction: number; threshold: number; notifyAllOfficeUsers?: boolean }) =>
  apiRequest<any>('/api/balance-alerts', { method: 'POST', body: JSON.stringify(dto) });

export const toggleBalanceAlert = (id: string) =>
  apiRequest<any>(`/api/balance-alerts/${id}/toggle`, { method: 'PUT' });

export const deleteBalanceAlert = (id: string) =>
  apiRequest<any>(`/api/balance-alerts/${id}`, { method: 'DELETE' });

// ==================== TRANSACTION PIN ====================
export const getTransactionPinStatus = () =>
  apiRequest<{ isEnabled: boolean; hasPin: boolean }>('/api/transaction-pin/status');

export const verifyTransactionPinBackend = (pin: string) =>
  apiRequest<boolean>('/api/transaction-pin/verify', { method: 'POST', body: JSON.stringify({ pin }) });

// ==================== DAILY FLOAT SUMMARIES ====================
export const getTodayFloatSummary = () =>
  apiRequest<any>('/api/exchange/daily/today');

export const getFloatHistory = (from: string, to: string) =>
  apiRequest<any[]>(`/api/exchange/daily/summaries?from=${from}&to=${to}`);

// ==================== PHONE LOGIN (one login, several bureaus) ====================
// Server flag Features__ClientIdentity. Off → every call below answers "not available"
// and the app shows only the classic code + password sign-in.

export interface IdentityBureauDto {
  companyId: string;
  companyName: string;
  logoUrl?: string | null;
  clientCode: string;
  clientName: string;
  baseCurrency: number;
}

export interface IdentityTokenDto {
  accessToken: string; // limited: lists, links and picks bureaus only (15 minutes)
  expiresAt: string;
  phone: string;
  deviceTrusted: boolean;
  bureaus: IdentityBureauDto[];
}

const IDENTITY_DEVICE_KEY = "sariff_identity_device"; // random secret, never leaves SecureStore except to the server
const IDENTITY_PHONE_KEY = "sariff_identity_phone";

/** This install's device secret for "skip the code on this phone" (created once). */
export async function getIdentityDeviceSecret(): Promise<string> {
  let s = await SecureStore.getItemAsync(IDENTITY_DEVICE_KEY);
  if (!s) {
    const g: any = globalThis as any;
    if (g.crypto?.getRandomValues) {
      const bytes = new Uint8Array(24);
      g.crypto.getRandomValues(bytes);
      s = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    } else {
      s = Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16)).join("") + Date.now().toString(16);
    }
    await SecureStore.setItemAsync(IDENTITY_DEVICE_KEY, s);
  }
  return s;
}

export const getRememberedIdentityPhone = () => SecureStore.getItemAsync(IDENTITY_PHONE_KEY);
export const rememberIdentityPhone = (phone: string) => SecureStore.setItemAsync(IDENTITY_PHONE_KEY, phone);
/** Forget this phone: a new secret means the server no longer trusts this install. */
export async function forgetIdentityDevice() {
  await SecureStore.deleteItemAsync(IDENTITY_PHONE_KEY);
  await SecureStore.deleteItemAsync(IDENTITY_DEVICE_KEY);
}

async function identityFetch<T>(path: string, method: string, token?: string, body?: unknown): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (method !== "GET") headers["Idempotency-Key"] = newIdempotencyKey();
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 404) return { success: false, message: "Phone login is not available yet.", data: null as any };
    if (res.status === 401) return { success: false, message: "Your phone sign-in expired. Start again.", data: null as any };
    return await res.json();
  } catch (e: any) {
    return { success: false, message: e?.name === "AbortError" ? "The server took too long. Try again." : "Can't reach the server.", data: null as any };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** False on any error, so the classic sign-in always works. */
export async function identityEnabled(): Promise<boolean> {
  const r = await identityFetch<{ enabled: boolean }>("/api/identity/enabled", "GET");
  return !!(r.success && r.data?.enabled);
}

export const identityRequestCode = (phone: string) =>
  identityFetch<boolean>("/api/identity/request-code", "POST", undefined, { phone });

export const identityVerifyCode = (phone: string, code: string, deviceId?: string, deviceName?: string) =>
  identityFetch<IdentityTokenDto>("/api/identity/verify-code", "POST", undefined, { phone, code, deviceId, deviceName });

export const identityDeviceLogin = (phone: string, deviceId: string) =>
  identityFetch<IdentityTokenDto>("/api/identity/device-login", "POST", undefined, { phone, deviceId });

export const identityLink = (token: string, clientCode: string, password: string) =>
  identityFetch<IdentityBureauDto>("/api/identity/link", "POST", token, { clientCode, password });

export const identityPick = (token: string, companyId: string) =>
  identityFetch<TokenResponseDto>("/api/identity/select", "POST", token, { companyId });

/** Did this bureau session come from a phone login? (Then "Switch bureau" is offered.) */
export async function hasPhoneLogin(): Promise<boolean> {
  const token = await getToken();
  if (!token) return false;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = part + "===".slice((part.length + 3) % 4);
    const g: any = globalThis as any;
    const json = typeof g.atob === "function" ? g.atob(padded) : "";
    return !!JSON.parse(json || "{}").identity_id;
  } catch {
    return false;
  }
}

// Inside the portal the bureau token carries the phone login.
export const getLinkedBureaus = () => apiRequest<IdentityBureauDto[]>("/api/identity/bureaus");
export const linkBureau = (clientCode: string, password: string) =>
  apiRequest<IdentityBureauDto>("/api/identity/link", { method: "POST", body: JSON.stringify({ clientCode, password }) });
export const switchBureauRequest = (companyId: string) =>
  apiRequest<TokenResponseDto>("/api/identity/select", { method: "POST", body: JSON.stringify({ companyId }) });
export const unlinkBureau = (companyId: string) =>
  apiRequest<boolean>(`/api/identity/bureaus/${companyId}`, { method: "DELETE" });
export const signOutEverywhere = () =>
  apiRequest<boolean>("/api/identity/sign-out-everywhere", { method: "POST" });

/** Office: cut a client's phone-login link (lost phone). Money and history stay. */
export const unlinkClientPhoneLogin = (clientId: string) =>
  apiRequest<boolean>(`/api/client/${clientId}/unlink-phone-login`, { method: "POST" });
