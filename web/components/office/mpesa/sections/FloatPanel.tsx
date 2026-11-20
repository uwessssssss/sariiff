"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { currencyCode, formatMoney, getIncomeSummary, type IncomeCurrencyDto } from "@/lib/api";

/**
 * Float, per currency (never added across currencies): e-float in the active wallets and
 * cash in the tills. A customer's cash-in or cash-out only swaps one for the other, so the
 * total doesn't change and nothing is earned.
 */
export function FloatPanel({ reloadKey = 0 }: { reloadKey?: number }) {
  const [rows, setRows] = useState<IncomeCurrencyDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const r = await getIncomeSummary();
      if (r.success && r.data) setRows(r.data.byCurrency || []);
      else { setRows([]); setFailed(true); }
    } catch { setRows([]); setFailed(true); }
  }, []);
  useEffect(() => { load(); }, [load, reloadKey]);

  const shown = (rows || []).filter((r) => r.eFloat || r.cashOnHand);

  return (
    <section aria-labelledby="float-heading" className="rounded-2xl border border-slate-200 bg-white p-6">
      <h3 id="float-heading" className="text-base font-semibold text-slate-900">Float</h3>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        E-float in the wallets and cash in the tills. A customer&apos;s cash-in or cash-out swaps one for the other: the total stays the same.
      </p>
      {rows === null ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : failed ? (
        <p className="mt-4 text-sm text-red-700">Couldn&apos;t load the float. <button type="button" className="underline" onClick={load}>Try again</button></p>
      ) : shown.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No float yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
                <th scope="col" className="py-2 pr-3">Currency</th>
                <th scope="col" className="py-2 pr-3 text-right">E-float</th>
                <th scope="col" className="py-2 pr-3 text-right">Cash on hand</th>
                <th scope="col" className="py-2 text-right">Total float</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.currency} className="border-b border-slate-100 tabular-nums text-slate-900" data-currency={currencyCode(r.currency)}>
                  <th scope="row" className="py-2 pr-3 text-left font-semibold">{currencyCode(r.currency)}</th>
                  <td className="py-2 pr-3 text-right">{formatMoney(r.eFloat, r.currency)}</td>
                  <td className="py-2 pr-3 text-right">{formatMoney(r.cashOnHand, r.currency)}</td>
                  <td className="py-2 text-right font-semibold">{formatMoney(r.eFloat + r.cashOnHand, r.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Cash on hand is all of the bureau&apos;s cash in that currency.</p>
        </div>
      )}
    </section>
  );
}
