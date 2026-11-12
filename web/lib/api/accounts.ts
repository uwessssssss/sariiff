import { type ApiResponse, apiRequest } from "./core";
import { Currency, type CurrencyAccountTotalsDto } from "./enums";

// ==============================================
// Bank Account Types
// ==============================================

export interface BankAccountDto {
  id: string;
  code: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  branchCode?: string;
  currency: Currency;
  balance: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  isActive: boolean;
  createdAt: string;
}
export interface CreateBankAccountDto {
  bankName: string;
  accountNumber: string;
  accountName: string;
  branchCode?: string;
  currency: Currency;
  openingBalance?: number;
}
// ==============================================
// M-Pesa Agent Types
// ==============================================

export interface MpesaAgentDto {
  id: string;
  code: string;
  agentName: string;
  agentNumber: string;
  phoneNumber: string;
  storeNumber?: string;
  agentType?: number;
  balance: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  isActive: boolean;
  createdAt: string;
  /** 0 = M-Pesa, 1 = MTN MoMo, 2 = Airtel Money */
  provider?: number;
  /** The wallet's own currency: M-Pesa = KES, MTN MoMo = UGX, Airtel = home. */
  currency?: Currency;
}
export interface CreateMpesaAgentDto {
  agentName: string;
  agentNumber: string;
  phoneNumber: string;
  storeNumber?: string;
  agentType?: number;
  openingBalance?: number;
  provider?: number;
}
/** Mobile money networks an agent can belong to. */
export const MOBILE_MONEY_PROVIDERS = [
  { value: 0, label: "M-Pesa" },
  { value: 1, label: "MTN MoMo" },
  { value: 2, label: "Airtel Money" },
];
export const providerLabel = (p?: number) =>
  MOBILE_MONEY_PROVIDERS.find((x) => x.value === (p ?? 0))?.label ?? "M-Pesa";
/**
 * The currency a NEW wallet on this network holds (same rule as the server):
 * M-Pesa is Kenyan shillings even in a Ugandan bureau; MTN MoMo is MTN Uganda (UGX);
 * Airtel Money runs in both countries, so it follows the bureau's home currency.
 */
export const walletCurrency = (provider: number | undefined, home: number): number =>
  provider === 0 || provider === undefined ? Currency.KES : provider === 1 ? Currency.UGX : home;
// ==============================================
// Cash Account Types
// ==============================================

export interface CashAccountDto {
  id: string;
  name: string;
  currency: Currency;
  balance: number;
  openingBalance: number;
  isActive: boolean;
}
// Response DTO - matches backend CashAccountResponseDto
export interface CashAccountResponseDto {
  id: string;
  currency: Currency;
  balance: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  createdAt: string;
}
// Create DTO - matches backend CreateCashAccountDto
export interface CreateCashAccountDto {
  currency: Currency;
  openingBalance: number;
}
// Update DTO - matches backend UpdateCashAccountDto
export interface UpdateCashAccountDto {
  openingBalance?: number;
}
// Stats DTO - matches backend CashStatsDto
export interface CashStatsDto {
  balanceKES: number;
  openingBalanceKES: number;
  totalDebitKES: number;
  totalCreditKES: number;
  netMovementKES: number;
  balanceUSD: number;
  openingBalanceUSD: number;
  totalDebitUSD: number;
  totalCreditUSD: number;
  netMovementUSD: number;
  /** Every cash currency held (KES, USD, UGX, EUR) */
  byCurrency?: CurrencyAccountTotalsDto[] | null;
}
// ==============================================
// Bank Account API Functions
// ==============================================

export async function getBankAccounts(): Promise<
  ApiResponse<BankAccountDto[]>
> {
  return apiRequest("/api/bank");
}
export async function getBankAccountById(
  id: string,
): Promise<ApiResponse<BankAccountDto>> {
  return apiRequest(`/api/bank/${id}`);
}
export async function createBankAccount(
  dto: CreateBankAccountDto,
): Promise<ApiResponse<BankAccountDto>> {
  return apiRequest("/api/bank", { method: "POST", body: JSON.stringify(dto) });
}
export async function updateBankAccount(
  id: string,
  dto: Partial<BankAccountDto>,
): Promise<ApiResponse<BankAccountDto>> {
  return apiRequest(`/api/bank/${id}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}
export async function deleteBankAccount(
  id: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/bank/${id}`, { method: "DELETE" });
}
export async function getBankAccountStatement(
  id: string,
  startDate?: string,
  endDate?: string,
): Promise<ApiResponse<any>> {
  let url = `/api/bank/${id}/statement`;
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  if (params.toString()) url += `?${params.toString()}`;
  return apiRequest(url);
}
export async function getBankStats(): Promise<ApiResponse<any>> {
  return apiRequest("/api/bank/stats");
}
// ==============================================
// M-Pesa Agent API Functions
// ==============================================

export async function getMpesaAgents(): Promise<ApiResponse<MpesaAgentDto[]>> {
  return apiRequest("/api/mpesa");
}
export async function getMpesaAgentById(
  id: string,
): Promise<ApiResponse<MpesaAgentDto>> {
  return apiRequest(`/api/mpesa/${id}`);
}
export async function createMpesaAgent(
  dto: CreateMpesaAgentDto,
): Promise<ApiResponse<MpesaAgentDto>> {
  return apiRequest("/api/mpesa", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
export async function updateMpesaAgent(
  id: string,
  dto: Partial<MpesaAgentDto>,
): Promise<ApiResponse<MpesaAgentDto>> {
  return apiRequest(`/api/mpesa/${id}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}
export async function deleteMpesaAgent(
  id: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/mpesa/${id}`, { method: "DELETE" });
}
export async function getMpesaAgentStatement(
  id: string,
  startDate?: string,
  endDate?: string,
): Promise<ApiResponse<any>> {
  let url = `/api/mpesa/${id}/statement`;
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  if (params.toString()) url += `?${params.toString()}`;
  return apiRequest(url);
}
export async function getMpesaStats(): Promise<ApiResponse<any>> {
  return apiRequest("/api/mpesa/stats");
}
// ==============================================
// Cash Account API Functions
// ==============================================

export async function getCashAccounts(): Promise<
  ApiResponse<CashAccountDto[]>
> {
  return apiRequest("/api/cash");
}
export async function getCashAccountStatement(
  currency: number,
  startDate?: string,
  endDate?: string,
): Promise<ApiResponse<any>> {
  let url = `/api/cash/statement/${currency}`;
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  if (params.toString()) url += `?${params.toString()}`;
  return apiRequest(url);
}
export async function getCashStats(): Promise<ApiResponse<any>> {
  return apiRequest("/api/cash/stats");
}
/**
 * Create a new cash account
 */
export async function createCashAccount(
  dto: CreateCashAccountDto,
): Promise<ApiResponse<CashAccountResponseDto>> {
  return apiRequest("/api/cash", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
/**
 * Get a specific cash account by ID
 */
export async function getCashAccountById(
  id: string,
): Promise<ApiResponse<CashAccountResponseDto>> {
  return apiRequest(`/api/cash/${id}`);
}
/**
 * Get cash account by currency
 */
export async function getCashAccountByCurrency(
  currency: Currency,
): Promise<ApiResponse<CashAccountResponseDto>> {
  return apiRequest(`/api/cash/currency/${currency}`);
}
/**
 * Update a cash account (opening balance)
 */
export async function updateCashAccount(
  id: string,
  dto: UpdateCashAccountDto,
): Promise<ApiResponse<CashAccountResponseDto>> {
  return apiRequest(`/api/cash/${id}`, {
    method: "PUT",
    body: JSON.stringify(dto),
  });
}
/**
 * Delete a cash account (soft delete)
 */
export async function deleteCashAccount(
  id: string,
): Promise<ApiResponse<boolean>> {
  return apiRequest(`/api/cash/${id}`, {
    method: "DELETE",
  });
}
