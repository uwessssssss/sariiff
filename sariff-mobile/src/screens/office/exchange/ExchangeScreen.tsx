import { Animated, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Currency, currencyCode, foreignCurrenciesFor, formatCurrency, formatDateTime } from "../../../types";
import { EmptyState, GradientCard, LoadingScreen, SectionHeader } from "../../../components/ui";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as api from "../../../services/api";
import { colors, shadows, spacing } from "../../../theme";
import { fmtRate, styles } from "./helpers";
import { useExchangeScreen } from "./useExchangeScreen";
import { TodaySummary } from "./sections/TodaySummary";
import { ExchangeDetailsSheet } from "./sections/ExchangeDetailsSheet";
import { SetRateSheet } from "./sections/SetRateSheet";
import { NewExchangeSheet } from "./sections/NewExchangeSheet";
import { FloatFundingSheet } from "./sections/FloatFundingSheet";
import { SettleProfitSheet } from "./sections/SettleProfitSheet";
import { RateHistorySheet } from "./sections/RateHistorySheet";
import { DailyFloatSheet } from "./sections/DailyFloatSheet";
import { HistoryModal } from "./sections/HistoryModal";
import { PinModal } from "./sections/PinModal";

export default function ExchangeScreen() {
  const vm = useExchangeScreen();
  const { base, baseCode, float, handleVoidExchange, insets, loadFloatAccounts, loadRateHistory, loading, makeAnim, onRefresh, rate, rates, refreshing, setBuyRate, setDetailTxn, setFloatCurrency, setFloatHistory, setModal, setRateCurrency, setSellRate, setShowHistory, txns } = vm;
  if (loading) return <LoadingScreen message="Loading exchange..." />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Exchange</Text>
        <TouchableOpacity
          onPress={() => {
            setModal("exchange");
            loadFloatAccounts();
            if (rate) {
              setBuyRate(rate.buyRate.toString());
              setSellRate(rate.sellRate.toString());
            }
          }}
        >
          <LinearGradient
            colors={colors.gradients.primary}
            style={styles.addBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="swap-horizontal" size={18} color="#FFF" />
            <Text style={styles.addBtnText}>New</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: 100,
        }}
      >
        {/* Rate Card */}
        <Animated.View style={makeAnim(0)}>
          <LinearGradient
            colors={colors.gradients.dark}
            style={[styles.rateCard, shadows.xl]}
          >
            <View style={styles.rateRow}>
              <View style={styles.rateItem}>
                <Text style={styles.rateLabel}>BUY (USD→{baseCode})</Text>
                <Text
                  style={styles.rateValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {rate?.buyRate?.toFixed(2) || "—"}
                </Text>
              </View>
              <View style={styles.rateDivider} />
              <View style={styles.rateItem}>
                <Text style={styles.rateLabel}>SELL ({baseCode}→USD)</Text>
                <Text
                  style={styles.rateValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {rate?.sellRate?.toFixed(2) || "—"}
                </Text>
              </View>
            </View>
            {/* UGX / EUR rates, when set */}
            {foreignCurrenciesFor(base).filter((c) => c !== Currency.USD && rates[c]).map((c) => (
              <Text key={c} style={[styles.rateLabel, { marginTop: 8 }]}>
                {currencyCode(c)}: buy {fmtRate(rates[c].buyRate)} · sell {fmtRate(rates[c].sellRate)}
              </Text>
            ))}
            <TouchableOpacity
              style={styles.setRateBtn}
              onPress={() => {
                setModal("setRate");
                setRateCurrency(Currency.USD);
                if (rate) {
                  setBuyRate(rate.buyRate.toString());
                  setSellRate(rate.sellRate.toString());
                }
              }}
            >
              <Ionicons
                name="pricetags-outline"
                size={14}
                color={colors.gold}
              />
              <Text style={styles.setRateBtnText}>Set Rate</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        {/* Float Cards */}
        <Animated.View style={[styles.floatRow, makeAnim(1)]}>
          <GradientCard
            gradient={colors.gradients.emerald}
            icon="cash-outline"
            label={`Float ${baseCode}`}
            value={formatCurrency(float?.kesBalance || 0, base)}
            style={{ flex: 1 }}
          />
          <GradientCard
            gradient={colors.gradients.blue}
            icon="logo-usd"
            label="Float USD"
            value={formatCurrency(float?.usdBalance || 0, Currency.USD)}
            style={{ flex: 1 }}
          />
        </Animated.View>
        {(float?.otherBalances || []).length > 0 && (
          <Animated.View style={[styles.floatRow, makeAnim(1)]}>
            {(float?.otherBalances || []).map((o) => (
              <GradientCard
                key={o.currency}
                gradient={colors.gradients.dark}
                icon="cash-outline"
                label={`Float ${o.currencyCode}`}
                value={formatCurrency(o.balance, o.currency)}
                style={{ flex: 1 }}
              />
            ))}
          </Animated.View>
        )}

        {/* Action Buttons */}
        <Animated.View style={[styles.actionRow, makeAnim(2)]}>
          <TouchableOpacity
            style={[styles.actionBtn, shadows.sm]}
            onPress={() => {
              setModal("fundFloat");
              // open on USD (the float most bureaus stock), not KES
              setFloatCurrency(Currency.USD);
              loadFloatAccounts();
            }}
          >
            <View
              style={[
                styles.actIconChip,
                { backgroundColor: "rgba(16,185,129,0.16)" },
              ]}
            >
              <Ionicons name="arrow-down-circle" size={19} color="#10B981" />
            </View>
            <Text style={styles.actionBtnText}>Fund Float</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, shadows.sm]}
            onPress={() => {
              setModal("withdrawFloat");
              loadFloatAccounts();
            }}
          >
            <View
              style={[
                styles.actIconChip,
                { backgroundColor: "rgba(239,68,68,0.14)" },
              ]}
            >
              <Ionicons name="arrow-up-circle" size={19} color="#EF4444" />
            </View>
            <Text style={styles.actionBtnText}>Withdraw</Text>
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={[styles.actionRow, makeAnim(2)]}>
          <TouchableOpacity
            style={[styles.actionBtn, shadows.sm]}
            onPress={loadRateHistory}
          >
            <View
              style={[
                styles.actIconChip,
                { backgroundColor: "rgba(91,156,255,0.14)" },
              ]}
            >
              <Ionicons name="stats-chart" size={18} color={colors.primary} />
            </View>
            <Text style={styles.actionBtnText}>Rate History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, shadows.sm]}
            onPress={() => setModal("dailyFloat")}
          >
            <View
              style={[
                styles.actIconChip,
                { backgroundColor: "rgba(91,156,255,0.14)" },
              ]}
            >
              <Ionicons name="sunny" size={18} color={colors.primary} />
            </View>
            <Text style={styles.actionBtnText}>Day Open/Close</Text>
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={[styles.actionRow, makeAnim(2)]}>
          <TouchableOpacity
            style={[styles.actionBtn, shadows.sm]}
            onPress={() => {
              setModal("settleProfit");
              loadFloatAccounts();
            }}
          >
            <View
              style={[
                styles.actIconChip,
                { backgroundColor: "rgba(233,185,73,0.18)" },
              ]}
            >
              <Ionicons name="cash" size={18} color="#F6D77E" />
            </View>
            <Text style={styles.actionBtnText}>Settle Profit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, shadows.sm]}
            onPress={async () => {
              const now = new Date();
              const from = new Date(
                now.getFullYear(),
                now.getMonth(),
                1,
              ).toISOString();
              const to = now.toISOString();
              const res = await api.getFloatHistory(from, to);
              if (res.success) setFloatHistory(res.data || []);
              setShowHistory(true);
            }}
          >
            <View
              style={[
                styles.actIconChip,
                { backgroundColor: "rgba(91,156,255,0.14)" },
              ]}
            >
              <Ionicons name="time" size={18} color={colors.primary} />
            </View>
            <Text style={styles.actionBtnText}>Float History</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Profit */}
        {float && (
          <Animated.View style={makeAnim(3)}>
            <View style={[styles.profitCard, shadows.sm]}>
              <Text style={styles.profitTitle}>Unrealised Profit</Text>
              <View style={styles.profitRow}>
                <View>
                  <Text style={styles.profitLabel}>{baseCode}</Text>
                  <Text
                    style={[styles.profitValue, { color: "#10B981" }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {formatCurrency(float.kesProfit, base)}
                  </Text>
                </View>
                <View>
                  <Text style={styles.profitLabel}>USD</Text>
                  <Text
                    style={[styles.profitValue, { color: "#3B82F6" }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {formatCurrency(float.usdProfit, Currency.USD)}
                  </Text>
                </View>
              </View>
              {(float.kesProfit > 0 || float.usdProfit > 0) && (
                <TouchableOpacity
                  style={styles.settleProfitBtn}
                  onPress={() => {
                    setModal("settleProfit");
                    loadFloatAccounts();
                  }}
                >
                  <Ionicons name="wallet-outline" size={16} color="#FFF" />
                  <Text style={styles.settleProfitText}>
                    Settle Profit to Cash
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}

        {/* Today's Summary Card */}
        <TodaySummary vm={vm} />

        {/* Transactions */}
        <Animated.View style={makeAnim(4)}>
          <SectionHeader title="Recent Exchanges" />
        </Animated.View>
        {txns.length === 0 ? (
          <EmptyState icon="swap-horizontal-outline" title="No exchanges yet" />
        ) : (
          txns.map((t, i) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.txnCard, shadows.sm]}
              activeOpacity={0.7}
              onPress={() => setDetailTxn(t)}
              onLongPress={() =>
                t.status !== "Voided" && handleVoidExchange(t.id, t.code)
              }
            >
              <View
                style={[
                  styles.txnIcon,
                  {
                    backgroundColor: t.direction === 0 ? "rgba(91,156,255,0.12)" : "rgba(246,180,94,0.12)",
                  },
                ]}
              >
                <Ionicons
                  name={t.direction === 0 ? "arrow-down" : "arrow-up"}
                  size={16}
                  color={t.direction === 0 ? "#2563EB" : "#D97706"}
                />
              </View>
              <View style={styles.txnText}>
                <Text style={styles.txnDesc}>
                  {t.clientName || "Walk-in"}
                  {t.status === "Voided" ? " [VOIDED]" : ""}
                </Text>
                <Text style={styles.txnMeta}>
                  {currencyCode(t.currencyGiven)}→{currencyCode(t.currencyReceived)} @ {fmtRate(t.exchangeRate)}{" "}
                  · {formatDateTime(t.date)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={[
                    styles.txnAmount,
                    t.status === "Voided" && {
                      textDecorationLine: "line-through",
                      color: colors.textTertiary,
                    },
                  ]}
                >
                  {formatCurrency(t.amountGiven, t.currencyGiven)}
                </Text>
                <Text style={[styles.txnProfit, { color: t.profit > 0 ? "#10B981" : t.profit < 0 ? "#FF6B81" : colors.textTertiary }]}>
                  {t.profit ? `${t.profit > 0 ? "+" : "-"}${formatCurrency(Math.abs(t.profit), base)}` : "—"}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Exchange Detail Modal */}
      <ExchangeDetailsSheet vm={vm} />

      {/* Set Rate Modal */}
      <SetRateSheet vm={vm} />

      {/* New Exchange Modal */}
      <NewExchangeSheet vm={vm} />

      {/* Fund/Withdraw Float Modal */}
      <FloatFundingSheet vm={vm} />

      {/* Settle Profit Modal */}
      <SettleProfitSheet vm={vm} />

      {/* Rate History Modal */}
      <RateHistorySheet vm={vm} />

      {/* Daily Float Modal */}
      <DailyFloatSheet vm={vm} />
      {/* Float History Modal */}
      <HistoryModal vm={vm} />

      {/* PIN Modal — Beautiful 4-box design */}
      <PinModal vm={vm} />
    </View>
  );
}
