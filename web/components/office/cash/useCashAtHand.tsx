"use client";

import { useCashAtHandData } from "./hooks/useCashAtHandData";
import { useCashAtHandActions } from "./hooks/useCashAtHandActions";

/** All of CashAtHand's state, effects and handlers, built in layers (hooks/), each using only the ones before it. */
export function useCashAtHand() {
  const g0 = useCashAtHandData();
  const g1 = useCashAtHandActions({ ...g0 });
  return { ...g0, ...g1 };
}

export type CashAtHandVM = ReturnType<typeof useCashAtHand>;
