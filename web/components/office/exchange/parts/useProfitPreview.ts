"use client";

import { useEffect, useState } from "react";
import { Currency, ExchangeDirection, calculateExchange } from "@/lib/api";

/**
 * The profit the server will book for this trade, asked of the server itself
 * (POST /api/exchange/calculate). A purchase books none; a sale books the home
 * currency received minus the AVERAGE COST of the units sold, which only the
 * server knows. The old preview showed spread x amount for both directions, so
 * a purchase promised a profit that was never booked.
 * Returns null while there is nothing to ask or the answer has not come back.
 */
export function useProfitPreview(amount: number, direction: ExchangeDirection, foreignCurrency: number): number | null {
  const [profit, setProfit] = useState<number | null>(null);
  useEffect(() => {
    setProfit(null);
    if (!(amount > 0) || direction === ExchangeDirection.UsdToKes) return;
    let live = true; // an answer for an earlier amount must not replace this one
    const t = setTimeout(() => {
      calculateExchange({ amount, direction, foreignCurrency: foreignCurrency as Currency })
        .then((r) => { if (live && r.success && r.data) setProfit(r.data.estimatedProfit); })
        .catch(() => {});
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [amount, direction, foreignCurrency]);
  return profit;
}
