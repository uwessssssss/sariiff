"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { AccountType, currencyCode, formatMoney, getIncomeSummary, recordCommission, type IncomeCurrencyDto } from "@/lib/api";
import { PinModal, checkPinStatus } from "@/components/ui/PinModal";
import { type MPesaAgent } from "../helpers";

/** "1,500.50" → 1500.5; empty → 0 when allowed; anything else → NaN. */
export function parseAmount(text: string, emptyIsZero = false): number {
  const t = text.replace(/[,\s]/g, "");
  if (t === "") return emptyIsZero ? 0 : NaN;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/**
 * Mobile money commission and float, per currency (never added across currencies).
 *
 * How it is booked (shown to staff in one line, done by the server):
 *  - commission is INCOME, recorded gross;
 *  - the tax the network keeps is a credit to claim back, not a cost;
 *  - the net lands in the wallet the network paid;
 *  - customer cash-in / cash-out only swaps cash for e-float: no income.
 */
export function CommissionPanel({ agents, onRecorded }: { agents: MPesaAgent[]; onRecorded?: () => void | Promise<void> }) {
  const [rows, setRows] = useState<IncomeCurrencyDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const r = await getIncomeSummary();
      if (r.success && r.data) setRows(r.data.byCurrency || []);
      else { setRows([]); setFailed(true); }
    } catch { setRows([]); setFailed(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (rows || []).filter((r) => r.commissionGross || r.withholdingTaxRecoverable || r.eFloat || r.cashOnHand || r.feeIncome || r.otherIncome);

  return (
    <section aria-labelledby="commission-heading" className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="commission-heading" className="text-base font-semibold text-slate-900">Commission and float · this month</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Commission is income, recorded gross. Tax the network keeps is a credit you claim back. Customer cash-in and
            cash-out only swap cash for e-float, so they earn nothing here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={agents.filter((a) => a.isActive).length === 0}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Coins className="h-4 w-4" />
          Record commission
        </button>
      </div>

      {rows === null ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : failed ? (
        <p className="mt-4 text-sm text-red-700">Couldn&apos;t load commission and float. <button type="button" className="underline" onClick={load}>Try again</button></p>
      ) : shown.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No commission recorded this month.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
                <th scope="col" className="py-2 pr-3">Currency</th>
                <th scope="col" className="py-2 pr-3 text-right">Commission earned</th>
                <th scope="col" className="py-2 pr-3 text-right">Tax withheld</th>
                <th scope="col" className="py-2 pr-3 text-right">Net received</th>
                <th scope="col" className="py-2 pr-3 text-right">Tax to claim (all time)</th>
                <th scope="col" className="py-2 pr-3 text-right">E-float</th>
                <th scope="col" className="py-2 pr-3 text-right">Cash on hand</th>
                <th scope="col" className="py-2 text-right">Total float</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.currency} className="border-b border-slate-100 tabular-nums text-slate-900" data-currency={currencyCode(r.currency)}>
                  <th scope="row" className="py-2 pr-3 text-left font-semibold">{currencyCode(r.currency)}</th>
                  <td className="py-2 pr-3 text-right">{formatMoney(r.commissionGross, r.currency)}</td>
                  <td className="py-2 pr-3 text-right">{formatMoney(r.withholdingTax, r.currency)}</td>
                  <td className="py-2 pr-3 text-right">{formatMoney(r.commissionNet, r.currency)}</td>
                  <td className="py-2 pr-3 text-right">{formatMoney(r.withholdingTaxRecoverable, r.currency)}</td>
                  <td className="py-2 pr-3 text-right">{formatMoney(r.eFloat, r.currency)}</td>
                  <td className="py-2 pr-3 text-right">{formatMoney(r.cashOnHand, r.currency)}</td>
                  <td className="py-2 text-right font-semibold">{formatMoney(r.eFloat + r.cashOnHand, r.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Cash on hand is all of the bureau&apos;s cash in that currency, not only the agency&apos;s.</p>
        </div>
      )}

      {open && (
        <RecordCommissionModal
          agents={agents.filter((a) => a.isActive)}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await Promise.all([load(), onRecorded?.()]);
          }}
        />
      )}
    </section>
  );
}

export function RecordCommissionModal({ agents, onClose, onSaved }: {
  agents: MPesaAgent[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [walletId, setWalletId] = useState(agents[0]?.id ?? "");
  const [gross, setGross] = useState("");
  const [tax, setTax] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const wallet = agents.find((a) => a.id === walletId);
  const g = parseAmount(gross);
  const t = parseAmount(tax, true);
  const problem = useMemo(() => {
    if (!wallet) return "Choose the wallet the network paid.";
    if (gross.trim() === "") return null;
    if (!(g > 0)) return "Enter the commission earned as a number above zero.";
    if (Number.isNaN(t)) return "Enter the tax withheld as a number, or leave it empty.";
    if (t >= g) return "Tax withheld must be less than the commission earned.";
    return null;
  }, [wallet, gross, g, t]);
  const ready = !!wallet && g > 0 && !Number.isNaN(t) && t < g && !problem;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const save = async () => {
    if (!ready || !wallet) return;
    setBusy(true);
    try {
      const r = await recordCommission({
        destAccountType: AccountType.Mpesa,
        destAccountId: wallet.id,
        currency: wallet.currency,
        grossAmount: g,
        withholdingTax: t,
        date: date || undefined,
        reference: reference.trim() || undefined,
      });
      if (r.success) {
        toast.success(`Commission recorded: ${formatMoney(g - t, wallet.currency)} into ${wallet.agentName}`);
        await onSaved();
      } else toast.error(r.message || "Couldn't record the commission");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't record the commission");
    } finally { setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    const pin = await checkPinStatus();
    if (pin.isEnabled && pin.hasPin) setShowPin(true);
    else await save();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="commission-title">
      <form id="commission-form" onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="commission-title" className="text-lg font-semibold text-slate-900">Record commission</h2>
            <p className="mt-0.5 text-sm text-slate-500">From the network&apos;s commission statement.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label htmlFor="commission-wallet" className="block text-sm font-medium text-slate-700">Paid into</label>
            <select id="commission-wallet" value={walletId} onChange={(e) => setWalletId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.agentName} – {a.agentNumber} ({currencyCode(a.currency)})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="commission-gross" className="block text-sm font-medium text-slate-700">Commission earned{wallet ? ` (${currencyCode(wallet.currency)})` : ""}</label>
              <input id="commission-gross" inputMode="decimal" required value={gross} onChange={(e) => setGross(e.target.value)} placeholder="10,000"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm tabular-nums text-slate-900 placeholder:text-slate-500" />
            </div>
            <div>
              <label htmlFor="commission-tax" className="block text-sm font-medium text-slate-700">Tax withheld <span className="font-normal text-slate-500">(optional)</span></label>
              <input id="commission-tax" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm tabular-nums text-slate-900 placeholder:text-slate-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="commission-ref" className="block text-sm font-medium text-slate-700">Network reference <span className="font-normal text-slate-500">(optional)</span></label>
              <input id="commission-ref" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900" />
            </div>
            <div>
              <label htmlFor="commission-date" className="block text-sm font-medium text-slate-700">Date paid <span className="font-normal text-slate-500">(optional)</span></label>
              <input id="commission-date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900" />
            </div>
          </div>

          {problem ? (
            <p role="alert" className="text-sm text-red-700">{problem}</p>
          ) : ready && wallet ? (
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700" data-testid="commission-entries">
              <p className="font-medium text-slate-900">{formatMoney(g - t, wallet.currency)} arrives in {wallet.agentName}</p>
              <p className="mt-1">Dr {wallet.agentName} {formatMoney(g - t, wallet.currency)} · Cr Commission income {formatMoney(g - t, wallet.currency)}</p>
              {t > 0 && <p>Dr Withholding tax {formatMoney(t, wallet.currency)} · Cr Commission income {formatMoney(t, wallet.currency)}</p>}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={!ready || busy}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Record
          </button>
        </div>
      </form>
      <PinModal isOpen={showPin} onClose={() => setShowPin(false)} onVerified={() => { setShowPin(false); save(); }} title="Enter Transaction PIN" />
    </div>
  );
}
