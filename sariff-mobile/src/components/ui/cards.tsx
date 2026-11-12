import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors, fonts, shadows } from "../../theme";
import { type GradientCardProps, PressScale } from "./press";

export function GradientCard({
  gradient,
  icon,
  label,
  value,
  subtitle,
  onPress,
  style,
}: GradientCardProps) {
  // Same props as before; drawn as a SummaryCard. The old gradient's hue picks the meaning.
  const g = String(gradient[0]).toLowerCase();
  const tone: SummaryTone =
    /39d9b0|10b981|16a34a|0f9e76|34d399|059669/.test(g) ? "in"
      : /ff6b81|f43f5e|ef4444|dc2626|d23b53/.test(g) ? "out"
      : /e9b949|f6d77e|f6b45e|f59e0b|d98a2a/.test(g) ? "value"
      : "accent";
  return <SummaryCard tone={tone} icon={icon} label={label} value={value} caption={subtitle} onPress={onPress} style={style} />;
}
// ==================== SUMMARY CARDS (Nov 2026 redesign) ====================
// One look for every money summary: a dark raised surface, a tinted icon chip, the figure in
// white. Colour carries meaning only — green = money in, red = money out, blue = balances and
// actions, gold = rates — instead of a different rainbow gradient per card.
export type SummaryTone = "accent" | "in" | "out" | "value" | "neutral";
export const TONES: Record<SummaryTone, { fg: string; bg: string; glow: string }> = {
  accent: { fg: colors.primary, bg: "rgba(91,156,255,0.14)", glow: "rgba(91,156,255,0.10)" },
  in: { fg: colors.success, bg: colors.successLight, glow: "rgba(57,217,176,0.09)" },
  out: { fg: colors.danger, bg: colors.dangerLight, glow: "rgba(255,107,129,0.09)" },
  value: { fg: colors.gold, bg: "rgba(233,185,73,0.14)", glow: "rgba(233,185,73,0.09)" },
  neutral: { fg: colors.textSecondary, bg: colors.glassStrong, glow: "rgba(255,255,255,0.04)" },
};
export interface SummaryCardProps {
  tone?: SummaryTone;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** the main figure: text, or a node such as <CountUp/> */
  value: React.ReactNode;
  caption?: string;
  /** further lines under the figure (e.g. the same total in other currencies) */
  extra?: string[];
  valueColor?: string;
  onPress?: () => void;
  style?: ViewStyle;
}
export function SummaryCard({ tone = "accent", icon, label, value, caption, extra, valueColor, onPress, style }: SummaryCardProps) {
  const t = TONES[tone];
  const body = (
    <View style={[sum.card, style]} accessible accessibilityLabel={`${label}: ${typeof value === "string" ? value : ""}${caption ? `, ${caption}` : ""}`}>
      <View style={[sum.glow, { backgroundColor: t.glow }]} />
      <View style={sum.head}>
        <View style={[sum.chip, { backgroundColor: t.bg }]}>
          <Ionicons name={icon} size={16} color={t.fg} />
        </View>
        <Text style={sum.label} numberOfLines={1}>{label}</Text>
        {onPress && <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />}
      </View>
      {typeof value === "string" ? (
        <Text style={[sum.value, valueColor ? { color: valueColor } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>{value}</Text>
      ) : (
        <View style={sum.valueWrap}>{value}</View>
      )}
      {!!caption && <Text style={sum.caption} numberOfLines={2}>{caption}</Text>}
      {(extra || []).map((x) => (
        <Text key={x} style={sum.extra} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{x}</Text>
      ))}
      <View style={[sum.bar, { backgroundColor: t.fg }]} />
    </View>
  );
  return onPress ? <PressScale onPress={onPress} activeScale={0.98} style={{ flex: 1 }}>{body}</PressScale> : body;
}
/** Two summary cards side by side (or one full width). */
export function SummaryGrid({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const kids = React.Children.toArray(children).filter(Boolean);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < kids.length; i += 2) rows.push(kids.slice(i, i + 2));
  return (
    <View style={[{ gap: 12 }, style]}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 12 }}>
          {r.map((k, j) => <View key={j} style={{ flex: 1 }}>{k}</View>)}
          {r.length === 1 && kids.length > 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}
export interface HeroStat { label: string; value: string; tone?: SummaryTone }
export interface HeroCardProps {
  eyebrow: string;
  value: React.ReactNode;
  caption?: string;
  stats?: HeroStat[];
  badge?: string;
  valueColor?: string;
  style?: ViewStyle;
}
/** The one figure that matters most on a screen: deep navy, a soft blue glow, big white numbers. */
export function HeroCard({ eyebrow, value, caption, stats, badge, valueColor, style }: HeroCardProps) {
  return (
    <LinearGradient colors={["#16264A", "#0F1830", "#0C1120"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[sum.hero, shadows.lg, style]}>
      <View style={sum.heroGlow} />
      <View style={sum.heroGlow2} />
      <View style={sum.heroHead}>
        <Text style={sum.heroEyebrow}>{eyebrow}</Text>
        {!!badge && <View style={sum.heroBadge}><Text style={sum.heroBadgeText}>{badge}</Text></View>}
      </View>
      {typeof value === "string" ? (
        <Text style={[sum.heroValue, valueColor ? { color: valueColor } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{value}</Text>
      ) : (
        <View style={{ marginTop: 8 }}>{value}</View>
      )}
      {!!caption && <Text style={sum.heroCaption}>{caption}</Text>}
      {!!stats?.length && (
        <View style={sum.heroStats}>
          {stats.map((x, i) => (
            <View key={x.label} style={[sum.heroStat, i > 0 && sum.heroStatDivider]}>
              <Text style={sum.heroStatLabel} numberOfLines={1}>{x.label}</Text>
              <Text style={[sum.heroStatValue, x.tone ? { color: TONES[x.tone].fg } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{x.value}</Text>
            </View>
          ))}
        </View>
      )}
    </LinearGradient>
  );
}
export const sum = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    padding: 16, paddingBottom: 18, overflow: "hidden", minHeight: 128, ...shadows.sm,
  },
  glow: { position: "absolute", width: 120, height: 120, borderRadius: 60, top: -50, right: -40 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  chip: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", color: colors.textSecondary, fontFamily: fonts.uiSemibold, fontWeight: "600" },
  value: { marginTop: 16, fontSize: 22, color: colors.text, fontFamily: fonts.display, fontWeight: "700", letterSpacing: -0.3 },
  valueWrap: { marginTop: 16 },
  caption: { marginTop: 4, fontSize: 12, color: colors.textSecondary, fontFamily: fonts.ui },
  extra: { marginTop: 2, fontSize: 12.5, color: colors.textSecondary, fontFamily: fonts.uiMedium, fontWeight: "500" },
  bar: { position: "absolute", left: 16, right: 16, bottom: 0, height: 2, borderTopLeftRadius: 2, borderTopRightRadius: 2, opacity: 0.55 },
  hero: { borderRadius: 24, padding: 20, overflow: "hidden", borderWidth: 1, borderColor: "rgba(127,179,255,0.18)" },
  heroGlow: { position: "absolute", width: 220, height: 220, borderRadius: 110, top: -110, right: -70, backgroundColor: "rgba(91,156,255,0.16)" },
  heroGlow2: { position: "absolute", width: 160, height: 160, borderRadius: 80, bottom: -90, left: -50, backgroundColor: "rgba(57,217,176,0.07)" },
  heroHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroEyebrow: { fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase", color: "#AFC4E8", fontFamily: fonts.uiSemibold, fontWeight: "600" },
  heroBadge: { backgroundColor: "rgba(91,156,255,0.18)", borderColor: "rgba(127,179,255,0.35)", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  heroBadgeText: { fontSize: 11, color: "#CFE0FF", fontFamily: fonts.uiSemibold, fontWeight: "600" },
  heroValue: { marginTop: 8, fontSize: 34, color: colors.text, fontFamily: fonts.display, fontWeight: "700", letterSpacing: -0.6 },
  heroCaption: { marginTop: 2, fontSize: 12.5, color: "#AFC4E8", fontFamily: fonts.ui },
  heroStats: { flexDirection: "row", marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  heroStat: { flex: 1, paddingRight: 8 },
  heroStatDivider: { paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.08)" },
  heroStatLabel: { fontSize: 11, color: "#AFC4E8", fontFamily: fonts.ui, letterSpacing: 0.3 },
  heroStatValue: { marginTop: 3, fontSize: 15.5, color: colors.text, fontFamily: fonts.uiSemibold, fontWeight: "600" },
});
// ==================== STAT ROW ====================
export interface StatRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
  subtitle?: string;
  onPress?: () => void;
}
