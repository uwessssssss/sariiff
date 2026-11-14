"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { resetBaseCurrency } from "@/lib/useBaseCurrency";
import { useRouter, usePathname } from "next/navigation";
import {
  login as apiLogin,
  verifyOtp as apiVerifyOtp,
  logout as apiLogout,
  getStoredAuth,
  setStoredAuth,
  clearStoredAuth,
  UnifiedLoginDto,
  OtpVerifyDto,
  TokenResponseDto,
  UserRole,
} from "@/lib/api";

// Generate/retrieve persistent device ID for trusted device feature
// A trusted device skips the SMS code, so its id is a secret: secure random bytes, never
// Math.random (predictable). Without storage (private mode) there is simply no trusted device.
function getWebDeviceId(): string | undefined {
  const key = "sariff_device_id";
  try {
    let id = localStorage.getItem(key);
    if (!id || id.length < 32 || id.includes("-")) { // dashes: an old Math.random id, replaced
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

// ==============================================
// Types
// ==============================================

export type UserRoleType = "super-admin" | "office-user" | "client" | null;

export interface AuthUser {
  id: string;
  name: string;
  role: UserRoleType;
  roleNum: number;
  phone: string;
  email?: string;
  companyId?: string;
  companyName?: string;
  ownerName?: string;
  userCode?: string;
}

interface LoginResult {
  success: boolean;
  message: string;
  requiresOtp?: boolean;
  userName?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (
    code: string,
    phoneNumber: string,
    password: string,
  ) => Promise<LoginResult>;
  verifyOtp: (
    code: string,
    phoneNumber: string,
    otpCode: string,
  ) => Promise<LoginResult>;
  logout: () => Promise<void>;
  getToken: () => string | null;
  /** Phone login: a bureau was picked and its normal client token came back. */
  signInWithTokens: (tokens: TokenResponseDto, phoneNumber: string) => void;
}

// ==============================================
// Context
// ==============================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ==============================================
// Helper Functions
// ==============================================

function roleNumToString(roleNum: number): UserRoleType {
  switch (roleNum) {
    case UserRole.SuperAdmin:
      return "super-admin";
    case UserRole.OfficeUser:
      return "office-user";
    case UserRole.Client:
      return "client";
    default:
      return null;
  }
}

function getDashboardPath(role: UserRoleType): string {
  switch (role) {
    case "super-admin":
      return "/admin/dashboard";
    case "office-user":
      return "/office/dashboard";
    case "client":
      return "/client/dashboard";
    default:
      return "/login";
  }
}

// Public routes that don't require authentication
const publicRoutes = ["/", "/login"];

// ==============================================
// Provider Component
// ==============================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Check for existing auth on mount
  useEffect(() => {
    const checkAuth = () => {
      const stored = getStoredAuth();
      if (stored && stored.token && stored.user) {
        const roleType = roleNumToString(stored.user.role);
        setUser({
          id: stored.user.id,
          name: stored.user.fullName,
          role: roleType,
          roleNum: stored.user.role,
          phone: stored.user.whatsAppNumber,
          email: stored.user.email,
          companyId: stored.user.companyId,
          companyName: stored.user.companyName,
          ownerName: stored.user.ownerName,
          userCode: stored.user.userCode,
        });
      }
      setIsLoading(false);
    };
    checkAuth();
  }, []);

  // Redirect based on auth state
  useEffect(() => {
    if (isLoading) return;

    const isPublicRoute = publicRoutes.includes(pathname);

    if (!user && !isPublicRoute) {
      router.push("/login");
    } else if (user && pathname === "/login") {
      router.push(getDashboardPath(user.role));
    } else if (user && pathname === "/dashboard") {
      router.push("/office/dashboard");
    } else if (user && pathname === "/client-portal") {
      router.push("/client/dashboard");
    }
  }, [user, isLoading, pathname, router]);

  // Helper to set auth from token response
  const setAuthFromTokens = useCallback(
    (tokens: TokenResponseDto, phoneNumber: string, userCode: string) => {
      if (tokens.accessToken) {
        const roleType = roleNumToString(tokens.role);

        const userInfo = {
          id: tokens.userId || "",
          fullName: tokens.name,
          whatsAppNumber: tokens.whatsAppNumber || phoneNumber,
          email: tokens.email,
          role: tokens.role,
          companyId: tokens.companyId,
          companyName: tokens.name,
          ownerName: tokens.ownerName,
          userCode: tokens.code || userCode,
          mustChangePassword: false,
        };

        setStoredAuth({
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken || "",
          user: userInfo,
          expiresAt: tokens.expiresAt || "",
        });

        const authUser: AuthUser = {
          id: userInfo.id,
          name: userInfo.fullName,
          role: roleType,
          roleNum: userInfo.role,
          phone: userInfo.whatsAppNumber,
          email: userInfo.email,
          companyId: userInfo.companyId,
          companyName: userInfo.companyName,
          ownerName: userInfo.ownerName,
          userCode: userInfo.userCode,
        };

        setUser(authUser);

        // Show loading spinner during navigation to dashboard
        setIsNavigating(true);
        router.push(getDashboardPath(roleType));
      }
    },
    [router],
  );

  // Clear navigating state when pathname changes (navigation complete)
  useEffect(() => {
    setIsNavigating(false);
  }, [pathname]);

  // Unified login function
  const login = useCallback(
    async (
      code: string,
      phoneNumber: string,
      password: string,
    ): Promise<LoginResult> => {
      try {
        // Generate device ID for trusted device check
        const deviceId = getWebDeviceId();
        const dto: UnifiedLoginDto = { code, phoneNumber, password, deviceId };
        const response = await apiLogin(dto);

        if (response.success && response.data) {
          // 1) OTP flow (Super Admin / Office User)
          if ((response.data as any).requiresOtp) {
            return {
              success: true,
              message:
                (response.data as any).message || "Verification code sent by SMS",
              requiresOtp: true,
            };
          }

          // 2) Non-OTP flow (Client) - tokens might be nested OR returned directly
          const possibleTokens = (response.data as any).tokens ?? response.data;

          if (possibleTokens?.accessToken) {
            setAuthFromTokens(
              possibleTokens as TokenResponseDto,
              phoneNumber,
              code,
            );
            return {
              success: true,
              message: "Login successful",
              userName: possibleTokens.name,
            };
          }

          return {
            success: false,
            message:
              (response.data as any).message ||
              response.message ||
              "Login failed",
          };
        }

        return { success: false, message: response.message || "Login failed" };
      } catch (error: any) {
        console.error("Login error:", error);
        return { success: false, message: error.message || "Login failed" };
      }
    },
    [setAuthFromTokens],
  );

  // Verify OTP function
  const verifyOtp = useCallback(
    async (
      code: string,
      phoneNumber: string,
      otpCode: string,
    ): Promise<LoginResult> => {
      try {
        const deviceId = getWebDeviceId();
        const deviceName = `${navigator.userAgent.includes("Mobile") ? "Mobile" : "Desktop"} Browser`;
        const dto: OtpVerifyDto = {
          code,
          phoneNumber,
          otp: otpCode,
          deviceId,
          deviceName,
        };
        const response = await apiVerifyOtp(dto);

        if (response.success && response.data) {
          setAuthFromTokens(response.data, phoneNumber, code);
          return {
            success: true,
            message: "Login successful",
            userName: response.data.name,
          };
        } else {
          return {
            success: false,
            message: response.message || "OTP verification failed",
          };
        }
      } catch (error: any) {
        console.error("OTP verify error:", error);
        return {
          success: false,
          message: error.message || "OTP verification failed",
        };
      }
    },
    [setAuthFromTokens],
  );

  // Logout function
  const logout = useCallback(async () => {
    resetBaseCurrency(); // next company re-fetches its home currency
    try {
      await apiLogout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearStoredAuth();
      setUser(null);
      router.push("/login");
    }
  }, [router]);

  // Get current token
  const getToken = useCallback((): string | null => {
    const stored = getStoredAuth();
    return stored?.token || null;
  }, []);

  // Security: auto-logout on inactivity, matching the mobile app's policy —
  // office/admin staff: 3 minutes; clients: 15 minutes. Activity just records
  // a timestamp (cheap); a single interval checks idle time. Also logs out if
  // the tab was hidden/backgrounded past the idle limit.
  useEffect(() => {
    if (!user) return; // only while logged in

    const IDLE_MS =
      user.roleNum === UserRole.Client ? 15 * 60 * 1000 : 3 * 60 * 1000;
    const CHECK_MS = 15 * 1000; // re-check every 15s
    // Activity is shared by every tab: tabs share one sign-in, and an untouched background
    // tab used to sign out (ending the shared session) while the person worked in another.
    const KEY = "sariff_last_active";
    let lastActive = Date.now();
    let lastWritten = 0;
    const sharedLastActive = () => {
      try {
        const v = Number(localStorage.getItem(KEY));
        return Number.isFinite(v) ? Math.max(lastActive, v) : lastActive;
      } catch {
        return lastActive;
      }
    };
    const idleFor = () => Date.now() - sharedLastActive();

    const markActive = () => {
      lastActive = Date.now();
      if (lastActive - lastWritten > 5000) {
        lastWritten = lastActive;
        try { localStorage.setItem(KEY, String(lastActive)); } catch {}
      }
    };
    markActive();

    const interval = setInterval(() => {
      if (idleFor() >= IDLE_MS) {
        logout();
      }
    }, CHECK_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible" && idleFor() >= IDLE_MS) {
        logout();
      }
    };

    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ];
    events.forEach((e) =>
      window.addEventListener(e, markActive, { passive: true }),
    );
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      events.forEach((e) => window.removeEventListener(e, markActive));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, logout]);

  const signInWithTokens = useCallback(
    (tokens: TokenResponseDto, phoneNumber: string) => {
      resetBaseCurrency(); // a different bureau may have a different home currency
      setAuthFromTokens(tokens, phoneNumber, tokens.code);
    },
    [setAuthFromTokens],
  );

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    verifyOtp,
    logout,
    getToken,
    signInWithTokens,
  };

  return (
    <AuthContext.Provider value={value}>
      {isNavigating && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
          <p className="text-slate-600 font-medium text-lg">
            Loading your dashboard...
          </p>
          <p className="text-slate-400 text-sm mt-1">Please wait</p>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}

// ==============================================
// Hook
// ==============================================

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export { UserRole };
