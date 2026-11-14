"use client";

import { type useTransactionForm } from "./useTransactionForm";

/** Values TransactionForm works out once its data is ready (after the loading/error screens). */
export function buildTransactionFormView(vm: ReturnType<typeof useTransactionForm>) {
  const { isBalanceIncrease } = vm;
  // Dynamic colors based on balance effect
  const headerGradient = isBalanceIncrease
    ? "bg-emerald-700"
    : "bg-red-600";
  const buttonGradient = isBalanceIncrease
    ? "hover:shadow-md bg-emerald-700"
    : "hover:shadow-md bg-red-600";
  const summaryBorderColor = isBalanceIncrease
    ? "bg-emerald-50 border-emerald-500"
    : "bg-red-50 border-red-500";

  return {
    headerGradient,
    buttonGradient,
    summaryBorderColor,
  };
}
