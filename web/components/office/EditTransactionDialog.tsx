"use client";

/**
 * Edit a posted transaction's paperwork — description and notes.
 * The reference is shown but locked: the API doesn't accept changes to it, and
 * references starting REV-/EXC-/EXP-/FLOAT- mark system entries.
 *
 * Amount, currency and direction are shown but NOT editable: the API only
 * accepts these three text fields, and money changes must go through a
 * reversal so the ledger keeps its history.
 */

import { useEffect, useState } from "react";
import { X, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { updateTransaction, currencyCode, currencyDecimals } from "@/lib/api";
import { ui } from "./theme";

export interface EditableTransaction {
  id: string;
  code?: string;
  reference?: string;
  description?: string;
  notes?: string | null;
  amount: number;
  currency: number;
  thisAccountAction?: string;
}

export function EditTransactionDialog({
  txn,
  onClose,
  onSaved,
}: {
  txn: EditableTransaction;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [description, setDescription] = useState(txn.description || "");
  const [notes, setNotes] = useState(txn.notes || "");
  const [saving, setSaving] = useState(false);

  const unchanged =
    description === (txn.description || "") && notes === (txn.notes || "");

  const save = async () => {
    setSaving(true);
    try {
      const res = await updateTransaction(txn.id, {
        description: description.trim() || undefined,
        notes: notes.trim(), // "" clears the note; undefined would silently keep the old one
      });
      if (res.success) {
        toast.success(`${txn.reference || txn.code} updated`);
        await onSaved();
        onClose();
      } else {
        toast.error(res.message || "Couldn't update the transaction");
      }
    } catch {
      toast.error("Couldn't update the transaction");
    } finally {
      setSaving(false);
    }
  };

  // Escape closes the dialog (keyboard users can't click the dark backdrop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const field =
    "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15";
  const dp = currencyDecimals(txn.currency);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit transaction"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Edit transaction</h3>
            <p className="font-mono text-xs text-slate-500">{txn.code || txn.reference}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="space-y-4 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!unchanged) save();
          }}
        >
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-[#E9EEF6] px-3 py-2.5 text-sm">
            <div>
              <p className="text-xs text-slate-500">Amount</p>
              <p className="font-semibold tabular-nums text-slate-900">
                {currencyCode(txn.currency)}{" "}
                {(txn.amount || 0).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Entry</p>
              <p className="font-semibold text-slate-900">{txn.thisAccountAction || "—"}</p>
            </div>
            <div className="flex items-center justify-end gap-1 text-xs text-slate-500">
              <Lock className="h-3.5 w-3.5" /> Reverse to change money
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Reference</span>
            <div className={`${field} flex items-center justify-between bg-slate-50 font-mono text-slate-500`}>
              <span>{txn.reference || txn.code || "—"}</span>
              <Lock className="h-3.5 w-3.5" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Description</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className={field} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
            />
          </label>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className={`${ui.btnSecondary} flex-1`}>
              Cancel
            </button>
            <button type="submit" disabled={saving || unchanged} className={`${ui.btnPrimary} flex-1`}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditTransactionDialog;
