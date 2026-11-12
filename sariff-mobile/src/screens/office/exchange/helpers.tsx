import { StyleSheet } from "react-native";
import { borderRadius, colors, fontSize, fontWeight, fonts, spacing } from "../../../theme";

export type ModalType =
  | "none"
  | "setRate"
  | "exchange"
  | "fundFloat"
  | "withdrawFloat"
  | "settleProfit"
  | "rateHistory"
  | "dailyFloat";
// UGX trades at ~0.03 KES per unit, so small rates need more decimals.
export const fmtRate = (r: number) => (Math.abs(r) < 1 ? r.toFixed(4) : r.toFixed(2));
export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: 4,
  },
  addBtnText: {
    color: "#FFF",
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  rateCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  rateRow: { flexDirection: "row", alignItems: "center" },
  rateItem: { flex: 1, alignItems: "center" },
  rateLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 1,
    marginBottom: 4,
  },
  rateValue: {
    fontSize: 28,
    fontWeight: "800" as any,
    fontFamily: fonts.display,
    color: "#FFF",
  },
  rateDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  setRateBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    marginTop: spacing.md,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  setRateBtnText: {
    color: colors.primaryLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  floatRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  actIconChip: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  actionBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  profitCard: {
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  profitTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  profitRow: { flexDirection: "row", justifyContent: "space-around" },
  profitLabel: { fontSize: fontSize.xs, color: colors.textTertiary },
  profitValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    fontFamily: fonts.display,
    marginTop: 2,
  },
  settleProfitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  settleProfitText: {
    color: "#FFF",
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  txnCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  txnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  txnText: { flex: 1 },
  txnDesc: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  txnMeta: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  txnAmount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  txnProfit: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    marginTop: 2,
  },
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  chipRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 2,
    borderColor: "transparent",
  },
  chipActive: {
    backgroundColor: colors.infoLight,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  chipTextActive: { color: colors.primary, fontWeight: fontWeight.bold },
  calcText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    backgroundColor: colors.infoLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
});
