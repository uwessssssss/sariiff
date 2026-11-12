import { ActionBtn, ChipGroup, FormSection, Input, ModalSheet } from "../../../../components/ui";
import { Text, View } from "react-native";
import { colors } from "../../../../theme";
import { currencyChips, currencyCode, foreignCurrenciesFor, formatCurrency } from "../../../../types";
import { fmtRate } from "../helpers";
import { type ExchangeScreenVM } from "../useExchangeScreen";

export function NewExchangeSheet({ vm }: { vm: ExchangeScreenVM }) {
  const { base, baseCode, boardRate, customRateOutOfBand, customRateValid, direction, effectiveRate, exchAmount, exchCustomRate, exchType, formLoading, fxCurrency, handleExchangeWithPin, modal, rates, renderExchClientPicker, setDirection, setExchAmount, setExchCustomRate, setExchType, setFxCurrency, setModal } = vm;
  return (
    <ModalSheet
      visible={modal === "exchange"}
      onClose={() => setModal("none")}
      title="New Exchange"
      icon="swap-horizontal-outline"
      iconColor={colors.primary}
      iconBg="rgba(91,156,255,0.12)"
    >
      <FormSection label="Exchange Type">
        <ChipGroup
          options={[
            { value: 0, label: "💵 Cash" },
            { value: 1, label: "📋 From Account" },
          ]}
          selected={exchType}
          onSelect={setExchType}
        />
      </FormSection>
      <FormSection label="Currency">
        {foreignCurrenciesFor(base).some((c) => rates[c]) ? (
          <ChipGroup
            options={currencyChips(foreignCurrenciesFor(base).filter((c) => rates[c]))}
            selected={fxCurrency}
            onSelect={setFxCurrency}
          />
        ) : (
          <Text style={{ color: "#FF6B81", fontSize: 13 }}>No exchange rate is set. Set a rate first.</Text>
        )}
      </FormSection>
      <FormSection label="Direction">
        <ChipGroup
          options={[
            { value: 0, label: `${currencyCode(fxCurrency)} → ${baseCode}`, color: "#39D9B0" },
            { value: 1, label: `${baseCode} → ${currencyCode(fxCurrency)}`, color: "#7FB3FF" },
          ]}
          selected={direction}
          onSelect={setDirection}
        />
      </FormSection>
      <FormSection label={`Amount the client gives (${direction === 0 ? currencyCode(fxCurrency) : "${baseCode}"})`}>
        <Input
          label=""
          value={exchAmount}
          onChangeText={setExchAmount}
          keyboardType="numeric"
          icon="cash-outline"
          placeholder="0.00"
        />
      </FormSection>
      {rates[fxCurrency] && exchAmount ? (
        <View
          style={{
            backgroundColor: "rgba(57,217,176,0.12)",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <Text
            style={{ fontSize: 13, color: "#39D9B0", textAlign: "center" }}
          >
            Rate{customRateValid ? " (custom)" : ""}:{" "}
            {fmtRate(effectiveRate)}{" "}
            → Client receives:{" "}
            {formatCurrency(
              parseFloat(exchAmount) *
                (direction === 0 ? effectiveRate : effectiveRate > 0 ? 1 / effectiveRate : 0),
              direction === 0 ? base : fxCurrency,
            )}
          </Text>
          {customRateOutOfBand ? (
            <Text style={{ fontSize: 12, color: "#FF6B81", textAlign: "center", marginTop: 6 }}>
              Custom rate must be within 10% of today's rate ({fmtRate(boardRate * 0.9)} – {fmtRate(boardRate * 1.1)}).
            </Text>
          ) : null}
        </View>
      ) : null}
      <FormSection label="Custom Rate (optional)">
        <Input
          label=""
          value={exchCustomRate}
          onChangeText={setExchCustomRate}
          keyboardType="numeric"
          icon="calculator-outline"
          placeholder="Leave blank for current rate"
        />
      </FormSection>
      {exchType === 1 ? (
        <FormSection label="Select Client">
          {renderExchClientPicker(true)}
        </FormSection>
      ) : (
        <FormSection label="Client (optional)">
          {renderExchClientPicker(false)}
        </FormSection>
      )}
      <ActionBtn
        title="Complete Exchange"
        onPress={handleExchangeWithPin}
        loading={formLoading}
        icon="swap-horizontal-outline"
        gradient={colors.gradients.blue as any}
      />
    </ModalSheet>
  );
}
