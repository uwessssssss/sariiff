import { Animated, Text, View } from "react-native";
import { Currency, formatCurrency } from "../../../../types";
import { borderRadius, colors, fontSize, fontWeight, shadows, spacing } from "../../../../theme";
import { type ExchangeScreenVM } from "../useExchangeScreen";

export function TodaySummary({ vm }: { vm: ExchangeScreenVM }) {
  const { base, baseCode, makeAnim, todaySummary } = vm;
  return (
    <>
      {todaySummary && (
        <Animated.View style={[{ marginBottom: spacing.lg }, makeAnim(3)]}>
          <View
            style={[
              {
                backgroundColor: colors.glass,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: borderRadius.lg,
                padding: spacing.lg,
              },
              shadows.sm,
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: spacing.md,
              }}
            >
              <Text
                style={{
                  fontSize: fontSize.md,
                  fontWeight: fontWeight.bold,
                  color: colors.text,
                }}
              >
                📊 Today's Summary
              </Text>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 12,
                  backgroundColor: todaySummary.isClosed
                    ? "rgba(57,217,176,0.12)"
                    : todaySummary.openingKes > 0
                      ? "rgba(246,180,94,0.12)"
                      : "rgba(255,107,129,0.12)",
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700" as any,
                    color: todaySummary.isClosed
                      ? "#166534"
                      : todaySummary.openingKes > 0
                        ? "#92400E"
                        : "#991B1B",
                  }}
                >
                  {todaySummary.isClosed
                    ? "✅ Closed"
                    : todaySummary.openingKes > 0
                      ? "☀️ Open"
                      : "⏳ Not Started"}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(57,217,176,0.12)",
                  borderRadius: borderRadius.md,
                  padding: spacing.sm,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: fontSize.xs, color: "#39D9B0" }}>
                  Exchanges
                </Text>
                <Text
                  style={{
                    fontSize: fontSize.lg,
                    fontWeight: fontWeight.bold,
                    color: "#39D9B0",
                  }}
                >
                  {todaySummary.exchangeCount || 0}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(91,156,255,0.12)",
                  borderRadius: borderRadius.md,
                  padding: spacing.sm,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: fontSize.xs, color: "#7FB3FF" }}>
                  {baseCode} Profit
                </Text>
                <Text
                  style={{
                    fontSize: fontSize.md,
                    fontWeight: fontWeight.bold,
                    color: "#7FB3FF",
                  }}
                >
                  {formatCurrency(todaySummary.kesProfit || 0, base)}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(154,123,255,0.12)",
                  borderRadius: borderRadius.md,
                  padding: spacing.sm,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: fontSize.xs, color: "#B9A3FF" }}>
                  USD Profit
                </Text>
                <Text
                  style={{
                    fontSize: fontSize.md,
                    fontWeight: fontWeight.bold,
                    color: "#B9A3FF",
                  }}
                >
                  {formatCurrency(todaySummary.usdProfit || 0, Currency.USD)}
                </Text>
              </View>
            </View>
            {(todaySummary.kesVariance != null &&
              todaySummary.kesVariance !== 0) ||
            (todaySummary.usdVariance != null &&
              todaySummary.usdVariance !== 0) ? (
              <View
                style={{
                  flexDirection: "row",
                  gap: spacing.sm,
                  marginTop: spacing.sm,
                  backgroundColor: "rgba(246,180,94,0.12)",
                  borderRadius: borderRadius.md,
                  padding: spacing.sm,
                }}
              >
                <Text
                  style={{ fontSize: fontSize.xs, color: "#F6B45E", flex: 1 }}
                >
                  ⚠️ Variance: {baseCode}{" "}
                  {(todaySummary.kesVariance || 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  | USD{" "}
                  {(todaySummary.usdVariance || 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      )}
    </>
  );
}
