import { InfoRow } from "../../../../components/ui";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import Toast from "react-native-toast-message";
import { colors } from "../../../../theme";
import { formatCurrency, formatDateTime } from "../../../../types";
import { shareReceipt } from "../helpers";
import { toastConfig } from "../../../../components/toastConfig";
import { type StatementsScreenVM } from "../useStatementsScreen";

export function ReceiptSheet({ vm }: { vm: StatementsScreenVM }) {
  const { insets, selectedTxn, setSelectedTxn } = vm;
  return (
    <Modal
      visible={!!selectedTxn}
      transparent
      animationType="fade"
      onRequestClose={() => setSelectedTxn(null)}
    >
      <TouchableOpacity
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          padding: 20,
        }}
        activeOpacity={1}
        onPress={() => setSelectedTxn(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 20,
            overflow: "hidden",
            maxHeight: "85%",
          }}
        >
          {selectedTxn && (
            <>
              {/* Hero Amount */}
              <LinearGradient
                colors={
                  selectedTxn.type === "Credit"
                    ? ["#059669", "#10B981"]
                    : ["#DC2626", "#EF4444"]
                }
                style={{
                  paddingVertical: 28,
                  paddingHorizontal: 24,
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: "rgba(255,255,255,0.2)",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 8,
                  }}
                >
                  <Ionicons
                    name={
                      selectedTxn.type === "Credit"
                        ? "arrow-down"
                        : "arrow-up"
                    }
                    size={24}
                    color="#FFF"
                  />
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700" as any,
                    color: "rgba(255,255,255,0.8)",
                    letterSpacing: 1.5,
                  }}
                >
                  {selectedTxn.type === "Credit" ? "MONEY IN" : "MONEY OUT"}
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  style={{
                    fontSize: 32,
                    fontWeight: "800" as any,
                    color: "#FFF",
                    marginTop: 4,
                  }}
                >
                  {selectedTxn.type === "Credit" ? "+" : "-"}
                  {formatCurrency(selectedTxn.amount, selectedTxn.currency)}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.7)",
                    marginTop: 4,
                  }}
                >
                  {selectedTxn.code}
                </Text>
              </LinearGradient>
              {/* Details */}
              <ScrollView style={{ padding: 20, flexShrink: 1 }}>
                <InfoRow
                  label="Description"
                  value={selectedTxn.description}
                  stacked
                />
                <InfoRow
                  label="Date"
                  value={formatDateTime(selectedTxn.date)}
                />
                <InfoRow
                  label="Balance Before"
                  value={formatCurrency(
                    selectedTxn.balanceBefore ?? 0,
                    selectedTxn.currency,
                  )}
                />
                <InfoRow
                  label="Balance After"
                  value={formatCurrency(
                    selectedTxn.balanceAfter ?? 0,
                    selectedTxn.currency,
                  )}
                  valueColor={
                    (selectedTxn.balanceAfter ?? 0) >= 0
                      ? "#059669"
                      : "#DC2626"
                  }
                />
                {selectedTxn.counterAccountName ? (
                  <InfoRow
                    label="Via"
                    value={selectedTxn.counterAccountName}
                  />
                ) : null}
                {selectedTxn.reference ? (
                  <InfoRow label="Reference" value={selectedTxn.reference} />
                ) : null}
                {selectedTxn.notes ? (
                  <InfoRow label="Notes" value={selectedTxn.notes} stacked />
                ) : null}

                {/* Download Receipt */}
                <TouchableOpacity
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(91,156,255,0.12)",
                    borderRadius: 12,
                    padding: 14,
                    marginTop: 16,
                    gap: 8,
                  }}
                  onPress={() => shareReceipt(selectedTxn)}
                >
                  <Ionicons
                    name="download-outline"
                    size={18}
                    color="#4F46E5"
                  />
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700" as any,
                      color: "#4F46E5",
                    }}
                  >
                    Download Receipt
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSelectedTxn(null)}
                  style={{
                    marginTop: 12,
                    paddingVertical: 14,
                    backgroundColor: colors.surfaceAlt,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: colors.textTertiary,
                      fontWeight: "600" as any,
                      fontSize: 15,
                    }}
                  >
                    Close
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    {!!selectedTxn && (
        <Toast config={toastConfig} position="top" topOffset={insets.top + 12} />
      )}

    </Modal>
  );
}
