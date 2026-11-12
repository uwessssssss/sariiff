import { CreateExchangeDto, ExchangeFloatDto, ExchangeRateDto, ExchangeTransactionDto, PagedResult } from "../../types";
import { apiRequest } from "./core";

// ==================== EXCHANGE ====================
/** Active rate for a foreign currency (USD by default). */
export const getCurrentExchangeRate = (currency?: number) =>
  apiRequest<ExchangeRateDto>(`/api/exchange/rate${currency !== undefined ? `?currency=${currency}` : ""}`);
/** Rates are per foreign currency (KES per 1 unit); USD when omitted. */
export const setExchangeRate = (buyRate: number, sellRate: number, foreignCurrency?: number) =>
  apiRequest<ExchangeRateDto>("/api/exchange/rate", {
    method: "POST",
    body: JSON.stringify({ buyRate, sellRate, foreignCurrency }),
  });
export const getExchangeFloat = () =>
  apiRequest<ExchangeFloatDto>("/api/exchange/float");
export const createExchange = (dto: CreateExchangeDto) =>
  apiRequest<ExchangeTransactionDto>("/api/exchange/transaction", {
    method: "POST",
    body: JSON.stringify(dto),
  });
export const getExchangeTransactions = (page = 1, pageSize = 20) =>
  apiRequest<PagedResult<ExchangeTransactionDto>>(
    `/api/exchange/transactions?page=${page}&pageSize=${pageSize}`
  );
// ==================== EXCHANGE (full operations) ====================
export const voidExchange = (id: string, reason: string) =>
  apiRequest<any>(`/api/exchange/transaction/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
export const fundExchangeFloat = (dto: any) =>
  apiRequest<any>('/api/exchange/float/fund', { method: 'POST', body: JSON.stringify(dto) });
export const withdrawExchangeFloat = (dto: any) =>
  apiRequest<any>('/api/exchange/float/withdraw', { method: 'POST', body: JSON.stringify(dto) });
export const settleExchangeProfit = (dto: any) =>
  apiRequest<any>('/api/exchange/float/settle-profit', { method: 'POST', body: JSON.stringify(dto) });
export const getUsdPosition = () => apiRequest<any>('/api/exchange/position/usd');
// endpoint not available: export const getExchangeAlerts = () => apiRequest<any>('/api/exchange/alerts');
export const getExchangeRateHistory = () => apiRequest<any>('/api/exchange/rate/history');
export const getExchangeById = (id: string) => apiRequest<any>(`/api/exchange/transaction/${id}`);
export const calculateExchange = (direction: number, amount: number, foreignCurrency?: number) =>
  apiRequest<any>('/api/exchange/calculate', { method: 'POST', body: JSON.stringify({ direction, amount, foreignCurrency }) });
export const getExchangeDailySummaries = (from?: string, to?: string) => {
  let url = '/api/exchange/daily/summaries';
  const p: string[] = [];
  if (from) p.push(`startDate=${from}`);
  if (to) p.push(`endDate=${to}`);
  if (p.length) url += `?${p.join('&')}`;
  return apiRequest<any>(url);
};
export const getExchangeTodaySummary = () => apiRequest<any>('/api/exchange/daily/today');
export const getExchangeProfitReport = (from: string, to: string) =>
  apiRequest<any>(`/api/exchange/reports/profit?from=${from}&to=${to}`);
export const getFloatMovements = (page = 1, pageSize = 20) =>
  apiRequest<any>(`/api/exchange/float/movements?page=${page}&pageSize=${pageSize}`);
export const recordOpeningFloat = (dto: any) =>
  apiRequest<any>('/api/exchange/daily/opening', { method: 'POST', body: JSON.stringify(dto) });
export const recordClosingFloat = (dto: any) =>
  apiRequest<any>('/api/exchange/daily/closing', { method: 'POST', body: JSON.stringify(dto) });
export const updateExchangeAlertThresholds = (dto: any) =>
  apiRequest<any>('/api/exchange/alerts/thresholds', { method: 'PUT', body: JSON.stringify(dto) });
// ==================== DAILY FLOAT SUMMARIES ====================
export const getTodayFloatSummary = () =>
  apiRequest<any>('/api/exchange/daily/today');
export const getFloatHistory = (from: string, to: string) =>
  apiRequest<any[]>(`/api/exchange/daily/summaries?from=${from}&to=${to}`);
