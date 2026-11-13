import { ApiResponse } from "../../types";
import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Production / any build that sets a real extra.apiBaseUrl uses it on BOTH platforms.
// A placeholder or non-http value is ignored so local dev falls back to the dev URLs below.
export const RAW_CONFIG_URL = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined;
export const CONFIG_URL =
  RAW_CONFIG_URL && RAW_CONFIG_URL.startsWith("http") && !RAW_CONFIG_URL.includes("YOUR-BACKEND")
    ? RAW_CONFIG_URL
    : undefined;
// Local dev fallbacks:
//   physical Android device  -> your machine's LAN IP
//   Android emulator         -> set extra.apiBaseUrl to "http://10.0.2.2:8080"
//   iOS simulator            -> localhost
export const API_BASE =
  CONFIG_URL ??
  (Platform.OS === "android" ? "http://192.168.0.122:8080" : "http://localhost:8080");
// Guard: in a release build the local fallback can never reach a real device,
// so every request would fail with a confusing "network request failed".
// Surface the misconfiguration loudly instead of failing silently.
if (!CONFIG_URL && !__DEV__) {
  console.warn(
    "[SARIFF] No apiBaseUrl configured — using a LOCAL dev URL that will not work on a real device. Set extra.apiBaseUrl in app config.",
  );
}
// ==================== SESSION EXPIRED CALLBACK ====================
export let _onSessionExpired: (() => void) | null = null;
export function setSessionExpiredCallback(cb: () => void) { _onSessionExpired = cb; }
// ==================== AUTH STORAGE ====================
export const TOKEN_KEY = "sariff_token";
export const REFRESH_KEY = "sariff_refresh";
export const USER_KEY = "sariff_user";
export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY);
}
export async function getStoredUser() {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}
export async function storeAuth(
  token: string,
  refreshToken: string,
  user: any
) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}
export async function clearAuth() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}
// ==================== HTTP CLIENT ====================
// ---- Idempotency (see the web app's lib/api.ts) ---------------------------
export const newIdempotencyKey = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
/** Stable for an identical re-press, new as soon as the payload changes. */
export function submissionKey(sessionKey: string, payload: unknown): string {
  const text = JSON.stringify(payload) ?? "";
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${sessionKey}-${(h >>> 0).toString(36)}`;
}
export let pinnedKey: string | null = null;
/** Run `fn` with one fixed Idempotency-Key for its write (one per form submission). */
export async function withIdempotencyKey<R>(key: string, fn: () => Promise<R>): Promise<R> {
  pinnedKey = key;
  try {
    return await fn();
  } finally {
    pinnedKey = null;
  }
}
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const method = (options.method || "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD";
  const key = isRead ? null : pinnedKey ?? newIdempotencyKey(); // read before any await
  const token = await getToken();

  const controller = new AbortController();
  // Writes get longer: a Render cold start can take ~30 s, and timing out early
  // made people press Save again while the first save was still running.
  const timeoutId = setTimeout(() => controller.abort(), isRead ? 15000 : 30000);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (key) headers["Idempotency-Key"] = key;

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Token expired — try refresh
    if (response.status === 401 && token) {
      // Another request may already have refreshed: replay with the new token.
      const latest = await getToken();
      const refreshed = latest && latest !== token ? latest : await refreshAuthOnce();
      if (refreshed) {
        headers["Authorization"] = `Bearer ${refreshed}`;
        const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers,
          signal: controller.signal,
        });
        return readJson<T>(retryResponse);
      }
      // Refresh failed — clear stale auth, force re-login
      await clearAuth();
      if (_onSessionExpired) _onSessionExpired();
      return {
        success: false,
        message: "Session expired. Please login again.",
        data: null as any,
      };
    }

    return await readJson<T>(response);
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      return {
        success: false,
        message: isRead
          ? "Request timed out. Check your connection."
          : "No reply from the server yet — it may still have saved this. Check the list before trying again.",
        data: null as any,
      };
    }

    return {
      success: false,
      message: error.message || "Network error",
      data: null as any,
    };
  }
}
/**
 * The reply as JSON. Render answers a cold start or an outage with an HTML page (502/503):
 * response.json() then threw "JSON Parse error: Unexpected character: <", which is what
 * the screen showed.
 */
async function readJson<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      message: response.status >= 500
        ? "The server is starting up or unavailable. Wait a moment and try again."
        : `Unexpected reply from the server (${response.status}).`,
      data: null as any,
    };
  }
}
// Single-flight: the API rotates the refresh token on use, so parallel 401s
// must share ONE refresh instead of each spending the same token.
export let refreshInFlight: Promise<string | null> | null = null;
export function refreshAuthOnce(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshTokenRequest().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}
export async function refreshTokenRequest(): Promise<string | null> {
  try {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.success && data.data?.accessToken) {
      await SecureStore.setItemAsync(TOKEN_KEY, data.data.accessToken);
      // Backend issues a new refresh token — must store it or next refresh fails
      if (data.data.refreshToken) {
        await SecureStore.setItemAsync(REFRESH_KEY, data.data.refreshToken);
      }
      return data.data.accessToken;
    }

    return null;
  } catch {
    return null;
  }
}
