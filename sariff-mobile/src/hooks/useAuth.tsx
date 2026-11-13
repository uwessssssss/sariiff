import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { resetBaseCurrency } from './useBaseCurrency';
import { Platform } from "react-native";
import { UserInfoDto, UnifiedLoginDto, OtpVerifyDto, UserRole } from "../types";
import * as api from "../services/api";
import {
  registerForPushNotifications,
  getDeviceId,
  getDeviceName,
} from "../utils/notifications";
import { cacheClear } from "../utils/cache";

// Register push token silently after login
let activePushToken: string | null = null;
const registerPushToken = async () => {
  try {
    const token = await registerForPushNotifications();
    if (token) {
      activePushToken = token;
      await api.registerDeviceToken(token, Platform.OS);
    }
  } catch {}
};

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: UserInfoDto | null;
  requiresOtp: boolean;
  pendingLogin: { code: string; phoneNumber: string } | null;
}

interface AuthContextType extends AuthState {
  login: (
    dto: UnifiedLoginDto,
  ) => Promise<{ success: boolean; message: string }>;
  verifyOtp: (otp: string) => Promise<{ success: boolean; message: string }>;
  resendOtp: () => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  /** Phone login: a bureau was picked; data is the normal client token response. */
  signInWithTokens: (data: any) => Promise<void>;
  /** Phone login: leave this bureau and open another one linked to the same phone. */
  switchBureau: (companyId: string) => Promise<{ success: boolean; message: string }>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    user: null,
    requiresOtp: false,
    pendingLogin: null,
  });

  // Login details kept in memory ONLY while the OTP screen is open, so
  // "Resend" can request a new code (the server requires the password).
  // Cleared on success, logout, session expiry and every new login.
  const pendingDtoRef = useRef<(UnifiedLoginDto & { deviceId?: string }) | null>(null);

  useEffect(() => {
    // Wire session expired callback — forces logout when token refresh fails
    api.setSessionExpiredCallback(() => {
      pendingDtoRef.current = null;
      // The screens cache under fixed keys ("client_dashboard", ...): an expired session must
      // not leave this account's balances for the next person who signs in on this phone.
      cacheClear().catch(() => {});
      resetBaseCurrency();
      setState({
        isLoading: false,
        isAuthenticated: false,
        user: null,
        requiresOtp: false,
        pendingLogin: null,
      });
    });

    (async () => {
      try {
        const token = await api.getToken();
        const user = await api.getStoredUser();

        if (token && user) {
          setState({
            isLoading: false,
            isAuthenticated: true,
            user,
            requiresOtp: false,
            pendingLogin: null,
          });
        } else {
          setState((s) => ({ ...s, isLoading: false }));
        }
      } catch {
        setState((s) => ({ ...s, isLoading: false }));
      }
    })();
  }, []);

  const login = useCallback(async (dto: UnifiedLoginDto) => {
    // Clear old auth first so stale tokens don't interfere with OTP flow
    pendingDtoRef.current = null;
    await api.clearAuth();
    // A new sign-in starts with nothing cached from whoever used this phone before.
    try { await cacheClear(); } catch {}

    // Also reset current auth state before a fresh login
    setState((s) => ({
      ...s,
      isAuthenticated: false,
      user: null,
      requiresOtp: false,
      pendingLogin: null,
    }));

    // Add device ID for trusted device check
    const deviceId = await getDeviceId();
    const dtoWithDevice = { ...dto, deviceId };

    const result = await api.login(dtoWithDevice);
    if (!result.success) {
      return { success: false, message: result.message };
    }

    if (result.data.requiresOtp) {
      pendingDtoRef.current = dtoWithDevice;
      setState((s) => ({
        ...s,
        requiresOtp: true,
        pendingLogin: {
          code: dto.code,
          phoneNumber: dto.phoneNumber,
        },
      }));
      return { success: true, message: "OTP sent" };
    }

    // Direct login (Client — no OTP) — backend returns TokenResponseDto with flat fields
    const data = result.data as any;
    if (data.accessToken && data.role === UserRole.SuperAdmin) {   // trusted device: no code step
      await api.storeAuth(data.accessToken, data.refreshToken || "", { id: "", code: "", fullName: "", role: 0 } as UserInfoDto);
      await api.logout();
      return { success: false, message: "The super admin dashboard is on the web. Sign in at the Sarif website." };
    }
    if (data.accessToken) {
      const userInfo: UserInfoDto = {
        id: "", // Not in TokenResponseDto — loaded from profile API later
        code: data.code || dto.code,
        fullName: data.ownerName || data.name || "",
        role: typeof data.role === "number" ? data.role : 2, // 0=SA, 1=Office, 2=Client
        companyId: data.companyId || undefined,
        companyName: data.companyId ? data.name || undefined : undefined,
      };

      await api.storeAuth(data.accessToken, data.refreshToken || "", userInfo);

      // Register push notification token
      registerPushToken();

      setState({
        isLoading: false,
        isAuthenticated: true,
        user: userInfo,
        requiresOtp: false,
        pendingLogin: null,
      });

      return { success: true, message: "Login successful" };
    }

    return { success: false, message: "Unexpected response" };
  }, []);

  const verifyOtp = useCallback(
    async (otp: string) => {
      if (!state.pendingLogin) {
        return { success: false, message: "No pending login" };
      }

      const deviceId = await getDeviceId();
      const deviceName = getDeviceName();
      const payload: OtpVerifyDto = {
        code: state.pendingLogin.code,
        phoneNumber: state.pendingLogin.phoneNumber,
        otp,
        deviceId,
        deviceName,
      };

      const result = await api.verifyOtp(payload);

      if (!result.success) {
        return { success: false, message: result.message };
      }

      // Backend returns TokenResponseDto with flat fields (accessToken, not token)
      const data = result.data as any;
      // The platform owner's screens are web-only: signed in here, the super admin landed in
      // the bureau tabs, where every request is refused. End that session and say where to go.
      if (data.accessToken && data.role === UserRole.SuperAdmin) {
        await api.storeAuth(data.accessToken, data.refreshToken || "", { id: "", code: "", fullName: "", role: 0 } as UserInfoDto);
        await api.logout();
        pendingDtoRef.current = null;
        setState((s) => ({ ...s, requiresOtp: false, pendingLogin: null }));
        return { success: false, message: "The super admin dashboard is on the web. Sign in at the Sarif website." };
      }
      if (data.accessToken) {
        const userInfo: UserInfoDto = {
          id: "", // Not in TokenResponseDto — loaded from profile API later
          code: data.code || state.pendingLogin.code,
          fullName: data.ownerName || data.name || "",
          role: typeof data.role === "number" ? data.role : 1,
          companyId: data.companyId || undefined,
          companyName: data.name || undefined, // SA/CO: name = company/org name
        };

        await api.storeAuth(
          data.accessToken,
          data.refreshToken || "",
          userInfo,
        );

        // Register push notification token
        registerPushToken();

        pendingDtoRef.current = null;
        setState({
          isLoading: false,
          isAuthenticated: true,
          user: userInfo,
          requiresOtp: false,
          pendingLogin: null,
        });

        return { success: true, message: "Login successful" };
      }

      return { success: false, message: "Verification failed" };
    },
    [state.pendingLogin],
  );

  // Ask the server for a fresh code. Calls the login endpoint again directly
  // (not login() above, which resets the OTP screen state).
  const resendOtp = useCallback(async () => {
    const dto = pendingDtoRef.current;
    if (!dto) {
      return { success: false, message: "Go back and sign in again to get a new code." };
    }
    const result = await api.login(dto);
    if (!result.success) {
      return { success: false, message: result.message };
    }
    if (result.data?.requiresOtp) {
      return { success: true, message: "New code sent" };
    }
    return { success: false, message: "Couldn't send a new code. Try again." };
  }, []);

  const logoutFn = useCallback(async () => {
    resetBaseCurrency(); // next company re-fetches its home currency
    pendingDtoRef.current = null;
    // Push token is KEPT on logout so the user still gets re-engagement notifications.
    // Notification text DOES carry amounts and references, so the server hands the token to
    // whoever signs in next on this phone and stops it for the previous account.
    await api.logout();
    try {
      await cacheClear();
    } catch {}
    setState({
      isLoading: false,
      isAuthenticated: false,
      user: null,
      requiresOtp: false,
      pendingLogin: null,
    });
  }, []);

  // A bureau token from the phone login. Same storage as the classic login.
  const signInWithTokens = useCallback(async (data: any) => {
    const userInfo: UserInfoDto = {
      id: "",
      code: data.code || "",
      fullName: data.ownerName || data.name || "",
      role: typeof data.role === "number" ? data.role : 2,
      companyId: data.companyId || undefined,
      companyName: undefined,
    };
    await api.storeAuth(data.accessToken, data.refreshToken || "", userInfo);
    registerPushToken(); // push token now belongs to this bureau's account
    pendingDtoRef.current = null;
    setState({ isLoading: false, isAuthenticated: true, user: userInfo, requiresOtp: false, pendingLogin: null });
  }, []);

  const switchBureau = useCallback(async (companyId: string) => {
    const result = await api.switchBureauRequest(companyId);
    if (!result.success || !(result.data as any)?.accessToken) {
      return { success: false, message: result.message || "Couldn't open that bureau" };
    }
    // Forget this bureau's tokens on this phone (not /api/auth/logout, which would end the
    // client's sessions at that bureau on every device), then drop everything cached
    // from it, so nothing from one bureau can show inside another.
    await api.clearAuth();
    try {
      await cacheClear();
    } catch {}
    resetBaseCurrency();
    // Unmount the client tabs for a moment so every screen loads fresh.
    setState({ isLoading: true, isAuthenticated: false, user: null, requiresOtp: false, pendingLogin: null });
    await signInWithTokens(result.data);
    return { success: true, message: "Switched" };
  }, [signInWithTokens]);

  return (
    <AuthContext.Provider
      value={{ ...state, login, verifyOtp, resendOtp, logout: logoutFn, signInWithTokens, switchBureau }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
