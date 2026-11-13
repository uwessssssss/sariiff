import { secureRandomHex } from "../../utils/random";
import { ApiResponse, TokenResponseDto } from "../../types";
import * as SecureStore from "expo-secure-store";
import { API_BASE, apiRequest, getToken, newIdempotencyKey } from "./core";

// ==================== PHONE LOGIN (one login, several bureaus) ====================
// Server flag Features__ClientIdentity. Off → every call below answers "not available"
// and the app shows only the classic code + password sign-in.

export interface IdentityBureauDto {
  companyId: string;
  companyName: string;
  logoUrl?: string | null;
  clientCode: string;
  clientName: string;
  baseCurrency: number;
}
export interface IdentityTokenDto {
  accessToken: string; // limited: lists, links and picks bureaus only (15 minutes)
  expiresAt: string;
  phone: string;
  deviceTrusted: boolean;
  bureaus: IdentityBureauDto[];
}
export const IDENTITY_DEVICE_KEY = "sariff_identity_device";
 // random secret, never leaves SecureStore except to the server
export const IDENTITY_PHONE_KEY = "sariff_identity_phone";
/**
 * This install's device secret for "skip the code on this phone" (created once).
 * Undefined when the phone has no secure random source or its encrypted store fails:
 * then the phone is simply not trusted and signs in with an SMS code.
 */
export async function getIdentityDeviceSecret(): Promise<string | undefined> {
  try {
    let s = await SecureStore.getItemAsync(IDENTITY_DEVICE_KEY);
    if (!s) {
      // Secure bytes only: this secret lets the phone skip the SMS code (it was Math.random
      // whenever crypto.getRandomValues was missing, which on Hermes is always).
      const fresh = secureRandomHex(24);
      if (!fresh) return undefined;
      s = fresh;
      await SecureStore.setItemAsync(IDENTITY_DEVICE_KEY, s);
    }
    return s;
  } catch {
    return undefined;
  }
}
export const getRememberedIdentityPhone = () => SecureStore.getItemAsync(IDENTITY_PHONE_KEY);
export const rememberIdentityPhone = (phone: string) => SecureStore.setItemAsync(IDENTITY_PHONE_KEY, phone);
/** Forget this phone: a new secret means the server no longer trusts this install. */
export async function forgetIdentityDevice() {
  await SecureStore.deleteItemAsync(IDENTITY_PHONE_KEY);
  await SecureStore.deleteItemAsync(IDENTITY_DEVICE_KEY);
}
export async function identityFetch<T>(path: string, method: string, token?: string, body?: unknown): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (method !== "GET") headers["Idempotency-Key"] = newIdempotencyKey();
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 404) return { success: false, message: "Phone login is not available yet.", data: null as any };
    if (res.status === 401) return { success: false, message: "Your phone sign-in expired. Start again.", data: null as any };
    return await res.json();
  } catch (e: any) {
    return { success: false, message: e?.name === "AbortError" ? "The server took too long. Try again." : "Can't reach the server.", data: null as any };
  } finally {
    clearTimeout(timeoutId);
  }
}
/** False on any error, so the classic sign-in always works. */
export async function identityEnabled(): Promise<boolean> {
  const r = await identityFetch<{ enabled: boolean }>("/api/identity/enabled", "GET");
  return !!(r.success && r.data?.enabled);
}
export const identityRequestCode = (phone: string) =>
  identityFetch<boolean>("/api/identity/request-code", "POST", undefined, { phone });
export const identityVerifyCode = (phone: string, code: string, deviceId?: string, deviceName?: string) =>
  identityFetch<IdentityTokenDto>("/api/identity/verify-code", "POST", undefined, { phone, code, deviceId, deviceName });
export const identityDeviceLogin = (phone: string, deviceId: string) =>
  identityFetch<IdentityTokenDto>("/api/identity/device-login", "POST", undefined, { phone, deviceId });
export const identityLink = (token: string, clientCode: string, password: string) =>
  identityFetch<IdentityBureauDto>("/api/identity/link", "POST", token, { clientCode, password });
export const identityPick = (token: string, companyId: string) =>
  identityFetch<TokenResponseDto>("/api/identity/select", "POST", token, { companyId });
/** Did this bureau session come from a phone login? (Then "Switch bureau" is offered.) */
export async function hasPhoneLogin(): Promise<boolean> {
  const token = await getToken();
  if (!token) return false;
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = part + "===".slice((part.length + 3) % 4);
    const g: any = globalThis as any;
    const json = typeof g.atob === "function" ? g.atob(padded) : "";
    return !!JSON.parse(json || "{}").identity_id;
  } catch {
    return false;
  }
}
// Inside the portal the bureau token carries the phone login.
export const getLinkedBureaus = () => apiRequest<IdentityBureauDto[]>("/api/identity/bureaus");
export const linkBureau = (clientCode: string, password: string) =>
  apiRequest<IdentityBureauDto>("/api/identity/link", { method: "POST", body: JSON.stringify({ clientCode, password }) });
export const switchBureauRequest = (companyId: string) =>
  apiRequest<TokenResponseDto>("/api/identity/select", { method: "POST", body: JSON.stringify({ companyId }) });
export const unlinkBureau = (companyId: string) =>
  apiRequest<boolean>(`/api/identity/bureaus/${companyId}`, { method: "DELETE" });
export const signOutEverywhere = () =>
  apiRequest<boolean>("/api/identity/sign-out-everywhere", { method: "POST" });
/** Office: cut a client's phone-login link (lost phone). Money and history stay. */
export const unlinkClientPhoneLogin = (clientId: string) =>
  apiRequest<boolean>(`/api/client/${clientId}/unlink-phone-login`, { method: "POST" });
