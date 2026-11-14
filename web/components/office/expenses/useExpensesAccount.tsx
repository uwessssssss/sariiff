"use client";

import { useExpensesAccountState } from "./hooks/useExpensesAccountState";
import { useExpensesAccountExport } from "./hooks/useExpensesAccountExport";

/** All of ExpensesAccount's state, effects and handlers, built in layers (hooks/), each using only the ones before it. */
export function useExpensesAccount() {
  const g0 = useExpensesAccountState();
  const g1 = useExpensesAccountExport({ ...g0 });
  return { ...g0, ...g1 };
}

export type ExpensesAccountVM = ReturnType<typeof useExpensesAccount>;
