import { DashboardStatsDto, TransactionDto } from "../../types";
import { apiRequest } from "./core";

// ==================== DASHBOARD ====================
export const getDashboardStats = () =>
  apiRequest<DashboardStatsDto>("/api/dashboard");
// Currencies this company actually uses (for display — pickers still show all),
// so a Ugandan (UGX/USD) bureau never sees empty KES blocks, etc.
export const getCompanyCurrencies = () =>
  apiRequest<{
    currencies: { currency: number; code: string; value: number }[];
    /** Home currency: rates are "base per 1 foreign" and profit is in it (wallets hold their network's currency) */
    baseCurrency?: number;
    baseCurrencyCode?: string;
  }>("/api/dashboard/currencies");
export const getRecentTransactions = (count = 50) =>
  apiRequest<TransactionDto[]>(
    `/api/transaction/recent?count=${count}`
  );
