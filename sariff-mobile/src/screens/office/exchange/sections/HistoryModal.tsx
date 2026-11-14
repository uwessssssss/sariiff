import { Currency, formatCurrency } from "../../../../types";
import { Ionicons } from "@expo/vector-icons";
import { Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { borderRadius, colors, fontSize, fontWeight, spacing } from "../../../../theme";
import { type ExchangeScreenVM } from "../useExchangeScreen";

export function HistoryModal({ vm }: { vm: ExchangeScreenVM }) {
  const { base, baseCode, floatHistory, setShowHistory, showHistory } = vm;
  return (
    <Modal visible={showHistory} transparent animationType="fade">
      <TouchableOpacity
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          padding: spacing.md,
        }}
        activeOpacity={1}
        onPress={() => setShowHistory(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 16,
            maxHeight: "80%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: spacing.lg,
              borderBottomWidth: 1,
              borderColor: colors.borderLight,
            }}
          >
            <Text
              style={{
                fontSize: fontSize.lg,
                fontWeight: fontWeight.bold,
                color: colors.text,
              }}
            >
              📅 Float History
            </Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={() => setShowHistory(false)}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ padding: spacing.md }}>
            {floatHistory.length === 0 ? (
              <Text
                style={{
                  textAlign: "center",
                  color: colors.textTertiary,
                  padding: spacing.xl,
                }}
              >
                No daily records yet. Start by recording an opening float.
              </Text>
            ) : (
              floatHistory.map((day: any, i: number) => (
                <View
                  key={i}
                  style={{
                    marginBottom: spacing.md,
                    backgroundColor: colors.glass,
                    borderRadius: borderRadius.md,
                    padding: spacing.md,
                    borderLeftWidth: 4,
                    borderLeftColor: day.isClosed ? "#10B981" : "#F59E0B",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: fontSize.sm,
                        fontWeight: fontWeight.bold,
                        color: colors.text,
                      }}
                    >
                      {new Date(day.date).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 10,
                        backgroundColor: day.isClosed ? "rgba(57,217,176,0.12)" : "rgba(246,180,94,0.12)",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "700" as any,
                          color: day.isClosed ? "#39D9B0" : "#F6B45E",
                        }}
                      >
                        {day.isClosed ? "Closed" : "Open"}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontSize: 10, color: colors.textTertiary }}
                      >
                        Exchanges
                      </Text>
                      <Text
                        style={{
                          fontSize: fontSize.sm,
                          fontWeight: fontWeight.bold,
                          color: colors.text,
                        }}
                      >
                        {day.exchangeCount || 0}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontSize: 10, color: colors.textTertiary }}
                      >
                        {baseCode} Profit
                      </Text>
                      <Text
                        style={{
                          fontSize: fontSize.sm,
                          fontWeight: fontWeight.bold,
                          color: "#10B981",
                        }}
                      >
                        {formatCurrency(day.kesProfit || 0, base)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ fontSize: 10, color: colors.textTertiary }}
                      >
                        USD Profit
                      </Text>
                      <Text
                        style={{
                          fontSize: fontSize.sm,
                          fontWeight: fontWeight.bold,
                          color: "#3B82F6",
                        }}
                      >
                        {formatCurrency(day.usdProfit || 0, Currency.USD)}
                      </Text>
                    </View>
                  </View>
                  {day.isClosed &&
                    (day.kesVariance !== 0 || day.usdVariance !== 0) && (
                      <View
                        style={{
                          flexDirection: "row",
                          marginTop: 6,
                          gap: spacing.sm,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            color:
                              (day.kesVariance || 0) === 0
                                ? "#10B981"
                                : "#DC2626",
                          }}
                        >
                          {baseCode} var: {(day.kesVariance || 0).toFixed(2)}
                        </Text>
                        <Text
                          style={{
                            fontSize: 10,
                            color:
                              (day.usdVariance || 0) === 0
                                ? "#10B981"
                                : "#DC2626",
                          }}
                        >
                          USD var: {(day.usdVariance || 0).toFixed(2)}
                        </Text>
                      </View>
                    )}
                </View>
              ))
            )}
            <View style={{ height: 20 }} />
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
