"use client";

import { useExchangeSectionState } from "./hooks/useExchangeSectionState";
import { useExchangeSectionData } from "./hooks/useExchangeSectionData";

/** All of ExchangeSection's state, effects and handlers, built in layers (hooks/), each using only the ones before it. */
export function useExchangeSection() {
  const g0 = useExchangeSectionState();
  const g1 = useExchangeSectionData({ ...g0 });
  return { ...g0, ...g1 };
}

export type ExchangeSectionVM = ReturnType<typeof useExchangeSection>;
