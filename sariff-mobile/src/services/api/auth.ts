import { ApiResponse, LoginResponseDto, OtpVerifyDto, UnifiedLoginDto } from "../../types";
import { API_BASE, apiRequest, clearAuth } from "./core";

// ==================== AUTH ====================
export async function login(
  dto: UnifiedLoginDto
): Promise<ApiResponse<LoginResponseDto>> {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}
export async function verifyOtp(
  dto: OtpVerifyDto
): Promise<ApiResponse<LoginResponseDto>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${API_BASE}/api/auth/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dto),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      return {
        success: false,
        message: "Request timed out. Check your connection.",
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
export async function logout(): Promise<void> {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } catch {}
  await clearAuth();
}
