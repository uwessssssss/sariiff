import { PagedResult } from "../../types";
import { apiRequest } from "./core";

// ==================== INVOICES ====================
export const getInvoices = (page = 1, pageSize = 50) =>
  apiRequest<PagedResult<any>>(`/api/invoice?page=${page}&pageSize=${pageSize}`);
// ==================== INVOICES (full CRUD) ====================
export const createInvoice = (dto: any) =>
  apiRequest<any>('/api/invoice', { method: 'POST', body: JSON.stringify(dto) });
export const getInvoiceById = (id: string) => apiRequest<any>(`/api/invoice/${id}`);
export const deleteInvoice = (id: string) =>
  apiRequest<boolean>(`/api/invoice/${id}`, { method: 'DELETE' });
export const updateInvoiceStatus = (id: string, status: number) =>
  apiRequest<any>(`/api/invoice/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
