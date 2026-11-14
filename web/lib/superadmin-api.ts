import { refreshAuthOnce, newIdempotencyKey, authorizedFetch } from "./api";
const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080") + "/api";

// ==================== TYPES ====================

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

// Enums
export enum SubscriptionPlan {
  Free = "Free",
  Starter = "Starter",
  Professional = "Professional",
  Enterprise = "Enterprise",
}

export enum SubscriptionStatus {
  Active = "Active",
  Trial = "Trial",
  Expired = "Expired",
  Cancelled = "Cancelled",
  Suspended = "Suspended",
}

export enum SecurityAlertType {
  FailedLogin = "FailedLogin",
  SuspiciousActivity = "SuspiciousActivity",
  UnauthorizedAccess = "UnauthorizedAccess",
  IPBlocked = "IPBlocked",
  AccountLocked = "AccountLocked",
  PasswordReset = "PasswordReset",
  NewDevice = "NewDevice",
  RateLimitExceeded = "RateLimitExceeded",
}

// Dashboard
export interface SuperAdminDashboard {
  totalCompanies: number;
  activeCompanies: number;
  trialCompanies: number;
  expiredCompanies: number;
  suspendedCompanies: number;
  companiesGrowth: number;
  totalUsers: number;
  totalClients: number;
  activeUsersToday: number;
  usersGrowth: number;
  monthlyRecurringRevenue: number;
  totalRevenue: number;
  pendingPayments: number;
  revenueGrowth: number;
  totalTransactionsVolume: number;
  monthlyTransactionsVolume: number;
  totalTransactionsCount: number;
  monthlyTransactionsCount: number;
  volumeGrowth: number;
  systemStatus: string;
  errorsLast24h: number;
  securityAlertsActive: number;
  topCompaniesByVolume: CompanyRank[];
  topCompaniesByTransactions: CompanyRank[];
  recentSignups: CompanyStats[];
  expiringSubscriptions: CompanyStats[];
  recentErrors: SystemLog[];
  companies: CompanySummary[];
  /** Platform volume per currency — never added across currencies */
  totalVolumeByCurrency?: CurrencyAmount[];
  monthlyVolumeByCurrency?: CurrencyAmount[];
  /** Bureaus per home currency, e.g. KES: 5, UGX: 3 */
  companiesByBaseCurrency?: { currency: number; count: number }[];
}

export interface CurrencyAmount {
  currency: number;
  currencyCode: string;
  amount: number;
}

export interface CompanyRank {
  id: string;
  name: string;
  code: string;
  value: number;
  rank: number;
  baseCurrency?: number;
  transactionCount?: number;
  volumeByCurrency?: CurrencyAmount[];
}

export interface CompanySummary {
  id: string;
  code: string;
  name: string;
  ownerName: string;
  totalClients: number;
  totalTransactions: number;
  totalBalanceKES: number;
  totalBalanceUSD: number;
  isActive: boolean;
}

// Company
export interface CompanyStats {
  id: string;
  code: string;
  name: string;
  ownerName: string;
  email: string | null;
  whatsAppNumber: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionStartDate: string | null;
  subscriptionExpiresAt: string | null;
  monthlyFee: number;
  totalPaid: number;
  lastPaymentDate: string | null;
  totalUsers: number;
  activeUsers: number;
  totalClients: number;
  activeClients: number;
  totalTransactions: number;
  monthlyTransactions: number;
  totalVolume: number;
  monthlyVolume: number;
  lastActivityAt: string | null;
  errorCount: number;
  totalVolumeByCurrency?: CurrencyAmount[];
  monthlyVolumeByCurrency?: CurrencyAmount[];
  /** Home currency: 0 = KES, 2 = UGX */
  baseCurrency?: number;
}

export interface CompanyDetail extends CompanyStats {
  logoUrl: string | null;
  taxId: string | null;
  website: string | null;
  address: string | null;
  bankAccountsCount: number;
  mpesaAgentsCount: number;
  totalCashBalanceKES: number;
  totalCashBalanceUSD: number;
  totalBankBalanceKES: number;
  totalBankBalanceUSD: number;
  totalMpesaBalance: number;
  totalClientBalanceKES: number;
  totalClientBalanceUSD: number;
  otherCurrencyHoldings?: CurrencyHolding[];
  recentTransactions: RecentTransaction[];
  recentLogins: LoginHistory[];
  unreconciledCount: number;
  /** Home currency (0 = KES, 2 = UGX) and whether it can still change */
  baseCurrency?: number;
  canChangeBaseCurrency?: boolean;
}

export interface CurrencyHolding {
  currency: number;
  currencyCode: string;
  cashBalance: number;
  bankBalance: number;
  clientBalance: number;
}

export interface RecentTransaction {
  id: string;
  code: string;
  description: string;
  amount: number;
  currency: string;
  transactionType: string;
  transactionDate: string;
}

// System Health
export interface SystemHealth {
  overallStatus: string;
  apiStatus: string;
  apiResponseTimeMs: number;
  apiRequestsPerMinute: number;
  apiErrorRate: number;
  databaseStatus: string;
  databaseLatencyMs: number;
  databaseConnections: number;
  serverCpuUsage: number;
  serverMemoryUsage: number;
  serverDiskUsage: number;
  activeWebSockets: number;
  uptimeSeconds: number;
  lastCheckedAt: string;
  errorsLast24h: number;
  warningsLast24h: number;
  criticalAlertsLast24h: number;
  /** Why the status isn't Healthy, in plain words. */
  reasons?: string[];
}

// Security
export interface SecurityOverview {
  failedLoginsLast24h: number;
  failedLoginsLast7d: number;
  lockedAccounts: number;
  suspiciousActivities: number;
  blockedIPs: number;
  activeAlerts: number;
  recentAlerts: SecurityAlert[];
  recentFailedLogins: LoginHistory[];
}

export interface SecurityAlert {
  id: string;
  alertType: SecurityAlertType;
  severity: string;
  message: string;
  companyId: string | null;
  companyName: string | null;
  ipAddress: string | null;
  isResolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export interface BlockedIP {
  id: string;
  ipAddress: string;
  reason: string;
  blockedUntil: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface IPWhitelist {
  id: string;
  ipAddress: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

// Financial
export interface FinancialOverview {
  totalRevenue: number;
  monthlyRevenue: number;
  yearlyRevenue: number;
  pendingPayments: number;
  revenueGrowth: number;
  revenueByPlan: RevenueByPlan[];
  totalTransactionsVolume: number;
  monthlyTransactionsVolume: number;
  avgTransactionSize: number;
  transactionsByType: TransactionTypeStats[];
  totalVolumeByCurrency?: CurrencyAmount[];
  monthlyVolumeByCurrency?: CurrencyAmount[];
}

export interface RevenueByPlan {
  plan: string;
  revenue: number;
  companyCount: number;
  percentage: number;
}

export interface TransactionTypeStats {
  type: string;
  count: number;
  volume: number;
}

export interface PaymentHistory {
  id: string;
  companyId: string;
  companyName: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  reference: string | null;
  paidAt: string | null;
  periodStart: string;
  periodEnd: string;
}

// Analytics
export interface AnalyticsOverview {
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  avgSessionDurationSeconds: number;
  featureUsage: FeatureUsage[];
  userGrowth: GrowthDataPoint[];
  transactionGrowth: GrowthDataPoint[];
  revenueGrowth: GrowthDataPoint[];
}

export interface FeatureUsage {
  feature: string;
  totalUses: number;
  uniqueUsers: number;
}

export interface GrowthDataPoint {
  period: string;
  value: number;
}

// Audit & Logs
export interface AuditLog {
  id: string;
  companyId: string | null;
  companyName: string | null;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: string | null;
  newValues: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface LoginHistory {
  id: string;
  companyId: string | null;
  companyName: string | null;
  userId: string | null;
  userName: string | null;
  userRole: string;
  ipAddress: string;
  location: string | null;
  isSuccessful: boolean;
  failureReason: string | null;
  loginAt: string;
}

export interface SystemLog {
  id: string;
  level: string;
  source: string;
  message: string;
  stackTrace: string | null;
  companyId: string | null;
  createdAt: string;
  /** Set once a super admin marks the cause fixed. */
  resolvedAt?: string | null;
}

// ==================== DTOs ====================

export interface UpdateCompanyDto {
  name?: string;
  ownerName?: string;
  email?: string;
  logoUrl?: string;
  taxId?: string;
  website?: string;
  address?: string;
}

export interface UpdateSubscriptionDto {
  plan: string;
  status: string;
  monthlyFee: number;
  expiresAt?: string;
}

// ==================== STORED AUTH TYPE ====================

interface StoredAuth {
  token: string;
  refreshToken: string;
  user: {
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
  };
  expiresAt: string;
}

// ==================== API HELPER ====================

function getStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  const authStr = localStorage.getItem("sariff_auth");
  if (!authStr) return null;
  try {
    return JSON.parse(authStr);
  } catch {
    return null;
  }
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const auth = getStoredAuth();
  const token = auth?.token || null;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    (headers as Record<string, string>)["Idempotency-Key"] ??= newIdempotencyKey();
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    // Token refresh on 401, BEFORE reading the body: the API's 401 has an empty body, and
    // reading it first returned "Request failed with status 401" without ever refreshing, so
    // every super-admin screen failed after the first hour.
    if (response.status === 401 && auth?.refreshToken) {
      const latest = getStoredAuth();
      const rd =
        latest?.token && latest.token !== auth.token
          ? { accessToken: latest.token }
          : await refreshAuthOnce(auth.refreshToken);
      if (rd) {
        const retryResp = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers: { ...headers, Authorization: `Bearer ${rd.accessToken}` },
        });
        try {
          const retried = await retryResp.json();
          return "success" in retried ? retried : { success: retryResp.ok, message: retryResp.ok ? "Success" : `Request failed with status ${retryResp.status}`, data: retryResp.ok ? retried : (null as any) };
        } catch {
          return { success: false, message: `Request failed with status ${retryResp.status}`, data: null as any };
        }
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem("sariff_auth");
        window.location.href = "/login";
      }
      return { success: false, message: "Session expired. Please sign in again.", data: null as any };
    }

    // Handle non-JSON responses (e.g. 404 with empty body)
    let data: any;
    try {
      data = await response.json();
    } catch {
      return {
        success: false,
        message: `Request failed with status ${response.status}`,
        data: null as any,
      };
    }

    if (!response.ok) {
      return {
        success: false,
        message:
          data.message || `Request failed with status ${response.status}`,
        data: null as any,
      };
    }

    if ("success" in data) {
      return data;
    }
    return { success: true, message: "Success", data };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Network error",
      data: null as any,
    };
  }
}

// ==================== DASHBOARD ====================

export const getDashboard = () =>
  apiRequest<SuperAdminDashboard>("/admin/dashboard/extended");

// ==================== COMPANIES ====================

export const getCompanies = (params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  /** Home currency (0 KES, 2 UGX); "all" or omitted = every country */
  baseCurrency?: string;
}) => {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", String(params.page));
  if (params.pageSize) queryParams.append("pageSize", String(params.pageSize));
  if (params.search) queryParams.append("search", params.search);
  if (params.status && params.status !== "all")
    queryParams.append("status", params.status);
  if (params.baseCurrency && params.baseCurrency !== "all")
    queryParams.append("baseCurrency", params.baseCurrency);
  return apiRequest<PagedResult<CompanyStats>>(
    `/admin/companies?${queryParams}`
  );
};

export const getCompanyDetails = (id: string) =>
  apiRequest<CompanyDetail>(`/admin/companies/${id}/details`);

// FIXED: Now includes status field
// Map enum names to numbers for backend
const planMap: Record<string, number> = {
  Free: 0,
  Starter: 1,
  Professional: 2,
  Enterprise: 3,
};
const statusMap: Record<string, number> = {
  Active: 0,
  Trial: 1,
  Expired: 2,
  Cancelled: 3,
  Suspended: 4,
};

export const updateSubscription = (id: string, data: UpdateSubscriptionDto) =>
  apiRequest<boolean>(`/admin/companies/${id}/subscription`, {
    method: "PUT",
    body: JSON.stringify({
      plan: typeof data.plan === "number" ? data.plan : planMap[data.plan] ?? 0,
      status:
        typeof data.status === "number"
          ? data.status
          : statusMap[data.status] ?? 0,
      monthlyFee: data.monthlyFee,
      expiresAt: data.expiresAt || null,
    }),
  });

// NEW: Update company details
export const updateCompany = (id: string, data: UpdateCompanyDto) =>
  apiRequest<boolean>(`/admin/companies/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const suspendCompany = (id: string, reason: string) =>
  apiRequest<boolean>(`/admin/companies/${id}/suspend`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

export const activateCompany = (id: string) =>
  apiRequest<boolean>(`/admin/companies/${id}/activate`, {
    method: "POST",
  });

export const resetPassword = (id: string, newPassword: string) =>
  apiRequest<boolean>(`/admin/companies/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });

export const createCompany = (data: {
  name: string;
  ownerName: string;
  whatsAppNumber: string;
  email?: string;
  password: string;
  codePrefix?: string;
  /** 0 = KES (Kenya), 2 = UGX (Uganda) */
  baseCurrency?: number;
}) =>
  apiRequest<any>("/company", {
    method: "POST",
    body: JSON.stringify(data),
  });

/** Change a company's base currency — refused once it has exchange or mobile money history. */
export const setCompanyBaseCurrency = (id: string, baseCurrency: number) =>
  apiRequest<CompanyDetail>(`/admin/companies/${id}/base-currency`, {
    method: "PUT",
    body: JSON.stringify({ baseCurrency }),
  });

// ==================== SYSTEM HEALTH ====================

export const getSystemHealth = () =>
  apiRequest<SystemHealth>("/admin/system/health");

// ==================== SECURITY ====================

export const getSecurityOverview = () =>
  apiRequest<SecurityOverview>("/admin/security/overview");

export const getSecurityAlerts = (params: {
  page?: number;
  pageSize?: number;
  resolved?: boolean;
}) => {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", String(params.page));
  if (params.pageSize) queryParams.append("pageSize", String(params.pageSize));
  if (params.resolved !== undefined)
    queryParams.append("resolved", String(params.resolved));
  return apiRequest<PagedResult<SecurityAlert>>(
    `/admin/security/alerts?${queryParams}`
  );
};

export const resolveAlert = (id: string, notes?: string) =>
  apiRequest<boolean>(`/admin/security/alerts/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  });

export const blockIP = (data: {
  ipAddress: string;
  reason: string;
  blockUntil?: string;
}) =>
  apiRequest<boolean>("/admin/security/block-ip", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const unblockIP = (id: string) =>
  apiRequest<boolean>(`/admin/security/blocked-ips/${id}`, {
    method: "DELETE",
  });

export const getIPWhitelist = () =>
  apiRequest<IPWhitelist[]>("/admin/security/ip-whitelist");

export const addIPToWhitelist = (data: {
  ipAddress: string;
  description?: string;
}) =>
  apiRequest<boolean>("/admin/security/ip-whitelist", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const removeIPFromWhitelist = (id: string) =>
  apiRequest<boolean>(`/admin/security/ip-whitelist/${id}`, {
    method: "DELETE",
  });

// ==================== FINANCIAL ====================

export const getFinancialOverview = () =>
  apiRequest<FinancialOverview>("/admin/financials/overview");

export const getPayments = (params: {
  page?: number;
  pageSize?: number;
  companyId?: string;
}) => {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", String(params.page));
  if (params.pageSize) queryParams.append("pageSize", String(params.pageSize));
  if (params.companyId) queryParams.append("companyId", params.companyId);
  return apiRequest<PagedResult<PaymentHistory>>(
    `/admin/financials/payments?${queryParams}`
  );
};

export const recordPayment = (data: {
  companyId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
}) =>
  apiRequest<PaymentHistory>("/admin/financials/payments", {
    method: "POST",
    body: JSON.stringify(data),
  });

// ==================== ANALYTICS ====================

export const getAnalytics = (params?: {
  startDate?: string;
  endDate?: string;
}) => {
  const queryParams = new URLSearchParams();
  if (params?.startDate) queryParams.append("startDate", params.startDate);
  if (params?.endDate) queryParams.append("endDate", params.endDate);
  return apiRequest<AnalyticsOverview>(
    `/admin/analytics/overview?${queryParams}`
  );
};

// ==================== AUDIT LOGS ====================

export const getAuditLogs = (params: {
  page?: number;
  pageSize?: number;
  companyId?: string;
  userId?: string;
  action?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
  severity?: string;
}) => {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) queryParams.append(key, String(value));
  });
  return apiRequest<PagedResult<AuditLog>>(
    `/admin/audit-logs/extended?${queryParams}`
  );
};

export const exportAuditLogs = async (params?: {
  companyId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<Blob | null> => {
  const queryParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });
  }

  try {
    const response = await authorizedFetch(`${API_BASE}/admin/audit-logs/export?${queryParams}`);
    if (response.ok) return await response.blob();
    return null;
  } catch {
    return null;
  }
};

// ==================== LOGIN HISTORY ====================

export const getLoginHistory = (params: {
  page?: number;
  pageSize?: number;
  companyId?: string;
}) => {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", String(params.page));
  if (params.pageSize) queryParams.append("pageSize", String(params.pageSize));
  if (params.companyId) queryParams.append("companyId", params.companyId);
  return apiRequest<PagedResult<LoginHistory>>(
    `/admin/login-history?${queryParams}`
  );
};

// ==================== SYSTEM LOGS ====================

export const getSystemLogs = (params: {
  page?: number;
  pageSize?: number;
  level?: string;
  includeResolved?: boolean;
}) => {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", String(params.page));
  if (params.pageSize) queryParams.append("pageSize", String(params.pageSize));
  if (params.level && params.level !== "all")
    queryParams.append("level", params.level);
  if (params.includeResolved) queryParams.append("includeResolved", "true");
  return apiRequest<PagedResult<SystemLog>>(
    `/admin/system-logs?${queryParams}`
  );
};

/** Mark a log entry resolved; similar = also every identical unresolved entry. Returns how many were marked. */
export const resolveSystemLog = (id: string, similar = true) =>
  apiRequest<number>(`/admin/system-logs/${id}/resolve?similar=${similar}`, { method: "POST" });

// ==================== TRANSACTION PIN (SuperAdmin) ====================
export const setTransactionPin = (companyId: string, pin: string) =>
  apiRequest<any>("/transaction-pin/set", { method: "POST", body: JSON.stringify({ pin, companyId }) });

export const toggleTransactionPin = (companyId: string) =>
  apiRequest<any>(`/transaction-pin/toggle?companyId=${companyId}`, { method: "POST" });

export const removeTransactionPin = (companyId: string) =>
  apiRequest<any>(`/transaction-pin?companyId=${companyId}`, { method: "DELETE" });

export const getTransactionPinStatus = (companyId?: string) =>
  apiRequest<any>(`/transaction-pin/status${companyId ? `?companyId=${companyId}` : ''}`);