import { API_BASE_URL, type ApiResponse, apiRequest, getStoredAuth, newIdempotencyKey } from "./core";
import type { TokenResponseDto } from "./auth";

// ==============================================
// Phone login: one login, several bureaus
// (switched on by the server flag Features__ClientIdentity)
// ==============================================

export interface IdentityBureauDto {
  companyId: string;
  companyName: string;
  logoUrl?: string | null;
  clientCode: string;
  clientName: string;
  baseCurrency: number;
}
export interface IdentityTokenDto {
  accessToken: string; // limited: only lists, links and picks bureaus (15 minutes)
  expiresAt: string;
  phone: string;
  deviceTrusted: boolean;
  bureaus: IdentityBureauDto[];
}
/** Calls made with the short phone-login token (before a bureau is picked). */
export async function identityFetch<T>(path: string, method: string, token?: string, body?: unknown): Promise<ApiResponse<T>> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (method !== "GET") headers["Idempotency-Key"] = newIdempotencyKey();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 404) return { success: false, message: "Phone login is not available yet.", data: null };
    if (response.status === 401) return { success: false, message: "Your phone sign-in expired. Start again.", data: null };
    return await response.json();
  } catch (error: any) {
    return { success: false, message: error?.message || "Network error — cannot reach server", data: null };
  }
}
/** Is phone login switched on? False on any error, so the classic login always works. */
export async function identityEnabled(): Promise<boolean> {
  const r = await identityFetch<{ enabled: boolean }>("/api/identity/enabled", "GET");
  return !!(r.success && r.data?.enabled);
}
export const identityRequestCode = (phone: string) =>
  identityFetch<boolean>("/api/identity/request-code", "POST", undefined, { phone });
export const identityVerifyCode = (phone: string, code: string, deviceId?: string, deviceName?: string) =>
  identityFetch<IdentityTokenDto>("/api/identity/verify-code", "POST", undefined, { phone, code, deviceId, deviceName });
export const identityLink = (token: string, clientCode: string, password: string) =>
  identityFetch<IdentityBureauDto>("/api/identity/link", "POST", token, { clientCode, password });
export const identityPick = (token: string, companyId: string) =>
  identityFetch<TokenResponseDto>("/api/identity/select", "POST", token, { companyId });
/** The phone login behind the signed-in bureau token, or null for a code+password sign-in. */
export function phoneLoginId(): string | null {
  const token = getStoredAuth()?.token;
  if (!token) return null;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const id = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "="))).identity_id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}
/** Did this bureau session come from a phone login? (Then "Switch bureau" is offered.) */
export const hasPhoneLogin = (): boolean => phoneLoginId() !== null;
// From inside the portal: the normal bureau token carries the phone login, so these
// go through apiRequest (refresh included).
export const getLinkedBureaus = () => apiRequest<IdentityBureauDto[]>("/api/identity/bureaus");
export const linkBureau = (clientCode: string, password: string) =>
  apiRequest<IdentityBureauDto>("/api/identity/link", { method: "POST", body: JSON.stringify({ clientCode, password }) });
export const switchBureau = (companyId: string) =>
  apiRequest<TokenResponseDto>("/api/identity/select", { method: "POST", body: JSON.stringify({ companyId }) });
export const unlinkBureau = (companyId: string) =>
  apiRequest<boolean>(`/api/identity/bureaus/${companyId}`, { method: "DELETE" });
export const signOutEverywhere = () =>
  apiRequest<boolean>("/api/identity/sign-out-everywhere", { method: "POST" });
/** Office: cut a client's phone-login link (lost phone). Money and history stay. */
export const unlinkClientPhoneLogin = (clientId: string) =>
  apiRequest<boolean>(`/api/client/${clientId}/unlink-phone-login`, { method: "POST" });
