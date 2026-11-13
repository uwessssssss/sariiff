import { PagedResult } from "../../types";
import { apiRequest } from "./core";

// ==================== INVOICES ====================
export const getInvoices = (page = 1, pageSize = 50) =>
  apiRequest<PagedResult<any>>(`/api/invoice?page=${page}&pageSize=${pageSize}`);
/** Every invoice, page by page: "Paid" and "Outstanding" were totals of the latest 50 only. */
export async function getAllInvoices(): Promise<{ success: boolean; message?: string; data: any[] }> {
  const all: any[] = [];
  for (let page = 1; page <= 250; page++) {
    const r = await getInvoices(page, 200);
    if (!r.success) return page === 1 ? { success: false, message: r.message, data: [] } : { success: true, data: all };
    const rows: any[] = (r.data as any)?.items || [];
    all.push(...rows);
    const total = (r.data as any)?.totalCount ?? all.length;
    if (rows.length < 200 || all.length >= total) break;
  }
  return { success: true, data: all };
}
// ==================== INVOICES (full CRUD) ====================
export const createInvoice = (dto: any) =>
  apiRequest<any>('/api/invoice', { method: 'POST', body: JSON.stringify(dto) });
export const getInvoiceById = (id: string) => apiRequest<any>(`/api/invoice/${id}`);
export const deleteInvoice = (id: string) =>
  apiRequest<boolean>(`/api/invoice/${id}`, { method: 'DELETE' });
export const updateInvoiceStatus = (id: string, status: number) =>
  apiRequest<any>(`/api/invoice/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
