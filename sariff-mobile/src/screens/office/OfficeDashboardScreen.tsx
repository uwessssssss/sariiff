import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Animated,
  TouchableOpacity,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../hooks/useAuth";
import * as api from "../../services/api";
import { cacheGet, cacheHydrate, cacheSet } from "../../utils/cache";
import {
  DashboardStatsDto,
  TransactionDto,
  formatCurrency,
  Currency,
  TransactionType,
  formatDateTime,
  CURRENCY_COLOR,
  CURRENCY_INFO,
  currencyCode, currencyPlural } from "../../types";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import {
  SectionHeader,
  LoadingScreen,
  TransactionRow,
  CountUp,
} from "../../components/ui";
import {
  colors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  shadows,
  fonts,
} from "../../theme";
import { localDate } from '../../utils/dates';

export default function OfficeDashboardScreen() {
  // Home currency (KES in Kenya, UGX in Uganda) leads the dashboard. Mobile money wallets
  // hold their network's currency; the card shows home wallets and lists the others.
  const { base, baseCode } = useBaseCurrency();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();

  const _cached: any = cacheGet("office_dashboard");
  const [stats, setStats] = useState<DashboardStatsDto | null>(
    _cached?.stats || null,
  );
  const [transactions, setTransactions] = useState<TransactionDto[]>(
    _cached?.transactions || [],
  );
  const [refreshing, setRefreshing] = useState(false);
  // Currencies this company actually uses — hides KES/USD flow blocks that
  // would otherwise sit empty for a bureau not using that currency.
  const [activeCurrencies, setActiveCurrencies] = useState<number[]>([0, 1]);
  const showKES = activeCurrencies.includes(0);
  const showUSD = activeCurrencies.includes(1);
  const [loading, setLoading] = useState(!_cached);

  const anims = useRef(
    Array(10)
      .fill(null)
      .map(() => new Animated.Value(0)),
  ).current;

  const loadData = useCallback(async () => {
    try {
      // Load the company's actually-used currencies (non-blocking on failure).
      api
        .getCompanyCurrencies()
        .then((res) => {
          if (res.success && res.data?.currencies?.length) {
            setActiveCurrencies(res.data.currencies.map((c: any) => c.value));
          }
        })
        .catch(() => {});

      const statsRes = await api.getDashboardStats();
      if (statsRes.success) {
        setStats(statsRes.data);
        if (statsRes.data?.recentTransactions) {
          // Filter to today's transactions only
          const today = localDate();
          const todayTxns = statsRes.data.recentTransactions.filter(
            (t: any) => {
              const txnDate = (t.transactionDate || t.createdAt || "").split(
                "T",
              )[0];
              return txnDate === today;
            },
          );
          const finalTxns =
            todayTxns.length > 0
              ? todayTxns
              : statsRes.data.recentTransactions.slice(0, 5);
          setTransactions(finalTxns);
          cacheSet("office_dashboard", {
            stats: statsRes.data,
            transactions: finalTxns,
          });
        } else {
          cacheSet("office_dashboard", { stats: statsRes.data, transactions });
        }
      }
    } catch {}
  }, []);

  const animateIn = () => {
    anims.forEach((a, i) => {
      Animated.spring(a, {
        toValue: 1,
        tension: 60,
        friction: 9,
        useNativeDriver: true,
        delay: i * 70,
      }).start();
    });
  };

  useEffect(() => {
    (async () => {
      const cached: any = await cacheHydrate("office_dashboard");
      if (cached) {
        if (cached.stats) setStats(cached.stats);
        if (cached.transactions) setTransactions(cached.transactions);
        setLoading(false);
      }
      await loadData();
      setLoading(false);
      animateIn();
    })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const makeAnim = (i: number) => ({
    opacity: anims[i],
    transform: [
      {
        translateY: anims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [30, 0],
        }),
      },
    ],
  });

  if (loading) return <LoadingScreen message="Loading dashboard..." />;
  const s = stats;

  const homeRow = (s?.byCurrency || []).find((h) => h.currency === base);
  const homeCash = homeRow ? homeRow.cash : base === Currency.KES ? s?.cashKES || 0 : 0;
  const homeBank = homeRow ? homeRow.bank : base === Currency.KES ? s?.totalBankKES || 0 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Dark Header — matches web sidebar aesthetic */}
      <LinearGradient colors={["#0F172A", "#1E293B"]} style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>
              {user?.companyName || user?.fullName || "Office"}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Profile"
              style={styles.headerBtn}
              onPress={() => navigation.navigate("Profile")}
            >
              <Ionicons name="person-outline" size={18} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Log out"
              style={[
                styles.headerBtn,
                { backgroundColor: "rgba(239,68,68,0.2)" },
              ]}
              onPress={logout}
            >
              <Ionicons name="log-out-outline" size={18} color="#FCA5A5" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ====== BALANCE CARDS — exact web gradient matches ====== */}
        <Animated.View style={[styles.cardRow, makeAnim(0)]}>
          {/* Cash KES — emerald→teal */}
          <View style={[styles.halfCard, shadows.xl]}>
            <LinearGradient
              colors={["#10B981", "#0D9488"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.balanceCard}
            >
              <View style={styles.decorCircle1} />
              <View style={styles.decorCircle2} />
              <View style={styles.cardInner}>
                <View style={styles.cardHeader}>
                  <View style={styles.glassIcon}>
                    <Ionicons name="wallet-outline" size={18} color="#FFF" />
                  </View>
                  <Text style={styles.cardLabel}>CASH — {baseCode}</Text>
                </View>
                <CountUp
                  value={homeCash}
                  format={(n) => formatCurrency(n, base)}
                  style={styles.cardValue}
                />
                <Text style={styles.cardSub}>{currencyPlural(base)}</Text>
              </View>
            </LinearGradient>
          </View>
          {/* Cash USD — blue→indigo */}
          <View style={[styles.halfCard, shadows.xl]}>
            <LinearGradient
              colors={["#3B82F6", "#4F46E5"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.balanceCard}
            >
              <View style={styles.decorCircle1} />
              <View style={styles.decorCircle2} />
              <View style={styles.cardInner}>
                <View style={styles.cardHeader}>
                  <View style={styles.glassIcon}>
                    <Ionicons name="logo-usd" size={18} color="#FFF" />
                  </View>
                  <Text style={styles.cardLabel}>CASH — USD</Text>
                </View>
                <CountUp
                  value={s?.cashUSD || 0}
                  format={(n) => formatCurrency(n, Currency.USD)}
                  style={styles.cardValue}
                />
                <Text style={styles.cardSub}>US Dollars</Text>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        <Animated.View style={[styles.cardRow, makeAnim(1)]}>
          {/* M-Pesa — green→emerald */}
          <View style={[styles.halfCard, shadows.xl]}>
            <LinearGradient
              colors={["#16A34A", "#059669"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.balanceCard}
            >
              <View style={styles.decorCircle1} />
              <View style={styles.decorCircle2} />
              <View style={styles.cardInner}>
                <View style={styles.cardHeader}>
                  <View style={styles.glassIcon}>
                    <Ionicons
                      name="phone-portrait-outline"
                      size={18}
                      color="#FFF"
                    />
                  </View>
                  <Text style={styles.cardLabel}>MOBILE MONEY</Text>
                </View>
                <CountUp
                  value={s?.totalMpesa || 0}
                  format={(n) => formatCurrency(n, base)}
                  style={styles.cardValue}
                />
                <Text style={styles.cardSub}>
                  {(s?.mobileMoneyByCurrency || []).filter((w) => w.currency !== base && w.amount).length
                    ? `${baseCode} wallets · also ${(s?.mobileMoneyByCurrency || [])
                        .filter((w) => w.currency !== base && w.amount)
                        .map((w) => formatCurrency(w.amount, w.currency)).join(', ')}`
                    : `All agents (${baseCode})`}
                </Text>
              </View>
            </LinearGradient>
          </View>
          {/* Exchange — purple→pink */}
          <View style={[styles.halfCard, shadows.xl]}>
            <LinearGradient
              colors={["#8B5CF6", "#EC4899"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.balanceCard}
            >
              <View style={styles.decorCircle1} />
              <View style={styles.decorCircle2} />
              <View style={styles.cardInner}>
                <View style={styles.cardHeader}>
                  <View style={styles.glassIcon}>
                    <Ionicons name="swap-horizontal" size={18} color="#FFF" />
                  </View>
                  <Text style={styles.cardLabel}>EXCHANGE</Text>
                </View>
                <Text style={styles.cardValue}>
                  {s?.currentExchangeRate
                    ? s.currentExchangeRate.buyRate.toFixed(2)
                    : "—"}
                </Text>
                <Text style={styles.cardSub}>Buy rate (USD→{baseCode})</Text>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        {/* ====== BANK ACCOUNTS — white card with gradient icon (web style) ====== */}
        <Animated.View style={[styles.cardRow, makeAnim(2)]}>
          <View style={[styles.halfCard]}>
            <View style={[styles.bankCard, shadows.md]}>
              <LinearGradient
                colors={["#06B6D4", "#2563EB"]}
                style={styles.bankIcon}
              >
                <Ionicons name="business" size={18} color="#FFF" />
              </LinearGradient>
              <Text style={styles.bankLabel}>Banks — {baseCode}</Text>
              <CountUp
                value={homeBank}
                format={(n) => formatCurrency(n, base)}
                style={[styles.bankValue, { color: "#06B6D4" }]}
              />
            </View>
          </View>
          <View style={[styles.halfCard]}>
            <View style={[styles.bankCard, shadows.md]}>
              <LinearGradient
                colors={["#6366F1", "#8B5CF6"]}
                style={styles.bankIcon}
              >
                <Ionicons name="business" size={18} color="#FFF" />
              </LinearGradient>
              <Text style={styles.bankLabel}>Banks — USD</Text>
              <CountUp
                value={s?.totalBankUSD || 0}
                format={(n) => formatCurrency(n, Currency.USD)}
                style={[styles.bankValue, { color: "#6366F1" }]}
              />
            </View>
          </View>
        </Animated.View>

        {/* Other currencies (beyond home + USD) — only those the office holds */}
        {(s?.byCurrency || [])
          .filter((h) => h.currency !== base && h.currency !== Currency.USD && (h.cash || h.bank))
          .map((h) => (
            <Animated.View key={h.currency} style={[styles.cardRow, makeAnim(2)]}>
              <View style={[styles.halfCard]}>
                <View style={[styles.bankCard, shadows.md]}>
                  <Text style={styles.bankLabel}>Cash — {currencyCode(h.currency)}</Text>
                  <Text style={[styles.bankValue, { color: CURRENCY_COLOR[h.currency] || "#475569" }]}>
                    {formatCurrency(h.cash, h.currency)}
                  </Text>
                </View>
              </View>
              <View style={[styles.halfCard]}>
                <View style={[styles.bankCard, shadows.md]}>
                  <Text style={styles.bankLabel}>Banks — {currencyCode(h.currency)}</Text>
                  <Text style={[styles.bankValue, { color: CURRENCY_COLOR[h.currency] || "#475569" }]}>
                    {formatCurrency(h.bank, h.currency)}
                  </Text>
                </View>
              </View>
            </Animated.View>
          ))}

        {/* ====== TODAY'S TRANSACTIONS — daily activity section (matches web) ====== */}
        <Animated.View style={makeAnim(3)}>
          <View style={[styles.dailySection, shadows.md]}>
            <View style={styles.dailyHeader}>
              <Ionicons name="calendar" size={20} color={colors.primary} />
              <Text style={styles.dailyTitle}>Today's Transactions</Text>
            </View>
            <Text style={styles.dailyDate}>
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </Text>

            {/* KES Flow */}
            {showKES && (
            <>
            <Text style={styles.currencyTag}>
              <View style={[styles.tagDot, { backgroundColor: "#10B981" }]} />{" "}
              Kenyan Shillings
            </Text>
            <View style={styles.flowRow}>
              <View
                style={[
                  styles.flowCard,
                  { backgroundColor: "rgba(57,217,176,0.12)", borderColor: "rgba(57,217,176,0.32)" },
                ]}
              >
                <View style={styles.flowCardHead}>
                  <Ionicons
                    name="arrow-down-circle"
                    size={16}
                    color="#059669"
                  />
                  <Text style={[styles.flowLabel, { color: "#39D9B0" }]}>
                    MONEY IN
                  </Text>
                </View>
                <Text style={[styles.flowValue, { color: "#39D9B0" }]}>
                  {formatCurrency(s?.todayTransactions?.totalDebitKES || 0)}
                </Text>
              </View>
              <View
                style={[
                  styles.flowCard,
                  { backgroundColor: "rgba(255,107,129,0.12)", borderColor: "rgba(255,107,129,0.32)" },
                ]}
              >
                <View style={styles.flowCardHead}>
                  <Ionicons name="arrow-up-circle" size={16} color="#DC2626" />
                  <Text style={[styles.flowLabel, { color: "#FF6B81" }]}>
                    MONEY OUT
                  </Text>
                </View>
                <Text style={[styles.flowValue, { color: "#FF6B81" }]}>
                  {formatCurrency(s?.todayTransactions?.totalCreditKES || 0)}
                </Text>
              </View>
            </View>
            {/* KES Net */}
            {(() => {
              const net =
                (s?.todayTransactions?.totalDebitKES || 0) -
                (s?.todayTransactions?.totalCreditKES || 0);
              return (
                <View
                  style={[
                    styles.netRow,
                    net >= 0
                      ? { backgroundColor: "rgba(57,217,176,0.12)", borderColor: "rgba(57,217,176,0.32)" }
                      : { backgroundColor: "rgba(255,107,129,0.12)", borderColor: "rgba(255,107,129,0.32)" },
                  ]}
                >
                  <Text style={styles.netLabel}>Net Flow (KES)</Text>
                  <Text
                    style={[
                      styles.netValue,
                      { color: net >= 0 ? "#39D9B0" : "#FF6B81" },
                    ]}
                  >
                    {net >= 0 ? "+" : ""}
                    {formatCurrency(net)}
                  </Text>
                </View>
              );
            })()}
            </>
            )}

            {/* USD Flow */}
            {showUSD && (
            <>
            <Text style={[styles.currencyTag, { marginTop: spacing.lg }]}>
              <View style={[styles.tagDot, { backgroundColor: "#3B82F6" }]} />{" "}
              US Dollars
            </Text>
            <View style={styles.flowRow}>
              <View
                style={[
                  styles.flowCard,
                  { backgroundColor: "rgba(91,156,255,0.12)", borderColor: "rgba(91,156,255,0.32)" },
                ]}
              >
                <View style={styles.flowCardHead}>
                  <Ionicons
                    name="arrow-down-circle"
                    size={16}
                    color="#2563EB"
                  />
                  <Text style={[styles.flowLabel, { color: "#7FB3FF" }]}>
                    MONEY IN
                  </Text>
                </View>
                <Text style={[styles.flowValue, { color: "#7FB3FF" }]}>
                  {formatCurrency(
                    s?.todayTransactions?.totalDebitUSD || 0,
                    Currency.USD,
                  )}
                </Text>
              </View>
              <View
                style={[
                  styles.flowCard,
                  { backgroundColor: "rgba(246,180,94,0.12)", borderColor: "rgba(246,180,94,0.32)" },
                ]}
              >
                <View style={styles.flowCardHead}>
                  <Ionicons name="arrow-up-circle" size={16} color="#EA580C" />
                  <Text style={[styles.flowLabel, { color: "#F6B45E" }]}>
                    MONEY OUT
                  </Text>
                </View>
                <Text style={[styles.flowValue, { color: "#F6B45E" }]}>
                  {formatCurrency(
                    s?.todayTransactions?.totalCreditUSD || 0,
                    Currency.USD,
                  )}
                </Text>
              </View>
            </View>
            {/* USD Net */}
            {(() => {
              const net =
                (s?.todayTransactions?.totalDebitUSD || 0) -
                (s?.todayTransactions?.totalCreditUSD || 0);
              return (
                <View
                  style={[
                    styles.netRow,
                    net >= 0
                      ? { backgroundColor: "rgba(91,156,255,0.12)", borderColor: "rgba(91,156,255,0.32)" }
                      : { backgroundColor: "rgba(246,180,94,0.12)", borderColor: "rgba(246,180,94,0.32)" },
                  ]}
                >
                  <Text style={styles.netLabel}>Net Flow (USD)</Text>
                  <Text
                    style={[
                      styles.netValue,
                      { color: net >= 0 ? "#7FB3FF" : "#F6B45E" },
                    ]}
                  >
                    {net >= 0 ? "+" : ""}
                    {formatCurrency(net, Currency.USD)}
                  </Text>
                </View>
              );
            })()}
            </>
            )}

            {/* UGX / EUR / ... flows — any other currency with activity today */}
            {(s?.todayTransactions?.byCurrency || [])
              .filter((f) => f.currency > 1 && (f.totalDebit || f.totalCredit))
              .map((f) => (
                <View key={f.currency}>
                  <Text style={[styles.currencyTag, { marginTop: spacing.lg }]}>
                    <View style={[styles.tagDot, { backgroundColor: CURRENCY_COLOR[f.currency] || "#475569" }]} />{" "}
                    {CURRENCY_INFO[f.currency]?.label || currencyCode(f.currency)}
                  </Text>
                  <View style={styles.flowRow}>
                    <View style={[styles.flowCard, { backgroundColor: "rgba(57,217,176,0.12)", borderColor: "rgba(57,217,176,0.32)" }]}>
                      <View style={styles.flowCardHead}>
                        <Ionicons name="arrow-down-circle" size={16} color="#059669" />
                        <Text style={[styles.flowLabel, { color: "#39D9B0" }]}>MONEY IN</Text>
                      </View>
                      <Text style={[styles.flowValue, { color: "#39D9B0" }]}>{formatCurrency(f.totalDebit, f.currency)}</Text>
                    </View>
                    <View style={[styles.flowCard, { backgroundColor: "rgba(255,107,129,0.12)", borderColor: "rgba(255,107,129,0.32)" }]}>
                      <View style={styles.flowCardHead}>
                        <Ionicons name="arrow-up-circle" size={16} color="#DC2626" />
                        <Text style={[styles.flowLabel, { color: "#FF6B81" }]}>MONEY OUT</Text>
                      </View>
                      <Text style={[styles.flowValue, { color: "#FF6B81" }]}>{formatCurrency(f.totalCredit, f.currency)}</Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.netRow,
                      f.netFlow >= 0
                        ? { backgroundColor: "rgba(57,217,176,0.12)", borderColor: "rgba(57,217,176,0.32)" }
                        : { backgroundColor: "rgba(255,107,129,0.12)", borderColor: "rgba(255,107,129,0.32)" },
                    ]}
                  >
                    <Text style={styles.netLabel}>Net Flow ({currencyCode(f.currency)})</Text>
                    <Text style={[styles.netValue, { color: f.netFlow >= 0 ? "#39D9B0" : "#FF6B81" }]}>
                      {f.netFlow >= 0 ? "+" : ""}
                      {formatCurrency(f.netFlow, f.currency)}
                    </Text>
                  </View>
                </View>
              ))}
          </View>
        </Animated.View>

        {/* ====== QUICK STATS ROW ====== */}
        <Animated.View style={makeAnim(4)}>
          <View style={[styles.quickStatsRow, shadows.sm]}>
            <View style={styles.quickStat}>
              <Text style={styles.quickStatValue}>
                {s?.currentExchangeRate
                  ? s.currentExchangeRate.sellRate.toFixed(1)
                  : "—"}
              </Text>
              <Text style={styles.quickStatLabel}>Sell Rate</Text>
            </View>
            <View style={[styles.quickStatDivider]} />
            <View style={styles.quickStat}>
              <Text style={styles.quickStatValue}>
                {s?.todayTransactions?.totalCount || 0}
              </Text>
              <Text style={styles.quickStatLabel}>Today Txns</Text>
            </View>
            <View style={[styles.quickStatDivider]} />
            <View style={styles.quickStat}>
              <Text style={styles.quickStatValue}>{transactions.length}</Text>
              <Text style={styles.quickStatLabel}>Recent</Text>
            </View>
          </View>
        </Animated.View>

        {/* ====== RECENT TRANSACTIONS ====== */}
        <Animated.View style={makeAnim(5)}>
          <SectionHeader
            title="Recent Transactions"
            action="View All"
            onAction={() => navigation.navigate("Transactions")}
          />
        </Animated.View>

        {transactions.slice(0, 8).map((txn, i) => (
          <Animated.View key={txn.id} style={makeAnim(Math.min(6 + i, 9))}>
            <TransactionRow
              type={
                txn.transactionType === TransactionType.Credit
                  ? "Credit"
                  : "Debit"
              }
              description={txn.description}
              amount={formatCurrency(txn.amount, txn.currency)}
              date={formatDateTime(txn.transactionDate || txn.createdAt)}
              // Green/+ when the SOURCE account gains: a till on Debit, a client on Credit
              // (it was "every Credit is green", so cash paid out showed as money in).
              isCredit={
                txn.sourceAccountType === 3
                  ? txn.transactionType === TransactionType.Credit
                  : txn.transactionType === TransactionType.Debit
              }
            />
          </Animated.View>
        ))}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    fontSize: fontSize.sm,
    color: "#94A3B8",
    fontWeight: fontWeight.medium,
  },
  userName: {
    fontSize: fontSize.xl,
    color: "#F1F5F9",
    fontWeight: fontWeight.extrabold,
    marginTop: 2,
  },
  headerActions: { flexDirection: "row", gap: spacing.sm },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.sm,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },

  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },

  // Balance Cards
  cardRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  halfCard: { flex: 1 },
  balanceCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    overflow: "hidden",
    minHeight: 120,
    justifyContent: "flex-end",
  },
  decorCircle1: {
    position: "absolute",
    top: -20,
    right: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  decorCircle2: {
    position: "absolute",
    bottom: -15,
    left: -15,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  cardInner: { position: "relative" },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  glassIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: "rgba(255,255,255,0.8)",
    letterSpacing: 1.5,
  },
  cardValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    fontFamily: fonts.display,
    color: "#FFF",
    marginBottom: 2,
  },
  cardSub: {
    fontSize: fontSize.xs,
    color: "rgba(255,255,255,0.65)",
    fontWeight: fontWeight.medium,
  },

  // Bank Cards (glass, dark)
  bankCard: {
    backgroundColor: colors.glass,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bankIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  bankLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  bankValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    fontFamily: fonts.display,
  },

  // Daily Activity Section
  dailySection: {
    backgroundColor: colors.glass,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  dailyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 2,
  },
  dailyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  dailyDate: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginBottom: spacing.lg,
  },

  currencyTag: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
  },
  tagDot: { width: 6, height: 6, borderRadius: 3, display: "flex" },

  flowRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  flowCard: {
    flex: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 2,
  },
  flowCardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: spacing.xs,
  },
  flowLabel: { fontSize: 9, fontWeight: fontWeight.bold, letterSpacing: 0.5 },
  flowValue: { fontSize: fontSize.lg, fontWeight: fontWeight.extrabold },

  netRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 2,
  },
  netLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: "#9AA6BE",
  },
  netValue: { fontSize: fontSize.lg, fontWeight: fontWeight.extrabold },

  // Quick Stats
  quickStatsRow: {
    flexDirection: "row",
    backgroundColor: colors.glass,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickStat: { flex: 1, alignItems: "center" },
  quickStatValue: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.extrabold,
    fontFamily: fonts.display,
    color: colors.gold,
  },
  quickStatLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    marginTop: 2,
  },
  quickStatDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
});
