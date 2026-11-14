import { ClientAlertDto, ClientDashboardDto, ClientTransactionDto, PagedResult } from "../../types";
import { apiRequest } from "./core";

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
