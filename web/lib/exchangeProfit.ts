/**
 * Exchange profit over a period, from the trade list the server returns
 * (GET /api/exchange/transactions). Used by the Reports page (P&L and the
 * 7-day profit trend).
 */

/** When a trade happened, in ms. */
export function tradeTime(x: any): number {
  const d = x.transactionDate || x.createdAt;
  return d ? new Date(d).getTime() : NaN;
}

/** Realised profit of the trades from `from` (inclusive) to `to` (exclusive, open if omitted). */
export function exchangeProfitBetween(trades: any[], from: Date, to?: Date): number {
  return (trades || [])
    .filter((x) => {
      const t = tradeTime(x);
      return t >= from.getTime() && (!to || t < to.getTime());
    })
    .reduce((sum, x) => sum + (x.profit || 0), 0);
}
