import { AccountType, Currency, PaymentMethod, ReconciliationStatus, TransactionType } from "./enums";
import { type ApiResponse, type PagedResult, apiRequest } from "./core";

// ==============================================
// Transaction Types
// ==============================================

export interface TransactionDto {
  id: string;
  code: string;
  reference: string;
  transactionDate: string;
  transactionType: TransactionType;
  amount: number;
  currency: Currency;
  description: string;
  notes?: string;
  exchangeRate?: number;
  /** The destination leg's amount/currency when the two sides differ (FX). */
  counterAmount?: number | null;
  counterCurrency?: Currency | null;
  sourceAccountType: AccountType;
  sourceAccountId: string;
  sourceAccountName: string;
  sourceBalanceBefore: number;
  sourceBalanceAfter: number;
  destAccountType: AccountType;
  destAccountId: string;
  destAccountName: string;
  destBalanceBefore: number;
  destBalanceAfter: number;
  reconciliationStatus: ReconciliationStatus;
  createdAt: string;
  createdByName?: string;
  isReversed?: boolean;
  isReversal?: boolean;
}
export interface CreateTransactionDto {
  transactionType: TransactionType;
  sourceAccountType: AccountType;
  sourceAccountId: string;
  destAccountType: AccountType;
  destAccountId: string;
  amount: number;
  currency: Currency;
  counterAmount?: number;
  counterCurrency?: Currency;
  description: string;
  notes?: string;
  exchangeRate?: number;
  paymentMethod: PaymentMethod;
}
export interface TransactionResponseDto {
  id: string;
  code: string;
  reference: string;
  transactionDate: string;
  transactionType: TransactionType;
  amount: number;
  currency: Currency;
  description: string;
  notes?: string;
  exchangeRate?: number;
  sourceAccountType: AccountType;
  sourceAccountId: string;
  sourceAccountName: string;
  sourceBalanceBefore: number;
  sourceBalanceAfter: number;
  destAccountType: AccountType;
  destAccountId: string;
  destAccountName: string;
  destBalanceBefore: number;
  destBalanceAfter: number;
  counterAmount?: number;
  counterCurrency?: Currency;
  reconciliationStatus: ReconciliationStatus;
  createdAt: string;
  isReversed?: boolean;
  isReversal?: boolean;
}
// ==============================================
// Transaction API Functions
// ==============================================

export async function getTransactions(
  page: number = 1,
  pageSize: number = 10,
  filters?: {
    startDate?: string;
    endDate?: string;
    type?: number;
    currency?: number;
  },
): Promise<ApiResponse<PagedResult<TransactionDto>>> {
  let url = `/api/transaction?page=${page}&pageSize=${pageSize}`;
  if (filters) {
    if (filters.startDate) url += `&startDate=${filters.startDate}`;
    if (filters.endDate) url += `&endDate=${filters.endDate}`;
    if (filters.type !== undefined) url += `&type=${filters.type}`;
    if (filters.currency !== undefined) url += `&currency=${filters.currency}`;
  }
  return apiRequest(url);
}
export async function createTransaction(
  dto: CreateTransactionDto,
): Promise<ApiResponse<TransactionDto>> {
  return apiRequest("/api/transaction", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
export async function getTransactionById(
  id: string,
): Promise<ApiResponse<TransactionDto>> {
  return apiRequest(`/api/transaction/${id}`);
}
export async function updateTransaction(
  id: string,
  dto: { description?: string; notes?: string },
): Promise<ApiResponse<TransactionDto>> {
  return apiRequest(`/api/transaction/${id}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}
export async function deleteTransaction(
  id: string,
  reason: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/transaction/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}
// Reverse a client transaction from the client statement.
// This is the ONLY way to delete transactions involving client accounts.
// The general deleteTransaction endpoint blocks client transactions.
export async function reverseClientTransaction(
  clientId: string,
  transactionId: string,
  reason: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/client/${clientId}/transaction/${transactionId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}
export async function getTodayTransactionsSummary(): Promise<ApiResponse<any>> {
  return apiRequest("/api/transaction/today");
}
// ==================== TRANSACTION PIN (for PinModal) ====================
export async function getTransactionPinStatus() {
  return apiRequest<{ isEnabled: boolean; hasPin: boolean }>(
    "/api/transaction-pin/status",
  );
}
export async function verifyTransactionPin(pin: string) {
  return apiRequest<boolean>("/api/transaction-pin/verify", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}
