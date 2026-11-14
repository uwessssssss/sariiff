"use client";

import { useReconciliationState } from "./hooks/useReconciliationState";
import { useReconciliationActions } from "./hooks/useReconciliationActions";
import { useReconciliationEffects } from "./hooks/useReconciliationEffects";

/** All of Reconciliation's state, effects and handlers, built in layers (hooks/), each using only the ones before it. */
export function useReconciliation() {
  const g0 = useReconciliationState();
  const g1 = useReconciliationActions({ ...g0 });
  const g2 = useReconciliationEffects({ ...g0, ...g1 });
  return { ...g0, ...g1, ...g2 };
}

export type ReconciliationVM = ReturnType<typeof useReconciliation>;
