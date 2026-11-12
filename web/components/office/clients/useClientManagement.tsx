"use client";

import { useClientManagementState } from "./hooks/useClientManagementState";
import { useClientManagementEffects } from "./hooks/useClientManagementEffects";

/** All of ClientManagement's state, effects and handlers, built in layers (hooks/), each using only the ones before it. */
export function useClientManagement() {
  const g0 = useClientManagementState();
  const g1 = useClientManagementEffects({ ...g0 });
  return { ...g0, ...g1 };
}

export type ClientManagementVM = ReturnType<typeof useClientManagement>;
