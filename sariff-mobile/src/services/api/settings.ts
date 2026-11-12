import { apiRequest } from "./core";

// ==================== SETTINGS ====================
export const getMyCompanyInfo = () => apiRequest<any>('/api/dashboard/company');
export const updateMyCompanySettings = (dto: any) =>
  apiRequest<any>('/api/dashboard/settings', { method: 'PUT', body: JSON.stringify(dto) });
