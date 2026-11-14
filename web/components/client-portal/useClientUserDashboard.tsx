"use client";

import { ClientUserDashboardProps } from "./helpers";
import { useClientUserDashboardState } from "./hooks/useClientUserDashboardState";
import { useClientUserDashboardData } from "./hooks/useClientUserDashboardData";
import { type buildClientUserDashboardView } from "./buildClientUserDashboardView";

/** All of ClientUserDashboard's state, effects and handlers, built in layers (hooks/), each using only the ones before it. */
export function useClientUserDashboard({
  userName,
  onLogout,
}: ClientUserDashboardProps) {
  const p = { userName, onLogout };
  const g0 = useClientUserDashboardState(p);
  const g1 = useClientUserDashboardData({ ...p, ...g0 });
  return { ...p, ...g0, ...g1 };
}

export type ClientUserDashboardVM = ReturnType<typeof useClientUserDashboard> & ReturnType<typeof buildClientUserDashboardView>;
