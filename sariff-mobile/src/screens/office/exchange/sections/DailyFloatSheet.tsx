import { ActionBtn, FormSection, InfoRow, Input, ModalSheet } from "../../../../components/ui";
import { CURRENCY_COLOR, Currency, formatCurrency } from "../../../../types";
import { Text, View } from "react-native";
import { colors } from "../../../../theme";
import { type ExchangeScreenVM } from "../useExchangeScreen";

export function DailyFloatSheet({ vm }: { vm: ExchangeScreenVM }) {
  const { base, baseCode, dailyKesCount, dailyNotes, dailyOtherCounts, dailyUsdCount, float, formLoading, handleDailyFloat, modal, setDailyKesCount, setDailyNotes, setDailyOtherCounts, setDailyUsdCount, setModal } = vm;
  return (
    <ModalSheet
      visible={modal === "dailyFloat"}
      onClose={() => setModal("none")}
      title="Daily Float Verification"
      icon="clipboard-outline"
      iconColor="#F59E0B"
      iconBg="rgba(246,180,94,0.12)"
    >
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
          label={`System ${baseCode}`}
          value={formatCurrency(float?.kesBalance || 0, base)}
          valueColor="#059669"
        />
        <InfoRow
          label="System USD"
          value={formatCurrency(float?.usdBalance || 0, Currency.USD)}
          valueColor="#2563EB"
        />
        {(float?.otherBalances || []).map((o) => (
          <InfoRow
            key={o.currency}
            label={`System ${o.currencyCode}`}
            value={formatCurrency(o.balance, o.currency)}
            valueColor={CURRENCY_COLOR[o.currency]}
          />
        ))}
      </View>
      <FormSection label={`Physical ${baseCode} Count`}>
        <Input
          label=""
          value={dailyKesCount}
          onChangeText={setDailyKesCount}
          keyboardType="numeric"
          icon="cash-outline"
          placeholder={`Count physical ${baseCode}`}
        />
      </FormSection>
      <FormSection label="Physical USD Count">
        <Input
          label=""
          value={dailyUsdCount}
          onChangeText={setDailyUsdCount}
          keyboardType="numeric"
          icon="logo-usd"
          placeholder="Count physical USD"
        />
      </FormSection>
      {(float?.otherBalances || []).map((o) => (
        <FormSection key={o.currency} label={`Physical ${o.currencyCode} Count`}>
          <Input
            label=""
            value={dailyOtherCounts[o.currency] ?? ""}
            onChangeText={(v: string) => setDailyOtherCounts((p) => ({ ...p, [o.currency]: v }))}
            keyboardType="numeric"
            icon="cash-outline"
            placeholder={`Count physical ${o.currencyCode}`}
          />
          {dailyOtherCounts[o.currency] ? (
            <Text style={{ fontSize: 12, marginTop: 4, color: parseFloat(dailyOtherCounts[o.currency]) - o.balance === 0 ? "#39D9B0" : "#FF6B81" }}>
              Variance: {parseFloat(dailyOtherCounts[o.currency]) - o.balance >= 0 ? "+" : ""}
              {(parseFloat(dailyOtherCounts[o.currency]) - o.balance).toFixed(2)}
            </Text>
          ) : null}
        </FormSection>
      ))}
      {dailyKesCount && dailyUsdCount && (
        <View
          style={{
            backgroundColor:
              parseFloat(dailyKesCount) - (float?.kesBalance || 0) === 0 &&
              parseFloat(dailyUsdCount) - (float?.usdBalance || 0) === 0
                ? "rgba(57,217,176,0.12)"
                : "rgba(246,180,94,0.12)",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600" as any,
              color: "#9AA6BE",
              marginBottom: 4,
            }}
          >
            Variance
          </Text>
          <InfoRow
            label={`${baseCode}`}
            value={`${parseFloat(dailyKesCount) - (float?.kesBalance || 0) >= 0 ? "+" : ""}${(parseFloat(dailyKesCount) - (float?.kesBalance || 0)).toFixed(2)}`}
            valueColor={
              parseFloat(dailyKesCount) - (float?.kesBalance || 0) === 0
                ? "#059669"
                : "#DC2626"
            }
          />
          <InfoRow
            label="USD"
            value={`${parseFloat(dailyUsdCount) - (float?.usdBalance || 0) >= 0 ? "+" : ""}${(parseFloat(dailyUsdCount) - (float?.usdBalance || 0)).toFixed(2)}`}
            valueColor={
              parseFloat(dailyUsdCount) - (float?.usdBalance || 0) === 0
                ? "#059669"
                : "#DC2626"
            }
          />
        </View>
      )}
      <FormSection label="Notes (optional)">
        <Input
          label=""
          value={dailyNotes}
          onChangeText={setDailyNotes}
          icon="document-text-outline"
          placeholder="Shift notes..."
          multiline
        />
      </FormSection>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <ActionBtn
            title="☀️ Opening"
            onPress={() => handleDailyFloat("opening")}
            loading={formLoading}
            gradient={["#D97706", "#F59E0B"]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <ActionBtn
            title="🌙 Closing"
            onPress={() => handleDailyFloat("closing")}
            loading={formLoading}
            gradient={colors.gradients.blue as any}
          />
        </View>
      </View>
    </ModalSheet>
  );
}
