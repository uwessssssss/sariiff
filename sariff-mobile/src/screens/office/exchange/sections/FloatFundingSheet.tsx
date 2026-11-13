import { parseAmount } from "../../../../utils/amount";
import { AccountType, currencyChips, currencyCode, floatCurrenciesFor } from "../../../../types";
import { ActionBtn, ChipGroup, FormSection, Input, ModalSheet } from "../../../../components/ui";
import { Text, TouchableOpacity, View } from "react-native";
import { colors } from "../../../../theme";
import { styles } from "../helpers";
import { type ExchangeScreenVM } from "../useExchangeScreen";

export function FloatFundingSheet({ vm }: { vm: ExchangeScreenVM }) {
  const { base, baseCode, floatAmount, floatCurrency, floatPurchaseRate, floatSrcId, floatSrcType, formLoading, getFloatAccountList, handleFloatOp, modal, setFloatAmount, setFloatCurrency, setFloatPurchaseRate, setFloatSrcId, setFloatSrcType, setModal } = vm;
  return (
    <ModalSheet
      visible={modal === "fundFloat" || modal === "withdrawFloat"}
      onClose={() => setModal("none")}
      title={modal === "fundFloat" ? "Fund Float" : "Withdraw Float"}
      icon={
        modal === "fundFloat" ? "add-circle-outline" : "remove-circle-outline"
      }
      iconColor={modal === "fundFloat" ? "#059669" : "#DC2626"}
      iconBg={modal === "fundFloat" ? "rgba(57,217,176,0.12)" : "rgba(255,107,129,0.12)"}
    >
      <FormSection label="Currency">
        <ChipGroup
          options={currencyChips(floatCurrenciesFor(base))}
          selected={floatCurrency}
          onSelect={(v: number) => {
            setFloatCurrency(v);
            setFloatSrcId("");
            setFloatPurchaseRate("");
          }}
        />
      </FormSection>
      <FormSection label="Amount">
        <Input
          label=""
          value={floatAmount}
          onChangeText={setFloatAmount}
          keyboardType="numeric"
          icon="cash-outline"
          placeholder="0.00"
        />
      </FormSection>
      {modal === "fundFloat" && floatCurrency !== base && (
        <FormSection label={`Purchase Rate (${baseCode} per 1 ${currencyCode(floatCurrency)})`}>
          <Input
            label=""
            value={floatPurchaseRate}
            onChangeText={setFloatPurchaseRate}
            keyboardType="numeric"
            icon="calculator-outline"
            placeholder={`e.g. ${({ 0: { 2: "28" }, 1: { 0: "128.50", 2: "3640" }, 2: { 0: "0.035" }, 3: { 0: "140", 2: "4000" } } as any)[floatCurrency]?.[base] ?? ""}`}
          />
          {floatAmount && floatPurchaseRate && (
            <Text style={{ fontSize: 13, color: "#39D9B0", marginTop: 4 }}>
              Cost: {baseCode}{" "}
              {(
                parseAmount(floatAmount) * parseAmount(floatPurchaseRate)
              ).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </Text>
          )}
        </FormSection>
      )}
      <FormSection label="Account Type">
        <ChipGroup
          options={[
            { value: AccountType.Cash, label: "Cash" },
            { value: AccountType.Bank, label: "Bank" },
            ...(modal === "fundFloat" || floatCurrency === 0
              ? [{ value: AccountType.Mpesa, label: "Mobile money" }]
              : []),
          ]}
          selected={floatSrcType}
          onSelect={(v: number) => {
            setFloatSrcType(v);
            setFloatSrcId("");
          }}
        />
      </FormSection>
      <FormSection
        label={
          modal === "fundFloat" ? `Pay From (${baseCode} Account)` : "Select Account"
        }
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {getFloatAccountList(floatSrcType).map((a: any) => (
            <TouchableOpacity
              key={a.id}
              style={[
                styles.chip,
                floatSrcId === a.id && styles.chipActive,
                { paddingHorizontal: 16 },
              ]}
              onPress={() => setFloatSrcId(a.id)}
            >
              <Text
                style={[
                  styles.chipText,
                  floatSrcId === a.id && styles.chipTextActive,
                ]}
              >
                {a.name}
              </Text>
            </TouchableOpacity>
          ))}
          {getFloatAccountList(floatSrcType).length === 0 && (
            <Text style={{ color: colors.textTertiary, fontSize: 13 }}>
              No{" "}
              {modal !== "fundFloat" ? currencyCode(floatCurrency) : `${baseCode}`}{" "}
              accounts
            </Text>
          )}
        </View>
      </FormSection>
      <ActionBtn
        title={modal === "fundFloat" ? "Fund Float" : "Withdraw Float"}
        onPress={() =>
          handleFloatOp(modal === "fundFloat" ? "fund" : "withdraw")
        }
        loading={formLoading}
        icon={
          modal === "fundFloat"
            ? "add-circle-outline"
            : "remove-circle-outline"
        }
        gradient={
          modal === "fundFloat"
            ? ["#059669", "#10B981"]
            : ["#DC2626", "#EF4444"]
        }
      />
    </ModalSheet>
  );
}
