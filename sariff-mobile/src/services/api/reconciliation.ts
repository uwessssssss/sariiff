import { apiRequest } from "./core";

// ==================== RECONCILIATION ====================
export const getReconciliations = (page = 1, pageSize = 20) =>
  apiRequest<any>('/api/reconciliation');
export const getReconciliationAccounts = () =>
  apiRequest<any>('/api/reconciliation/accounts');
// ==================== RECONCILIATION (full operations) ====================
export const createReconciliation = (dto: any) =>
  apiRequest<any>('/api/reconciliation', { method: 'POST', body: JSON.stringify(dto) });
export const reconcileTransaction = (transactionId: string, dto: any) =>
  apiRequest<any>(`/api/reconciliation/transaction/${transactionId}`, { method: 'PUT', body: JSON.stringify(dto) });
export const bulkReconcileTransactions = (dto: any) =>
  apiRequest<any>('/api/reconciliation/bulk', { method: 'PUT', body: JSON.stringify(dto) });
export const getAccountReconciliationSummary = (accountType: number, accountId: string) =>
  apiRequest<any>(`/api/reconciliation/account/${accountType}/${accountId}/summary`);
export const getAccountTransactionsForReconciliation = (accountType: number, accountId: string, page = 1, pageSize = 20) =>
  apiRequest<any>(`/api/reconciliation/account/${accountType}/${accountId}/transactions?page=${page}&pageSize=${pageSize}`);
export const getReconciliationHistory = (page = 1, pageSize = 20) =>
  apiRequest<any>('/api/reconciliation');
