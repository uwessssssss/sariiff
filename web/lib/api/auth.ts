import { API_BASE_URL, type ApiResponse, apiRequest, clearStoredAuth } from "./core";

// ==============================================
// Auth Types - Unified Login
// ==============================================

export interface UnifiedLoginDto {
  code: string;
  phoneNumber: string;
  password: string;
  deviceId?: string;
}
export interface OtpVerifyDto {
  code: string;
  phoneNumber: string;
  otp: string;
  deviceId?: string;
  deviceName?: string;
}
export interface LoginResponseDto {
  requiresOtp: boolean;
  tokens: TokenResponseDto | null;
  message: string;
}
export interface TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  role: number;
  name: string;
  code: string;
  companyId?: string;
  ownerName?: string;
  userId?: string;
  email?: string;
  whatsAppNumber?: string;
}
export interface AuthResponseDto {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  user: UserInfoDto;
}
export interface UserInfoDto {
  id: string;
  fullName: string;
  whatsAppNumber: string;
  email?: string;
  role: number;
  companyId?: string;
  companyName?: string;
  ownerName?: string;
  userCode?: string;
  mustChangePassword: boolean;
}
// ==============================================
// Auth API Functions
// ==============================================

export async function login(
  dto: UnifiedLoginDto,
): Promise<ApiResponse<LoginResponseDto>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dto),
    });
    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Network error — cannot reach server",
      data: null,
    };
  }
}
export async function verifyOtp(
  dto: OtpVerifyDto,
): Promise<ApiResponse<TokenResponseDto>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dto),
    });
    const data = await response.json();
    return data;
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Network error — cannot reach server",
      data: null,
    };
  }
}
export async function logout(): Promise<void> {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } finally {
    clearStoredAuth();
  }
}
