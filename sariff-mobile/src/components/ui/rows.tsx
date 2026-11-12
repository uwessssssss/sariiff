import { Ionicons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View, ViewStyle } from "react-native";
import { colors, shadows } from "../../theme";
import { PressScale } from "./press";
import type { StatRowProps } from "./cards";
import { styles } from "./styles";

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
export interface TransactionRowProps {
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
export interface SectionHeaderProps {
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
export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "outline";
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  size?: "sm" | "md" | "lg";
}
