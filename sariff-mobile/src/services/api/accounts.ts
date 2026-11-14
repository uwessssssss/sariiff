import { BankAccountDto, CashAccountDto, MpesaAgentDto } from "../../types";
import { apiRequest } from "./core";

// ==================== BANK ACCOUNTS ====================
export const getBankAccounts = () => apiRequest<BankAccountDto[]>("/api/bank");
export const getBankStatement = (id: string) =>
  apiRequest<any>(`/api/bank/${id}/statement`);
// ==================== MPESA ====================
export const getMpesaAgents = () => apiRequest<MpesaAgentDto[]>("/api/mpesa");
export const getMpesaStatement = (id: string) =>
  apiRequest<any>(`/api/mpesa/${id}/statement`);
// ==================== CASH ====================
export const getCashAccounts = () => apiRequest<CashAccountDto[]>("/api/cash");
export const getCashStatement = (currency: number) =>
  apiRequest<any>(`/api/cash/statement/${currency}`);
// ==================== BANK ACCOUNTS (CRUD) ====================
export const createBankAccount = (dto: any) =>
  apiRequest<BankAccountDto>('/api/bank', { method: 'POST', body: JSON.stringify(dto) });
export const updateBankAccount = (id: string, dto: any) =>
  apiRequest<BankAccountDto>(`/api/bank/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
export const deleteBankAccount = (id: string) =>
  apiRequest<boolean>(`/api/bank/${id}`, { method: 'DELETE' });
export const getBankAccountById = (id: string) =>
  apiRequest<BankAccountDto>(`/api/bank/${id}`);
export const getBankAccountStatement = (id: string, from?: string, to?: string) => {
  let url = `/api/bank/${id}/statement`;
  const p: string[] = [];
  if (from) p.push(`startDate=${from}`);
  if (to) p.push(`endDate=${to}`);
  if (p.length) url += `?${p.join('&')}`;
  return apiRequest<any>(url);
};
export const getBankStats = () => apiRequest<any>('/api/bank/stats');
// ==================== MPESA (CRUD) ====================
export const createMpesaAgent = (dto: any) =>
  apiRequest<MpesaAgentDto>('/api/mpesa', { method: 'POST', body: JSON.stringify(dto) });
export const updateMpesaAgent = (id: string, dto: any) =>
  apiRequest<MpesaAgentDto>(`/api/mpesa/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
export const deleteMpesaAgent = (id: string) =>
  apiRequest<boolean>(`/api/mpesa/${id}`, { method: 'DELETE' });
export const getMpesaAgentById = (id: string) =>
  apiRequest<MpesaAgentDto>(`/api/mpesa/${id}`);
export const getMpesaAgentStatement = (id: string, from?: string, to?: string) => {
  let url = `/api/mpesa/${id}/statement`;
  const p: string[] = [];
  if (from) p.push(`startDate=${from}`);
  if (to) p.push(`endDate=${to}`);
  if (p.length) url += `?${p.join('&')}`;
  return apiRequest<any>(url);
};
export const getMpesaStats = () => apiRequest<any>('/api/mpesa/stats');
// ==================== CASH (CRUD) ====================
export const createCashAccount = (dto: any) =>
  apiRequest<CashAccountDto>('/api/cash', { method: 'POST', body: JSON.stringify(dto) });
export const updateCashAccount = (id: string, dto: any) =>
  apiRequest<CashAccountDto>(`/api/cash/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
export const deleteCashAccount = (id: string) =>
  apiRequest<boolean>(`/api/cash/${id}`, { method: 'DELETE' });
export const getCashAccountById = (id: string) =>
  apiRequest<CashAccountDto>(`/api/cash/${id}`);
export const getCashAccountStatement = (currency: number, from?: string, to?: string) => {
  let url = `/api/cash/statement/${currency}`;
  const p: string[] = [];
  if (from) p.push(`startDate=${from}`);
  if (to) p.push(`endDate=${to}`);
  if (p.length) url += `?${p.join('&')}`;
  return apiRequest<any>(url);
};
export const getCashStats = () => apiRequest<any>('/api/cash/stats');
