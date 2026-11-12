import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import Toast from "react-native-toast-message";
import { colors } from "../../theme";
import { toastConfig } from "../toastConfig";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ModalSheetProps } from "./styles";
import { PressScale } from "./press";

export function ModalSheet({
  visible,
  onClose,
  title,
  icon,
  iconColor = colors.gold,
  iconBg = "rgba(233,185,73,0.16)",
  children,
  fullHeight,
}: ModalSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header — pad below the status bar (Android renders this modal full-screen) */}
        <View style={[ms.header, { paddingTop: insets.top + 14 }]}>
          <View style={ms.headerLeft}>
            {icon && (
              <View style={[ms.headerIcon, { backgroundColor: iconBg }]}>
                <Ionicons name={icon} size={20} color={iconColor} />
              </View>
            )}
            <Text style={ms.headerTitle}>{title}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close"
            onPress={onClose}
            style={ms.closeBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        {/* Drag Handle */}
        <View style={ms.handleRow}>
          <View style={ms.handle} />
        </View>
        {/* Content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={ms.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
          <View style={{ height: 40 + insets.bottom }} />
        </ScrollView>
      </KeyboardAvoidingView>
      {/* Toast rendered INSIDE the modal so error/success messages appear on
          top of the open form. A root-level <Toast> renders behind this native
          Modal layer, which is why toasts were only visible after closing.
          Gated on `visible` so it only owns the global toast ref while the
          modal is open, then hands control back to the root <Toast>. */}
      {visible && (
        <Toast config={toastConfig} position="top" topOffset={insets.top + 12} />
      )}
    </Modal>
  );
}
// ==================== FORM SECTION ====================
// Groups form fields with a label — Law of Proximity
export interface FormSectionProps {
  label: string;
  children: React.ReactNode;
}
export function FormSection({ label, children }: FormSectionProps) {
  return (
    <View style={ms.formSection}>
      <Text style={ms.formLabel}>{label}</Text>
      {children}
    </View>
  );
}
// ==================== CHIP GROUP ====================
// Segmented control for quick selections — Hick's Law
export interface ChipOption {
  value: any;
  label: string;
  color?: string;
}
export interface ChipGroupProps {
  options: ChipOption[];
  selected: any;
  onSelect: (v: any) => void;
}
export function ChipGroup({ options, selected, onSelect }: ChipGroupProps) {
  return (
    <View style={ms.chipGroup}>
      {options.map((opt) => (
        <TouchableOpacity
          key={String(opt.value)}
          onPress={() => onSelect(opt.value)}
          activeOpacity={0.8}
          style={[
            ms.chipItem,
            selected === opt.value && {
              backgroundColor: opt.color || colors.gold,
              borderColor: opt.color || colors.gold,
            },
          ]}
        >
          <Text
            style={[
              ms.chipLabel,
              selected === opt.value && {
                color: colors.textInverse,
                fontWeight: "700" as any,
              },
            ]}
          >
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
// ==================== ACTION BUTTON ====================
// Primary action with gradient — Law of Focus
export interface ActionBtnProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  gradient?: readonly [string, string, ...string[]];
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}
export function ActionBtn({
  title,
  onPress,
  loading,
  gradient = colors.gradients.gold,
  icon,
  disabled,
}: ActionBtnProps) {
  return (
    <PressScale
      onPress={onPress}
      disabled={loading || disabled}
      style={{ marginTop: 8 }}
    >
      <LinearGradient
        colors={disabled ? ([colors.surfaceAlt, colors.surfaceAlt] as const) : gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[ms.actionBtn, (loading || disabled) && { opacity: 0.6 }]}
      >
        {loading ? (
          <ActivityIndicator color={colors.textInverse} size="small" />
        ) : (
          <>
            {icon && (
              <Ionicons name={icon} size={20} color={colors.textInverse} />
            )}
            <Text style={ms.actionBtnText}>{title}</Text>
          </>
        )}
      </LinearGradient>
    </PressScale>
  );
}
// ==================== INFO ROW ====================
// Display key-value info with consistent alignment
export interface InfoRowProps {
  label: string;
  value: string;
  valueColor?: string;
  stacked?: boolean;
}
export function InfoRow({
  label,
  value,
  valueColor = colors.text,
  stacked,
}: InfoRowProps) {
  if (stacked) {
    return (
      <View style={ms.infoRowStacked}>
        <Text style={ms.infoLabel}>{label}</Text>
        <Text style={[ms.infoValueStacked, { color: valueColor }]}>
          {value}
        </Text>
      </View>
    );
  }
  return (
    <View style={ms.infoRow}>
      <Text style={ms.infoLabel}>{label}</Text>
      <Text
        style={[
          ms.infoValue,
          { color: valueColor, flex: 1, textAlign: "right", marginLeft: 12 },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
export const ms = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700" as any,
    color: colors.text,
    flex: 1,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  handleRow: { alignItems: "center", paddingBottom: 12 },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
  },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  formSection: { marginBottom: 20 },
  formLabel: {
    fontSize: 13,
    fontWeight: "600" as any,
    color: colors.textTertiary,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipGroup: { flexDirection: "row", gap: 8 },
  chipItem: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.glass,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: "500" as any,
    color: colors.textSecondary,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  actionBtnText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: "700" as any,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.borderLight,
  },
  infoRowStacked: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.borderLight,
  },
  infoValueStacked: {
    fontSize: 14,
    fontWeight: "600" as any,
    color: colors.text,
    marginTop: 5,
    lineHeight: 20,
  },
  infoLabel: { fontSize: 14, color: colors.textSecondary },
  infoValue: { fontSize: 14, fontWeight: "600" as any },
});
