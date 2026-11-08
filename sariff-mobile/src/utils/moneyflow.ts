/**
 * Which way did money move for the BUREAU on one transaction?
 *
 * Only the bureau's own tills count — cash, bank, M-Pesa (account types 0, 1, 2).
 * A debit to a till is money in, a credit is money out. The transaction's
 * `transactionType` is the SOURCE leg's; the destination leg is always the
 * opposite, and on a forex entry it moves `counterAmount` in `counterCurrency`.
 *
 *   Client → Cash (client deposits)     → in,  cash amount/currency
 *   Cash → Client (client withdraws)    → out
 *   Cash → Bank                         → transfer (no money enters or leaves)
 *   Client → Client (exchange lines)    → none (the float moves, not a till)
 *
 * This replaces "client involved ? Credit = in : Debit = in", which read the
 * source leg's type even when the client was the destination, and so showed a
 * client withdrawal entered from the cash side as Money In.
 */
export type FlowKind = "in" | "out" | "transfer" | "none";

export interface BureauFlow {
  kind: FlowKind;
  amount: number;
  currency: number;
}

const isTill = (accountType: unknown) => accountType === 0 || accountType === 1 || accountType === 2;

export function bureauFlow(t: {
  sourceAccountType?: number;
  destAccountType?: number;
  transactionType?: number; // 0 = Debit, 1 = Credit (source leg)
  rawTransactionType?: number;
  amount?: number;
  currency?: number;
  counterAmount?: number | null;
  counterCurrency?: number | null;
}): BureauFlow {
  const type = t.rawTransactionType ?? t.transactionType;
  const srcTill = isTill(t.sourceAccountType);
  const dstTill = isTill(t.destAccountType);
  const srcAmount = Math.abs(t.amount ?? 0);
  const srcCurrency = t.currency ?? 0;
  const dstAmount = Math.abs(t.counterAmount ?? t.amount ?? 0);
  const dstCurrency = t.counterCurrency ?? t.currency ?? 0;

  if (srcTill && dstTill) return { kind: "transfer", amount: srcAmount, currency: srcCurrency };
  if (srcTill) return { kind: type === 0 ? "in" : "out", amount: srcAmount, currency: srcCurrency };
  if (dstTill) return { kind: type === 1 ? "in" : "out", amount: dstAmount, currency: dstCurrency };
  return { kind: "none", amount: srcAmount, currency: srcCurrency };
}

export const flowLabel: Record<FlowKind, string> = {
  in: "Money In",
  out: "Money Out",
  transfer: "Transfer",
  none: "Statement only",
};
