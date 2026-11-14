import { type ApiResponse, type PagedResult, apiRequest } from "./core";
import { ClientType } from "./enums";

// ==============================================
// Client Types
// ==============================================

export interface ClientDto {
  /** True when the client has linked this account to a phone login (several bureaus, one login). */
  phoneLoginLinked?: boolean;
  id: string;
  code: string;
  fullName: string;
  whatsAppNumber: string;
  email?: string;
  idPassport?: string;
  clientType: ClientType;
  balanceKES: number;
  balanceUSD: number;
  openingBalanceKES: number;
  openingBalanceUSD: number;
  netMovementUSD: number;
  totalCreditUSD: number;
  totalDebitUSD: number;
  netMovementKES: number;
  totalCreditKES: number;
  totalDebitKES: number;
  isActive: boolean;
  expiresAt?: string;
  lastActivityAt?: string;
  createdAt: string;
  // Balances in currencies beyond KES/USD (UGX, EUR, ...)
  otherBalances?: CurrencyBalanceDto[];
}
export interface CurrencyBalanceDto {
  currency: number;
  currencyCode: string;
  balance: number;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
}
export interface CreateClientDto {
  fullName: string;
  whatsAppNumber: string;
  email?: string;
  idPassport?: string;
  clientType: ClientType;
  openingBalanceKES?: number;
  openingBalanceUSD?: number;
  /** Opening balance in the bureau's home currency when it isn't KES/USD (e.g. UGX). */
  openingBalanceHome?: number;
  password?: string;
}
export interface UpdateClientDto {
  fullName?: string;
  whatsAppNumber?: string;
  email?: string;
  idPassport?: string;
  isActive?: boolean;
}
// ==============================================
// Client API Functions
// ==============================================

/**
 * Every row of a paged list, fetched page by page (200 at a time).
 *
 * Before (Nov 2026) screens asked for "page 1 of 200/500/1000" and treated it as everything:
 * the client picker stopped at 200 clients and the month's profit was built from the first
 * 1,000 transactions. Returns the same shape as one page, holding all rows.
 */
export async function allPages<T = any>(
  fetchPage: (page: number, pageSize: number) => Promise<ApiResponse<any>>,
  pageSize: number = 200,
  maxRows: number = 50000,
): Promise<ApiResponse<PagedResult<T>>> {
  const items: T[] = [];
  let total = 0;
  for (let page = 1; items.length < maxRows; page++) {
    const r = await fetchPage(page, pageSize);
    if (!r.success || !r.data) return page === 1 ? (r as any) : { ...r, success: true, data: { items, totalCount: Math.max(total, items.length), page: 1, pageSize: items.length } as any };
    const rows: T[] = Array.isArray(r.data) ? r.data : r.data.items || [];
    total = Array.isArray(r.data) ? items.length + rows.length : r.data.totalCount ?? items.length + rows.length;
    items.push(...rows);
    if (rows.length < pageSize || items.length >= total) {
      return { ...r, data: { items, totalCount: Math.max(total, items.length), page: 1, pageSize: items.length } as any };
    }
  }
  return { success: true, message: "Success", data: { items, totalCount: total, page: 1, pageSize: items.length } as any } as any;
}
export async function getClients(
  page: number = 1,
  pageSize: number = 10,
  search?: string,
  filter?: string,
): Promise<ApiResponse<PagedResult<ClientDto>>> {
  let url = `/api/client?page=${page}&pageSize=${pageSize}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (filter) url += `&filter=${filter}`;
  return apiRequest(url);
}
// PERF: Lightweight client list for dropdowns — no balance calculations
export interface ClientLookupDto {
  id: string;
  code: string;
  fullName: string;
  whatsAppNumber: string;
  idPassport?: string;
  isActive: boolean;
}
export async function getClientLookup(
  search?: string,
): Promise<ApiResponse<ClientLookupDto[]>> {
  let url = "/api/client/lookup";
  if (search) url += `?search=${encodeURIComponent(search)}`;
  return apiRequest(url);
}
export async function getClientById(
  id: string,
): Promise<ApiResponse<ClientDto>> {
  return apiRequest(`/api/client/${id}`);
}
export async function createClient(
  dto: CreateClientDto,
): Promise<ApiResponse<ClientDto>> {
  return apiRequest("/api/client", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
export async function updateClient(
  id: string,
  dto: UpdateClientDto,
): Promise<ApiResponse<ClientDto>> {
  return apiRequest(`/api/client/${id}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}
export async function deleteClient(id: string): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/client/${id}`, { method: "DELETE" });
}
export async function getClientStatement(
  id: string,
  startDate?: string,
  endDate?: string,
  currency?: number,
): Promise<ApiResponse<any>> {
  let url = `/api/client/${id}/statement`;
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  if (currency !== undefined) params.append("currency", String(currency));
  if (params.toString()) url += `?${params.toString()}`;
  return apiRequest(url);
}
export async function getClientStats(): Promise<ApiResponse<any>> {
  return apiRequest("/api/client/stats");
}
// Reset client password (Office user action)
// =====================================================
// ADD THIS TO YOUR api.ts FILE
// =====================================================

// DTO for reset password request
export interface ResetClientPasswordDto {
  newPassword: string;
}
// Reset client password (Office user action)
// Endpoint: POST /api/client/{id}/reset-password
export async function resetClientPassword(
  clientId: string,
  newPassword: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest<boolean>(`/api/client/${clientId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
}
