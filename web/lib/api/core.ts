import type { TokenResponseDto, UserInfoDto } from "./auth";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
// ==============================================
// Type Definitions
// ==============================================

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}
export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
// ==============================================
// Auth Token Management
// ==============================================

export interface StoredAuth {
  token: string;
  refreshToken: string;
  user: UserInfoDto;
  expiresAt: string;
}
export function getStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;

  const authStr = localStorage.getItem("sariff_auth");
  if (!authStr) return null;

  try {
    return JSON.parse(authStr);
  } catch {
    return null;
  }
}
export function setStoredAuth(auth: StoredAuth): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("sariff_auth", JSON.stringify(auth));

  const expiryDate = auth.expiresAt
    ? new Date(auth.expiresAt)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const expires = expiryDate.toUTCString();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `auth_token=${auth.token}; path=/; expires=${expires}; SameSite=Lax${secure}`;

  const roleMap: Record<number, string> = {
    0: "super-admin",
    1: "office-user",
    2: "client",
  };
  const roleName = roleMap[auth.user.role] || "client";
  document.cookie = `user_role=${roleName}; path=/; expires=${expires}; SameSite=Lax${secure}`;
}
export function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("sariff_auth");
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  document.cookie = `auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
  document.cookie = `user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}
export function getCompanyId(): string | undefined {
  const auth = getStoredAuth();
  return auth?.user?.companyId;
}
// ==============================================
// API Request Helper
// ==============================================

// Small delay helper used for retry backoff
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
// ---- Idempotency ---------------------------------------------------------
// Every POST/PUT/PATCH/DELETE carries an Idempotency-Key. The API stores the
// first response per key, so a retried or double-submitted request returns
// that response instead of recording the money movement twice.
export const newIdempotencyKey = (): string =>
  typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function"
    ? (crypto as any).randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export let pinnedKey: string | null = null;
/**
 * Run `fn` with one fixed key for its mutating request. A form keeps one key per
 * submission, so pressing Save again after a timeout returns the first result
 * (or "already processing") instead of creating a duplicate. New key after success.
 */
/**
 * Key for one form submission: stable for an identical re-press (so a retry
 * after a timeout is recognised), different as soon as the payload changes.
 */
export function submissionKey(sessionKey: string, payload: unknown): string {
  const text = JSON.stringify(payload) ?? "";
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${sessionKey}-${(h >>> 0).toString(36)}`;
}
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
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const auth = getStoredAuth();
  const method = (options.method || "GET").toUpperCase();
  const isRead = method === "GET" || method === "HEAD";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (!isRead && !headers["Idempotency-Key"]) {
    // read synchronously, before any await, so concurrent calls can't swap keys
    headers["Idempotency-Key"] = pinnedKey ?? newIdempotencyKey();
  }

  if (auth?.token) {
    headers["Authorization"] = `Bearer ${auth.token}`;
  }

  // CompanyId and UserId are now extracted from JWT by the backend middleware.
  // Sending X-Company-Id / X-User-Id headers was removed as a security fix.

  const MAX_ATTEMPTS = 3; // total tries on a network failure / timeout / 5xx
  const TIMEOUT_MS = 30000; // per-attempt timeout (covers Render cold starts)

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Token expired -> refresh once, then replay the request
      if (response.status === 401 && auth?.refreshToken) {
        // Another request may already have refreshed while this one was in
        // flight: then just replay with the new token instead of spending the
        // (now revoked) old refresh token.
        const latest = getStoredAuth();
        const refreshed =
          latest?.token && latest.token !== auth.token
            ? { accessToken: latest.token }
            : await refreshAuthOnce(auth.refreshToken);
        if (refreshed) {
          headers["Authorization"] = `Bearer ${refreshed.accessToken}`;
          const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers,
          });
          return await retryResponse.json();
        } else {
          clearStoredAuth();
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
          return { success: false, message: "Session expired", data: null };
        }
      }

      // Server error (e.g. Render still waking) -> wait and retry.
      // Reads only: a write is never re-sent automatically (its key would make
      // a re-send safe, but the user should see the failure and decide).
      if (response.status >= 500 && isRead && attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 800);
        continue;
      }

      // Got a real response -> parse and return (don't retry 2xx/4xx)
      try {
        return await response.json();
      } catch {
        return {
          success: false,
          message:
            "The server returned an unexpected response. Please try again.",
          data: null,
        };
      }
    } catch (error: any) {
      // AbortError = timeout; TypeError = "failed to fetch" / connection closed.
      // Both are worth retrying on a slow or unstable connection.
      const isRetryable =
        error?.name === "AbortError" || error?.name === "TypeError";

      if (isRetryable && isRead && attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 800); // backoff: 0.8s, then 1.6s
        continue;
      }

      if (error?.name === "AbortError") {
        return {
          success: false,
          message: isRead
            ? "The server is taking too long to respond (it may be waking up). Please try again."
            : "No reply from the server yet — it may still have saved this. Check the list before trying again.",
          data: null,
        };
      }
      return {
        success: false,
        message:
          "Couldn't reach the server — your connection may be slow or offline. Please try again.",
        data: null,
      };
    }
  }

  return {
    success: false,
    message: "Network error — please check your connection and try again.",
    data: null,
  };
}
// Single-flight refresh: when the token expires, the dashboard's parallel
// requests all get 401 at once. The API rotates (revokes) the refresh token on
// use, so only ONE refresh may run; everyone else waits for its result.
export let refreshInFlight: Promise<{ accessToken: string } | null> | null = null;
export function refreshAuthOnce(refreshTokenValue: string): Promise<{ accessToken: string } | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshToken(refreshTokenValue).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}
export async function refreshToken(
  refreshTokenValue: string,
): Promise<{ accessToken: string } | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshTokenValue }),
    });

    if (!response.ok) return null;

    const result: ApiResponse<TokenResponseDto> = await response.json();
    if (result.success && result.data?.accessToken) {
      // Backend returns flat TokenResponseDto — map to StoredAuth shape
      const data = result.data;
      setStoredAuth({
        token: data.accessToken,
        refreshToken: data.refreshToken || refreshTokenValue,
        user: {
          id: data.companyId || "",
          fullName: data.name,
          whatsAppNumber: "",
          role: data.role,
          companyId: data.companyId,
          companyName: data.name,
          ownerName: data.ownerName,
          userCode: data.code,
          mustChangePassword: false,
        },
        expiresAt: data.expiresAt || "",
      });
      return { accessToken: data.accessToken };
    }
    return null;
  } catch {
    return null;
  }
}
