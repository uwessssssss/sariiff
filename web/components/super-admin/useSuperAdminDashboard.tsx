"use client";

import { SuperAdminDashboardProps } from "./helpers";
import { useSuperAdminDashboardState } from "./hooks/useSuperAdminDashboardState";
import { useSuperAdminDashboardExport } from "./hooks/useSuperAdminDashboardExport";

/** All of SuperAdminDashboard's state, effects and handlers, built in layers (hooks/), each using only the ones before it. */
export function useSuperAdminDashboard({
  userName = "Super Admin",
  onLogout,
  activeTab: initialTab = "overview",
}: SuperAdminDashboardProps) {
  const p = { userName, onLogout, initialTab };
  const g0 = useSuperAdminDashboardState(p);
  const g1 = useSuperAdminDashboardExport({ ...p, ...g0 });
  return { ...p, ...g0, ...g1 };
}

export type SuperAdminDashboardVM = ReturnType<typeof useSuperAdminDashboard>;
