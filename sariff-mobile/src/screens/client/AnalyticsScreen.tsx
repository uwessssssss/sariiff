import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../../services/api';
import { formatCurrency, currencyCode } from '../../types';
import { LoadingScreen, SectionHeader } from '../../components/ui';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const anims = useRef(Array(6).fill(null).map(() => new Animated.Value(0))).current;

  const load = useCallback(async () => {
    try {
    const res = await api.getClientAnalytics();
    if (res.success) setAnalytics(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      await load(); setLoading(false);
      anims.forEach((a, i) => Animated.spring(a, { toValue: 1, tension: 60, friction: 9, useNativeDriver: true, delay: i * 80 }).start());
    })();
  }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  if (loading) return <LoadingScreen message="Loading analytics..." />;

  const data = analytics || {};
  const monthlySummary = data.monthlyData || [];
  const totalIncomeKES = monthlySummary.reduce((s: number, m: any) => s + (m.incomeKES || 0), 0);
  const totalExpensesKES = monthlySummary.reduce((s: number, m: any) => s + (m.expensesKES || 0), 0);
  const totalIncomeUSD = monthlySummary.reduce((s: number, m: any) => s + (m.incomeUSD || 0), 0);
  const totalExpensesUSD = monthlySummary.reduce((s: number, m: any) => s + (m.expensesUSD || 0), 0);
  const netKES = data.totals?.netIncomeKES ?? (totalIncomeKES - totalExpensesKES);

  // Other-currency totals (UGX, EUR, ...) aggregated from the totals breakdown.
  const otherTotals: any[] = data.totals?.otherCurrencies || [];

  // Overview per currency the client used (amounts in different currencies
  // are never added together). The first row is the headline.
  const overview = [
    { c: 0, inc: totalIncomeKES, exp: totalExpensesKES, net: netKES },
    { c: 1, inc: totalIncomeUSD, exp: totalExpensesUSD, net: data.totals?.netIncomeUSD ?? (totalIncomeUSD - totalExpensesUSD) },
    ...otherTotals.map((o: any) => ({ c: o.currency, inc: o.income || 0, exp: o.expenses || 0, net: (o.income || 0) - (o.expenses || 0) })),
  ].filter((r) => r.inc || r.exp);
  const ov = overview.length ? overview : [{ c: 0, inc: 0, exp: 0, net: 0 }];
  // Month lines: KES, USD and other currencies with activity that month
  const monthLines = (m: any) =>
    [
      { c: 0, inc: m.incomeKES || 0, exp: m.expensesKES || 0 },
      { c: 1, inc: m.incomeUSD || 0, exp: m.expensesUSD || 0 },
      ...((m.otherCurrencies || []) as any[]).map((o) => ({ c: o.currency, inc: o.income || 0, exp: o.expenses || 0 })),
    ].filter((l) => l.inc || l.exp);

  // Build the currency breakdown rows usage-driven: KES/USD only if used,
  // plus any other currency the client actually transacted in.
  const breakdownRows: any[] = [];
  if (totalIncomeKES !== 0 || totalExpensesKES !== 0) {
    breakdownRows.push({ label: 'KES Credits', value: formatCurrency(totalIncomeKES), icon: 'add-circle-outline', color: colors.success });
    breakdownRows.push({ label: 'KES Debits', value: formatCurrency(totalExpensesKES), icon: 'remove-circle-outline', color: colors.danger });
  }
  if (totalIncomeUSD !== 0 || totalExpensesUSD !== 0) {
    breakdownRows.push({ label: 'USD Credits', value: formatCurrency(totalIncomeUSD, 1), icon: 'add-circle-outline', color: '#3B82F6' });
    breakdownRows.push({ label: 'USD Debits', value: formatCurrency(totalExpensesUSD, 1), icon: 'remove-circle-outline', color: '#EF4444' });
  }
  otherTotals.forEach((c: any) => {
    breakdownRows.push({ label: `${c.currencyCode} Credits`, value: formatCurrency(c.income || 0, c.currency), icon: 'add-circle-outline', color: '#7C3AED' });
    breakdownRows.push({ label: `${c.currencyCode} Debits`, value: formatCurrency(c.expenses || 0, c.currency), icon: 'remove-circle-outline', color: '#A855F7' });
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Analytics</Text>
        <Text style={styles.subtitle}>Your spending insights</Text>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120 }}>

        {/* Overview Cards */}
        <View style={styles.cardsRow}>
          <Animated.View style={[{ flex: 1 }, { opacity: anims[0], transform: [{ scale: anims[0].interpolate({ inputRange: [0,1], outputRange: [0.8,1] }) }] }]}>
            <LinearGradient colors={colors.gradients.emerald} style={[styles.overviewCard, shadows.lg]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name="arrow-down-circle" size={24} color="rgba(255,255,255,0.8)" />
              <Text style={styles.overviewLabel}>Total Received</Text>
              {ov.map((r, i) => (
                <Text key={r.c} style={i === 0 ? styles.overviewValue : styles.overviewLabel} numberOfLines={1} adjustsFontSizeToFit>
                  {formatCurrency(r.inc, r.c)}
                </Text>
              ))}
            </LinearGradient>
          </Animated.View>
          <Animated.View style={[{ flex: 1 }, { opacity: anims[1], transform: [{ scale: anims[1].interpolate({ inputRange: [0,1], outputRange: [0.8,1] }) }] }]}>
            <LinearGradient colors={colors.gradients.red} style={[styles.overviewCard, shadows.lg]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name="arrow-up-circle" size={24} color="rgba(255,255,255,0.8)" />
              <Text style={styles.overviewLabel}>Total Sent</Text>
              {ov.map((r, i) => (
                <Text key={r.c} style={i === 0 ? styles.overviewValue : styles.overviewLabel} numberOfLines={1} adjustsFontSizeToFit>
                  {formatCurrency(r.exp, r.c)}
                </Text>
              ))}
            </LinearGradient>
          </Animated.View>
        </View>

        {/* Net Flow */}
        <Animated.View style={[{ opacity: anims[2], transform: [{ translateY: anims[2].interpolate({ inputRange: [0,1], outputRange: [20,0] }) }] }]}>
          <LinearGradient colors={colors.gradients.blue} style={[styles.netCard, shadows.md]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <View>
              <Text style={styles.netLabel}>Net Flow</Text>
              {ov.map((r, i) => (
                <Text key={r.c} style={i === 0 ? styles.netValue : styles.netLabel}>
                  {formatCurrency(r.net, r.c)}
                </Text>
              ))}
            </View>
            <Ionicons name="analytics" size={32} color="rgba(255,255,255,0.3)" />
          </LinearGradient>
        </Animated.View>

        {/* Transaction Stats */}
        <SectionHeader title="Transaction Breakdown" />
        <Animated.View style={[styles.statsCard, shadows.sm, { opacity: anims[3] }]}>
          {[
            { label: 'Total Transactions', value: String(data.totals?.totalTransactions || 0), icon: 'layers-outline', color: colors.primary },
            ...breakdownRows,
          ].map((row, i, arr) => (
            <View key={i} style={[styles.statRow, i < arr.length - 1 && styles.statRowBorder]}>
              <View style={styles.statRowLeft}>
                <Ionicons name={row.icon as any} size={18} color={row.color} />
                <Text style={styles.statRowLabel}>{row.label}</Text>
              </View>
              <Text style={[styles.statRowValue, { color: row.color }]}>{row.value}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Monthly Summary */}
        {monthlySummary.length > 0 && (
          <>
            <SectionHeader title="Monthly Summary" />
            {monthlySummary.slice(0, 6).map((month: any, i: number) => (
              <Animated.View key={i} style={[styles.monthCard, shadows.sm, { opacity: anims[Math.min(i + 4, 5)] }]}>
                <View style={styles.monthHeader}>
                  <Text style={styles.monthName}>{month.month}</Text>
                  <Text style={styles.monthCount}>{monthLines(month).length === 0 ? 'No activity' : ''}</Text>
                </View>
                {monthLines(month).map((l) => (
                  <View key={l.c} style={styles.monthValues}>
                    <Text style={styles.monthLabel}>{currencyCode(l.c)} In / Out</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.monthAmount, { color: colors.success }]}>+{formatCurrency(l.inc, l.c)}</Text>
                      <Text style={[styles.monthAmount, { color: colors.danger, fontSize: fontSize.sm }]}>-{formatCurrency(l.exp, l.c)}</Text>
                    </View>
                  </View>
                ))}
              </Animated.View>
            ))}
          </>
        )}

        {/* Category Breakdown */}
        {(data.categoryBreakdown || []).length > 0 && (
          <>
            <SectionHeader title="Category Breakdown" />
            <Animated.View style={[styles.statsCard, shadows.sm, { opacity: anims[Math.min(5, 5)] }]}>
              {(data.categoryBreakdown || []).map((cat: any, i: number) => (
                <View key={i} style={[styles.statRow, i < (data.categoryBreakdown.length - 1) && styles.statRowBorder]}>
                  <View style={styles.statRowLeft}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ['rgba(91,156,255,0.12)', 'rgba(57,217,176,0.12)', 'rgba(246,180,94,0.12)', 'rgba(255,107,129,0.12)', 'rgba(154,123,255,0.12)', 'rgba(91,156,255,0.12)'][i % 6], alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 10, fontWeight: fontWeight.bold, color: ['#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#4338CA'][i % 6] }}>{cat.count}</Text>
                    </View>
                    <View>
                      <Text style={styles.statRowLabel}>{cat.category || 'Other'}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>{(cat.percentage || 0).toFixed(1)}%</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.statRowValue, { color: colors.text }]}>{formatCurrency(cat.totalKES || 0)}</Text>
                    {(cat.totalUSD || 0) > 0 && <Text style={{ fontSize: fontSize.xs, color: '#3B82F6' }}>{formatCurrency(cat.totalUSD, 1)}</Text>}
                    {((cat.otherCurrencies || []) as any[]).map((o) => (
                      <Text key={o.currency} style={{ fontSize: fontSize.xs, color: '#7C3AED' }}>{formatCurrency(o.income || 0, o.currency)}</Text>
                    ))}
                  </View>
                </View>
              ))}
            </Animated.View>
          </>
        )}

        {/* Weekly Activity */}
        {(data.weeklyActivity || []).length > 0 && (
          <>
            <SectionHeader title="Weekly Activity" />
            <Animated.View style={[styles.statsCard, shadows.sm, { opacity: anims[Math.min(5, 5)] }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 80 }}>
                {(data.weeklyActivity || []).map((day: any, i: number) => {
                  const max = Math.max(...(data.weeklyActivity || []).map((d: any) => d.transactions || 0), 1);
                  const h = Math.max(((day.transactions || 0) / max) * 60, 4);
                  return (
                    <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                      <Text style={{ fontSize: 9, fontWeight: fontWeight.bold, color: colors.primary, marginBottom: 2 }}>{day.transactions || 0}</Text>
                      <View style={{ width: 20, height: h, backgroundColor: colors.primary, borderRadius: borderRadius.sm, opacity: 0.7 + (h / 60) * 0.3 }} />
                      <Text style={{ fontSize: 9, color: colors.textTertiary, marginTop: 4 }}>{(day.day || '').slice(0, 3)}</Text>
                    </View>
                  );
                })}
              </View>
            </Animated.View>
          </>
        )}

        {/* No data fallback */}
        {!analytics && !loading && (
          <View style={styles.emptyWrap}>
            <Ionicons name="bar-chart-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No analytics data available yet</Text>
            <Text style={styles.emptySubtext}>Transaction data will appear here as you make transactions</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  cardsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  overviewCard: { borderRadius: borderRadius.lg, padding: spacing.lg, minHeight: 110 },
  overviewLabel: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs, fontWeight: fontWeight.semibold, marginTop: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  overviewValue: { color: '#FFF', fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, marginTop: 2 },
  netCard: { borderRadius: borderRadius.lg, padding: spacing.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  netLabel: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase' },
  netValue: { color: '#FFF', fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, marginTop: spacing.xs },
  statsCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md },
  statRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  statRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statRowLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  statRowValue: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  monthCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.sm },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  monthName: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  monthCount: { fontSize: fontSize.xs, color: colors.textTertiary },
  monthValues: { flexDirection: 'row', justifyContent: 'space-between' },
  monthLabel: { fontSize: fontSize.xs, color: colors.textTertiary },
  monthAmount: { fontSize: fontSize.md, fontWeight: fontWeight.bold, marginTop: 2 },
  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xxxxl },
  emptyText: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginTop: spacing.lg },
  emptySubtext: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
});
