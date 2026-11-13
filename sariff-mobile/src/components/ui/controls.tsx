import { ActivityIndicator, Text, TextInput, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, shadows, spacing } from "../../theme";
import type { ButtonProps } from "./rows";
import { PressScale } from "./press";
import { styles } from "./styles";

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
export interface InputProps {
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
  /** "none" for passwords that can be shown, codes and emails. */
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
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
  autoCapitalize,
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
          // Passwords and emails must arrive as typed: the default capitalised the first
          // letter on many Android keyboards ("Kibanda#2027" for "kibanda#2027").
          autoCapitalize={autoCapitalize ?? (secureTextEntry || keyboardType === "email-address" ? "none" : undefined)}
          autoCorrect={autoCapitalize === "none" || secureTextEntry || keyboardType === "email-address" ? false : undefined}
          multiline={multiline}
          editable={editable}
        />
      </View>
      {error && <Text style={styles.inputError}>{error}</Text>}
    </View>
  );
}
// ==================== EMPTY STATE ====================
export interface EmptyStateProps {
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
