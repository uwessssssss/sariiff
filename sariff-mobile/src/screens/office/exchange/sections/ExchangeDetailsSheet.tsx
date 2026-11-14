import { ActionBtn, InfoRow, ModalSheet } from "../../../../components/ui";
import { View } from "react-native";
import { colors } from "../../../../theme";
import { currencyCode, formatCurrency, formatDateTime } from "../../../../types";
import { type ExchangeScreenVM } from "../useExchangeScreen";

export function ExchangeDetailsSheet({ vm }: { vm: ExchangeScreenVM }) {
  const { base, detailTxn, handleVoidExchange, setDetailTxn } = vm;
  return (
    <ModalSheet
      visible={!!detailTxn}
      onClose={() => setDetailTxn(null)}
      title="Exchange Details"
      icon="swap-horizontal-outline"
      iconColor={colors.primary}
      iconBg="rgba(91,156,255,0.12)"
    >
      {detailTxn && (
        <>
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
            <InfoRow label="Code" value={detailTxn.code} />
            <InfoRow
              label="Status"
              value={detailTxn.status}
              valueColor={
                detailTxn.status === "Voided" ? colors.danger : colors.success
              }
            />
            <InfoRow
              label="Client"
              value={detailTxn.clientName || "Walk-in"}
            />
            <InfoRow
              label="Direction"
              value={`${currencyCode(detailTxn.currencyGiven)} → ${currencyCode(detailTxn.currencyReceived)}`}
            />
            <InfoRow label="Rate" value={String(detailTxn.exchangeRate)} />
            <InfoRow
              label="Amount Given"
              value={formatCurrency(
                detailTxn.amountGiven,
                detailTxn.currencyGiven,
              )}
              valueColor="#FF6B81"
            />
            <InfoRow
              label="Amount Received"
              value={formatCurrency(
                detailTxn.amountReceived,
                detailTxn.currencyReceived,
              )}
              valueColor="#39D9B0"
            />
            <InfoRow
              label="Profit"
              value={formatCurrency(
                detailTxn.profit,
                detailTxn.profitCurrency ?? base,
              )}
              valueColor="#10B981"
            />
            <InfoRow label="Date" value={formatDateTime(detailTxn.date)} />
          </View>
          {detailTxn.notes ? (
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
              <InfoRow label="Notes" value={detailTxn.notes} stacked />
            </View>
          ) : null}
          {detailTxn.status !== "Voided" && (
            <ActionBtn
              title="Void Exchange"
              onPress={() => {
                const t = detailTxn;
                setDetailTxn(null);
                handleVoidExchange(t.id, t.code);
              }}
              icon="close-circle-outline"
              gradient={["#EF4444", "#F87171"]}
            />
          )}
        </>
      )}
    </ModalSheet>
  );
}
