import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Modal,
  Dimensions,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Animated,
} from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { toastConfig } from "../toastConfig";
import {
  colors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  shadows,
  fonts,
} from "../../theme";

// ==================== PRESS SCALE (internal motion helper) ====================
// Spring-press micro-interaction. Wraps any tappable element. Pure built-in Animated (no worklets).
function PressScale({
  children,
  onPress,
  disabled,
  activeScale = 0.96,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  activeScale?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, {
      toValue: v,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        if (!disabled) {
          to(activeScale);
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch {}
        }
      }}
      onPressOut={() => to(1)}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style as any]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ==================== GRADIENT CARD ====================
interface GradientCardProps {
  gradient: readonly [string, string, ...string[]];
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  subtitle?: string;
  onPress?: () => void;
  style?: ViewStyle;
}

export function GradientCard({
  gradient,
  icon,
  label,
  value,
  subtitle,
  onPress,
  style,
}: GradientCardProps) {
  const content = (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradientCard, style]}
    >
      <View style={styles.gradientCardDecor} />
      <View style={styles.gradientCardDecor2} />
      <View style={styles.gradientCardContent}>
        <View style={styles.gradientCardHeader}>
          <View style={styles.gradientCardIcon}>
            <Ionicons name={icon} size={20} color="#FFF" />
          </View>
          <Text style={styles.gradientCardLabel}>{label}</Text>
        </View>
        <Text
          style={styles.gradientCardValue}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
        {subtitle && (
          <Text style={styles.gradientCardSubtitle}>{subtitle}</Text>
        )}
      </View>
    </LinearGradient>
  );

  if (onPress)
    return (
      <PressScale onPress={onPress} activeScale={0.97}>
        {content}
      </PressScale>
    );
  return content;
}

// ==================== STAT ROW ====================
interface StatRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
  subtitle?: string;
  onPress?: () => void;
}

export function StatRow({
  icon,
  iconColor,
  iconBg,
  label,
  value,
  subtitle,
  onPress,
}: StatRowProps) {
  const body = (
    <View style={[styles.statRow, shadows.sm]}>
      <View style={[styles.statRowIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.statRowText}>
        <Text style={styles.statRowLabel}>{label}</Text>
        {subtitle && <Text style={styles.statRowSubtitle}>{subtitle}</Text>}
      </View>
      <Text style={styles.statRowValue}>{value}</Text>
      {onPress && (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={colors.textTertiary}
        />
      )}
    </View>
  );
  if (onPress)
    return (
      <PressScale onPress={onPress} activeScale={0.98}>
        {body}
      </PressScale>
    );
  return body;
}

// ==================== TRANSACTION ROW ====================
interface TransactionRowProps {
  type: string;
  description: string;
  amount: string;
  date: string;
  isCredit: boolean;
  onPress?: () => void;
}

export function TransactionRow({
  type,
  description,
  amount,
  date,
  isCredit,
  onPress,
}: TransactionRowProps) {
  return (
    <TouchableOpacity
      style={styles.txnRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.txnIcon,
          {
            backgroundColor: isCredit
              ? colors.successLight
              : colors.dangerLight,
          },
        ]}
      >
        <Ionicons
          name={isCredit ? "arrow-down" : "arrow-up"}
          size={16}
          color={isCredit ? colors.success : colors.danger}
        />
      </View>
      <View style={styles.txnText}>
        <Text style={styles.txnDescription} numberOfLines={1}>
          {description}
        </Text>
        <Text style={styles.txnDate}>{date}</Text>
      </View>
      <View style={styles.txnAmountWrap}>
        <Text
          style={[
            styles.txnAmount,
            { color: isCredit ? colors.success : colors.danger },
          ]}
        >
          {isCredit ? "+" : "-"}
          {amount}
        </Text>
        <Text style={styles.txnType}>{type}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ==================== SECTION HEADER ====================
interface SectionHeaderProps {
  title: string;
  action?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, action, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={onAction}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ==================== BUTTON ====================
interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "outline";
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  size?: "sm" | "md" | "lg";
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  style,
  size = "md",
}: ButtonProps) {
  const isOutline = variant === "outline";
  const bg =
    variant === "danger"
      ? colors.danger
      : variant === "secondary"
        ? colors.surfaceAlt
        : colors.primary;
  const height = size === "sm" ? 38 : size === "lg" ? 56 : 48;

  if (variant === "primary") {
    return (
      <PressScale
        onPress={onPress}
        disabled={disabled || loading}
        style={style as ViewStyle}
      >
        <LinearGradient
          colors={colors.gradients.gold}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.button,
            { height, opacity: disabled ? 0.5 : 1 },
            shadows.gold,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <View style={styles.buttonInner}>
              {icon && (
                <Ionicons
                  name={icon}
                  size={18}
                  color={colors.textInverse}
                  style={{ marginRight: 8 }}
                />
              )}
              <Text style={[styles.buttonText, { color: colors.textInverse }]}>
                {title}
              </Text>
            </View>
          )}
        </LinearGradient>
      </PressScale>
    );
  }

  return (
    <PressScale
      onPress={onPress}
      disabled={disabled || loading}
      style={style as ViewStyle}
    >
      <View
        style={[
          styles.button,
          {
            height,
            backgroundColor: isOutline ? "transparent" : bg,
            borderWidth: isOutline ? 1.5 : 0,
            borderColor: isOutline ? colors.borderStrong : undefined,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={isOutline ? colors.text : "#FFF"} />
        ) : (
          <View style={styles.buttonInner}>
            {icon && (
              <Ionicons
                name={icon}
                size={18}
                color={isOutline ? colors.text : "#FFF"}
                style={{ marginRight: 8 }}
              />
            )}
            <Text
              style={[
                styles.buttonText,
                { color: isOutline ? colors.text : "#FFF" },
              ]}
            >
              {title}
            </Text>
          </View>
        )}
      </View>
    </PressScale>
  );
}

// ==================== INPUT ====================
interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "numeric" | "phone-pad" | "email-address";
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string;
  multiline?: boolean;
  editable?: boolean;
}

export function Input({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  icon,
  error,
  multiline,
  editable = true,
}: InputProps) {
  return (
    <View style={styles.inputWrapper}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <View
        style={[
          styles.inputContainer,
          multiline && {
            height: undefined,
            minHeight: 92,
            alignItems: "flex-start",
            paddingTop: spacing.md,
            paddingBottom: spacing.sm,
          },
          error && { borderColor: colors.danger },
        ]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={18}
            color={colors.textTertiary}
            style={{ marginRight: 10, marginTop: multiline ? 2 : 0 }}
          />
        )}
        <TextInput
          style={[
            styles.input,
            multiline
              ? { height: 72, textAlignVertical: "top" }
              : { textAlignVertical: "center" },
          ]}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          multiline={multiline}
          editable={editable}
        />
      </View>
      {error && <Text style={styles.inputError}>{error}</Text>}
    </View>
  );
}

// ==================== EMPTY STATE ====================
interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={48} color={colors.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
      {action && onAction && (
        <Button
          title={action}
          onPress={onAction}
          variant="outline"
          size="sm"
          style={{ marginTop: 16 }}
        />
      )}
    </View>
  );
}

// ==================== COUNT UP (animated number) ====================
// Animates from 0 to `value` and renders via `format`. Final output equals format(value).
export function CountUp({
  value,
  format,
  style,
  duration = 650,
}: {
  value: number;
  format: (n: number) => string;
  style?: TextStyle | TextStyle[];
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setDisplay(v));
    Animated.timing(anim, {
      toValue: value,
      duration,
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [value]);
  return (
    <Text
      style={style}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
    >
      {format(display)}
    </Text>
  );
}

// ==================== SHIMMER / SKELETON ====================
// Premium loading placeholder with a sweeping highlight. Use to build content-shaped
// skeletons instead of spinners (perceived-performance win).
export function Shimmer({
  width = "100%",
  height = 16,
  radius = 12,
  style,
}: {
  width?: any;
  height?: number;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
}) {
  const x = useRef(new Animated.Value(-1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration: 1200, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const translateX = x.interpolate({
    inputRange: [-1, 1],
    outputRange: [-180, 180],
  });
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.glass,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: colors.borderLight,
        },
        style as any,
      ]}
    >
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { transform: [{ translateX }] }]}
      >
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.10)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, width: 180 }}
        />
      </Animated.View>
    </View>
  );
}

// ==================== LOADING ====================
export function LoadingScreen({ message }: { message?: string }) {
  return (
    <View style={styles.loadingScreen}>
      <View style={{ width: "88%", gap: 14 }}>
        <Shimmer height={120} radius={borderRadius.lg} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Shimmer height={90} radius={borderRadius.lg} style={{ flex: 1 }} />
          <Shimmer height={90} radius={borderRadius.lg} style={{ flex: 1 }} />
        </View>
        <Shimmer height={56} radius={borderRadius.md} />
        <Shimmer height={56} radius={borderRadius.md} />
        <Shimmer height={56} radius={borderRadius.md} />
      </View>
      {message ? <Text style={styles.loadingText}>{message}</Text> : null}
    </View>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
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
interface ModalSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBg?: string;
  children: React.ReactNode;
  fullHeight?: boolean;
}

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
interface FormSectionProps {
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
interface ChipOption {
  value: any;
  label: string;
  color?: string;
}
interface ChipGroupProps {
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
interface ActionBtnProps {
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
interface InfoRowProps {
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

const ms = StyleSheet.create({
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
