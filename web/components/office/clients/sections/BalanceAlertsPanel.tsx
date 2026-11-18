"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createBalanceAlert, currencyCode, deleteBalanceAlert, formatMoney, getBalanceAlerts, toggleBalanceAlert } from "@/lib/api";

/** A rule as GET /api/balance-alerts returns it (BalanceAlertRuleDto). */
export interface BalanceAlertRule {
  id: string;
  clientId?: string | null;
  clientName?: string | null;
  currency: number;
  direction: number; // 0 = below, 1 = above
  threshold: number;
  isActive: boolean;
  lastTriggeredAt?: string | null;
  createdAt: string;
}

/** "1,500.50" → 1500.5; anything that is not a plain positive number → NaN. */
export function parseThreshold(text: string): number {
  const t = text.replace(/[,\s]/g, "");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

/**
 * Balance alerts for one client, inside Edit client. The office is told (push to the
 * office phones, and an office alert) when this client's balance in a currency goes below
 * or above an amount, at most once a day per rule. Bureau-wide rules (set for every
 * client) are listed apart, read-only here, so removing one is never a side effect of
 * editing a single client.
 */
export function BalanceAlertsPanel({ clientId, clientName, currencies, homeCurrency }: {
  clientId: string;
  clientName: string;
  /** Currencies offered for a new rule: the home currency first. */
  currencies: number[];
  homeCurrency: number;
}) {
  const [rules, setRules] = useState<BalanceAlertRule[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [currency, setCurrency] = useState(homeCurrency);
  const [direction, setDirection] = useState(0);
  const [threshold, setThreshold] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const r = await getBalanceAlerts(clientId);
      if (r.success) setRules(r.data || []);
      else { setRules([]); setFailed(true); }
    } catch { setRules([]); setFailed(true); }
  }, [clientId]);
  useEffect(() => { setRules(null); setThreshold(""); setCurrency(homeCurrency); setDirection(0); load(); }, [clientId, homeCurrency, load]);

  const own = (rules || []).filter((r) => r.clientId === clientId);
  const everyone = (rules || []).filter((r) => !r.clientId);
  const amount = parseThreshold(threshold);
  const duplicate = own.some((r) => r.currency === currency && r.direction === direction && r.threshold === amount);

  const add = async () => {
    if (!(amount > 0)) { toast.error("Type the amount as digits, e.g. 50000 or 1,500.50"); return; }
    if (duplicate) { toast.error("This client already has that alert"); return; }
    setBusy("add");
    try {
      const r = await createBalanceAlert({ clientId, currency, direction, threshold: amount, notifyAllOfficeUsers: true });
      if (!r.success) { toast.error(r.message || "Couldn't add the alert"); return; }
      toast.success(`Alert added: ${clientName}'s ${currencyCode(currency)} ${direction === 0 ? "below" : "above"} ${formatMoney(amount, currency)}`);
      setThreshold("");
      await load();
    } catch { toast.error("Couldn't add the alert"); } finally { setBusy(null); }
  };
  const toggle = async (rule: BalanceAlertRule) => {
    setBusy(rule.id);
    try {
      const r = await toggleBalanceAlert(rule.id);
      if (!r.success) { toast.error(r.message || "Couldn't change the alert"); return; }
      setRules((xs) => (xs || []).map((x) => (x.id === rule.id ? { ...x, isActive: !x.isActive } : x)));
    } catch { toast.error("Couldn't change the alert"); } finally { setBusy(null); }
  };
  const remove = async (rule: BalanceAlertRule) => {
    if (!window.confirm(`Remove the alert "${currencyCode(rule.currency)} ${rule.direction === 0 ? "below" : "above"} ${formatMoney(rule.threshold, rule.currency)}"?`)) return;
    setBusy(rule.id);
    try {
      const r = await deleteBalanceAlert(rule.id);
      if (!r.success) { toast.error(r.message || "Couldn't remove the alert"); return; }
      setRules((xs) => (xs || []).filter((x) => x.id !== rule.id));
    } catch { toast.error("Couldn't remove the alert"); } finally { setBusy(null); }
  };

  const ruleText = (r: BalanceAlertRule) => `${currencyCode(r.currency)} balance ${r.direction === 0 ? "below" : "above"} ${formatMoney(r.threshold, r.currency)}`;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600 leading-relaxed">
        The office is notified when {clientName}&apos;s balance crosses an amount you set: on the office phones and in
        the office alerts. Each alert is sent at most once a day. The client is not told.
      </p>

      {rules === null ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading alerts…</div>
      ) : (
        <>
          {failed && (
            <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Couldn&apos;t load the alerts.
              <button type="button" onClick={load} className="font-semibold underline">Try again</button>
            </div>
          )}
          <ul className="space-y-2" aria-label="This client's alerts">
            {own.length === 0 && !failed && (
              <li className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-center text-xs text-slate-500">No alerts for this client yet</li>
            )}
            {own.map((r) => (
              <li key={r.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${r.isActive ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"}`}>
                {r.isActive ? <Bell className="w-4 h-4 shrink-0 text-blue-600" /> : <BellOff className="w-4 h-4 shrink-0 text-slate-400" />}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold tabular-nums ${r.isActive ? "text-slate-900" : "text-slate-500 line-through"}`}>{ruleText(r)}</p>
                  <p className="text-[11px] text-slate-500">
                    {r.isActive ? "On" : "Paused"}
                    {r.lastTriggeredAt ? ` · last sent ${when(r.lastTriggeredAt)}` : " · not sent yet"}
                  </p>
                </div>
                <button type="button" disabled={busy === r.id} onClick={() => toggle(r)}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                  {r.isActive ? "Pause" : "Turn on"}
                </button>
                <button type="button" aria-label={`Remove alert ${ruleText(r)}`} disabled={busy === r.id} onClick={() => remove(r)}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>

          {everyone.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-xs font-semibold text-slate-700">Also applies (set for every client)</p>
              <ul className="mt-1 space-y-0.5">
                {everyone.map((r) => (
                  <li key={r.id} className="text-xs text-slate-600 tabular-nums">{ruleText(r)}{r.isActive ? "" : " (paused)"}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">New alert</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_auto_1fr]">
          <div role="radiogroup" aria-label="Currency" className="flex gap-1">
            {currencies.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={currency === c} onClick={() => setCurrency(c)}
                className={`rounded-md px-3 py-2 text-xs font-semibold border ${currency === c ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
                {currencyCode(c)}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="alert-direction">When the balance goes</label>
          <select id="alert-direction" value={direction} onChange={(e) => setDirection(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
            <option value={0}>goes below</option>
            <option value={1}>goes above</option>
          </select>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="alert-threshold">Amount</label>
            <input id="alert-threshold" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder={`Amount in ${currencyCode(currency)}`}
              aria-invalid={threshold !== "" && !(amount > 0)}
              className={`min-w-0 flex-1 rounded-md border px-3 py-2 text-sm tabular-nums ${threshold !== "" && !(amount > 0) ? "border-red-400" : "border-slate-300"}`} />
            <button type="button" onClick={add} disabled={busy === "add" || !(amount > 0)}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {busy === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
            </button>
          </div>
        </div>
        {amount > 0 && (
          <p className="mt-2 text-xs text-slate-600">
            Notify the office when {clientName}&apos;s {currencyCode(currency)} balance {direction === 0 ? "goes below" : "goes above"}{" "}
            <span className="font-semibold tabular-nums">{formatMoney(amount, currency)}</span>.
            {duplicate && <span className="text-red-600"> This alert already exists.</span>}
          </p>
        )}
      </fieldset>
    </div>
  );
}
