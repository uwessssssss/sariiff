import { ActionBtn, ChipGroup, FormSection, InfoRow, Input, ModalSheet } from "../../../../components/ui";
import { Currency, currencyChips, currencyCode, foreignCurrenciesFor } from "../../../../types";
import { View } from "react-native";
import { colors } from "../../../../theme";
import { fmtRate } from "../helpers";
import { type ExchangeScreenVM } from "../useExchangeScreen";

export function SetRateSheet({ vm }: { vm: ExchangeScreenVM }) {
  const { base, baseCode, buyRate, formLoading, handleSetRate, modal, rateCurrency, rates, sellRate, setBuyRate, setModal, setRateCurrency, setSellRate } = vm;
  return (
    <ModalSheet
      visible={modal === "setRate"}
      onClose={() => setModal("none")}
      title="Set Exchange Rate"
      icon="trending-up-outline"
      iconColor={colors.primary}
      iconBg="rgba(154,123,255,0.12)"
    >
      <FormSection label="Currency">
        <ChipGroup
          options={currencyChips(foreignCurrenciesFor(base))}
          selected={rateCurrency}
          onSelect={(v: number) => {
            setRateCurrency(v);
            setBuyRate(rates[v] ? String(rates[v].buyRate) : "");
            setSellRate(rates[v] ? String(rates[v].sellRate) : "");
          }}
        />
      </FormSection>
      <FormSection label={`Buy Rate (${baseCode} per 1 ${currencyCode(rateCurrency)})`}>
        <Input
          label=""
          value={buyRate}
          onChangeText={setBuyRate}
          keyboardType="numeric"
          icon="trending-up-outline"
          placeholder={base === Currency.UGX ? "3640" : "128.50"}
        />
      </FormSection>
      <FormSection label={`Sell Rate (${baseCode} per 1 ${currencyCode(rateCurrency)})`}>
        <Input
          label=""
          value={sellRate}
          onChangeText={setSellRate}
          keyboardType="numeric"
          icon="trending-down-outline"
          placeholder={base === Currency.UGX ? "3700" : "129.50"}
        />
      </FormSection>
      {rates[rateCurrency] && (
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
            label="Current Buy"
            value={fmtRate(rates[rateCurrency].buyRate)}
            valueColor="#059669"
          />
          <InfoRow
            label="Current Sell"
            value={fmtRate(rates[rateCurrency].sellRate)}
            valueColor="#3B82F6"
          />
          <InfoRow
            label="Spread"
            value={fmtRate(rates[rateCurrency].sellRate - rates[rateCurrency].buyRate)}
            valueColor={colors.gold}
          />
        </View>
      )}
      <ActionBtn
        title="Update Rate"
        onPress={handleSetRate}
        loading={formLoading}
        icon="checkmark-circle-outline"
        gradient={colors.gradients.blue as any}
      />
    </ModalSheet>
  );
}
