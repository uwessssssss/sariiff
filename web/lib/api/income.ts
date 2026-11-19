import { type ApiResponse, apiRequest } from "./core";
import { type AccountType, type Currency } from "./enums";

// ==============================================
// Income: mobile money commission (recorded gross; the tax the network keeps is a
// credit to claim back) and the income / float summary, per currency.
// ==============================================

export interface RecordCommissionDto {
  destAccountType: AccountType; // the wallet (or bank / till) the net landed in
  destAccountId: string;
  currency: Currency | number; // the wallet's own currency
  grossAmount: number; // commission earned
  withholdingTax: number; // kept by the network
  date?: string;
  reference?: string; // the network's statement reference
  notes?: string;
}

export interface IncomeCurrencyDto {
  currency: Currency;
  commissionGross: number;
  withholdingTax: number;
  commissionNet: number;
  feeIncome: number;
  otherIncome: number;
  totalIncome: number;
  withholdingTaxRecoverable: number; // all time
  eFloat: number; // active wallets now
  cashOnHand: number; // cash tills now
}

export interface IncomeSummaryDto {
  fromUtc: string;
  toUtcExclusive: string;
  byCurrency: IncomeCurrencyDto[];
}

export async function recordCommission(dto: RecordCommissionDto): Promise<ApiResponse<any>> {
  return apiRequest("/api/income/commission", { method: "POST", body: JSON.stringify(dto) });
}

export async function getIncomeSummary(startDate?: string, endDate?: string): Promise<ApiResponse<IncomeSummaryDto>> {
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  const q = params.toString();
  return apiRequest(`/api/income/summary${q ? `?${q}` : ""}`);
}
