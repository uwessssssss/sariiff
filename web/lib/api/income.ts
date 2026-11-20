import { type ApiResponse, apiRequest } from "./core";
import { type AccountType, type Currency } from "./enums";

// ==============================================
// Income: accounts the bureau names itself ("Commission", "Rent received"...), income received
// into them (Dr till/bank/wallet or client, Cr the income account), statements, and the summary.
// ==============================================

export interface CurrencyAmount { currency: Currency; currencyCode: string; amount: number }

export interface IncomeAccountDto {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  postings: number;
  totals: CurrencyAmount[]; // earned per currency, all time
}

export interface RecordIncomeDto {
  incomeAccountId: string;
  destAccountType: AccountType | number; // till, bank, wallet, or a client (a fee)
  destAccountId: string;
  currency: Currency | number;
  amount: number;
  date?: string;
  description?: string;
  reference?: string;
  notes?: string;
}

export interface IncomeLineDto { id: string; name: string; amount: number; postings: number }

export interface IncomeCurrencyDto {
  currency: Currency;
  totalIncome: number; // in the period
  byAccount: IncomeLineDto[];
  eFloat: number; // active wallets now
  cashOnHand: number; // cash tills now
}

export interface IncomeSummaryDto { fromUtc: string; toUtcExclusive: string; byCurrency: IncomeCurrencyDto[] }

export interface IncomeStatementLineDto {
  transactionId: string;
  code: string;
  date: string;
  description: string;
  reference?: string | null;
  receivedInto: string;
  amount: number; // + income, − reversal
  runningTotal: number;
  isReversal: boolean;
  isReversed: boolean;
  receivedIntoType: number; // 3 = a client: reversed through the client's statement
  receivedIntoId: string;
}

export interface IncomeStatementCurrencyDto { currency: Currency; opening: number; inPeriod: number; closing: number; lines: IncomeStatementLineDto[] }

export interface IncomeStatementDto {
  accountId: string;
  accountName: string;
  description?: string | null;
  isActive: boolean;
  fromUtc?: string | null;
  toUtcExclusive: string;
  byCurrency: IncomeStatementCurrencyDto[];
}

const qs = (startDate?: string, endDate?: string) => {
  const p = new URLSearchParams();
  if (startDate) p.append("startDate", startDate);
  if (endDate) p.append("endDate", endDate);
  const q = p.toString();
  return q ? `?${q}` : "";
};

export async function getIncomeAccounts(): Promise<ApiResponse<IncomeAccountDto[]>> {
  return apiRequest("/api/income/accounts");
}
export async function createIncomeAccount(dto: { name: string; description?: string }): Promise<ApiResponse<IncomeAccountDto>> {
  return apiRequest("/api/income/accounts", { method: "POST", body: JSON.stringify(dto) });
}
export async function updateIncomeAccount(id: string, dto: { name?: string; description?: string; isActive?: boolean }): Promise<ApiResponse<IncomeAccountDto>> {
  return apiRequest(`/api/income/accounts/${id}`, { method: "PUT", body: JSON.stringify(dto) });
}
export async function deleteIncomeAccount(id: string): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/income/accounts/${id}`, { method: "DELETE" });
}
export async function getIncomeStatement(id: string, startDate?: string, endDate?: string): Promise<ApiResponse<IncomeStatementDto>> {
  return apiRequest(`/api/income/accounts/${id}/statement${qs(startDate, endDate)}`);
}
export async function recordIncome(dto: RecordIncomeDto): Promise<ApiResponse<any>> {
  return apiRequest("/api/income", { method: "POST", body: JSON.stringify(dto) });
}
export async function getIncomeSummary(startDate?: string, endDate?: string): Promise<ApiResponse<IncomeSummaryDto>> {
  return apiRequest(`/api/income/summary${qs(startDate, endDate)}`);
}
