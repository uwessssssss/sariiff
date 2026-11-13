import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Animated,
  TouchableOpacity,
  Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../hooks/useAuth";
import * as api from "../../services/api";
import { cacheGet, cacheHydrate, cacheSet } from "../../utils/cache";
import {
  ClientDashboardDto,
  ClientTransactionDto,
  formatCurrency,
  Currency,
  formatDateTime,
  currencyCode,
  balanceRowsFrom,
} from "../../types";
import { SectionHeader, LoadingScreen, InfoRow, SummaryCard, SummaryGrid, HeroCard } from "../../components/ui";
import {
  colors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  shadows,
} from "../../theme";

export default function ClientDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const _cd: any = cacheGet("client_dashboard");
  const [dashboard, setDashboard] = useState<ClientDashboardDto | null>(
    _cd || null,
  );
  const [loading, setLoading] = useState(!_cd);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<ClientTransactionDto | null>(
    null,
  );
  const anims = useRef(
    Array(8)
      .fill(null)
      .map(() => new Animated.Value(0)),
  ).current;

  const load = useCallback(async () => {
    try {
      const res = await api.getClientDashboard();
      if (res.success) {
        setDashboard(res.data);
        cacheSet("client_dashboard", res.data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const cached: any = await cacheHydrate("client_dashboard");
      if (cached) {
        setDashboard(cached);
        setLoading(false);
      }
      await load();
      setLoading(false);
      anims.forEach((a, i) =>
        Animated.spring(a, {
          toValue: 1,
          tension: 60,
          friction: 9,
          useNativeDriver: true,
          delay: i * 70,
        }).start(),
      );
    })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
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

  if (loading) return <LoadingScreen message="Loading your account..." />;
  const d = dashboard;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <LinearGradient colors={["#0F172A", "#1E293B"]} style={styles.header}>
        <View>
          <Text style={styles.greeting}>Account Overview</Text>
          <Text style={styles.userName}>
            Welcome, {user?.fullName || "Client"}
          </Text>
        </View>
        <Text style={styles.companyBadge} numberOfLines={1}>
          {(d?.profile as any)?.companyName || "Sarif"}
        </Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ====== BALANCES (Nov 2026 redesign) ======
            The currency the client actually uses leads (UGX for a Ugandan client). Before,
            KES and USD always had the big cards and UGX was a small chip in dark text that
            was unreadable on the dark background. */}
        {(() => {
          const rows = balanceRowsFrom(d?.profile)
            .slice()
            .sort((a, b) => (Math.abs(b.totalIn) + Math.abs(b.totalOut) + Math.abs(b.balance)) - (Math.abs(a.totalIn) + Math.abs(a.totalOut) + Math.abs(a.balance)));
          if (!rows.length)
            return (
              <View style={styles.emptyBalances}>
                <Ionicons name="wallet-outline" size={28} color={colors.textSecondary} />
                <Text style={styles.emptyBalancesText}>No balances yet. Your account activity will appear here.</Text>
              </View>
            );
          const [main, ...rest] = rows;
          const owes = main.balance < 0;
          return (
            <>
              <Animated.View style={[{ marginBottom: 12 }, makeAnim(0)]}>
                <HeroCard
                  eyebrow={`Your balance · ${main.code}`}
                  badge={main.code}
                  value={formatCurrency(main.balance, main.currency)}
                  valueColor={owes ? colors.danger : undefined}
                  caption={owes ? "You owe the bureau this amount" : "Held for you by the bureau"}
                  stats={[
                    { label: "Money in", value: formatCurrency(main.totalIn, main.currency), tone: "in" },
                    { label: "Money out", value: formatCurrency(main.totalOut, main.currency), tone: "out" },
                  ]}
                />
              </Animated.View>
              {rest.length > 0 && (
                <Animated.View style={[{ marginBottom: 12 }, makeAnim(1)]}>
                  <SummaryGrid>
                    {rest.map((r) => (
                      <SummaryCard
                        key={r.currency}
                        tone={r.balance < 0 ? "out" : "accent"}
                        icon={r.currency === Currency.USD ? "logo-usd" : "cash-outline"}
                        label={`Balance · ${r.code}`}
                        value={formatCurrency(r.balance, r.currency)}
                        valueColor={r.balance < 0 ? colors.danger : undefined}
                        caption={`In ${formatCurrency(r.totalIn, r.currency)} · Out ${formatCurrency(r.totalOut, r.currency)}`}
                      />
                    ))}
                  </SummaryGrid>
                </Animated.View>
              )}
            </>
          );
        })()}

        {/* ====== QUICK STATS BAR ====== */}
        <Animated.View style={[styles.statsBar, makeAnim(2)]}>
          {[
            {
              icon: "swap-horizontal" as const,
              label: "Transactions",
              value: String(d?.quickStats?.transactionCount || 0),
              color: colors.primary,
            },
            {
              icon: "notifications" as const,
              label: "Unread",
              value: String(d?.quickStats?.unreadAlerts || 0),
              color: d?.quickStats?.unreadAlerts ? colors.danger : colors.textSecondary,
            },
            {
              icon: "calendar" as const,
              label: "In this month",
              value: (() => {
                const q: any = d?.quickStats || {};
                const month = [
                  { c: Currency.KES, v: q.thisMonthInKES || 0 },
                  { c: Currency.USD, v: q.thisMonthInUSD || 0 },
                  ...((q.thisMonthOtherCurrencies || []) as any[]).map((o) => ({ c: o.currency, v: o.income || 0 })),
                ].filter((m) => m.v);
                return month.length === 0
                  ? formatCurrency(0)
                  : month.map((m) => formatCurrency(m.v, m.c)).join("\n");
              })(),
              color: colors.success,
            },
          ].map((stat, i) => (
            <View key={i} style={styles.statItem}>
              <Ionicons name={stat.icon} size={16} color={stat.color} />
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </Animated.View>

        {/* ====== QUICK ACTIONS — matches web action cards ====== */}
        <Animated.View style={makeAnim(3)}>
          <SectionHeader title="Quick Actions" />
        </Animated.View>
        <Animated.View style={[styles.actionsGrid, makeAnim(3)]}>
          {[
            {
              icon: "document-text-outline" as const,
              label: "Statements",
              sub: "View full history",
              tab: "Statements",
            },
            {
              icon: "bar-chart-outline" as const,
              label: "Analytics",
              sub: "Detailed insights",
              tab: "Analytics",
            },
            {
              icon: "notifications-outline" as const,
              label: "Alerts",
              sub: "View notifications",
              tab: "Alerts",
              badge: d?.quickStats?.unreadAlerts || 0,
            },
            {
              icon: "person-outline" as const,
              label: "Profile",
              sub: "Account settings",
              tab: "Profile",
            },
          ].map((action, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.actionCard, shadows.sm]}
              onPress={() => navigation.navigate(action.tab)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${action.label}: ${action.sub}`}
            >
              {/* one accent for every shortcut (was a different gradient per card) */}
              <View style={styles.actionIcon}>
                <Ionicons name={action.icon} size={20} color={colors.primary} />
              </View>
              {(action as any).badge > 0 && (
                <View style={styles.actionBadge}>
                  <Text style={styles.actionBadgeText}>
                    {(action as any).badge > 99 ? "99+" : (action as any).badge}
                  </Text>
                </View>
              )}
              <Text style={styles.actionLabel}>{action.label}</Text>
              <Text style={styles.actionSub}>{action.sub}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>

        {/* ====== RECENT TRANSACTIONS ====== */}
        <Animated.View style={makeAnim(4)}>
          <SectionHeader
            title="Recent Activity"
            action="View All"
            onAction={() => navigation.navigate("Statements")}
          />
        </Animated.View>

        {(d?.recentTransactions || []).slice(0, 6).map((txn, i) => (
          <Animated.View
            key={txn.id || i}
            style={[styles.txnCard, shadows.sm, makeAnim(Math.min(5 + i, 7))]}
          >
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
              activeOpacity={0.7}
              onPress={() => setSelectedTxn(txn)}
            >
              <View
                style={[
                  styles.txnIcon,
                  {
                    backgroundColor:
                      txn.type === "Credit" ? "rgba(57,217,176,0.12)" : "rgba(255,107,129,0.12)",
                  },
                ]}
              >
                <Ionicons
                  name={txn.type === "Credit" ? "arrow-down" : "arrow-up"}
                  size={16}
                  color={txn.type === "Credit" ? "#16A34A" : "#DC2626"}
                />
              </View>
              <View style={styles.txnText}>
                <Text style={styles.txnDesc} numberOfLines={1}>
                  {txn.description}
                </Text>
                <Text style={styles.txnDate}>
                  <Text
                    style={{
                      color: txn.currency === 1 ? "#3B82F6" : "#10B981",
                      fontWeight: "700" as any,
                    }}
                  >
                    {currencyCode(txn.currency)}
                  </Text>
                  {" · "}
                  {formatDateTime(txn.date)}
                </Text>
              </View>
              <View style={styles.txnRight}>
                <Text
                  style={[
                    styles.txnAmount,
                    { color: txn.type === "Credit" ? "#39D9B0" : "#FF6B81" },
                  ]}
                >
                  {txn.type === "Credit" ? "+" : "-"}
                  {formatCurrency(
                    txn.amount,
                    txn.currency ?? Currency.KES,
                  )}
                </Text>
                <Text style={styles.txnBalance}>
                  Bal:{" "}
                  {formatCurrency(
                    txn.balanceAfter,
                    txn.currency ?? Currency.KES,
                  )}
                </Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        ))}

        {/* Transaction Detail Modal */}
        {selectedTxn && (
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
                }}
              >
                {/* Hero Amount */}
                <LinearGradient
                  colors={
                    selectedTxn.type === "Credit"
                      ? ["#047857", "#059669"]
                      : ["#B91C1C", "#DC2626"]
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
                    {formatCurrency(
                      selectedTxn.amount,
                      selectedTxn.currency ?? Currency.KES,
                    )}
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
                <View style={{ padding: 20 }}>
                  <InfoRow
                    label="Description"
                    value={selectedTxn.description}
                  />
                  <InfoRow
                    label="Date"
                    value={formatDateTime(selectedTxn.date)}
                  />
                  <InfoRow
                    label="Balance Before"
                    value={formatCurrency(
                      selectedTxn.balanceBefore ?? 0,
                      selectedTxn.currency ?? Currency.KES,
                    )}
                  />
                  <InfoRow
                    label="Balance After"
                    value={formatCurrency(
                      selectedTxn.balanceAfter ?? 0,
                      selectedTxn.currency ?? Currency.KES,
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
                    <InfoRow label="Notes" value={selectedTxn.notes} />
                  ) : null}
                  <TouchableOpacity
                    onPress={() => setSelectedTxn(null)}
                    style={{
                      marginTop: 16,
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
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    fontWeight: fontWeight.medium,
  },
  userName: {
    fontSize: fontSize.xl,
    color: "#F1F5F9",
    fontWeight: fontWeight.extrabold,
    marginTop: 2,
  },
  companyBadge: {
    maxWidth: "42%",
    backgroundColor: "rgba(59,130,246,0.2)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.3)",
    color: "#93C5FD",
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    overflow: "hidden",
  },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },

  cardRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  emptyBalances: { marginBottom: 12, padding: 20, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  emptyBalancesText: { marginTop: 8, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: "center" },
  halfCard: { flex: 1 },
  balanceCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    overflow: "hidden",
    minHeight: 115,
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
    color: "#FFF",
    marginBottom: 2,
  },
  cardSub: {
    fontSize: fontSize.xs,
    color: "rgba(255,255,255,0.65)",
    fontWeight: fontWeight.medium,
  },

  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionCard: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(91,156,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  actionBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBadgeText: {
    color: "#FFF",
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  actionLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: 2,
  },
  actionSub: { fontSize: fontSize.xs, color: colors.textSecondary },

  txnCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  txnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  txnText: { flex: 1 },
  txnDesc: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  txnDate: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  txnRight: { alignItems: "flex-end" },
  txnAmount: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  txnBalance: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Quick Stats Bar
  statsBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    color: colors.text,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textTertiary,
    fontWeight: fontWeight.medium,
  },

  // Detail Modal
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  detailLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  detailValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    maxWidth: "60%",
    textAlign: "right",
  },
});
