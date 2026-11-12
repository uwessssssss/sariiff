import { apiRequest } from "./core";

// ==================== BALANCE ALERTS ====================
export async function getBalanceAlerts(clientId?: string) {
  return apiRequest<any>(
    `/api/balance-alerts${clientId ? `?clientId=${clientId}` : ""}`,
  );
}
export async function createBalanceAlert(dto: {
  clientId?: string;
  currency: number;
  direction: number;
  threshold: number;
  notifyAllOfficeUsers?: boolean;
}) {
  return apiRequest<any>("/api/balance-alerts", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
export async function toggleBalanceAlert(id: string) {
  return apiRequest<any>(`/api/balance-alerts/${id}/toggle`, { method: "PUT" });
}
export async function deleteBalanceAlert(id: string) {
  return apiRequest<any>(`/api/balance-alerts/${id}`, { method: "DELETE" });
}
