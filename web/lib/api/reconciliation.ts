import { AccountType, Currency, ReconciliationStatus, TransactionType } from "./enums";
import { type ApiResponse, type PagedResult, apiRequest } from "./core";

// ==============================================
// Reconciliation Types - ALIGNED WITH BACKEND DTOs
// ==============================================

// Matches AccountReconciliationSummaryDto from backend
export interface AccountReconciliationSummaryDto {
  id: string;
  code: string;
  name: string;
  accountType: AccountType;
  currency: Currency;
  balance: number;
  pendingCount: number;
  matchedCount: number;
  unmatchedCount: number;
}
// Matches TransactionReconciliationDto from backend
export interface TransactionReconciliationDto {
  id: string;
  code: string;
  reference: string;
  transactionDate: string;
  transactionType: TransactionType;
  amount: number;
  actualAmount: number | null;
  variance: number | null;
  currency: Currency;
  description: string;
  reconciliationStatus: ReconciliationStatus;
  reconciledAt: string | null;
  reconciledByName: string | null;
  reconciliationNotes: string | null;
  sourceAccountType: AccountType;
  sourceAccountId: string;
}
// Matches AccountReconciliationBalanceDto from backend
export interface AccountReconciliationBalanceDto {
  expectedBalance: number;
  actualBalance: number;
  variance: number;
  pendingCount: number;
  matchedCount: number;
  unmatchedCount: number;
  pendingAmount: number;
  matchedAmount: number;
  unmatchedAmount: number;
}
// Matches ReconcileTransactionDto for PUT request
export interface ReconcileTransactionDto {
  actualAmount: number;
  status: ReconciliationStatus;
  notes?: string;
}
// Matches BulkReconcileDto for PUT request
export interface BulkReconcileDto {
  transactionIds: string[];
  status: ReconciliationStatus;
  notes?: string;
}
// Matches CreateReconciliationDto for POST request
export interface CreateReconciliationDto {
  accountType: AccountType;
  accountId: string;
  actualBalance: number;
  notes?: string;
}
// Matches ReconciliationResponseDto from backend
export interface ReconciliationResponseDto {
  id: string;
  accountType: AccountType;
  accountId: string;
  accountName: string;
  currency: Currency;
  expectedBalance: number;
  actualBalance: number;
  variance: number;
  status: ReconciliationStatus;
  notes: string | null;
  reconciledAt: string | null;
  createdAt: string;
}
// Reconciliation filter DTO
export interface ReconciliationFilterDto {
  status?: ReconciliationStatus;
  startDate?: string;
  endDate?: string;
}
// Legacy ReconciliationDto
export interface ReconciliationDto {
  id: string;
  accountType: AccountType;
  accountId: string;
  accountName: string;
  systemBalance: number;
  actualBalance: number;
  variance: number;
  status: ReconciliationStatus;
  reconciledAt?: string;
  reconciledByName?: string;
  notes?: string;
}
// ==============================================
// Reconciliation API Functions - FULL IMPLEMENTATION
// ==============================================

// Get all accounts with reconciliation stats
export async function getReconciliationAccounts(): Promise<
  ApiResponse<AccountReconciliationSummaryDto[]>
> {
  return apiRequest("/api/reconciliation/accounts");
}
// Get transactions for a specific account
export async function getAccountTransactionsForReconciliation(
  accountType: AccountType,
  accountId: string,
  filter?: ReconciliationFilterDto,
  page: number = 1,
  pageSize: number = 50,
): Promise<ApiResponse<PagedResult<TransactionReconciliationDto>>> {
  const params = new URLSearchParams();
  if (filter?.status !== undefined)
    params.append("status", filter.status.toString());
  if (filter?.startDate) params.append("startDate", filter.startDate);
  if (filter?.endDate) params.append("endDate", filter.endDate);
  params.append("page", page.toString());
  params.append("pageSize", pageSize.toString());

  return apiRequest(
    `/api/reconciliation/account/${accountType}/${accountId}/transactions?${params.toString()}`,
  );
}
// Get account balance summary for reconciliation
export async function getAccountReconciliationSummary(
  accountType: AccountType,
  accountId: string,
): Promise<ApiResponse<AccountReconciliationBalanceDto>> {
  return apiRequest(
    `/api/reconciliation/account/${accountType}/${accountId}/summary`,
  );
}
// Reconcile a single transaction
export async function reconcileTransaction(
  transactionId: string,
  dto: ReconcileTransactionDto,
): Promise<ApiResponse<TransactionReconciliationDto>> {
  return apiRequest(`/api/reconciliation/transaction/${transactionId}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}
// Bulk reconcile multiple transactions
export async function bulkReconcileTransactions(
  dto: BulkReconcileDto,
): Promise<ApiResponse<number>> {
  return apiRequest("/api/reconciliation/bulk", {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}
// Create/complete a reconciliation record
export async function createReconciliationRecord(
  dto: CreateReconciliationDto,
): Promise<ApiResponse<ReconciliationResponseDto>> {
  return apiRequest("/api/reconciliation", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
// Get reconciliation history
export async function getReconciliationHistory(
  accountType?: AccountType,
  page: number = 1,
  pageSize: number = 20,
): Promise<ApiResponse<PagedResult<ReconciliationResponseDto>>> {
  const params = new URLSearchParams();
  if (accountType !== undefined)
    params.append("accountType", accountType.toString());
  params.append("page", page.toString());
  params.append("pageSize", pageSize.toString());

  return apiRequest(`/api/reconciliation?${params.toString()}`);
}
// Complete a reconciliation (mark as finalized)
export async function completeReconciliation(
  reconciliationId: string,
): Promise<ApiResponse<ReconciliationResponseDto>> {
  return apiRequest(`/api/reconciliation/${reconciliationId}/complete`, {
    method: "POST",
  });
}
// Legacy function - kept for backwards compatibility
export async function getReconciliations(
  page: number = 1,
  pageSize: number = 10,
): Promise<ApiResponse<PagedResult<ReconciliationDto>>> {
  return apiRequest(`/api/reconciliation?page=${page}&pageSize=${pageSize}`);
}
// Legacy function - kept for backwards compatibility
export async function createReconciliation(
  dto: any,
): Promise<ApiResponse<ReconciliationDto>> {
  return apiRequest("/api/reconciliation", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
