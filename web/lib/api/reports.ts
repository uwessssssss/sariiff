import { type ApiResponse, apiRequest } from "./core";

// ==============================================
// Report API Functions
// ==============================================

export async function getDailyReport(date: string): Promise<ApiResponse<any>> {
  return apiRequest(`/api/report/daily?date=${date}`);
}
export async function getMonthlyReport(
  year: number,
  month: number,
): Promise<ApiResponse<any>> {
  // Backend has no monthly endpoint. Use transaction report with month date range.
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
  return apiRequest(
    `/api/report/transactions?startDate=${startDate}&endDate=${endDate}`,
  );
}
export async function getClientStatementReport(
  clientId: string,
  startDate: string,
  endDate: string,
): Promise<ApiResponse<any>> {
  // Backend has no /api/report/client-statement. Use the client statement endpoint.
  return apiRequest(
    `/api/client/${clientId}/statement?startDate=${startDate}&endDate=${endDate}`,
  );
}
