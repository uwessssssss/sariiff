import { useExchangeScreenState } from "./hooks/useExchangeScreenState";
import { useExchangeScreenData } from "./hooks/useExchangeScreenData";

/** All of ExchangeScreen's state, effects and handlers, built in layers (hooks/), each using only the ones before it. */
export function useExchangeScreen() {
  const g0 = useExchangeScreenState();
  const g1 = useExchangeScreenData({ ...g0 });
  return { ...g0, ...g1 };
}

export type ExchangeScreenVM = ReturnType<typeof useExchangeScreen>;
