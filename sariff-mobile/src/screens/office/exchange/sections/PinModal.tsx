import { Ionicons } from "@expo/vector-icons";
import { Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
import Toast from "react-native-toast-message";
import { colors, spacing } from "../../../../theme";
import { toastConfig } from "../../../../components/toastConfig";
import { type ExchangeScreenVM } from "../useExchangeScreen";

export function PinModal({ vm }: { vm: ExchangeScreenVM }) {
  const { handlePinDigit, handlePinKeyPress, insets, pinDigits, pinError, pinRefs, pinVerifying, setShowPinModal, showPinModal } = vm;
  return (
    <Modal visible={showPinModal} transparent animationType="fade">
      <TouchableOpacity
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          padding: spacing.lg,
        }}
        activeOpacity={1}
        onPress={() => setShowPinModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            backgroundColor: "#161A26",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.09)",
            borderRadius: 20,
            padding: 24,
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: "rgba(91,156,255,0.12)",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Ionicons name="lock-closed" size={28} color={colors.primary} />
          </View>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700" as any,
              color: "#F4F6FB",
            }}
          >
            Enter Bureau PIN
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: "#9AA6BE",
              marginTop: 4,
              textAlign: "center",
            }}
          >
            Enter the 4-digit bureau PIN to continue
          </Text>
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              marginTop: 24,
              marginBottom: 12,
            }}
          >
            {pinDigits.map((d, i) => (
              <TextInput
                key={i}
                ref={pinRefs[i]}
                value={d}
                onChangeText={(v) => handlePinDigit(i, v)}
                onKeyPress={({ nativeEvent }) =>
                  handlePinKeyPress(i, nativeEvent.key)
                }
                style={{
                  width: 56,
                  height: 56,
                  borderWidth: 2,
                  borderColor: pinError
                    ? "#DC2626"
                    : d
                      ? colors.primary
                      : "rgba(255,255,255,0.12)",
                  borderRadius: 14,
                  textAlign: "center",
                  fontSize: 24,
                  fontWeight: "700" as any,
                  color: "#F4F6FB",
                  backgroundColor: "rgba(255,255,255,0.06)",
                }}
                keyboardType="numeric"
                maxLength={1}
                secureTextEntry
                editable={!pinVerifying}
              />
            ))}
          </View>
          {pinVerifying && (
            <Text
              style={{
                color: colors.primary,
                fontSize: 13,
                fontWeight: "600" as any,
                marginBottom: 8,
              }}
            >
              Verifying...
            </Text>
          )}
          {pinError ? (
            <Text style={{ color: "#FF6B81", fontSize: 13, marginBottom: 8 }}>
              {pinError}
            </Text>
          ) : null}
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 11,
              textAlign: "center",
              marginTop: 8,
            }}
          >
            Contact your administrator if you don't know the PIN
          </Text>
          <TouchableOpacity
            style={{
              width: "100%",
              paddingVertical: 14,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 12,
              alignItems: "center",
              marginTop: 20,
            }}
            onPress={() => setShowPinModal(false)}
          >
            <Text
              style={{
                color: "#9AA6BE",
                fontWeight: "600" as any,
                fontSize: 15,
              }}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    {showPinModal && (
        <Toast config={toastConfig} position="top" topOffset={insets.top + 12} />
      )}

    </Modal>
  );
}
