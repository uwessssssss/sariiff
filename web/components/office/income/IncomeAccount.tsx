"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  AccountType, currencyCode, deleteTransaction, formatMoney, getBankAccounts, getCashAccounts, getIncomeAccounts,
  getIncomeSummary, getMpesaAgents, getTransactions, recordIncome,
  type IncomeAccountDto, type IncomeCurrencyDto, type TransactionDto,
} from "@/lib/api";
import { PinModal, checkPinStatus } from "@/components/ui/PinModal";
import { parseAmount } from "@/components/office/mpesa/sections/CommissionPanel";

/** Where income can be received: a till, a bank account or a wallet, each with its own currency. */
export interface Receiver { type: number; id: string; name: string; currency: number }

/** "2026-11-01" for the first day of this month (local). */
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/**
 * Income: commission, fees, interest, rent, other. Recorded gross; any tax the payer withheld
 * is a credit to claim back, not a cost. Per currency, never added across currencies.
 */
export function IncomeAccount() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<IncomeCurrencyDto[] | null>(null);
  const [postings, setPostings] = useState<TransactionDto[]>([]);
  const [kinds, setKinds] = useState<IncomeAccountDto[]>([]);
  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [reversing, setReversing] = useState<TransactionDto | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [s, p] = await Promise.all([
        getIncomeSummary(from, to),
        getTransactions(1, 200, { startDate: from, endDate: to, accountType: AccountType.Income }),
      ]);
      if (!s.success || !s.data) throw new Error(s.message);
      setRows(s.data.byCurrency || []);
      setPostings(p.success && p.data ? p.data.items || [] : []);
    } catch { setRows([]); setFailed(true); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let live = true;
    (async () => {
      const [k, c, b, m] = await Promise.all([
        getIncomeAccounts().catch(() => null), getCashAccounts().catch(() => null),
        getBankAccounts().catch(() => null), getMpesaAgents().catch(() => null),
      ]);
      if (!live) return;
      setKinds(k?.success && k.data ? k.data : []);
      setReceivers([
        ...((c?.success && c.data) || []).map((x) => ({ type: AccountType.Cash, id: x.id, name: `Cash till (${currencyCode(x.currency)})`, currency: x.currency })),
        ...((b?.success && b.data) || []).filter((x: any) => x.isActive !== false).map((x) => ({ type: AccountType.Bank, id: x.id, name: `${x.bankName} – ${x.accountName}`, currency: x.currency })),
        ...((m?.success && m.data) || []).filter((x: any) => x.isActive !== false).map((x: any) => ({ type: AccountType.Mpesa, id: x.id, name: `${x.agentName} – ${x.agentNumber}`, currency: x.currency ?? 0 })),
      ]);
    })();
    return () => { live = false; };
  }, []);

  const shown = (rows || []).filter((r) => r.totalIncome || r.withholdingTax || r.withholdingTaxRecoverable);
  const isTax = (t: TransactionDto) => t.destAccountType === AccountType.TaxRecoverable || t.sourceAccountType === AccountType.TaxRecoverable;

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Income</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Commission, fees, interest, rent and other income. Recorded gross: tax a payer withholds is a credit you claim
            back, not a cost. Each currency is kept apart.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} disabled={kinds.length === 0 || receivers.length === 0}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
          <Plus className="h-4 w-4" /> Record income
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="income-from" className="block text-xs font-medium text-slate-600">From</label>
          <input id="income-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
        </div>
        <div>
          <label htmlFor="income-to" className="block text-xs font-medium text-slate-600">To</label>
          <input id="income-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
        </div>
      </div>

      {rows === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : failed ? (
        <p className="text-sm text-red-700">Couldn&apos;t load income. <button type="button" className="underline" onClick={load}>Try again</button></p>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No income recorded in these dates.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((r) => (
            <section key={r.currency} data-currency={currencyCode(r.currency)} aria-label={`Income in ${currencyCode(r.currency)}`} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-600">{currencyCode(r.currency)}</h3>
                <p className="text-xl font-semibold tabular-nums text-slate-900">{formatMoney(r.totalIncome, r.currency)}</p>
              </div>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
                    <th scope="col" className="py-1.5 pr-2">Income</th>
                    <th scope="col" className="py-1.5 pr-2 text-right">Earned</th>
                    <th scope="col" className="py-1.5 pr-2 text-right">Tax withheld</th>
                    <th scope="col" className="py-1.5 text-right">Received</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums text-slate-900">
                  {r.byAccount.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100">
                      <th scope="row" className="py-1.5 pr-2 text-left font-medium">{l.name}</th>
                      <td className="py-1.5 pr-2 text-right">{formatMoney(l.gross, r.currency)}</td>
                      <td className="py-1.5 pr-2 text-right">{formatMoney(l.withholdingTax, r.currency)}</td>
                      <td className="py-1.5 text-right">{formatMoney(l.net, r.currency)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <th scope="row" className="py-1.5 pr-2 text-left">Total</th>
                    <td className="py-1.5 pr-2 text-right">{formatMoney(r.totalIncome, r.currency)}</td>
                    <td className="py-1.5 pr-2 text-right">{formatMoney(r.withholdingTax, r.currency)}</td>
                    <td className="py-1.5 text-right">{formatMoney(r.netReceived, r.currency)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 text-sm text-slate-600">Tax to claim back (all time): <span className="font-semibold tabular-nums text-slate-900">{formatMoney(r.withholdingTaxRecoverable, r.currency)}</span></p>
            </section>
          ))}
        </div>
      )}

      <section aria-labelledby="income-postings" className="rounded-2xl border border-slate-200 bg-white">
        <h3 id="income-postings" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900">Postings</h3>
        {postings.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">None in these dates.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {postings.map((t) => (
              <li key={t.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{t.description}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(t.transactionDate).toLocaleDateString("en-GB")} · {t.code} · {t.sourceAccountName} → {t.destAccountName}
                    {t.isReversed && <span className="ml-2 font-medium text-amber-800">Reversed</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`text-sm font-semibold tabular-nums ${isTax(t) ? "text-slate-600" : "text-emerald-700"}`}>{formatMoney(t.amount, t.currency)}</span>
                  {!t.isReversed && !t.code?.startsWith("REV") && (
                    <button type="button" onClick={() => setReversing(t)} className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Reverse</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && <RecordIncomeModal kinds={kinds} receivers={receivers} onClose={() => setOpen(false)} onSaved={async () => { setOpen(false); await load(); }} />}
      {reversing && <ReverseIncome posting={reversing} onClose={() => setReversing(null)} onDone={async () => { setReversing(null); await load(); }} />}
    </div>
  );
}

export function RecordIncomeModal({ kinds, receivers, onClose, onSaved }: {
  kinds: IncomeAccountDto[];
  receivers: Receiver[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [kindId, setKindId] = useState(kinds[0]?.id ?? "");
  const [receiverKey, setReceiverKey] = useState(receivers[0] ? `${receivers[0].type}:${receivers[0].id}` : "");
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const receiver = receivers.find((r) => `${r.type}:${r.id}` === receiverKey);
  const kind = kinds.find((k) => k.id === kindId);
  const a = parseAmount(amount);
  const t = parseAmount(tax, true);
  const problem = useMemo(() => {
    if (amount.trim() === "") return null;
    if (!(a > 0)) return "Enter the income as a number above zero.";
    if (Number.isNaN(t)) return "Enter the tax withheld as a number, or leave it empty.";
    if (t >= a) return "Tax withheld must be less than the income.";
    return null;
  }, [amount, a, t]);
  const ready = !!receiver && !!kind && a > 0 && !Number.isNaN(t) && t < a && !problem;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const save = async () => {
    if (!ready || !receiver || !kind) return;
    setBusy(true);
    try {
      const r = await recordIncome({
        incomeAccountId: kind.id, destAccountType: receiver.type, destAccountId: receiver.id, currency: receiver.currency,
        amount: a, withholdingTax: t, date: date || undefined,
        description: description.trim() || undefined, reference: reference.trim() || undefined,
      });
      if (r.success) {
        toast.success(`${kind.name} recorded: ${formatMoney(a - t, receiver.currency)} into ${receiver.name}`);
        await onSaved();
      } else toast.error(r.message || "Couldn't record the income");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't record the income");
    } finally { setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    const pin = await checkPinStatus();
    if (pin.isEnabled && pin.hasPin) setShowPin(true);
    else await save();
  };

  const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="income-title">
      <form id="income-form" onSubmit={submit} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="income-title" className="text-lg font-semibold text-slate-900">Record income</h2>
            <p className="mt-0.5 text-sm text-slate-500">Money the bureau earned, other than from exchange.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="income-kind" className="block text-sm font-medium text-slate-700">Kind of income</label>
              <select id="income-kind" value={kindId} onChange={(e) => setKindId(e.target.value)} className={field}>
                {kinds.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="income-into" className="block text-sm font-medium text-slate-700">Received into</label>
              <select id="income-into" value={receiverKey} onChange={(e) => setReceiverKey(e.target.value)} className={field}>
                {receivers.map((r) => <option key={`${r.type}:${r.id}`} value={`${r.type}:${r.id}`}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="income-amount" className="block text-sm font-medium text-slate-700">Amount earned{receiver ? ` (${currencyCode(receiver.currency)})` : ""}</label>
              <input id="income-amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10,000" className={`${field} tabular-nums`} />
            </div>
            <div>
              <label htmlFor="income-tax" className="block text-sm font-medium text-slate-700">Tax withheld <span className="font-normal text-slate-500">(optional)</span></label>
              <input id="income-tax" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0" className={`${field} tabular-nums`} />
            </div>
          </div>
          <div>
            <label htmlFor="income-description" className="block text-sm font-medium text-slate-700">Description <span className="font-normal text-slate-500">(optional)</span></label>
            <input id="income-description" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Shop 3 rent, November" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="income-ref" className="block text-sm font-medium text-slate-700">Reference <span className="font-normal text-slate-500">(optional)</span></label>
              <input id="income-ref" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="income-date" className="block text-sm font-medium text-slate-700">Date received <span className="font-normal text-slate-500">(optional)</span></label>
              <input id="income-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className={field} />
            </div>
          </div>

          {problem ? (
            <p role="alert" className="text-sm text-red-700">{problem}</p>
          ) : ready && receiver && kind ? (
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700" data-testid="income-entries">
              <p className="font-medium text-slate-900">{formatMoney(a - t, receiver.currency)} arrives in {receiver.name}</p>
              <p className="mt-1">Dr {receiver.name} {formatMoney(a - t, receiver.currency)} · Cr {kind.name} {formatMoney(a - t, receiver.currency)}</p>
              {t > 0 && <p>Dr Withholding tax {formatMoney(t, receiver.currency)} · Cr {kind.name} {formatMoney(t, receiver.currency)}</p>}
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

/** Reverse one income posting (the income itself or its tax line); asks for a reason and the PIN if set. */
function ReverseIncome({ posting, onClose, onDone }: { posting: TransactionDto; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await deleteTransaction(posting.id, reason.trim());
      if (r.success) { toast.success(`${posting.code} reversed`); await onDone(); }
      else toast.error(r.message || "Couldn't reverse it");
    } catch (e: any) { toast.error(e?.message || "Couldn't reverse it"); } finally { setBusy(false); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return;
    const pin = await checkPinStatus();
    if (pin.isEnabled && pin.hasPin) setShowPin(true); else await go();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="reverse-title">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="reverse-title" className="text-lg font-semibold text-slate-900">Reverse {posting.code}?</h2>
        <p className="mt-1 text-sm text-slate-600">{posting.description}. If it had tax withheld, reverse its tax line too.</p>
        <label htmlFor="reverse-reason" className="mt-4 block text-sm font-medium text-slate-700">Reason</label>
        <input id="reverse-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900" />
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700">Cancel</button>
          <button type="submit" disabled={busy || reason.trim().length < 3} className="h-10 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50">Reverse</button>
        </div>
      </form>
      <PinModal isOpen={showPin} onClose={() => setShowPin(false)} onVerified={() => { setShowPin(false); go(); }} title="Enter Transaction PIN" />
    </div>
  );
}
