"use client";

/**
 * Transaction pop-ups shared by Bank accounts, Mobile money and Clients:
 *   • TransactionDetailsDialog  — what happened, with a printable receipt
 *   • RelatedAccountDialog      — the other side of the double entry
 *   • ReverseTransactionDialog  — post the opposite entry (with an optional reason)
 *
 * One copy, so a fix lands on every screen. Money in / out is worked out here
 * once: Cash, Bank and Mobile money are assets (Debit = money in); a client
 * account is what the bureau owes the client (Credit = money in).
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  X,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowRight,
  ArrowLeft,
  Printer,
  Link2,
  Loader2,
  RotateCcw,
  CalendarDays,
  User,
  Building2,
  Smartphone,
  Banknote,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { currencyCode, currencyDecimals } from "@/lib/api";
import { escapeHtml, printHtml } from "@/lib/print";
import { useAuth } from "@/providers/AuthProvider";
import { ui } from "./theme";
import { PinModal, checkPinStatus } from "@/components/ui/PinModal";

export type LedgerKind = "client" | "bank" | "mpesa" | "cash";

/** The display transaction each screen already builds from a statement line. */
export interface DialogTxn {
  id: string;
  code: string;
  reference: string;
  description: string;
  date?: string;
  transactionDate?: string;
  thisAccountAction: string; // "Debit" | "Credit", from this account's side
  amount: number;
  currency: number;
  balanceBefore?: number;
  balanceAfter: number;
  notes?: string | null;
  exchangeRate?: number | null;
  counterAmount?: number | null;
  counterCurrency?: number | null;
  isReversed?: boolean;
  isReversal?: boolean;
  relatedAccount?: {
    accountType: number;
    accountName: string;
    accountCode?: string | null;
    currency: number;
    action: string;
    amount: number;
    balanceAfter: number;
    clientCode?: string | null;
    clientPhone?: string | null;
  };
}

// ---------- shared rules & formatting ----------

const ACCOUNT_TYPE_LABEL: Record<number, string> = { 0: "Cash", 1: "Bank account", 2: "Mobile money", 3: "Client", 4: "Expense" };
const KIND_LABEL: Record<LedgerKind, string> = { client: "Client account", bank: "Bank account", mpesa: "Mobile money", cash: "Cash" };
const KIND_TYPE: Record<LedgerKind, number> = { cash: 0, bank: 1, mpesa: 2, client: 3 };
const CURRENCY_NAME: Record<string, string> = { KES: "Kenyan shilling", USD: "US dollar", UGX: "Ugandan shilling", EUR: "Euro" };

/** Money in for this account type? Assets: Debit. Client (liability) and expense: Credit / Debit as booked. */
export const isMoneyIn = (accountType: number, action: string) =>
  accountType === 3 ? action === "Credit" : action === "Debit";

export const formatMoney = (amount: number, currency: number) => {
  const dp = currencyDecimals(currency);
  return `${currencyCode(currency)} ${Math.abs(amount || 0).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
};

const signed = (amount: number, currency: number, moneyIn: boolean) =>
  `${amount ? (moneyIn ? "+" : "−") : ""}${formatMoney(amount, currency)}`;

const when = (t: DialogTxn) => {
  const d = new Date(t.date || t.transactionDate || "");
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const TypeIcon = ({ type, className }: { type: number; className?: string }) =>
  type === 3 ? <User className={className} /> : type === 1 ? <Building2 className={className} /> : type === 2 ? <Smartphone className={className} /> : type === 0 ? <Banknote className={className} /> : <Receipt className={className} />;

// ---------- dialog shell ----------

function Shell({
  label,
  icon,
  title,
  subtitle,
  onClose,
  footer,
  children,
  z = "z-[60]",
}: {
  label: string;
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  z?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={`fixed inset-0 ${z} flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4`} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E9EEF6] text-[#0F172A]">{icon}</div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

const Field = ({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className={`mt-0.5 break-words text-sm font-semibold text-slate-900 ${mono ? "font-mono" : ""}`}>{children || "—"}</p>
  </div>
);

const StatusPill = ({ t }: { t: DialogTxn }) =>
  t.isReversal ? (
    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Reversal</span>
  ) : t.isReversed ? (
    <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Reversed</span>
  ) : null;

// ---------- 1. details ----------

export function TransactionDetailsDialog({
  txn,
  kind,
  accountName,
  onClose,
  onRelated,
}: {
  txn: DialogTxn;
  kind: LedgerKind;
  /** e.g. "Equity Bank – 0180…", the client's name. Printed on the receipt. */
  accountName?: string;
  onClose: () => void;
  onRelated?: () => void;
}) {
  const { user } = useAuth();
  const moneyIn = isMoneyIn(KIND_TYPE[kind], txn.thisAccountAction);
  const fx = txn.exchangeRate && txn.counterAmount && txn.counterCurrency !== undefined && txn.counterCurrency !== null;

  const printReceipt = () => {
    const bureau = (user as any)?.companyName || "Sarif";
    const row = (k: string, v: string) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`;
    const ok = printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${escapeHtml(txn.code)}</title>
      <style>body{font-family:Arial,sans-serif;color:#0F172A;margin:32px;max-width:520px}h1{font-size:18px;margin:0}
      .muted{color:#64748B;font-size:12px}.amt{font-size:26px;font-weight:700;margin:18px 0 4px;color:${moneyIn ? "#047857" : "#B91C1C"}}
      table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}td{padding:7px 0;border-bottom:1px solid #E2E8F0}
      td:first-child{color:#64748B;width:42%}.foot{margin-top:22px;font-size:11px;color:#94A3B8}</style></head><body>
      <h1>${escapeHtml(bureau)}</h1><div class="muted">Transaction receipt · ${escapeHtml(KIND_LABEL[kind])}${accountName ? " · " + escapeHtml(accountName) : ""}</div>
      <div class="amt">${escapeHtml(signed(txn.amount, txn.currency, moneyIn))}</div>
      <div class="muted">${moneyIn ? "Money in" : "Money out"}${txn.isReversed ? " · REVERSED" : txn.isReversal ? " · REVERSAL" : ""}</div>
      <table>
        ${row("Transaction", txn.code)}${row("Reference", txn.reference || "—")}${row("Date", when(txn))}
        ${row("Description", txn.description || "—")}
        ${fx ? row("Exchange", `${formatMoney(txn.counterAmount!, txn.counterCurrency!)} @ ${txn.exchangeRate}`) : ""}
        ${txn.relatedAccount ? row("Other account", `${ACCOUNT_TYPE_LABEL[txn.relatedAccount.accountType] || "Account"} · ${txn.relatedAccount.accountName}`) : ""}
        ${row("Balance after", formatMoney(txn.balanceAfter, txn.currency))}
        ${txn.notes ? row("Notes", txn.notes) : ""}
      </table>
      <div class="foot">Printed ${escapeHtml(new Date().toLocaleString("en-GB"))} · computer-generated, no signature required</div>
      </body></html>`);
    if (!ok) toast.error("Couldn't open the print view");
  };

  return (
    <Shell
      label="Transaction details"
      icon={moneyIn ? <ArrowDownCircle className="h-5 w-5 text-emerald-600" /> : <ArrowUpCircle className="h-5 w-5 text-red-600" />}
      title="Transaction details"
      subtitle={<span className="font-mono">{txn.code}</span>}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={`${ui.btnSecondary} flex-1`}>Close</button>
          <button onClick={printReceipt} className={ui.btnSecondary} aria-label="Print receipt" title="Print receipt">
            <Printer className="h-4 w-4" /> <span className="hidden sm:inline">Receipt</span>
          </button>
          {onRelated && txn.relatedAccount && (
            <button onClick={onRelated} className={`${ui.btnPrimary} flex-1`}>
              <Link2 className="h-4 w-4" /> Related account
            </button>
          )}
        </>
      }
    >
      <div className={`rounded-xl border p-4 ${moneyIn ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs font-semibold uppercase tracking-wide ${moneyIn ? "text-emerald-700" : "text-red-700"}`}>
            {moneyIn ? "Money in" : "Money out"} · {txn.thisAccountAction}
          </p>
          <StatusPill t={txn} />
        </div>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${moneyIn ? "text-emerald-700" : "text-red-700"} ${txn.isReversed ? "line-through" : ""}`}>
          {signed(txn.amount, txn.currency, moneyIn)}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          {txn.balanceBefore !== undefined && <>Balance {formatMoney(txn.balanceBefore, txn.currency)} → </>}
          <span className="font-semibold text-slate-900">{formatMoney(txn.balanceAfter, txn.currency)}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Reference" mono>{txn.reference}</Field>
        <Field label="Currency">{`${currencyCode(txn.currency)} · ${CURRENCY_NAME[currencyCode(txn.currency)] || ""}`}</Field>
        <div className="col-span-2">
          <Field label="Date & time">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-slate-500" />{when(txn)}</span>
          </Field>
        </div>
      </div>

      {fx && (
        <Field label="Exchange">{`${formatMoney(txn.counterAmount!, txn.counterCurrency!)} @ ${txn.exchangeRate}`}</Field>
      )}

      <Field label="Description">{txn.description}</Field>
      {txn.notes && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs font-medium text-amber-800">Notes</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">{txn.notes}</p>
        </div>
      )}
    </Shell>
  );
}

// ---------- 2. related account ----------

export function RelatedAccountDialog({
  txn,
  kind,
  onClose,
  onBack,
}: {
  txn: DialogTxn;
  kind: LedgerKind;
  onClose: () => void;
  /** Back to the transaction details. */
  onBack?: () => void;
}) {
  const r = txn.relatedAccount;
  if (!r) return null;
  const thisIn = isMoneyIn(KIND_TYPE[kind], txn.thisAccountAction);
  // Double entry: the other side is always booked opposite to this one.
  const otherAction = r.action || (txn.thisAccountAction === "Debit" ? "Credit" : "Debit");
  const otherIn = isMoneyIn(r.accountType, otherAction);
  const otherAmount = r.amount || (r.currency === txn.currency ? txn.amount : 0);

  return (
    <Shell
      z="z-[70]"
      label="Related account"
      icon={<TypeIcon type={r.accountType} className="h-5 w-5" />}
      title="Related account"
      subtitle="The other side of this double entry"
      onClose={onClose}
      footer={
        <>
          {onBack && (
            <button onClick={onBack} className={`${ui.btnSecondary} flex-1`}>
              <ArrowLeft className="h-4 w-4" /> Transaction
            </button>
          )}
          <button onClick={onClose} className={`${ui.btnPrimary} flex-1`}>Close</button>
        </>
      }
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-medium text-slate-500">{ACCOUNT_TYPE_LABEL[r.accountType] || "Account"}</p>
        <p className="mt-0.5 text-lg font-semibold text-slate-900">{r.accountName || "—"}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {r.accountCode && <span>Code <span className="font-mono font-semibold text-slate-900">{r.accountCode}</span></span>}
          {r.clientCode && r.clientCode !== r.accountCode && <span>Client <span className="font-mono font-semibold text-slate-900">{r.clientCode}</span></span>}
          {r.clientPhone && <span>Phone <span className="font-semibold text-slate-900">{r.clientPhone}</span></span>}
          <span>Currency <span className="font-semibold text-slate-900">{currencyCode(r.currency)}</span></span>
        </div>
      </div>

      <div className={`rounded-xl border p-4 ${otherIn ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
        <p className={`text-xs font-semibold uppercase tracking-wide ${otherIn ? "text-emerald-700" : "text-red-700"}`}>
          How this account was affected · {otherAction}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-600">{otherIn ? "Money in" : "Money out"}</p>
            <p className={`text-lg font-semibold tabular-nums ${otherIn ? "text-emerald-700" : "text-red-700"}`}>{signed(otherAmount, r.currency, otherIn)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">Balance after</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900">{formatMoney(r.balanceAfter, r.currency)}</p>
          </div>
        </div>
      </div>

      {/* The double entry, side by side */}
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="mb-3 text-xs font-semibold text-slate-700">Double entry</p>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 text-center">
            <TypeIcon type={KIND_TYPE[kind]} className="mx-auto h-5 w-5 text-[#0F172A]" />
            <p className="mt-1 text-xs font-semibold text-slate-900">{KIND_LABEL[kind]}</p>
            <p className={`text-xs font-semibold ${thisIn ? "text-emerald-700" : "text-red-700"}`}>
              {txn.thisAccountAction} · {signed(txn.amount, txn.currency, thisIn)}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1 text-center">
            <TypeIcon type={r.accountType} className="mx-auto h-5 w-5 text-[#0F172A]" />
            <p className="mt-1 truncate text-xs font-semibold text-slate-900">{ACCOUNT_TYPE_LABEL[r.accountType] || "Account"}</p>
            <p className={`text-xs font-semibold ${otherIn ? "text-emerald-700" : "text-red-700"}`}>
              {otherAction} · {signed(otherAmount, r.currency, otherIn)}
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ---------- 3. reverse ----------

export function ReverseTransactionDialog({
  txn,
  kind,
  busy,
  onClose,
  onConfirm,
}: {
  txn: DialogTxn;
  kind: LedgerKind;
  busy: boolean;
  onClose: () => void;
  /** Receives the typed reason ("" when left blank). */
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const moneyIn = isMoneyIn(KIND_TYPE[kind], txn.thisAccountAction);

  // The API refuses a reversal without a fresh PIN when the bureau has one switched on,
  // so ask for it here rather than letting the request fail.
  const confirm = async () => {
    setChecking(true);
    const pin = await checkPinStatus();
    setChecking(false);
    if (pin.isEnabled && pin.hasPin) setPinOpen(true);
    else onConfirm(reason.trim());
  };

  return (
    <>
    <PinModal
      isOpen={pinOpen}
      onClose={() => setPinOpen(false)}
      onVerified={() => {
        setPinOpen(false);
        onConfirm(reason.trim());
      }}
      title="Enter PIN to reverse"
    />
    <Shell
      label="Reverse transaction"
      icon={<RotateCcw className="h-5 w-5 text-red-600" />}
      title="Reverse transaction"
      subtitle="Both entries stay on the statement"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy} className={`${ui.btnSecondary} flex-1`}>Cancel</button>
          <button
            onClick={confirm}
            disabled={busy || checking}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Reversing…" : "Reverse"}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        Sarif posts an opposite entry that cancels this one and puts the money back. The original and the reversal both stay on the statement, so the history is kept.
      </p>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="flex justify-between gap-3"><span className="text-slate-500">Transaction</span><span className="font-mono font-semibold text-slate-900">{txn.code}</span></div>
        {txn.reference && txn.reference !== txn.code && (
          <div className="mt-1.5 flex justify-between gap-3"><span className="text-slate-500">Reference</span><span className="font-mono text-slate-900">{txn.reference}</span></div>
        )}
        <div className="mt-1.5 flex justify-between gap-3"><span className="text-slate-500">Description</span><span className="text-right text-slate-900">{txn.description || "—"}</span></div>
        <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2">
          <span className="text-slate-500">Amount</span>
          <span className={`font-semibold tabular-nums ${moneyIn ? "text-emerald-700" : "text-red-700"}`}>{signed(txn.amount, txn.currency, moneyIn)}</span>
        </div>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Reason <span className="font-normal text-slate-500">(optional, kept in the audit log)</span></span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder="e.g. Entered twice, wrong amount"
          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
        />
      </label>
    </Shell>
    </>
  );
}
