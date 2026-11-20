import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import * as api from '../../services/api';
import { formatCurrency, formatDate, currencyCode, allowedCurrenciesFor } from '../../types';
import { useBaseCurrency } from '../../hooks/useBaseCurrency';
import { Input, EmptyState, LoadingScreen, ModalSheet, ChipGroup, ActionBtn } from '../../components/ui';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';
import { localDate } from '../../utils/dates';
import { parseAmount } from '../../utils/amount';

type Account = { id: string; name: string; description?: string | null; isActive: boolean; postings: number; totals: { currency: number; amount: number }[] };
type Line = { transactionId: string; code: string; date: string; description: string; receivedInto: string; amount: number; runningTotal: number; isReversal: boolean; isReversed: boolean; receivedIntoType?: number; receivedIntoId?: string };
type StatementCurrency = { currency: number; opening: number; inPeriod: number; closing: number; lines: Line[] };
type Receiver = { type: number; id: string; name: string; currency: number };
type Period = 'month' | 'last' | 'all';

/** The period's dates as the server takes them (plain local dates; the end is inclusive). */
export function periodDates(p: Period, now: Date = new Date()): { from?: string; to?: string } {
  if (p === 'all') return {};
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === 'month') return { from: localDate(first), to: localDate(now) };
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: localDate(lastStart), to: localDate(lastEnd) };
}

/**
 * Income: the bureau's own income accounts, each with its statement.
 * Recording income is Dr the till / bank / wallet, Cr the income account.
 */
export default function IncomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Account | null>(null);

  const load = useCallback(async () => {
    const r = await api.getIncomeAccounts().catch(() => null);
    setAccounts(r?.success && Array.isArray(r.data) ? (r.data as Account[]) : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await api.createIncomeAccount({ name });
      if (r.success) { Toast.show({ type: 'success', text1: `${name} created` }); setCreating(false); setNewName(''); load(); }
      else Toast.show({ type: 'error', text1: 'Not created', text2: r.message });
    } finally { setBusy(false); }
  };

  const toggle = async (a: Account) => {
    const r = await api.updateIncomeAccount(a.id, { isActive: !a.isActive });
    if (r.success) { Toast.show({ type: 'success', text1: `${a.name} switched ${a.isActive ? 'off' : 'on'}` }); load(); }
    else Toast.show({ type: 'error', text1: 'Not changed', text2: r.message });
  };

  if (selected) return <IncomeStatementView account={selected} onBack={() => { setSelected(null); load(); }} />;
  if (accounts === null) return <LoadingScreen message="Loading income..." />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={styles.backBtn}><Ionicons name="arrow-back" size={22} color={colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Income</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="New income account" onPress={() => setCreating(true)}>
          <LinearGradient colors={colors.gradients.primary} style={styles.addBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Ionicons name="add" size={18} color="#FFF" /><Text style={styles.addBtnText}>New</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Text style={styles.hint}>Tap an account for its statement. To record income, long-press a till, bank or wallet in Accounts.</Text>
        {accounts.length === 0 ? (
          <EmptyState icon="trending-up-outline" title="No income accounts yet" subtitle="Create one for each kind of income, e.g. Commission or Rent received." action="New income account" onAction={() => setCreating(true)} />
        ) : accounts.map((a) => (
          <TouchableOpacity key={a.id} style={[styles.card, shadows.sm]} activeOpacity={0.7}
            onPress={() => setSelected(a)}
            onLongPress={() => Alert.alert(a.name, 'Choose action', [
              { text: 'Statement', onPress: () => setSelected(a) },
              { text: a.isActive ? 'Switch off' : 'Switch on', onPress: () => toggle(a) },
              { text: 'Cancel', style: 'cancel' },
            ])}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{a.name}{!a.isActive ? '  · Switched off' : ''}</Text>
              {!!a.description && <Text style={styles.meta}>{a.description}</Text>}
              <Text style={styles.meta}>
                {a.totals.length === 0 ? 'Nothing recorded yet' : a.totals.map((t) => formatCurrency(t.amount, t.currency)).join(' · ')}
                {a.postings > 0 ? ` · ${a.postings} posting${a.postings === 1 ? '' : 's'}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ModalSheet visible={creating} onClose={() => setCreating(false)} title="New income account" icon="trending-up-outline" iconColor="#059669" iconBg="rgba(57,217,176,0.12)">
        <Input label="Name" value={newName} onChangeText={setNewName} icon="pricetag-outline" placeholder="e.g. Commission" />
        <ActionBtn title="Create" onPress={create} loading={busy} disabled={!newName.trim()} icon="checkmark-circle-outline" gradient={['#059669', '#10B981']} />
      </ModalSheet>
    </View>
  );
}

/** One income account's statement on the phone: earned before, each posting with a running total, earned to the end. */
export function IncomeStatementView({ account, onBack }: { account: Account; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<StatementCurrency[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [into, setInto] = useState('');
  const [amount, setAmount] = useState('');
  const [what, setWhat] = useState('');
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState<string | null>(null);   // null = no PIN asked
  const [version, setVersion] = useState(0);
  // A fee charged to a client: Dr the client (their balance goes down), Cr the income account.
  const { base } = useBaseCurrency();
  const [mode, setMode] = useState<'account' | 'client'>('account');
  const [clientQuery, setClientQuery] = useState('');
  const [clientHits, setClientHits] = useState<{ id: string; fullName: string; code: string }[]>([]);
  const [client, setClient] = useState<{ id: string; fullName: string; code: string } | null>(null);
  const [clientCurrency, setClientCurrency] = useState<number | null>(null);
  useEffect(() => {
    if (!recording || mode !== 'client' || client || clientQuery.trim().length < 2) { setClientHits([]); return; }
    let live = true;
    const t = setTimeout(async () => {
      const r = await api.getClients(1, 8, clientQuery.trim()).catch(() => null);
      const items = (r?.success && (r.data as any)?.items) || [];
      if (live) setClientHits(items.map((c: any) => ({ id: c.id, fullName: c.fullName, code: c.code })));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [recording, mode, client, clientQuery]);
  // Reversing a line: a client line goes through the client's statement, like every client posting.
  const [reversing, setReversing] = useState<Line | null>(null);
  const [reason, setReason] = useState('');
  const [revPin, setRevPin] = useState<string | null>(null);
  const [revBusy, setRevBusy] = useState(false);
  const reverse = async () => {
    const l = reversing;
    if (!l || reason.trim().length < 3) return;
    setRevBusy(true);
    try {
      if (revPin === null) {
        const st = await api.getTransactionPinStatus().catch(() => null);
        if (st?.success && st.data?.isEnabled && st.data?.hasPin) { setRevPin(''); return; }
      } else {
        const ok = await api.verifyTransactionPinBackend(revPin);
        if (!ok.success || ok.data === false) { Toast.show({ type: 'error', text1: 'Wrong PIN', text2: ok.message }); return; }
      }
      const r = l.receivedIntoType === 3 && l.receivedIntoId
        ? await api.reverseClientTransaction(l.receivedIntoId, l.transactionId, reason.trim())
        : await api.deleteTransaction(l.transactionId, reason.trim());
      if (r.success) { Toast.show({ type: 'success', text1: `${l.code} reversed` }); setReversing(null); setVersion((v) => v + 1); }
      else Toast.show({ type: 'error', text1: 'Not reversed', text2: r.message });
    } finally { setRevBusy(false); }
  };
  const { from, to } = periodDates(period);

  useEffect(() => {
    let live = true;
    setFailed(false); setData(null);
    api.getIncomeStatement(account.id, from, to)
      .then((r) => { if (!live) return; if (r.success && r.data) setData(r.data.byCurrency || []); else setFailed(true); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [account.id, from, to, version]);

  const openRecord = async () => {
    setRecording(true); setAmount(''); setWhat(''); setPin(null); setMode('account'); setClient(null); setClientQuery(''); setClientCurrency(null);
    const [c, b, m] = await Promise.all([api.getCashAccounts().catch(() => null), api.getBankAccounts().catch(() => null), api.getMpesaAgents().catch(() => null)]);
    const list: Receiver[] = [
      ...((c?.success && Array.isArray(c.data) && c.data) || []).map((x: any) => ({ type: 0, id: x.id, name: `Cash ${currencyCode(x.currency)}`, currency: x.currency })),
      ...((b?.success && Array.isArray(b.data) && b.data) || []).filter((x: any) => x.isActive !== false).map((x: any) => ({ type: 1, id: x.id, name: x.bankName, currency: x.currency })),
      ...((m?.success && Array.isArray(m.data) && m.data) || []).filter((x: any) => x.isActive !== false).map((x: any) => ({ type: 2, id: x.id, name: x.agentName, currency: x.currency ?? 0 })),
    ];
    setReceivers(list);
    setInto(list[0] ? `${list[0].type}:${list[0].id}` : '');
  };
  const receiver: Receiver | undefined = mode === 'account' ? receivers.find((r) => `${r.type}:${r.id}` === into)
    : client ? { type: 3, id: client.id, name: `${client.fullName} (${client.code})`, currency: clientCurrency ?? base } : undefined;
  const a = parseAmount(amount);
  const ready = !!receiver && a > 0 && account.isActive;

  const record = async () => {
    if (!ready || !receiver) return;
    setBusy(true);
    try {
      if (pin === null) {
        const st = await api.getTransactionPinStatus().catch(() => null);
        if (st?.success && st.data?.isEnabled && st.data?.hasPin) { setPin(''); return; }   // ask for it, then press again
      } else {
        const ok = await api.verifyTransactionPinBackend(pin);
        if (!ok.success || ok.data === false) { Toast.show({ type: 'error', text1: 'Wrong PIN', text2: ok.message }); return; }
      }
      const r = await api.recordIncome({ incomeAccountId: account.id, destAccountType: receiver.type, destAccountId: receiver.id, currency: receiver.currency, amount: a, description: what.trim() || undefined });
      if (r.success) {
        Toast.show({ type: 'success', text1: `${account.name} recorded`, text2: `${formatCurrency(a, receiver.currency)} ${receiver.type === 3 ? 'charged to' : 'into'} ${receiver.name}` });
        setRecording(false); setVersion((v) => v + 1);
      }
      else Toast.show({ type: 'error', text1: 'Not recorded', text2: r.message });
    } finally { setBusy(false); }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backBtn}><Ionicons name="arrow-back" size={22} color={colors.text} /></TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{account.name}</Text>
        {account.isActive ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Record income" onPress={openRecord}>
            <LinearGradient colors={colors.gradients.primary} style={styles.addBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="add" size={18} color="#FFF" /><Text style={styles.addBtnText}>Record</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : <View style={{ width: 36 }} />}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}>
        <ChipGroup options={[{ value: 'month', label: 'This month' }, { value: 'last', label: 'Last month' }, { value: 'all', label: 'All time' }]} selected={period} onSelect={setPeriod} />
        {data === null && !failed ? (
          <Text style={styles.hint}>Loading…</Text>
        ) : failed || !data ? (
          <Text style={[styles.hint, { color: colors.danger }]}>Couldn't load the statement.</Text>
        ) : data.length === 0 ? (
          <Text style={styles.hint}>Nothing recorded in this account yet.</Text>
        ) : data.map((c) => (
          <View key={c.currency} style={[styles.card, styles.statement, shadows.sm]} accessibilityLabel={`${account.name} in ${currencyCode(c.currency)}`}>
            <Text style={styles.cardTitle}>{currencyCode(c.currency)} · earned {formatCurrency(c.inPeriod, c.currency)}</Text>
            <View style={styles.row}><Text style={styles.meta}>{from ? `Earned before ${formatDate(from)}` : 'Earned before the first posting'}</Text><Text style={styles.amount}>{formatCurrency(c.opening, c.currency)}</Text></View>
            {c.lines.map((l) => (
              <View key={l.transactionId} style={styles.line}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineTitle} numberOfLines={2}>{l.description}{l.isReversed ? '  · Reversed' : ''}</Text>
                  <Text style={styles.meta}>{formatDate(l.date)} · {l.code} · {l.receivedInto}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.amount, l.amount < 0 && { color: colors.danger }]}>{l.amount < 0 ? `−${formatCurrency(-l.amount, c.currency)}` : formatCurrency(l.amount, c.currency)}</Text>
                  <Text style={styles.meta}>{formatCurrency(l.runningTotal, c.currency)}</Text>
                  {!l.isReversal && !l.isReversed && (
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Reverse ${l.code}`} onPress={() => { setReversing(l); setReason(''); setRevPin(null); }}>
                      <Text style={styles.reverse}>Reverse</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
            <View style={styles.row}><Text style={[styles.meta, { fontWeight: fontWeight.bold }]}>{to ? `Earned to ${formatDate(to)}` : 'Earned to date'}</Text><Text style={[styles.amount, { fontWeight: fontWeight.bold }]}>{formatCurrency(c.closing, c.currency)}</Text></View>
          </View>
        ))}
      </ScrollView>

      <ModalSheet visible={recording} onClose={() => setRecording(false)} title={`Record ${account.name}`} icon="cash-outline" iconColor="#059669" iconBg="rgba(57,217,176,0.12)">
        <ChipGroup options={[{ value: 'account', label: 'Till, bank or wallet' }, { value: 'client', label: 'Charge a client (a fee)' }]} selected={mode} onSelect={(v) => setMode(v as 'account' | 'client')} />
        {mode === 'account' ? (<>
          <Text style={styles.meta}>Received into</Text>
          <ChipGroup options={receivers.map((r) => ({ value: `${r.type}:${r.id}`, label: `${r.name} (${currencyCode(r.currency)})` }))} selected={into} onSelect={setInto} />
        </>) : (<>
          {client ? (
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{client.fullName} ({client.code})</Text>
              <TouchableOpacity accessibilityRole="button" onPress={() => { setClient(null); setClientQuery(''); }}><Text style={styles.reverse}>Change</Text></TouchableOpacity>
            </View>
          ) : (<>
            <Input label="Client (name, code or phone)" value={clientQuery} onChangeText={setClientQuery} icon="person-outline" placeholder="Type 2 letters" />
            {clientHits.map((h) => (
              <TouchableOpacity key={h.id} accessibilityRole="button" onPress={() => setClient(h)} style={styles.hit}>
                <Text style={styles.lineTitle}>{h.fullName} ({h.code})</Text>
              </TouchableOpacity>
            ))}
          </>)}
          <Text style={styles.meta}>Currency</Text>
          <ChipGroup options={allowedCurrenciesFor(base).map((c) => ({ value: String(c), label: currencyCode(c) }))} selected={String(clientCurrency ?? base)} onSelect={(v) => setClientCurrency(Number(v))} />
        </>)}
        <Input label={`Amount${receiver ? ` (${currencyCode(receiver.currency)})` : ''}`} value={amount} onChangeText={setAmount} keyboardType="numeric" icon="cash-outline" placeholder="10,000" />
        <Input label="Description (optional)" value={what} onChangeText={setWhat} icon="document-text-outline" placeholder="" />
        {pin !== null && <Input label="Transaction PIN" value={pin} onChangeText={setPin} keyboardType="numeric" secureTextEntry icon="lock-closed-outline" placeholder="••••" />}
        {amount.trim() !== '' && !(a > 0) ? <Text style={[styles.meta, { color: colors.danger }]}>Enter the amount as a number above zero.</Text>
          : ready && receiver ? <Text style={styles.meta}>Dr {receiver.name} {formatCurrency(a, receiver.currency)}{receiver.type === 3 ? ' (their balance goes down)' : ''} · Cr {account.name} {formatCurrency(a, receiver.currency)}</Text> : null}
        <ActionBtn title={pin !== null ? 'Confirm with PIN' : 'Record income'} onPress={record} loading={busy} disabled={!ready} icon="checkmark-circle-outline" gradient={['#059669', '#10B981']} />
      </ModalSheet>

      <ModalSheet visible={!!reversing} onClose={() => setReversing(null)} title={reversing ? `Reverse ${reversing.code}` : 'Reverse'} icon="return-down-back-outline" iconColor={colors.danger} iconBg="rgba(239,68,68,0.12)">
        {reversing && (<>
          <Text style={styles.meta}>{reversing.description}. The money comes back out of {reversing.receivedInto}.</Text>
          <Input label="Reason" value={reason} onChangeText={setReason} icon="create-outline" placeholder="At least 3 letters" />
          {revPin !== null && <Input label="Transaction PIN" value={revPin} onChangeText={setRevPin} keyboardType="numeric" secureTextEntry icon="lock-closed-outline" placeholder="••••" />}
          <ActionBtn title={revPin !== null ? 'Confirm with PIN' : 'Reverse'} onPress={reverse} loading={revBusy} disabled={reason.trim().length < 3} icon="return-down-back-outline" gradient={['#DC2626', '#EF4444']} />
        </>)}
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.md, gap: 4 },
  addBtnText: { color: '#FFF', fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  hint: { color: colors.textSecondary, fontSize: fontSize.sm, marginVertical: spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md, gap: spacing.md },
  statement: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
  cardTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  meta: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  line: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  lineTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  amount: { color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  reverse: { color: colors.danger, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, marginTop: 4 },
  hit: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
