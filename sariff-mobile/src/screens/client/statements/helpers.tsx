import * as api from "../../../services/api";
import { StyleSheet } from "react-native";
import Toast from "react-native-toast-message";
import { borderRadius, colors, fontSize, fontWeight, spacing } from "../../../theme";
import { amountText, currencyCode } from "../../../types";

export type CurrencyFilter = "all" | "kes" | "usd" | "ugx" | "eur";
export type TypeFilter = "all" | "credit" | "debit";
// Builds a branded HTML statement that expo-print renders into a real PDF.
export function buildStatementHtml(s: any): string {
  const esc = (v: any) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const stCur = s?.currency;
  const curOf = (c: any) => currencyCode(c);
  const money = (n: any, c: any = stCur) => `${curOf(c)} ${amountText(Number(n || 0), c)}`;
  const d = (v: any) => {
    const dt = new Date(v);
    return isNaN(dt.getTime()) ? esc(v) : dt.toLocaleDateString("en-GB");
  };
  const period =
    (s?.periodStart ? d(s.periodStart) : "—") +
    " to " +
    (s?.periodEnd ? d(s.periodEnd) : "—");

  const rows = (s?.transactions || [])
    .map((t: any) => {
      // Credit = money IN (positive, green); Debit = money OUT (negative, red).
      const isIn = t?.type === "Credit";
      const amt = Number(t?.amount || 0);
      const color = isIn ? "#059669" : "#DC2626";
      const sign = isIn ? "+" : "-";
      const c = t?.currency ?? stCur;
      return `<tr>
        <td>${d(t?.date || t?.createdAt)}</td>
        <td>${esc(t?.description || t?.reference || t?.code || "")}</td>
        <td style="text-align:right;color:${color};font-weight:600;">${sign}${money(amt, c)}</td>
        <td style="text-align:right;">${money(t?.balanceAfter, c)}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    * { font-family: -apple-system, Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; }
    body { margin: 0; padding: 28px; color: #0f172a; }
    .head { border-bottom: 3px solid #1D9E75; padding-bottom: 12px; margin-bottom: 16px; }
    .brand { color: #1D9E75; font-size: 22px; font-weight: 800; letter-spacing: .5px; }
    .title { font-size: 13px; color: #64748b; margin-top: 2px; }
    .meta { font-size: 12px; line-height: 1.7; margin: 12px 0 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { text-align: left; background: #f1f5f9; padding: 7px 8px; color: #475569; border-bottom: 1px solid #e2e8f0; }
    th:nth-child(3), th:nth-child(4) { text-align: right; }
    td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
    .summary { margin-top: 18px; border-top: 2px solid #e2e8f0; padding-top: 12px; font-size: 12px; width: 300px; margin-left: auto; }
    .summary .row { display: flex; justify-content: space-between; padding: 3px 0; }
    .summary .net { font-weight: 700; border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 6px; }
    .foot { margin-top: 24px; font-size: 10px; color: #94a3b8; text-align: center; }
  </style></head>
  <body>
    <div class="head">
      <div class="brand">${esc(s?.companyName || "Account statement")}</div>
      <div class="title">Account Statement</div>
    </div>
    <div class="meta">
      <b>${esc(s?.accountName || "")}</b> &nbsp;&middot;&nbsp; ${esc(s?.accountCode || "")}<br/>
      Currency: <b>${curOf(stCur)}</b><br/>
      Period: <b>${period}</b><br/>
      Opening Balance: <b>${money(s?.openingBalance)}</b>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Balance</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px;">No transactions in this period</td></tr>`}</tbody>
    </table>
    <div class="summary">
      <div class="row"><span>Total In (Credits)</span><span style="color:#059669;">+${money(s?.totalCredits)}</span></div>
      <div class="row"><span>Total Out (Debits)</span><span style="color:#DC2626;">-${money(s?.totalDebits)}</span></div>
      <div class="row net"><span>Net Movement</span><span style="color:${Number(s?.netMovement || 0) >= 0 ? "#059669" : "#DC2626"};">${Number(s?.netMovement || 0) < 0 ? "-" : "+"}${money(Math.abs(Number(s?.netMovement || 0)))}</span></div>
      <div class="row net"><span>Closing Balance</span><span>${money(s?.closingBalance)}</span></div>
    </div>
    <div class="foot">Generated ${new Date().toLocaleString("en-GB")} &middot; Sarif</div>
  </body></html>`;
}
// Single-transaction receipt as a real PDF (Credit = +/green, Debit = -/red).
/** `bureau`: the bureau's name for the header (it said "Sarif", the software, on every client's receipt). */
export function buildReceiptHtml(t: any, bureau?: string): string {
  const esc = (v: any) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const curOf = (c: any) => currencyCode(c);
  const money = (n: any, c: any) => `${curOf(c)} ${amountText(Number(n || 0), c)}`;
  const isIn = t?.type === "Credit";
  const color = isIn ? "#059669" : "#DC2626";
  const sign = isIn ? "+" : "-";
  const when = new Date(t?.date || t?.createdAt);
  const whenStr = isNaN(when.getTime())
    ? esc(t?.date)
    : when.toLocaleString("en-GB");
  const row = (label: string, val: string) =>
    `<div class="row"><span class="l">${label}</span><span class="v">${val}</span></div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    * { font-family: -apple-system, Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; }
    body { margin: 0; padding: 32px; color: #0f172a; }
    .card { max-width: 460px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; }
    .head { background: #1D9E75; color: #fff; padding: 18px 22px; }
    .brand { font-size: 20px; font-weight: 800; letter-spacing: .5px; }
    .sub { font-size: 12px; opacity: .9; margin-top: 2px; }
    .amount { text-align: center; padding: 22px; border-bottom: 1px solid #f1f5f9; }
    .amount .big { font-size: 30px; font-weight: 800; color: ${color}; }
    .amount .tag { font-size: 12px; color: #64748b; margin-top: 4px; }
    .body { padding: 18px 22px; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f8fafc; font-size: 13px; }
    .row .l { color: #64748b; }
    .row .v { color: #0f172a; font-weight: 600; text-align: right; max-width: 60%; }
    .foot { text-align: center; font-size: 10px; color: #94a3b8; padding: 14px; }
  </style></head>
  <body>
    <div class="card">
      <div class="head">
        <div class="brand">${String(bureau || "Receipt").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
        <div class="sub">Transaction Receipt</div>
      </div>
      <div class="amount">
        <div class="big">${sign}${money(t?.amount, t?.currency)}</div>
        <div class="tag">${isIn ? "Credit · Money In" : "Debit · Money Out"}</div>
      </div>
      <div class="body">
        ${row("Reference", esc(t?.code || t?.reference || "—"))}
        ${row("Date", whenStr)}
        ${t?.description ? row("Description", esc(t.description)) : ""}
        ${t?.counterAccountName ? row("Counterparty", esc(t.counterAccountName)) : ""}
        ${row("Balance After", money(t?.balanceAfter, t?.currency))}
      </div>
      <div class="foot">Generated ${new Date().toLocaleString("en-GB")} &middot; Sarif</div>
    </div>
  </body></html>`;
}
// Generate the receipt PDF on-device and share it.
export async function shareReceipt(t: any): Promise<void> {
  try {
    Toast.show({ type: "info", text1: "Generating receipt..." });
    const Print = require("expo-print");
    const Sharing = require("expo-sharing");
    const bureau = await api.getClientProfile().then((r: any) => r?.data?.companyName as string | undefined).catch(() => undefined);
    const { uri } = await Print.printToFileAsync({ html: buildReceiptHtml(t, bureau) });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `receipt_${t?.code || "txn"}.pdf`,
        UTI: "com.adobe.pdf",
      });
      Toast.show({ type: "success", text1: "Receipt shared" });
    } else {
      Toast.show({ type: "error", text1: "Sharing not available" });
    }
  } catch (e: any) {
    Toast.show({
      type: "error",
      text1: "Receipt failed",
      text2: e?.message || "Could not generate receipt",
    });
  }
}
export const styles = StyleSheet.create({
  sumCard: { backgroundColor: "#121A2E", borderRadius: 20, borderWidth: 1, borderColor: "rgba(127,179,255,0.18)", padding: 16, marginBottom: spacing.md },
  sumHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sumEyebrow: { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#AFC4E8", fontWeight: "600" },
  sumHint: { fontSize: 11, color: colors.textTertiary },
  sumRow: { flexDirection: "row" },
  sumRowTop: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  sumCell: { flex: 1, paddingRight: 8 },
  sumDivider: { paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.08)" },
  sumLabel: { fontSize: 11.5, color: colors.textSecondary, marginBottom: 3 },
  sumValue: { fontSize: 19, fontWeight: "700", color: colors.text },
  sumSmall: { fontSize: 15, fontWeight: "600" },
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.extrabold,
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },

  // Filters
  filterSection: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  filterRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  filterPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  filterTextActive: { color: "#FFF" },
  filterSpacer: { flex: 1 },
  typeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  typeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  // List
  list: { paddingHorizontal: spacing.lg },

  // Transaction Card
  txnCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  txnIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  txnInfo: { flex: 1, marginRight: spacing.sm },
  txnDescription: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.text,
    flex: 1,
  },
  txnDate: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  txnRight: { alignItems: "flex-end" },
  txnAmount: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  txnBalance: { fontSize: 10, color: colors.textTertiary, marginTop: 2 },
  dRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  dLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  dValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    maxWidth: "60%",
    textAlign: "right",
  },
});
