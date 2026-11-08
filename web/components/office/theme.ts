/**
 * Office design system — the 60 / 30 / 10 rule.
 *
 *  60  NEUTRAL  page slate-50, cards white, borders slate-200, text slate-500…900
 *  30  NAVY     #0F172A — sidebar, hero cards, total rows, stat tiles that lead a page
 *               + its tint #E9EEF6 for table heads, so tables are never plain white
 *  10  ACCENT   blue-600 — primary buttons, active tab, links, selected state
 *
 *  Semantic colours sit outside the ratio and carry meaning only:
 *  emerald = money in / positive · red = money out / negative · amber = warning.
 *  No purple, pink, indigo, cyan, teal or decorative gradients.
 *
 *  Type scale — only these seven sizes, nothing under 12px:
 *   text-xs   12  labels, table heads, meta, badges
 *   text-sm   14  body, table cells, buttons, inputs
 *   text-base 16  card / section titles
 *   text-lg   18  secondary figures
 *   text-xl   20  stat-tile values
 *   text-2xl  24  page titles
 *   text-3xl  30  hero figures
 */

export const NAVY = "#0F172A";
export const NAVY_TINT = "#E9EEF6";

export const ui = {
  // page
  pageTitle: "text-2xl font-semibold tracking-tight text-slate-900",
  pageSub: "mt-1 text-sm text-slate-500",

  // cards
  card: "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm",
  cardHead: "flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4",
  cardTitle: "text-base font-semibold text-slate-900",
  cardMeta: "text-xs font-medium text-slate-500",

  // tables
  thead: "bg-[#E9EEF6]",
  th: "px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-[#334155] sm:px-4",
  td: "px-3 py-3 text-sm sm:px-4",
  row: "border-t border-slate-100",
  totalRow: "bg-[#0F172A] text-white",

  // navy hero / lead tile
  hero: "relative overflow-hidden rounded-xl bg-[#0F172A] text-white shadow-sm",

  // chips
  codeChip: "inline-flex items-center rounded-md bg-[#E9EEF6] px-2 py-0.5 text-xs font-semibold text-[#0F172A]",

  // buttons
  btnPrimary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60",
  btnSecondary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60",
} as const;
