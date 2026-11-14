import { ModalSheet } from "../../../../components/ui";
import { Text, View } from "react-native";
import { colors } from "../../../../theme";
import { type ExchangeScreenVM } from "../useExchangeScreen";

export function RateHistorySheet({ vm }: { vm: ExchangeScreenVM }) {
  const { modal, rateHistoryData, setModal } = vm;
  return (
    <ModalSheet
      visible={modal === "rateHistory"}
      onClose={() => setModal("none")}
      title="Rate History"
      icon="trending-up-outline"
      iconColor={colors.primary}
      iconBg="rgba(154,123,255,0.12)"
    >
      {rateHistoryData.length === 0 ? (
        <Text
          style={{
            color: colors.textTertiary,
            textAlign: "center",
            padding: 40,
          }}
        >
          No rate history
        </Text>
      ) : (
        rateHistoryData.slice(0, 20).map((r: any, i: number) => (
          <View
            key={i}
            style={[
              {
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderColor: colors.border,
              },
              i === 0 && {
                backgroundColor: "rgba(91,156,255,0.16)",
                marginHorizontal: -20,
                paddingHorizontal: 20,
                borderRadius: 12,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: i === 0 ? ("700" as any) : ("500" as any),
                  color: colors.text,
                }}
              >
                {new Date(r.effectiveFrom || r.createdAt).toLocaleDateString(
                  "en-GB",
                  { day: "numeric", month: "short", year: "numeric" },
                )}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                {new Date(r.effectiveFrom || r.createdAt).toLocaleTimeString(
                  "en-GB",
                  { hour: "2-digit", minute: "2-digit" },
                )}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", marginRight: 16 }}>
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                Buy
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700" as any,
                  color: "#39D9B0",
                }}
              >
                {(r.buyRate || 0).toFixed(2)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                Sell
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700" as any,
                  color: "#7FB3FF",
                }}
              >
                {(r.sellRate || 0).toFixed(2)}
              </Text>
            </View>
          </View>
        ))
      )}
    </ModalSheet>
  );
}
