"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, Loader2, Pencil, Plus, Power, Printer, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  AccountType, createIncomeAccount, currencyCode, deleteIncomeAccount, deleteTransaction, formatMoney, getBankAccounts,
  getCashAccounts, getIncomeAccounts, getIncomeStatement, getIncomeSummary, getMpesaAgents, recordIncome, updateIncomeAccount,
  type IncomeAccountDto, type IncomeCurrencyDto, type IncomeStatementDto, type IncomeStatementLineDto,
} from "@/lib/api";
import { PinModal, checkPinStatus } from "@/components/ui/PinModal";

/** "1,500.50" → 1500.5; empty or anything else → NaN. */
export function parseAmount(text: string): number {
  const t = text.replace(/[,\s]/g, "");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** Where income can be received: a till, a bank account or a wallet, each in its own currency. */
export interface Receiver { type: number; id: string; name: string; currency: number }

const pad = (n: number) => String(n).padStart(2, "0");
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/** Ask for the transaction PIN when the bureau has one, then run the action. */
function usePinGate() {
  const [pending, setPending] = useState<null | (() => void)>(null);
  const gate = async (action: () => void) => {
    const pin = await checkPinStatus();
    if (pin.isEnabled && pin.hasPin) setPending(() => action);
    else action();
  };
  const modal = (
    <PinModal isOpen={!!pending} onClose={() => setPending(null)} onVerified={() => { const a = pending; setPending(null); a?.(); }} title="Enter Transaction PIN" />
  );
  return { gate, modal };
}

/**
 * Income other than from exchange, in income accounts the bureau names itself.
 * Received into a till, bank or wallet: Dr that account, Cr the income account.
 * Each account has a statement; each currency is kept apart.
 */
export function IncomeAccount() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [accounts, setAccounts] = useState<IncomeAccountDto[] | null>(null);
  const [rows, setRows] = useState<IncomeCurrencyDto[]>([]);
  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [failed, setFailed] = useState(false);
  const [recording, setRecording] = useState<string | null>(null); // the account to start on, "" = first
  const [editing, setEditing] = useState<IncomeAccountDto | "new" | null>(null);
  const [statementOf, setStatementOf] = useState<IncomeAccountDto | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [a, s] = await Promise.all([getIncomeAccounts(), getIncomeSummary(from, to)]);
      if (!a.success || !s.success) throw new Error(a.message || s.message);
      setAccounts(a.data || []);
      setRows(s.data?.byCurrency || []);
    } catch { setAccounts((x) => x ?? []); setFailed(true); }
  }, [from, to]);
  useEffect(() => { load(); }, [load, version]);

  useEffect(() => {
    let live = true;
    (async () => {
      const [c, b, m] = await Promise.all([getCashAccounts().catch(() => null), getBankAccounts().catch(() => null), getMpesaAgents().catch(() => null)]);
      if (!live) return;
      setReceivers([
        ...((c?.success && c.data) || []).map((x) => ({ type: AccountType.Cash, id: x.id, name: `Cash till (${currencyCode(x.currency)})`, currency: x.currency })),
        ...((b?.success && b.data) || []).filter((x) => x.isActive !== false).map((x) => ({ type: AccountType.Bank, id: x.id, name: `${x.bankName} – ${x.accountName}`, currency: x.currency })),
        ...((m?.success && m.data) || []).filter((x: any) => x.isActive !== false).map((x: any) => ({ type: AccountType.Mpesa, id: x.id, name: `${x.agentName} – ${x.agentNumber}`, currency: x.currency ?? 0 })),
      ]);
    })();
    return () => { live = false; };
  }, []);

  const refresh = () => setVersion((v) => v + 1);
  const active = (accounts || []).filter((a) => a.isActive);
  const shown = rows.filter((r) => r.totalIncome || r.byAccount.length);

  if (statementOf) {
    return <IncomeStatement account={statementOf} initialFrom={from} initialTo={to} onBack={() => { setStatementOf(null); refresh(); }} />;
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Income</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Money the bureau earns other than from exchange, in income accounts you name yourself. Each account has its own statement.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setEditing("new")}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Plus className="h-4 w-4" /> New income account
          </button>
          <button type="button" onClick={() => setRecording("")} disabled={active.length === 0 || receivers.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-4 w-4" /> Record income
          </button>
        </div>
      </div>

      {accounts === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : failed ? (
        <p className="text-sm text-red-700">Couldn&apos;t load income. <button type="button" className="underline" onClick={load}>Try again</button></p>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-900">No income accounts yet</p>
          <p className="mt-1 text-sm text-slate-500">Create one for each kind of income, for example Commission, Rent received or Consultancy.</p>
          <button type="button" onClick={() => setEditing("new")} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
            <Plus className="h-4 w-4" /> New income account
          </button>
        </div>
      ) : (
        <>
          <section aria-labelledby="income-period" className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <h3 id="income-period" className="mr-auto text-base font-semibold text-slate-900">Earned in these dates</h3>
              <div>
                <label htmlFor="income-from" className="block text-xs font-medium text-slate-600">From</label>
                <input id="income-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
              </div>
              <div>
                <label htmlFor="income-to" className="block text-xs font-medium text-slate-600">To</label>
                <input id="income-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
              </div>
            </div>
            {shown.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No income in these dates.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {shown.map((r) => (
                  <div key={r.currency} data-currency={currencyCode(r.currency)} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-600">{currencyCode(r.currency)}</span>
                      <span className="text-xl font-semibold tabular-nums text-slate-900">{formatMoney(r.totalIncome, r.currency)}</span>
                    </div>
                    <ul className="mt-3 divide-y divide-slate-100 text-sm">
                      {r.byAccount.map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-3 py-1.5">
                          <span className="min-w-0 truncate text-slate-700">{l.name}</span>
                          <span className="shrink-0 tabular-nums text-slate-900">{formatMoney(l.amount, r.currency)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="income-accounts" className="rounded-2xl border border-slate-200 bg-white">
            <h3 id="income-accounts" className="border-b border-slate-200 px-5 py-3 text-base font-semibold text-slate-900">Income accounts</h3>
            <ul className="divide-y divide-slate-100">
              {accounts.map((a) => (
                <li key={a.id} data-account={a.name} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      {a.name}
                      {!a.isActive && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Switched off</span>}
                    </p>
                    {a.description && <p className="mt-0.5 text-sm text-slate-500">{a.description}</p>}
                    <p className="mt-1 text-xs text-slate-600">
                      {a.totals.length === 0 ? "Nothing recorded yet" : a.totals.map((t) => formatMoney(t.amount, t.currency)).join(" · ")}
                      {a.postings > 0 && ` · ${a.postings} posting${a.postings === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <button type="button" onClick={() => setStatementOf(a)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-50">
                      <FileText className="h-4 w-4" /> Statement
                    </button>
                    {a.isActive && (
                      <button type="button" onClick={() => setRecording(a.id)} disabled={receivers.length === 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                        <Plus className="h-4 w-4" /> Record
                      </button>
                    )}
                    <button type="button" onClick={() => setEditing(a)} aria-label={`Edit ${a.name}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
                      <Pencil className="h-4 w-4" /> Edit
                    </button>
                    <button type="button" aria-label={`${a.isActive ? "Switch off" : "Switch on"} ${a.name}`}
                      onClick={async () => {
                        const r = await updateIncomeAccount(a.id, { isActive: !a.isActive });
                        if (r.success) { toast.success(`${a.name} switched ${a.isActive ? "off" : "on"}`); refresh(); } else toast.error(r.message);
                      }}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
                      <Power className="h-4 w-4" /> {a.isActive ? "Switch off" : "Switch on"}
                    </button>
                    {a.postings === 0 && (
                      <button type="button" aria-label={`Delete ${a.name}`}
                        onClick={async () => {
                          const r = await deleteIncomeAccount(a.id);
                          if (r.success) { toast.success(`${a.name} deleted`); refresh(); } else toast.error(r.message);
                        }}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" /> Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {editing && <IncomeAccountModal account={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {recording !== null && (
        <RecordIncomeModal accounts={active} receivers={receivers} startOn={recording || undefined}
          onClose={() => setRecording(null)} onSaved={() => { setRecording(null); refresh(); }} />
      )}
    </div>
  );
}

/** Create or rename an income account. */
export function IncomeAccountModal({ account, onClose, onSaved }: { account: IncomeAccountDto | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(account?.name ?? "");
  const [description, setDescription] = useState(account?.description ?? "");
  const [busy, setBusy] = useState(false);
  const ok = name.trim().length > 0 && name.trim().length <= 100;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    try {
      const r = account
        ? await updateIncomeAccount(account.id, { name: name.trim(), description: description.trim() })
        : await createIncomeAccount({ name: name.trim(), description: description.trim() || undefined });
      if (r.success) { toast.success(account ? "Income account updated" : `${name.trim()} created`); onSaved(); }
      else toast.error(r.message || "Couldn't save");
    } catch (err: any) { toast.error(err?.message || "Couldn't save"); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="income-account-title">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="income-account-title" className="text-lg font-semibold text-slate-900">{account ? `Edit ${account.name}` : "New income account"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <label htmlFor="income-account-name" className="block text-sm font-medium text-slate-700">Name</label>
            <input id="income-account-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Commission, Rent received"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500" />
          </div>
          <div>
            <label htmlFor="income-account-description" className="block text-sm font-medium text-slate-700">Description <span className="font-normal text-slate-500">(optional)</span></label>
            <input id="income-account-description" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900" />
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={!ok || busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {account ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function RecordIncomeModal({ accounts, receivers, startOn, onClose, onSaved }: {
  accounts: IncomeAccountDto[];
  receivers: Receiver[];
  startOn?: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [accountId, setAccountId] = useState(startOn ?? accounts[0]?.id ?? "");
  const [receiverKey, setReceiverKey] = useState(receivers[0] ? `${receivers[0].type}:${receivers[0].id}` : "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const { gate, modal } = usePinGate();

  const receiver = receivers.find((r) => `${r.type}:${r.id}` === receiverKey);
  const account = accounts.find((k) => k.id === accountId);
  const a = parseAmount(amount);
  const problem = useMemo(() => (amount.trim() !== "" && !(a > 0) ? "Enter the amount as a number above zero." : null), [amount, a]);
  const ready = !!receiver && !!account && a > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const save = async () => {
    if (!ready || !receiver || !account) return;
    setBusy(true);
    try {
      const r = await recordIncome({
        incomeAccountId: account.id, destAccountType: receiver.type, destAccountId: receiver.id, currency: receiver.currency,
        amount: a, date: date || undefined, description: description.trim() || undefined, reference: reference.trim() || undefined,
      });
      if (r.success) {
        toast.success(`${account.name}: ${formatMoney(a, receiver.currency)} into ${receiver.name}`);
        await onSaved();
      } else toast.error(r.message || "Couldn't record the income");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't record the income");
    } finally { setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => { e.preventDefault(); if (ready) await gate(save); };
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
              <label htmlFor="income-account" className="block text-sm font-medium text-slate-700">Income account</label>
              <select id="income-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} className={field}>
                {accounts.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
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
              <label htmlFor="income-amount" className="block text-sm font-medium text-slate-700">Amount{receiver ? ` (${currencyCode(receiver.currency)})` : ""}</label>
              <input id="income-amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10,000" className={`${field} tabular-nums`} />
            </div>
            <div>
              <label htmlFor="income-date" className="block text-sm font-medium text-slate-700">Date received <span className="font-normal text-slate-500">(optional)</span></label>
              <input id="income-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="income-description" className="block text-sm font-medium text-slate-700">Description <span className="font-normal text-slate-500">(optional)</span></label>
            <input id="income-description" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Shop 3, November" className={field} />
          </div>
          <div>
            <label htmlFor="income-ref" className="block text-sm font-medium text-slate-700">Reference <span className="font-normal text-slate-500">(optional)</span></label>
            <input id="income-ref" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} className={field} />
          </div>

          {problem ? (
            <p role="alert" className="text-sm text-red-700">{problem}</p>
          ) : ready && receiver && account ? (
            <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700" data-testid="income-entry">
              Dr {receiver.name} {formatMoney(a, receiver.currency)} · Cr {account.name} {formatMoney(a, receiver.currency)}
            </p>
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
      {modal}
    </div>
  );
}

/** One income account's statement: earned before the start date, each posting with a running total, earned to the end date. */
export function IncomeStatement({ account, initialFrom, initialTo, onBack }: { account: IncomeAccountDto; initialFrom: string; initialTo: string; onBack: () => void }) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [st, setSt] = useState<IncomeStatementDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [reversing, setReversing] = useState<IncomeStatementLineDto | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    getIncomeStatement(account.id, from || undefined, to || undefined)
      .then((r) => { if (!live) return; if (r.success && r.data) setSt(r.data); else { setSt(null); setFailed(true); } })
      .catch(() => { if (live) { setSt(null); setFailed(true); } });
    return () => { live = false; };
  }, [account.id, from, to, version]);

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <button type="button" onClick={onBack} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4" /> Income
        </button>
        <div className="ml-auto flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="statement-from" className="block text-xs font-medium text-slate-600">From</label>
            <input id="statement-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
          </div>
          <div>
            <label htmlFor="statement-to" className="block text-xs font-medium text-slate-600">To</label>
            <input id="statement-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
          </div>
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-semibold text-slate-900">{account.name}: statement</h2>
        <p className="mt-1 text-sm text-slate-500">
          {from ? fmtDate(from) : "From the first posting"} to {to ? fmtDate(to) : "today"}
          {account.description ? ` · ${account.description}` : ""}
          {!account.isActive ? " · Switched off" : ""}
        </p>
      </div>

      {st === null && !failed ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : failed || !st ? (
        <p className="text-sm text-red-700">Couldn&apos;t load the statement.</p>
      ) : st.byCurrency.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Nothing recorded in this account yet.</p>
      ) : (
        st.byCurrency.map((c) => (
          <section key={c.currency} data-currency={currencyCode(c.currency)} aria-label={`${account.name} in ${currencyCode(c.currency)}`} className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-5 py-3">
              <h3 className="text-base font-semibold text-slate-900">{currencyCode(c.currency)}</h3>
              <p className="text-sm text-slate-600">Earned in these dates: <span className="font-semibold tabular-nums text-slate-900">{formatMoney(c.inPeriod, c.currency)}</span></p>
            </div>
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
                  <th scope="col" className="px-5 py-2">Date</th>
                  <th scope="col" className="py-2 pr-3">Code</th>
                  <th scope="col" className="py-2 pr-3">Description</th>
                  <th scope="col" className="py-2 pr-3">Received into</th>
                  <th scope="col" className="py-2 pr-3 text-right">Amount</th>
                  <th scope="col" className="py-2 pr-5 text-right">Running total</th>
                  <th scope="col" className="py-2 pr-5 print:hidden"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-slate-900">
                <tr className="border-b border-slate-100 bg-slate-50 font-medium">
                  <td className="px-5 py-2" colSpan={5}>Earned before {from ? fmtDate(from) : "the first posting"}</td>
                  <td className="py-2 pr-5 text-right">{formatMoney(c.opening, c.currency)}</td>
                  <td className="print:hidden" />
                </tr>
                {c.lines.map((l) => (
                  <tr key={l.transactionId} className="border-b border-slate-100" data-code={l.code}>
                    <td className="whitespace-nowrap px-5 py-2">{fmtDate(l.date)}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{l.code}</td>
                    <td className="py-2 pr-3">
                      {l.description}
                      {l.isReversed && <span className="ml-2 text-xs font-medium text-amber-800">Reversed</span>}
                    </td>
                    <td className="py-2 pr-3">{l.receivedInto}</td>
                    <td className={`py-2 pr-3 text-right ${l.amount < 0 ? "text-red-700" : ""}`}>{l.amount < 0 ? `−${formatMoney(-l.amount, c.currency)}` : formatMoney(l.amount, c.currency)}</td>
                    <td className="py-2 pr-5 text-right">{formatMoney(l.runningTotal, c.currency)}</td>
                    <td className="py-2 pr-5 text-right print:hidden">
                      {!l.isReversal && !l.isReversed && (
                        <button type="button" onClick={() => setReversing(l)} className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Reverse</button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-5 py-2" colSpan={5}>Earned to {to ? fmtDate(to) : "today"}</td>
                  <td className="py-2 pr-5 text-right">{formatMoney(c.closing, c.currency)}</td>
                  <td className="print:hidden" />
                </tr>
              </tbody>
            </table>
          </section>
        ))
      )}

      {reversing && <ReverseLine line={reversing} onClose={() => setReversing(null)} onDone={() => { setReversing(null); setVersion((v) => v + 1); }} />}
    </div>
  );
}

/** Reverse one income posting; asks for a reason and the PIN if the bureau has one. */
function ReverseLine({ line, onClose, onDone }: { line: IncomeStatementLineDto; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { gate, modal } = usePinGate();
  const go = async () => {
    setBusy(true);
    try {
      const r = await deleteTransaction(line.transactionId, reason.trim());
      if (r.success) { toast.success(`${line.code} reversed`); onDone(); } else toast.error(r.message || "Couldn't reverse it");
    } catch (e: any) { toast.error(e?.message || "Couldn't reverse it"); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="reverse-title">
      <form onSubmit={(e) => { e.preventDefault(); if (reason.trim().length >= 3) gate(go); }} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="reverse-title" className="text-lg font-semibold text-slate-900">Reverse {line.code}?</h2>
        <p className="mt-1 text-sm text-slate-600">{line.description}. The money comes back out of {line.receivedInto}.</p>
        <label htmlFor="reverse-reason" className="mt-4 block text-sm font-medium text-slate-700">Reason</label>
        <input id="reverse-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900" />
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700">Cancel</button>
          <button type="submit" disabled={busy || reason.trim().length < 3} className="h-10 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50">Reverse</button>
        </div>
      </form>
      {modal}
    </div>
  );
}
