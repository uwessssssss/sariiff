"use client";

import { currencyCode, currencyDecimals } from "@/lib/api";
import { ui } from "./theme";

/** One currency's figures for a summary table. */
export interface CurrencyTotalsRow {
  currency: number;
  moneyIn: number;
  moneyOut: number;
  net: number;
  balance: number;
}

const fmt = (n: number, c: number) =>
  (n || 0).toLocaleString("en-US", {
    minimumFractionDigits: currencyDecimals(c),
    maximumFractionDigits: currencyDecimals(c),
  });

const signed = (n: number, c: number) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n), c)}`;

/**
 * Per-currency summary (KES, USD, UGX, EUR — whatever the account holds).
 * Replaces the old "KES headline + USD footnote" cards, which could not show
 * a third currency.
 */
export function CurrencyTotals({
  rows,
  title = "Summary by currency",
  inLabel = "Money in",
  outLabel = "Money out",
  balanceLabel = "Balance",
}: {
  rows: CurrencyTotalsRow[];
  title?: string;
  inLabel?: string;
  outLabel?: string;
  balanceLabel?: string;
}) {
  const th = ui.th;
  const td = ui.td;

  return (
    <section className={ui.card}>
      <div className={ui.cardHead}>
        <h2 className={ui.cardTitle}>{title}</h2>
        {rows.length > 0 && (
          <span className={ui.cardMeta}>
            {rows.length} {rows.length === 1 ? "currency" : "currencies"}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-600">Nothing recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full tabular-nums">
            <thead className={ui.thead}>
              <tr>
                <th className={`${th} pl-5`}>Currency</th>
                <th className={`${th} text-right`}>{inLabel}</th>
                <th className={`${th} text-right`}>{outLabel}</th>
                <th className={`${th} text-right`}>Net</th>
                <th className={`${th} pr-5 text-right`}>{balanceLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.currency} className={`${ui.row} hover:bg-slate-50`}>
                  <td className={`${td} pl-5`}>
                    <span className={ui.codeChip}>{currencyCode(r.currency)}</span>
                  </td>
                  <td className={`${td} whitespace-nowrap text-right font-medium text-emerald-700`}>{fmt(r.moneyIn, r.currency)}</td>
                  <td className={`${td} whitespace-nowrap text-right font-medium text-red-700`}>{fmt(r.moneyOut, r.currency)}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 font-semibold ${
                        r.net > 0
                          ? "bg-emerald-50 text-emerald-700"
                          : r.net < 0
                            ? "bg-red-50 text-red-700"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {signed(r.net, r.currency)}
                    </span>
                  </td>
                  <td className={`${td} pr-5 whitespace-nowrap text-right text-base font-semibold text-[#0F172A]`}>
                    {fmt(r.balance, r.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Rows from an API "byCurrency" list, falling back to the KES/USD fields an
 * older API sends. `src` is any stats object with the usual KES/USD names.
 */
export function rowsFromStats(src: any, kind: "account" | "flow" = "account"): CurrencyTotalsRow[] {
  if (!src) return [];
  const list = Array.isArray(src.byCurrency) ? src.byCurrency : null;
  if (list && list.length > 0) {
    return list.map((r: any) => ({
      currency: r.currency,
      moneyIn: r.totalDebit ?? 0,
      moneyOut: r.totalCredit ?? 0,
      net: kind === "flow" ? r.netFlow ?? 0 : (r.totalDebit ?? 0) - (r.totalCredit ?? 0),
      balance: r.balance ?? r.totalBalance ?? 0,
    }));
  }
  const pick = (k: string) => src[k] ?? 0;
  return [0, 1]
    .map((c) => {
      const s = c === 0 ? "KES" : "USD";
      return {
        currency: c,
        moneyIn: pick(`totalDebit${s}`),
        moneyOut: pick(`totalCredit${s}`),
        net: pick(`totalDebit${s}`) - pick(`totalCredit${s}`),
        balance: pick(`balance${s}`) || pick(`totalBalance${s}`),
      };
    })
    .filter((r) => r.moneyIn || r.moneyOut || r.balance);
}
