import { apiRequest } from "./core";

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
