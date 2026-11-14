import { API_BASE_URL, type ApiResponse, type PagedResult, apiRequest, authorizedFetch } from "./core";

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
    const res = await authorizedFetch(`${API_BASE_URL}/api/admin/audit-logs/export`);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}
