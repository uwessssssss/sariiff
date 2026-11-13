import { apiRequest } from "./core";

// ==================== REPORTS ====================
export const getDailyReport = (date: string) =>
  apiRequest<any>(`/api/report/daily?date=${date}`);
export const getExchangeSummary = (date: string) =>
  apiRequest<any>(`/api/exchange/daily/summaries?from=${date}&to=${date}`);
// ==================== REPORTS ====================
export const getAccountSummary = () => apiRequest<any>('/api/report/account-summary');
export const getProfitLoss = (from: string, to: string) =>
  apiRequest<any>(`/api/exchange/reports/profit?from=${from}&to=${to}`);
export const getLargeTransactions = (from: string, to: string, threshold = 500000) =>
  apiRequest<any>(`/api/exchange/reports/large-transactions?from=${from}&to=${to}&threshold=${threshold}`);
export const getTodayTransactionsSummary = () => apiRequest<any>('/api/transaction/today');
