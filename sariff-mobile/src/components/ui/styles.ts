import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet } from "react-native";
import { borderRadius, colors, fontSize, fontWeight, fonts, spacing } from "../../theme";

// ==================== STYLES ====================
export const styles = StyleSheet.create({
  // Gradient Card
  gradientCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    overflow: "hidden",
    minHeight: 120,
    justifyContent: "flex-end",
  },
  gradientCardDecor: {
    position: "absolute",
    top: -20,
    right: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  gradientCardDecor2: {
    position: "absolute",
    bottom: -15,
    left: -15,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  gradientCardContent: { position: "relative" },
  gradientCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  gradientCardIcon: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.sm,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
  },
  gradientCardLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: "rgba(255,255,255,0.85)",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  gradientCardValue: {
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.extrabold,
    fontFamily: fonts.display,
    color: "#FFF",
    marginBottom: 2,
    letterSpacing: -0.5,
  },
  gradientCardSubtitle: {
    fontSize: fontSize.sm,
    color: "rgba(255,255,255,0.75)",
    fontWeight: fontWeight.medium,
  },

  // Stat Row
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.glass,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  statRowIcon: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  statRowText: { flex: 1 },
  statRowLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  statRowSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  statRowValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginRight: spacing.xs,
  },

  // Transaction Row
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.border,
  },
  txnIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  txnText: { flex: 1 },
  txnDescription: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  txnDate: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  txnAmountWrap: { alignItems: "flex-end" },
  txnAmount: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  txnType: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },

  // Section Header
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.display,
    color: colors.text,
  },
  sectionAction: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.gold,
  },

  // Button
  button: {
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  buttonInner: { flexDirection: "row", alignItems: "center" },
  buttonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: "#FFF",
  },

  // Input
  inputWrapper: { marginBottom: spacing.lg },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.glass,
    height: 52,
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    height: "100%",
    paddingVertical: 0,
  },
  inputError: {
    fontSize: fontSize.xs,
    color: colors.danger,
    marginTop: spacing.xs,
  },

  // Empty State
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxxxl,
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },

  // Loading
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
});
// ==================== MODAL SHEET ====================
// Beautiful bottom-sheet style modal following 5 UX laws
export interface ModalSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBg?: string;
  children: React.ReactNode;
  fullHeight?: boolean;
}
