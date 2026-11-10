"use client";

/**
 * One statement for every account type — client, bank, mobile money, cash.
 *
 * Always ONE currency per statement (KES is never added to USD). The API cuts a
 * period-correct statement: opening = balance just before the period, closing =
 * balance after its last line, so  Opening + Money in − Money out = Closing.
 * The screen shows that check explicitly, and the PDF/print carry it too.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Download,
  Printer,
  Search,
  Loader2,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  AlertTriangle,
  CalendarDays,
  MessageCircle,
  Eye,
  Edit3,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  getClientStatement,
  getBankAccountStatement,
  getMpesaAgentStatement,
  getCashAccountStatement,
  currencyCode,
  currencyDecimals,
} from "@/lib/api";
import { shareViaWhatsApp } from "@/lib/whatsapp";
import { useAuth } from "@/providers/AuthProvider";
import { ui } from "./theme";

export type StatementKind = "client" | "bank" | "mpesa" | "cash";

export interface StatementModalProps {
  kind: StatementKind;
  /** Client / bank account / mobile money agent id. Not used for cash. */
  accountId?: string;
  /** Cash statements are per currency. */
  cashCurrency?: number;
  /** e.g. the client's name, "Equity Bank – 0123456789", "Cash KES" */
  title: string;
  /** e.g. "AFB-CL-2026-0002 · +254722000001" */
  subtitle?: string;
  /** Client only: the currencies to offer as tabs (home currency first). */
  currencies?: number[];
  /** Currency to open on (client: home currency; others: the account's). */
  currency: number;
  /** Client only: WhatsApp number for sharing. */
  whatsApp?: string;
  onClose: () => void;
  /**
   * Row actions. Each receives the raw API statement line, so the screen can
   * pass it through its own mapper and open its existing pop-ups. Edit and
   * delete are hidden on reversed entries and on reversals (same rule as before).
   */
  onView?: (line: any) => void;
  onEdit?: (line: any) => void;
  onDelete?: (line: any) => void;
  /** Opens the related (counter) account's details. */
  onRelated?: (line: any) => void;
}

/** Screens call this after an edit/delete so an open statement reloads. */
export const refreshOpenStatement = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("sarif:statement-refresh"));
};

interface Line {
  id: string;
  code: string;
  date: string;
  reference: string;
  description: string;
  counterparty: string;
  moneyIn: number;
  moneyOut: number;
  balance: number;
  rateNote: string;
  reversed: boolean;
  reversal: boolean;
  hasRelated: boolean;
  raw: any;
}

type Preset = "all" | "this-month" | "last-month" | "30d" | "this-year" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "30d", label: "Last 30 days" },
  { id: "this-year", label: "This year" },
  { id: "custom", label: "Custom" },
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rangeFor(p: Preset, from: string, to: string): { start?: string; end?: string } {
  const now = new Date();
  switch (p) {
    case "this-month":
      return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)), end: iso(now) };
    case "last-month":
      return {
        start: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        end: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case "30d": {
      const s = new Date(now);
      s.setDate(s.getDate() - 29);
      return { start: iso(s), end: iso(now) };
    }
    case "this-year":
      return { start: iso(new Date(now.getFullYear(), 0, 1)), end: iso(now) };
    case "custom":
      return { start: from || undefined, end: to || undefined };
    default:
      return {};
  }
}

const longDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

/** Builds the statement PDF. Pure — no React — so it can be tested outside the app. */
export function renderStatementPdf(o: {
  bureau: string;
  title: string;
  subtitle?: string;
  code: string;
  periodLabel: string;
  head: { opening: number; closing: number; moneyIn: number; moneyOut: number };
  lines: Line[];
  fmt: (n: number) => string;
  money: (n: number) => string;
}) {
  const { bureau, title, subtitle, code, periodLabel, head, fmt } = o;
  const shown = o.lines;
  // jsPDF's built-in fonts are Windows-1252 only: "−" (U+2212) would print as
  // garbage. Use a plain hyphen in the PDF; the screen keeps the real minus.
  const money = (n: number) => o.money(n).replace(/\u2212/g, "-");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const navy: [number, number, number] = [15, 23, 42];

  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(bureau, 14, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text("Account statement", 14, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(code, W - 14, 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(periodLabel, W - 14, 20, { align: "right" });

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, 14, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  if (subtitle) doc.text(subtitle, 14, 48);
  doc.text(`Generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`, W - 14, 42, { align: "right" });

  const boxes: [string, string, [number, number, number]][] = [
    ["Opening balance", money(head.opening), [15, 23, 42]],
    ["Money in", head.moneyIn ? `+${fmt(head.moneyIn)}` : fmt(0), [4, 120, 87]],
    ["Money out", head.moneyOut ? `-${fmt(head.moneyOut)}` : fmt(0), [185, 28, 28]],
    ["Closing balance", money(head.closing), [15, 23, 42]],
  ];
  const bw = (W - 28 - 9) / 4;
  boxes.forEach(([label, value, color], i) => {
    const x = 14 + i * (bw + 3);
    doc.setFillColor(i === 3 ? 15 : 233, i === 3 ? 23 : 238, i === 3 ? 42 : 246);
    doc.roundedRect(x, 54, bw, 18, 2, 2, "F");
    doc.setFontSize(7.5);
    doc.setTextColor(i === 3 ? 203 : 100, i === 3 ? 213 : 116, i === 3 ? 225 : 139);
    doc.text(label.toUpperCase(), x + 3, 60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    if (i === 3) doc.setTextColor(255, 255, 255);
    else doc.setTextColor(...color);
    doc.text(value, x + 3, 68);
    doc.setFont("helvetica", "normal");
  });

  autoTable(doc, {
    startY: 78,
    head: [["Date", "Reference", "Description", "Money in", "Money out", "Balance"]],
    body: shown.map((l) => [
      l.date ? new Date(l.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "",
      l.reference || l.code,
      [l.description + (l.reversed ? " (reversed)" : l.reversal ? " (reversal)" : ""), l.counterparty, l.rateNote]
        .filter(Boolean)
        .join("\n"),
      l.moneyIn ? fmt(l.moneyIn) : "",
      l.moneyOut ? fmt(l.moneyOut) : "",
      fmt(l.balance),
    ]),
    styles: { fontSize: 8, cellPadding: 2.2, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: [233, 238, 246], textColor: [15, 23, 42], fontStyle: "bold", fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 30, fontSize: 7 },
      3: { halign: "right", textColor: [4, 120, 87], cellWidth: 25 },
      4: { halign: "right", textColor: [185, 28, 28], cellWidth: 25 },
      5: { halign: "right", fontStyle: "bold", cellWidth: 27 },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Opening ${money(head.opening)}  +  in ${fmt(head.moneyIn)}  -  out ${fmt(head.moneyOut)}  =  closing ${money(head.closing)}`,
        14,
        H - 8,
      );
      doc.text(`Page ${doc.getNumberOfPages()}`, W - 14, H - 8, { align: "right" });
    },
  });
  return doc;
}

const entries = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

export function StatementModal(props: StatementModalProps) {
  const { kind, accountId, cashCurrency, title, subtitle, currencies, whatsApp, onClose, onView, onEdit, onDelete, onRelated } = props;
  const hasActions = !!(onView || onEdit || onDelete);
  const { user } = useAuth();
  const bureau = (user as any)?.companyName || "Sarif";

  // Assets (cash, bank, mobile money): a debit adds money. Client accounts are
  // what the bureau owes: a credit is the client's money coming in.
  const isAsset = kind !== "client";

  const [currency, setCurrency] = useState<number>(props.currency);
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"all" | "in" | "out">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [head, setHead] = useState({ opening: 0, closing: 0, moneyIn: 0, moneyOut: 0, start: "", end: "" });
  const [lines, setLines] = useState<Line[]>([]);

  const code = currencyCode(currency);
  const dp = currencyDecimals(currency);
  const fmt = useCallback(
    (n: number) => (n || 0).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }),
    [dp],
  );
  const money = useCallback((n: number) => `${code} ${n < 0 ? "−" : ""}${fmt(Math.abs(n))}`, [code, fmt]);

  const { start, end } = rangeFor(preset, from, to);
  const periodLabel =
    preset === "all" ? "All time" : start && end ? `${longDate(start)} – ${longDate(end)}` : start ? `From ${longDate(start)}` : end ? `Up to ${longDate(end)}` : "All time";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res =
        kind === "client"
          ? await getClientStatement(accountId!, start, end, currency)
          : kind === "bank"
            ? await getBankAccountStatement(accountId!, start, end)
            : kind === "mpesa"
              ? await getMpesaAgentStatement(accountId!, start, end)
              : await getCashAccountStatement(cashCurrency ?? currency, start, end);

      if (!res?.success || !res.data) {
        setError(res?.message || "The statement couldn't be loaded.");
        setLines([]);
        return;
      }
      const d = res.data;
      const debit = d.totalDebit ?? d.totalDebits ?? 0;
      const credit = d.totalCredit ?? d.totalCredits ?? 0;
      setHead({
        opening: d.openingBalance ?? 0,
        closing: d.closingBalance ?? 0,
        moneyIn: isAsset ? debit : credit,
        moneyOut: isAsset ? credit : debit,
        start: d.periodStart || "",
        end: d.periodEnd || "",
      });
      setLines(
        (Array.isArray(d.transactions) ? d.transactions : []).map((t: any, i: number) => {
          const dr = t.debit ?? 0;
          const cr = t.credit ?? 0;
          const rel = t.relatedAccount;
          const rateNote =
            t.exchangeRate && t.counterAmount && t.counterCurrency != null && t.counterCurrency !== t.currency
              ? `${currencyCode(t.counterCurrency)} ${Number(t.counterAmount).toLocaleString("en-US", {
                  maximumFractionDigits: currencyDecimals(t.counterCurrency),
                })} @ ${t.exchangeRate}`
              : "";
          return {
            id: t.transactionId || t.id || String(i),
            code: t.transactionCode || t.code || "",
            date: t.date || t.transactionDate || t.createdAt || "",
            reference: t.reference || t.transactionCode || "",
            description: t.description || "—",
            counterparty: rel?.accountName ? `${rel.accountName}${rel.clientCode ? ` (${rel.clientCode})` : ""}` : "",
            moneyIn: isAsset ? dr : cr,
            moneyOut: isAsset ? cr : dr,
            balance: t.balanceAfter ?? 0,
            rateNote,
            reversed: !!t.isReversed,
            reversal: !!t.isReversal,
            hasRelated: !!rel,
            raw: t,
          } as Line;
        }),
      );
    } catch {
      setError("The statement couldn't be loaded. Check your connection and try again.");
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [kind, accountId, cashCurrency, currency, start, end, isAsset]);

  useEffect(() => {
    if (preset === "custom" && (!from || !to)) return; // wait for both dates
    load();
  }, [load, preset, from, to]);

  useEffect(() => {
    const again = () => load();
    window.addEventListener("sarif:statement-refresh", again);
    return () => window.removeEventListener("sarif:statement-refresh", again);
  }, [load]);

  useEffect(() => {
    // Escape closes the statement only when no pop-up is open on top of it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const dialogs = document.querySelectorAll('[role="dialog"], .fixed.inset-0');
      if (dialogs.length <= 1) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter(
      (l) =>
        (direction === "all" || (direction === "in" ? l.moneyIn > 0 : l.moneyOut > 0)) &&
        (!q || `${l.description} ${l.reference} ${l.code} ${l.counterparty}`.toLowerCase().includes(q)),
    );
  }, [lines, search, direction]);

  // The statement must add up. If it doesn't, say so rather than hide it.
  const expected = head.opening + head.moneyIn - head.moneyOut;
  const tolerance = dp === 0 ? 0.5 : 0.005;
  const adds = Math.abs(expected - head.closing) <= tolerance;

  // ---------------------------------------------------------------- PDF
  const buildPdf = () =>
    renderStatementPdf({ bureau, title, subtitle, code, periodLabel, head, lines: shown, fmt, money });

  const fileName = `${title.replace(/[^\w-]+/g, "_")}_${code}_statement.pdf`;
  const downloadPdf = () => {
    try {
      buildPdf().save(fileName);
    } catch {
      toast.error("Couldn't create the PDF");
    }
  };
  const print = () => {
    try {
      const doc = buildPdf();
      doc.autoPrint();
      window.open(doc.output("bloburl"), "_blank");
    } catch {
      toast.error("Couldn't open the print view");
    }
  };
  const share = () => {
    if (!whatsApp) return;
    shareViaWhatsApp(
      whatsApp,
      [
        `*${bureau}* — statement`,
        `${title}${subtitle ? ` (${subtitle.split(" · ")[0]})` : ""}`,
        `Period: ${periodLabel}`,
        ``,
        `Opening balance: ${money(head.opening)}`,
        `Money in: +${fmt(head.moneyIn)}`,
        `Money out: −${fmt(head.moneyOut)}`,
        `*Closing balance: ${money(head.closing)}*`,
      ].join("\n"),
    );
  };

  // ---------------------------------------------------------------- UI
  const tile = "rounded-xl border border-slate-200 bg-white p-4";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Statement — ${title}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-slate-50 shadow-2xl sm:rounded-2xl"
      >
        {/* Header — navy */}
        <div className="relative shrink-0 overflow-hidden bg-[#0F172A] px-5 pb-4 pt-5 text-white sm:px-6">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-600/25 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Statement</p>
              <h2 className="mt-1 truncate text-xl font-semibold">{title}</h2>
              {subtitle && <p className="mt-0.5 truncate text-sm text-slate-300">{subtitle}</p>}
            </div>
            <button onClick={onClose} aria-label="Close statement" className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* currency tabs (client) + period */}
          <div className="relative mt-4 flex min-w-0 flex-wrap items-center gap-2">
            {currencies && currencies.length > 1 ? (
              <div className="inline-flex rounded-lg bg-white/10 p-0.5" role="tablist" aria-label="Currency">
                {currencies.map((c) => (
                  <button
                    key={c}
                    role="tab"
                    aria-selected={c === currency}
                    onClick={() => setCurrency(c)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                      c === currency ? "bg-white text-[#0F172A]" : "text-slate-300 hover:text-white"
                    }`}
                  >
                    {currencyCode(c)}
                  </button>
                ))}
              </div>
            ) : (
              <span className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold">{code}</span>
            )}
            <div className="-mx-1 flex w-full gap-1 overflow-x-auto px-1 [scrollbar-width:none] sm:w-auto">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  aria-pressed={preset === p.id}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                    preset === p.id ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset === "custom" && (
              <div className="flex items-center gap-2 text-xs">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="From date"
                  className="h-8 rounded-md border border-white/15 bg-white/10 px-2 text-white [color-scheme:dark]"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label="To date"
                  className="h-8 rounded-md border border-white/15 bg-white/10 px-2 text-white [color-scheme:dark]"
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className={tile}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Opening balance</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{money(head.opening)}</p>
              <p className="mt-0.5 text-xs text-slate-500">{preset === "all" ? "When the account opened" : `On ${longDate(start) || "start"}`}</p>
            </div>
            <div className={tile}>
              <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-600" /> Money in
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-700">{head.moneyIn ? `+${fmt(head.moneyIn)}` : fmt(0)}</p>
              <p className="mt-0.5 text-xs text-slate-500">{entries(lines.filter((l) => l.moneyIn > 0).length)}</p>
            </div>
            <div className={tile}>
              <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <ArrowUpCircle className="h-3.5 w-3.5 text-red-600" /> Money out
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-red-700">{head.moneyOut ? `−${fmt(head.moneyOut)}` : fmt(0)}</p>
              <p className="mt-0.5 text-xs text-slate-500">{entries(lines.filter((l) => l.moneyOut > 0).length)}</p>
            </div>
            {/* The figure people open a statement for: the blue accent, not the header's navy. */}
            <div className="rounded-xl bg-gradient-to-br from-blue-700 to-blue-800 p-4 text-white shadow-sm shadow-blue-600/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-50">Closing balance</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${head.closing < 0 ? "text-amber-100" : ""}`}>{money(head.closing)}</p>
              <p className="mt-0.5 text-xs text-blue-100/90">{preset === "all" ? "Right now" : `On ${longDate(end) || "today"}`}</p>
            </div>
          </div>

          {/* The arithmetic, shown */}
          {!loading && !error && (
            <p
              className={`mt-3 flex flex-wrap items-center gap-1.5 rounded-lg px-3 py-2 text-xs ${
                adds ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
              }`}
            >
              {adds ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              <span className="tabular-nums">
                {fmt(head.opening)} + {fmt(head.moneyIn)} − {fmt(head.moneyOut)} = {fmt(expected)}
              </span>
              <span>
                {adds
                  ? "matches the closing balance."
                  : `but the closing balance is ${fmt(head.closing)}. Some entries may have been edited after posting — reconcile this account.`}
              </span>
            </p>
          )}

          {/* Toolbar */}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search description, reference or counterparty"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </div>
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5" role="group" aria-label="Show">
              {(["all", "in", "out"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirection(d)}
                  aria-pressed={direction === d}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    direction === d ? "bg-[#0F172A] text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {d === "all" ? "All" : d === "in" ? "Money in" : "Money out"}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={downloadPdf} disabled={loading || !!error} className={ui.btnSecondary}>
                <Download className="h-4 w-4" /> PDF
              </button>
              <button onClick={print} disabled={loading || !!error} className={ui.btnSecondary}>
                <Printer className="h-4 w-4" /> Print
              </button>
              {whatsApp && (
                <button onClick={share} disabled={loading || !!error} className={ui.btnPrimary}>
                  <MessageCircle className="h-4 w-4" /> Share
                </button>
              )}
            </div>
          </div>

          {/* Lines */}
          <div className={`${ui.card} mt-4`}>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading statement…
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-3 py-14 text-center">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
                <p className="text-sm text-slate-600">{error}</p>
                <button onClick={load} className={ui.btnSecondary}>Try again</button>
              </div>
            ) : shown.length === 0 ? (
              <p className="py-14 text-center text-sm text-slate-500">
                {lines.length === 0 ? `No ${code} transactions in this period.` : "Nothing matches your search."}
              </p>
            ) : (
              <>
                {/* phone: cards */}
                <ul className="divide-y divide-slate-100 md:hidden">
                  {shown.map((l) => (
                    <li
                      key={l.id}
                      onClick={onView ? () => onView(l.raw) : undefined}
                      className={`px-4 py-3 ${l.reversed ? "bg-slate-50 line-through decoration-slate-400" : ""} ${onView ? "cursor-pointer active:bg-slate-50" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-medium text-slate-900 ${l.reversed ? "line-through" : ""}`}>{l.description}</p>
                          <p className="truncate text-xs text-slate-500">
                            {longDate(l.date)}
                            {l.counterparty && ` · ${l.counterparty}`}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`text-sm font-semibold tabular-nums ${l.moneyIn ? "text-emerald-700" : "text-red-700"}`}>
                            {l.moneyIn ? `+${fmt(l.moneyIn)}` : `−${fmt(l.moneyOut)}`}
                          </p>
                          <p className="text-xs tabular-nums text-slate-500">Bal {fmt(l.balance)}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* desktop: ledger */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full">
                    <thead className={ui.thead}>
                      <tr>
                        <th className={`${ui.th} pl-5`}>Date</th>
                        <th className={ui.th}>Details</th>
                        <th className={`${ui.th} text-right`}>Money in</th>
                        <th className={`${ui.th} text-right`}>Money out</th>
                        <th className={`${ui.th} ${hasActions ? "" : "pr-5"} text-right`}>Balance</th>
                        {hasActions && <th className={`${ui.th} pr-5 text-right`}>Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {shown.map((l) => (
                        <tr key={l.id} className={`${ui.row} align-top hover:bg-slate-50 ${l.reversed ? "bg-slate-50 line-through decoration-slate-400" : ""}`}>
                          <td className={`${ui.td} whitespace-nowrap pl-5`}>
                            <span className="block font-medium text-slate-900">{longDate(l.date)}</span>
                            <span className="text-xs text-slate-500">
                              {l.date ? new Date(l.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}
                            </span>
                          </td>
                          <td className={`${ui.td} min-w-[260px]`}>
                            <span className={`block font-medium text-slate-900 ${l.reversed ? "line-through" : ""}`}>
                              {l.description}
                              {l.reversed && (
                                <span className="ml-2 inline-block rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 no-underline">Reversed</span>
                              )}
                              {l.reversal && (
                                <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">Reversal</span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              {l.counterparty &&
                                (onRelated && l.hasRelated ? (
                                  <>
                                    <button
                                      onClick={() => onRelated(l.raw)}
                                      className="font-medium text-blue-700 hover:underline"
                                      title="Open the related account"
                                    >
                                      {l.counterparty}
                                    </button>
                                    {" · "}
                                  </>
                                ) : (
                                  <>{l.counterparty} · </>
                                ))}
                              <span className="font-mono">{l.reference || l.code}</span>
                              {l.rateNote && <> · {l.rateNote}</>}
                            </span>
                          </td>
                          <td className={`${ui.td} whitespace-nowrap text-right font-medium text-emerald-700`}>
                            {l.moneyIn ? fmt(l.moneyIn) : <span className="text-slate-500">—</span>}
                          </td>
                          <td className={`${ui.td} whitespace-nowrap text-right font-medium text-red-700`}>
                            {l.moneyOut ? fmt(l.moneyOut) : <span className="text-slate-500">—</span>}
                          </td>
                          <td className={`${ui.td} whitespace-nowrap ${hasActions ? "" : "pr-5"} text-right font-semibold ${l.balance < 0 ? "text-red-700" : "text-[#0F172A]"}`}>
                            {fmt(l.balance)}
                          </td>
                          {hasActions && (
                            <td className={`${ui.td} whitespace-nowrap pr-5 text-right`}>
                              <div className="inline-flex items-center gap-1">
                                {onView && (
                                  <button
                                    onClick={() => onView(l.raw)}
                                    aria-label={`View ${l.reference || l.code}`}
                                    title="View details"
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-[#E9EEF6] hover:text-[#0F172A]"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                )}
                                {onEdit && !l.reversed && !l.reversal && (
                                  <button
                                    onClick={() => onEdit(l.raw)}
                                    aria-label={`Edit ${l.reference || l.code}`}
                                    title="Edit transaction"
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </button>
                                )}
                                {onDelete && !l.reversed && !l.reversal && (
                                  <button
                                    onClick={() => onDelete(l.raw)}
                                    aria-label={`Reverse ${l.reference || l.code}`}
                                    title="Reverse transaction"
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          {!loading && !error && lines.length > 0 && (
            <p className="mt-2 text-right text-xs text-slate-500">
              {shown.length === lines.length ? entries(lines.length) : `${shown.length} of ${entries(lines.length)}`} · {periodLabel} · {code}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default StatementModal;
