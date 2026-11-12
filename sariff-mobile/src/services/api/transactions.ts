import { CreateTransactionDto, PagedResult, TransactionDto } from "../../types";
import { apiRequest } from "./core";

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
// ==================== TRANSACTIONS (full CRUD) ====================
export const getTransactionById = (id: string) =>
  apiRequest<TransactionDto>(`/api/transaction/${id}`);
export const deleteTransaction = (id: string, reason?: string) =>
  apiRequest<boolean>(`/api/transaction/${id}`, { method: 'DELETE', body: JSON.stringify({ reason: reason || 'Reversed' }) });
export const updateTransaction = (id: string, dto: { description?: string; notes?: string }) =>
  apiRequest<TransactionDto>(`/api/transaction/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
// ==================== TRANSACTION PIN ====================
export const getTransactionPinStatus = () =>
  apiRequest<{ isEnabled: boolean; hasPin: boolean }>('/api/transaction-pin/status');
export const verifyTransactionPinBackend = (pin: string) =>
  apiRequest<boolean>('/api/transaction-pin/verify', { method: 'POST', body: JSON.stringify({ pin }) });
