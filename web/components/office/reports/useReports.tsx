"use client";

import { useReportsState } from "./hooks/useReportsState";
import { useReportsData } from "./hooks/useReportsData";
import { useReportsEffects } from "./hooks/useReportsEffects";

/** All of Reports's state, effects and handlers, built in layers (hooks/), each using only the ones before it. */
export function useReports() {
  const g0 = useReportsState();
  const g1 = useReportsData({ ...g0 });
  const g2 = useReportsEffects({ ...g0, ...g1 });
  return { ...g0, ...g1, ...g2 };
}

export type ReportsVM = ReturnType<typeof useReports>;
