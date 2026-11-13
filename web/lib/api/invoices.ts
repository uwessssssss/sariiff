import { API_BASE_URL, type ApiResponse, type PagedResult, apiRequest, authorizedFetch } from "./core";
import { Currency } from "./enums";

// ==============================================
// Invoice Types — Matches backend DTOs
// ==============================================

export const InvoiceStatus = {
  Draft: 0,
  Sent: 1,
  Paid: 2,
  Cancelled: 3,
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];
export interface InvoiceItemDto {
  description: string;
  quantity: number;
  unitPrice: number;
}
export interface InvoiceItemResponseDto {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}
export interface CreateInvoiceDto {
  clientId?: string | null;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  dueDate: string;
  currency: Currency;
  items: InvoiceItemDto[];
  taxRate: number;
  discountAmount: number;
  notes?: string;
  terms?: string;
}
export interface InvoiceResponseDto {
  id: string;
  invoiceNumber: string;
  clientId: string | null;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  invoiceDate: string;
  dueDate: string;
  currency: Currency;
  status: InvoiceStatus;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  notes?: string;
  terms?: string;
  items: InvoiceItemResponseDto[];
}
// Legacy simple DTO (kept for backwards compatibility)
export interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  amount: number;
  currency: Currency;
  status: number;
  dueDate: string;
  createdAt: string;
}
// ==============================================
// Invoice API Functions
// ==============================================

export async function getInvoices(
  page: number = 1,
  pageSize: number = 100,
): Promise<ApiResponse<PagedResult<InvoiceResponseDto>>> {
  return apiRequest(`/api/invoice?page=${page}&pageSize=${pageSize}`);
}
export async function createInvoice(
  dto: CreateInvoiceDto,
): Promise<ApiResponse<InvoiceResponseDto>> {
  return apiRequest("/api/invoice", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
export async function getInvoiceById(
  id: string,
): Promise<ApiResponse<InvoiceResponseDto>> {
  return apiRequest(`/api/invoice/${id}`);
}
export async function updateInvoiceStatus(
  id: string,
  status: InvoiceStatus,
): Promise<ApiResponse<InvoiceResponseDto>> {
  return apiRequest(`/api/invoice/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}
export async function deleteInvoice(id: string): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/invoice/${id}`, {
    method: "DELETE",
  });
}
export async function downloadInvoicePdf(id: string): Promise<Blob> {
  const response = await authorizedFetch(`${API_BASE_URL}/api/invoice/${id}/pdf`);
  if (!response.ok) {
    throw new Error(`Failed to download invoice PDF (${response.status})`);
  }
  return response.blob();
}
