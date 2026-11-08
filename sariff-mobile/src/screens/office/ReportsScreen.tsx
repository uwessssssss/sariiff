import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as api from '../../services/api';
import { formatCurrency, Currency, currencyCode, CURRENCY_COLOR } from '../../types';
import { useBaseCurrency } from '../../hooks/useBaseCurrency';
import { EmptyState, SectionHeader, InfoRow } from '../../components/ui';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';
import { bureauFlow } from '../../utils/moneyflow';
import { localDate } from '../../utils/dates';

type ReportType = 'daily' | 'accountSummary' | 'clientBalances' | 'transactions';

/** Money in/out for EVERY currency with activity (KES, USD, UGX, EUR). */
function cashflowByCurrency(txns: any[]): { currency: number; in: number; out: number }[] {
  const m = new Map<number, { in: number; out: number }>();
  for (const t of txns || []) {
    const f = bureauFlow(t);
    const amt = f.amount;
    if (!amt || (f.kind !== 'in' && f.kind !== 'out')) continue;
    const cur = f.currency;
    const isIn = f.kind === 'in';
    const b = m.get(cur) || { in: 0, out: 0 };
    if (isIn) b.in += amt; else b.out += amt;
    m.set(cur, b);
  }
  return [...m.entries()].sort(([a], [b]) => a - b).map(([currency, v]) => ({ currency, ...v }));
}

/** Cash & bank per currency from a daily-report balances block (falls back to KES/USD fields). */
function balancesByCurrency(b: any): { currency: number; cash: number; bank: number }[] {
  if (!b) return [];
  if (Array.isArray(b.byCurrency) && b.byCurrency.length > 0)
    return b.byCurrency.map((r: any) => ({ currency: r.currency, cash: r.cash || 0, bank: r.bank || 0 }));
  return [
    { currency: 0, cash: b.cashKES || 0, bank: b.bankKES || 0 },
    { currency: 1, cash: b.cashUSD || 0, bank: b.bankUSD || 0 },
  ];
}

export default function ReportsScreen() {
  const { base } = useBaseCurrency();
  // Mobile money per wallet currency (an M-Pesa wallet is KES even in a Ugandan bureau).
  const wallets = (b: any): { currency: number; amount: number }[] =>
    Array.isArray(b?.mobileMoneyByCurrency) && b.mobileMoneyByCurrency.length > 0
      ? b.mobileMoneyByCurrency
      : [{ currency: base, amount: b?.mpesa || 0 }];
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [activeReport, setActiveReport] = useState<ReportType>('daily');
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Which day the daily report shows (defaults to today; ‹ › to browse back)
  const [reportDate, setReportDate] = useState<Date>(new Date());

  const today = localDate();
  const reportDateStr = localDate(reportDate);
  const isToday = reportDateStr === today;
  const shiftDay = (delta: number) => {
    const d = new Date(reportDate);
    d.setDate(d.getDate() + delta);
    if (localDate(d) > today) return; // no future days
    setReportDate(d);
  };

  const loadReport = useCallback(async () => {
    setLoading(true); setReport(null);
    try {
      let res;
      switch (activeReport) {
        case 'daily': res = await api.getDailyReport(reportDateStr); break;
        case 'accountSummary': res = await api.apiRequest<any>('/api/report/account-summary'); break;
        case 'clientBalances': res = await api.apiRequest<any>('/api/report/client-balances'); break;
        case 'transactions': res = await api.apiRequest<any>('/api/report/transactions?page=1&pageSize=30'); break;
      }
      if (res?.success) setReport(res.data);
    } catch {}
    setLoading(false);
  }, [activeReport, reportDateStr]);

  // One-tap share of the daily summary (WhatsApp, SMS, anything on the sheet)
  const shareDailySummary = async () => {
    if (!report || activeReport !== 'daily') return;
    try {
      const { Share } = require('react-native');
      // Every currency with activity / holdings (UGX and EUR were left out)
      const flows = cashflowByCurrency(report.transactions || []);
      const closing = balancesByCurrency(report.closingBalances).filter((r) => r.currency <= 1 || r.cash || r.bank);
      const join = (vals: string[]) => vals.join(' | ') || '0';
      const msg =
        `📊 Sarif Daily Report — ${reportDateStr}\n\n` +
        `CASH FLOW\n` +
        `Money In:  ${join(flows.map((f) => formatCurrency(f.in, f.currency)))}\n` +
        `Money Out: ${join(flows.map((f) => formatCurrency(f.out, f.currency)))}\n` +
        `Net Flow:  ${join(flows.map((f) => `${f.in - f.out >= 0 ? '+' : ''}${formatCurrency(f.in - f.out, f.currency)}`))}\n\n` +
        `CLOSING BALANCES\n` +
        `Cash: ${join(closing.map((r) => formatCurrency(r.cash, r.currency)))}\n` +
        `Bank: ${join(closing.map((r) => formatCurrency(r.bank, r.currency)))}\n` +
        `Mobile money: ${join(wallets(report.closingBalances).map((w) => formatCurrency(w.amount, w.currency)))}\n\n` +
        `Transactions: ${report.transactionSummary?.totalCount ?? (report.transactions || []).length}`;
      await Share.share({ message: msg });
    } catch {}
  };

  const reportTypes: { key: ReportType; label: string; icon: keyof typeof Ionicons.glyphMap; gradient: readonly [string, string, ...string[]] }[] = [
    { key: 'daily', label: 'Daily', icon: 'calendar-outline', gradient: colors.gradients.blue },
    { key: 'accountSummary', label: 'Accounts', icon: 'wallet-outline', gradient: colors.gradients.emerald },
    { key: 'clientBalances', label: 'Clients', icon: 'people-outline', gradient: colors.gradients.purple },
    { key: 'transactions', label: 'Transactions', icon: 'receipt-outline', gradient: ['#F59E0B', '#D97706'] },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={styles.backBtn}><Ionicons name="arrow-back" size={22} color={colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Reports</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadReport(); setRefreshing(false); }} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}>

        {/* Type Selector */}
        <View style={styles.typeGrid}>
          {reportTypes.map(r => (
            <TouchableOpacity key={r.key} style={{ width: '48%' }} onPress={() => { setActiveReport(r.key); setReport(null); }}>
              <LinearGradient colors={(activeReport === r.key ? r.gradient : [colors.surface, colors.surfaceAlt]) as readonly [string, string, ...string[]]}
                style={[styles.typeCard, activeReport === r.key && { borderWidth: 0, borderColor: 'transparent' }]} start={{x:0,y:0}} end={{x:1,y:1}}>
                <Ionicons name={r.icon} size={22} color={activeReport === r.key ? '#FFF' : colors.textSecondary} />
                <Text style={[styles.typeLabel, { color: activeReport === r.key ? '#FFF' : colors.textSecondary }]}>{r.label}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>

        {/* Load Button */}
        <TouchableOpacity onPress={loadReport} style={{ marginBottom: spacing.lg }}>
          <LinearGradient colors={colors.gradients.primary} style={styles.loadBtn} start={{x:0,y:0}} end={{x:1,y:0}}>
            <Ionicons name="analytics" size={18} color="#FFF" />
            <Text style={styles.loadBtnText}>Generate {reportTypes.find(r => r.key === activeReport)?.label} Report</Text>
          </LinearGradient>
        </TouchableOpacity>

        {loading && <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loadingText}>Generating...</Text></View>}

        {!loading && !report && <EmptyState icon="document-text-outline" title="Select a report" subtitle="Choose a report type and tap Generate" />}

        {/* Daily Report */}
        {!loading && report && activeReport === 'daily' && (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous" onPress={() => shiftDay(-1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: 6, backgroundColor: colors.surfaceAlt, borderRadius: 10 }}>
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 17, fontWeight: '700' as any, color: colors.text }}>📊 {reportDateStr}</Text>
                {isToday && <Text style={{ fontSize: 11, color: '#39D9B0', fontWeight: '700' as any }}>TODAY</Text>}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next" onPress={() => shiftDay(1)} disabled={isToday} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: 6, backgroundColor: colors.surfaceAlt, borderRadius: 10, opacity: isToday ? 0.35 : 1 }}>
                  <Ionicons name="chevron-forward" size={20} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Share" onPress={shareDailySummary} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: 6, backgroundColor: '#4F46E5', borderRadius: 10 }}>
                  <Ionicons name="share-social-outline" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 11, fontWeight: '700' as any, color: '#4ADE80', letterSpacing: 1, marginBottom: 8 }}>OPENING BALANCES</Text>
              {balancesByCurrency(report.openingBalances)
                .filter((r) => r.currency <= 1 || r.cash || r.bank)
                .flatMap((r) => [
                  <InfoRow key={`c${r.currency}`} label={`Cash ${currencyCode(r.currency)}`} value={formatCurrency(r.cash, r.currency)} valueColor={CURRENCY_COLOR[r.currency]} />,
                  <InfoRow key={`b${r.currency}`} label={`Bank ${currencyCode(r.currency)}`} value={formatCurrency(r.bank, r.currency)} valueColor={CURRENCY_COLOR[r.currency]} />,
                ])}
              {wallets(report.openingBalances).map((w) => (
                <InfoRow key={`m${w.currency}`} label={`Mobile money ${currencyCode(w.currency)}`} value={formatCurrency(w.amount, w.currency)} valueColor="#39D9B0" />
              ))}
            </View>
            <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 11, fontWeight: '700' as any, color: '#FCA5A5', letterSpacing: 1, marginBottom: 8 }}>CLOSING BALANCES</Text>
              {balancesByCurrency(report.closingBalances)
                .filter((r) => r.currency <= 1 || r.cash || r.bank)
                .flatMap((r) => [
                  <InfoRow key={`c${r.currency}`} label={`Cash ${currencyCode(r.currency)}`} value={formatCurrency(r.cash, r.currency)} valueColor={CURRENCY_COLOR[r.currency]} />,
                  <InfoRow key={`b${r.currency}`} label={`Bank ${currencyCode(r.currency)}`} value={formatCurrency(r.bank, r.currency)} valueColor={CURRENCY_COLOR[r.currency]} />,
                ])}
              {wallets(report.closingBalances).map((w) => (
                <InfoRow key={`m${w.currency}`} label={`Mobile money ${currencyCode(w.currency)}`} value={formatCurrency(w.amount, w.currency)} valueColor="#39D9B0" />
              ))}
            </View>
            <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 14, padding: 16, marginBottom: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700' as any, color: colors.textTertiary, letterSpacing: 1, marginBottom: 8 }}>CASH FLOW</Text>
              {(() => { const flows = cashflowByCurrency(report.transactions || []); return (<>
              {flows.flatMap((f) => {
                const code = currencyCode(f.currency);
                const net = f.in - f.out;
                return [
                  <InfoRow key={`in${f.currency}`} label={`Money In (${code})`} value={formatCurrency(f.in, f.currency)} valueColor="#059669" />,
                  <InfoRow key={`out${f.currency}`} label={`Money Out (${code})`} value={formatCurrency(f.out, f.currency)} valueColor="#DC2626" />,
                  <InfoRow key={`net${f.currency}`} label={`Net Flow ${code}`} value={`${net >= 0 ? '+' : ''}${formatCurrency(net, f.currency)}`} valueColor={net >= 0 ? '#059669' : '#DC2626'} />,
                ];
              })}
              {flows.length === 0 && <InfoRow label="Cash Flow" value="No activity" valueColor={colors.textSecondary} />}
              <InfoRow label="Total Transactions" value={String(report.transactionSummary?.totalCount ?? (report.transactions || []).length)} valueColor="#4F46E5" />
              </>); })()}
            </View>
          </View>
        )}

        {/* Account Summary */}
        {!loading && report && activeReport === 'accountSummary' && (
          <View>
            <Text style={{ fontSize: 18, fontWeight: '700' as any, color: colors.text, marginBottom: 16 }}>💰 Account Summary</Text>
            {report.cashAccounts && (<>
              <Text style={{ fontSize: 11, fontWeight: '700' as any, color: colors.textTertiary, letterSpacing: 1, marginBottom: 8, marginTop: 8 }}>CASH ACCOUNTS</Text>
              {(Array.isArray(report.cashAccounts) ? report.cashAccounts : [report.cashAccounts]).map((a: any, i: number) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 6 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                    <Ionicons name="cash-outline" size={18} color={CURRENCY_COLOR[a.currency] || '#059669'} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '600' as any, color: colors.text }}>{a.name || `Cash ${currencyCode(a.currency)}`}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700' as any, color: (a.balance || 0) >= 0 ? '#39D9B0' : '#FF6B81' }}>{formatCurrency(a.balance || 0, a.currency)}</Text>
                </View>
              ))}
            </>)}
            {report.bankAccounts && (<>
              <Text style={{ fontSize: 11, fontWeight: '700' as any, color: colors.textTertiary, letterSpacing: 1, marginBottom: 8, marginTop: 16 }}>BANK ACCOUNTS</Text>
              {(Array.isArray(report.bankAccounts) ? report.bankAccounts : []).map((a: any, i: number) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 6 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(91,156,255,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                    <Ionicons name="business-outline" size={18} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600' as any, color: colors.text }}>{a.bankName || a.name}</Text>
                    <Text style={{ fontSize: 10, color: colors.textTertiary }}>{a.accountName || a.accountNumber}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700' as any, color: '#7FB3FF' }}>{formatCurrency(a.balance || 0, a.currency)}</Text>
                </View>
              ))}
            </>)}
            {report.mpesaAgents && (<>
              <Text style={{ fontSize: 11, fontWeight: '700' as any, color: colors.textTertiary, letterSpacing: 1, marginBottom: 8, marginTop: 16 }}>M-PESA AGENTS</Text>
              {(Array.isArray(report.mpesaAgents) ? report.mpesaAgents : []).map((a: any, i: number) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 6 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(57,217,176,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                    <Ionicons name="phone-portrait-outline" size={18} color="#059669" />
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '600' as any, color: colors.text }}>{a.agentName || a.name}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700' as any, color: '#39D9B0' }}>{formatCurrency(a.balance || 0, base)}</Text>
                </View>
              ))}
            </>)}
          </View>
        )}

        {/* Client Balances */}
        {!loading && report && activeReport === 'clientBalances' && (
          <View>
            <Text style={{ fontSize: 18, fontWeight: '700' as any, color: colors.text, marginBottom: 16 }}>👥 Client Balances</Text>
            {(Array.isArray(report) ? report : report.clients || report.items || []).map((c: any, i: number) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: (c.balanceKES || 0) < 0 ? '#DC2626' : '#059669' }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(91,156,255,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700' as any, color: '#4F46E5' }}>{(c.fullName || c.name || '?')[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600' as any, color: colors.text }} numberOfLines={1}>{c.fullName || c.name}</Text>
                  <Text style={{ fontSize: 10, color: colors.textTertiary }}>{c.code}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700' as any, color: (c.balanceKES || 0) < 0 ? '#FF6B81' : (c.balanceKES || 0) > 0 ? '#39D9B0' : '#9AA6BE' }}>{formatCurrency(c.balanceKES || 0)}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600' as any, color: (c.balanceUSD || 0) < 0 ? '#FF6B81' : (c.balanceUSD || 0) > 0 ? '#7FB3FF' : '#9AA6BE' }}>{formatCurrency(c.balanceUSD || 0, Currency.USD)}</Text>
                  {(c.otherBalances || []).filter((b: any) => (b.amount ?? b.balance)).map((b: any) => (
                    <Text key={b.currency} style={{ fontSize: 11, fontWeight: '600' as any, color: (b.amount ?? b.balance) < 0 ? '#FF6B81' : CURRENCY_COLOR[b.currency] }}>
                      {formatCurrency(b.amount ?? b.balance, b.currency)}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Transaction Report */}
        {!loading && report && activeReport === 'transactions' && (
          <View>
            <Text style={{ fontSize: 18, fontWeight: '700' as any, color: colors.text, marginBottom: 16 }}>📋 Transaction Report</Text>
            {(report.items || report.transactions || (Array.isArray(report) ? report : [])).slice(0, 30).map((t: any, i: number) => {
              // Bureau's side: green = money into a till, red = out, grey = transfer.
              const f = bureauFlow(t);
              const tint = f.kind === 'in' ? '#39D9B0' : f.kind === 'out' ? '#FF6B81' : colors.textSecondary;
              return (
              <View key={i} style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: f.kind === 'in' ? 'rgba(57,217,176,0.12)' : f.kind === 'out' ? 'rgba(255,107,129,0.12)' : 'rgba(148,163,184,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Ionicons name={f.kind === 'in' ? 'arrow-down' : f.kind === 'out' ? 'arrow-up' : 'swap-horizontal'} size={16} color={tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600' as any, color: colors.text }} numberOfLines={1}>{t.description}</Text>
                  <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>{t.code} · {t.sourceAccountName || ''} → {t.destAccountName || ''}</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700' as any, color: tint }}>
                  {f.kind === 'in' ? '+' : f.kind === 'out' ? '-' : ''}{formatCurrency(f.amount, f.currency)}
                </Text>
              </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  typeCard: { borderRadius: 14, padding: spacing.lg, alignItems: 'center', gap: spacing.xs, borderWidth: 1.5, borderColor: colors.border, overflow: 'hidden' as any, elevation: 0 },
  typeLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  loadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, borderRadius: borderRadius.md, gap: spacing.sm },
  loadBtnText: { color: '#FFF', fontSize: fontSize.md, fontWeight: fontWeight.bold },
  loadingWrap: { alignItems: 'center', paddingVertical: spacing.xxxxl },
  loadingText: { color: colors.textSecondary, marginTop: spacing.md },
  reportCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md },
  reportTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  dataLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  dataValue: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text },
  clientRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clientName: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  clientBal: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, textAlign: 'right' },
  txnDesc: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text },
  txnMeta: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  txnAmount: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
});
