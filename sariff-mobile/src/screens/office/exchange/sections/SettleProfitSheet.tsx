import { AccountType, Currency, currencyCode, formatCurrency } from "../../../../types";
import { ActionBtn, ChipGroup, FormSection, InfoRow, ModalSheet } from "../../../../components/ui";
import { Text, TouchableOpacity, View } from "react-native";
import { colors } from "../../../../theme";
import { styles } from "../helpers";
import { type ExchangeScreenVM } from "../useExchangeScreen";

export function SettleProfitSheet({ vm }: { vm: ExchangeScreenVM }) {
  const { base, baseCode, float, floatSrcType, formLoading, getFloatAccountList, handleSettleProfit, modal, setFloatSrcType, setModal, setSettleAccId, setSettleCurrency, settleAccId, settleCurrency } = vm;
  return (
    <ModalSheet
      visible={modal === "settleProfit"}
      onClose={() => setModal("none")}
      title="Settle Profit"
      icon="wallet-outline"
      iconColor="#D97706"
      iconBg="rgba(246,180,94,0.12)"
    >
      {float && (
        <View
          style={{
            backgroundColor: colors.glass,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <InfoRow
            label={`${baseCode} Profit Available`}
            value={formatCurrency(float.kesProfit, base)}
            valueColor="#059669"
          />
          <InfoRow
            label="USD Profit Available"
            value={formatCurrency(float.usdProfit, Currency.USD)}
            valueColor="#2563EB"
          />
        </View>
      )}
      <FormSection label="Currency">
        <ChipGroup
          options={[
            {
              value: 0,
              label: `${baseCode} (${formatCurrency(float?.kesProfit || 0, base)})`,
              color: "#39D9B0",
            },
            {
              value: 1,
              label: `USD (${formatCurrency(float?.usdProfit || 0, Currency.USD)})`,
              color: "#7FB3FF",
            },
          ]}
          selected={settleCurrency}
          onSelect={(v: number) => {
            setSettleCurrency(v);
            setSettleAccId("");
            setFloatSrcType(AccountType.Cash);
          }}
        />
      </FormSection>
      <FormSection label="Destination Account Type">
        <ChipGroup
          options={[
            { value: AccountType.Cash, label: "Cash" },
            { value: AccountType.Bank, label: "Bank" },
            ...(settleCurrency === 0
              ? [{ value: AccountType.Mpesa, label: "Mobile money" }]
              : []),
          ]}
          selected={floatSrcType}
          onSelect={(v: number) => {
            setFloatSrcType(v);
            setSettleAccId("");
          }}
        />
      </FormSection>
      <FormSection label="Destination Account">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {getFloatAccountList(floatSrcType).map((a: any) => (
            <TouchableOpacity
              key={a.id}
              style={[
                styles.chip,
                settleAccId === a.id && styles.chipActive,
                { paddingHorizontal: 16 },
              ]}
              onPress={() => setSettleAccId(a.id)}
            >
              <Text
                style={[
                  styles.chipText,
                  settleAccId === a.id && styles.chipTextActive,
                ]}
              >
                {a.name}
              </Text>
            </TouchableOpacity>
          ))}
          {getFloatAccountList(floatSrcType).length === 0 && (
            <Text style={{ color: "#9CA3AF", fontSize: 13 }}>
              No {currencyCode(settleCurrency)} accounts
            </Text>
          )}
        </View>
      </FormSection>
      <ActionBtn
        title="Settle Profit"
        onPress={handleSettleProfit}
        loading={formLoading}
        icon="wallet-outline"
        gradient={["#D97706", "#F59E0B"]}
      />
    </ModalSheet>
  );
}
