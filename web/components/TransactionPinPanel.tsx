"use client";

/**
 * Super admin: the bureau's transaction PIN.
 *
 * When it is ON, office staff must enter the 4-digit PIN to post a transaction,
 * reverse one, record an exchange or void one — the API refuses those calls
 * otherwise. Only the super admin can set, change, switch off or remove it.
 */

import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/superadmin-api";

type Status = { isEnabled: boolean; hasPin: boolean };

const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, 4);

export function TransactionPinPanel({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    const res = await api.getTransactionPinStatus(companyId);
    if (res.success && res.data) {
      setStatus({ isEnabled: !!res.data.isEnabled, hasPin: !!res.data.hasPin });
    } else {
      setLoadError(true);
    }
  }, [companyId]);

  useEffect(() => {
    setStatus(null);
    setEditing(false);
    setConfirmRemove(false);
    load();
  }, [load]);

  const save = async () => {
    if (pin.length !== 4) return toast.error("The PIN must be exactly 4 digits");
    if (pin !== confirm) return toast.error("The two PINs don't match");
    if (/^(\d)\1{3}$/.test(pin) || pin === "1234" || pin === "0000")
      return toast.error("Choose a less obvious PIN than " + pin);
    setBusy(true);
    const res = await api.setTransactionPin(companyId, pin);
    setBusy(false);
    if (res.success) {
      toast.success(`PIN ${status?.hasPin ? "changed" : "set"} for ${companyName}. It is now required.`);
      setEditing(false);
      setPin("");
      setConfirm("");
      load();
    } else {
      toast.error(res.message || "Couldn't save the PIN");
    }
  };

  const toggle = async () => {
    setBusy(true);
    const res = await api.toggleTransactionPin(companyId);
    setBusy(false);
    if (res.success) {
      toast.success(res.message || "Updated");
      load();
    } else {
      toast.error(res.message || "Couldn't change the PIN setting");
    }
  };

  const remove = async () => {
    setBusy(true);
    const res = await api.removeTransactionPin(companyId);
    setBusy(false);
    setConfirmRemove(false);
    if (res.success) {
      toast.success(`PIN removed for ${companyName}`);
      load();
    } else {
      toast.error(res.message || "Couldn't remove the PIN");
    }
  };

  const field =
    "h-10 w-28 rounded-lg border border-slate-300 bg-white px-3 text-center font-mono text-lg tracking-[0.4em] text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15";
  const btn =
    "inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-60";

  const pill = !status
    ? null
    : status.isEnabled && status.hasPin
      ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Required</span>
      : status.hasPin
        ? <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">Set, switched off</span>
        : <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Not set</span>;

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <Lock className="h-4 w-4 text-slate-500" /> Transaction PIN {pill}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            When required, office staff enter this 4-digit PIN to post or reverse a transaction and to record or void an
            exchange. Share it only with the people who should approve money movements. Five wrong tries lock it for 15 minutes.
          </p>
        </div>

        {status && !editing && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button onClick={() => setEditing(true)} disabled={busy} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
              {status.hasPin ? "Change PIN" : "Set PIN"}
            </button>
            {status.hasPin && (
              <button onClick={toggle} disabled={busy} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
                {status.isEnabled ? "Switch off" : "Switch on"}
              </button>
            )}
            {status.hasPin && !confirmRemove && (
              <button onClick={() => setConfirmRemove(true)} disabled={busy} className={`${btn} text-red-700 hover:bg-red-50`}>
                Remove
              </button>
            )}
          </div>
        )}
      </div>

      {loadError && (
        <p className="mt-3 text-sm text-red-700">
          Couldn't load the PIN status.{" "}
          <button onClick={load} className="font-medium underline">Try again</button>
        </p>
      )}

      {confirmRemove && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <span>Remove the PIN? Staff will be able to move money without it.</span>
          <span className="flex gap-2">
            <button onClick={() => setConfirmRemove(false)} className={`${btn} bg-white text-slate-700`}>Keep it</button>
            <button onClick={remove} disabled={busy} className={`${btn} bg-red-600 text-white hover:bg-red-700`}>Remove PIN</button>
          </span>
        </div>
      )}

      {editing && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">New PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(e) => setPin(digitsOnly(e.target.value))}
              className={field}
              aria-label="New PIN"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Repeat PIN</span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(digitsOnly(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && save()}
              className={field}
              aria-label="Repeat PIN"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => { setEditing(false); setPin(""); setConfirm(""); }}
              className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
            >
              Cancel
            </button>
            <button onClick={save} disabled={busy || pin.length !== 4 || confirm.length !== 4} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
              {busy ? "Saving…" : "Save PIN"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
