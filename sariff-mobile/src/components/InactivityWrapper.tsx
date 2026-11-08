import React, { useRef, useEffect, useCallback } from "react";
import { View, AppState, AppStateStatus } from "react-native";
import { useAuth } from "../hooks/useAuth";
import { UserRole } from "../types";

const OFFICE_TIMEOUT_MS = 3 * 60 * 1000; // 3 min for office/admin (shared devices)
const CLIENT_TIMEOUT_MS = 15 * 60 * 1000; // 15 min for clients (their own phone)
const CHECK_INTERVAL_MS = 10 * 1000; // how often we check for idle

/**
 * Auto-logout after idle (or equivalent time in the background). Office/admin
 * time out at 3 min; clients at 15 min.
 *
 * Activity just records a timestamp (cheap); a single interval checks how long
 * it has been since the last activity and logs out when the role's timeout is
 * exceeded. This is more reliable than a single long setTimeout, which could be
 * disrupted by re-arming or by the gesture/navigation stack.
 */
export function InactivityWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, logout } = useAuth();
  const lastActivity = useRef<number>(Date.now());

  const timeoutMs =
    user?.role === UserRole.Client ? CLIENT_TIMEOUT_MS : OFFICE_TIMEOUT_MS;

  // Record activity — cheap timestamp write, called on every touch.
  const markActive = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  // Idle checker: re-created only when auth state or the role's timeout changes.
  useEffect(() => {
    if (!isAuthenticated) return;

    lastActivity.current = Date.now(); // fresh start on (re)login / role change

    const id = setInterval(() => {
      if (Date.now() - lastActivity.current >= timeoutMs) {
        logout();
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(id);
  }, [isAuthenticated, timeoutMs, logout]);

  // Background/foreground: if away longer than the role's timeout, log out on return.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === "active") {
        if (isAuthenticated && Date.now() - lastActivity.current >= timeoutMs) {
          logout();
        } else {
          // Returning within the window counts as activity.
          lastActivity.current = Date.now();
        }
      }
      // On background/inactive we intentionally do nothing: lastActivity stays
      // frozen, so a long background is correctly treated as idle on return.
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [isAuthenticated, logout, timeoutMs]);

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        markActive();
        return false;
      }}
      onMoveShouldSetResponderCapture={() => {
        markActive();
        return false;
      }}
    >
      {children}
    </View>
  );
}
