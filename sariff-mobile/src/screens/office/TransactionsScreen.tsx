import { parseAmount, anyBadAmount } from "../../utils/amount";
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Animated, Modal, ScrollView, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../../components/toastConfig';
import * as api from '../../services/api';
import { TransactionDto, TransactionType, AccountType, Currency, formatCurrency, formatDateTime, getAccountTypeLabel, getCurrencyLabel, currencyCode, CURRENCY_COLOR, allowedCurrenciesFor } from '../../types';
import { useBaseCurrency } from '../../hooks/useBaseCurrency';

// Any currency pair. With the home currency (KES in Kenya, UGX in Uganda) on one
// side the rate is "home per 1 unit of the other currency" (how bureaus quote);
// between two foreign currencies it is "units received per 1 unit given".
function convertAmount(amount: number, from: number, to: number, rate: number, base: number): number {
  if (from === to) return amount;
  if (to === base) return amount * rate;
  if (from === base) return amount / rate;
  return amount * rate;
}
function rateLabel(base: number, from?: number, to?: number): string {
  if (from === undefined || to === undefined) return 'rate';
  if (from === base) return `1 ${currencyCode(to)} = ? ${currencyCode(base)}`;
  if (to === base) return `1 ${currencyCode(from)} = ? ${currencyCode(base)}`;
  return `1 ${currencyCode(from)} = ? ${currencyCode(to)}`;
}
import { shareViaWhatsApp, buildTransactionMessage } from '../../utils/notifications';
import { Input, EmptyState, LoadingScreen, ModalSheet, FormSection, ChipGroup, ActionBtn, InfoRow } from '../../components/ui';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';

type FilterType = 'all' | 'credit' | 'debit';
type ModalMode = 'none' | 'create' | 'edit' | 'view';
const PM = { Cash: 0, Bank: 1, Mpesa: 2, Transfer: 3 };
const isAsset = (t: number) => t === AccountType.Cash || t === AccountType.Bank || t === AccountType.Mpesa;
interface AccOpt { id: string; name: string; type: number; currency: number; balance: number; clientId?: string; }

export default function TransactionsScreen() {
  const submitSession = useRef(api.newIdempotencyKey());
  const { base } = useBaseCurrency();
  const insets = useSafeAreaInsets();
  const [txns, setTxns] = useState<TransactionDto[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchText, setSearchText] = useState('');
  const [filterCurrency, setFilterCurrency] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1); const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalMode>('none');
  const headerAnim = useRef(new Animated.Value(0)).current;
  const [formLoading, setFormLoading] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [pinError, setPinError] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);
  const pinRefs = [useRef<any>(null), useRef<any>(null), useRef<any>(null), useRef<any>(null)];
  // Create form
  const [txnType, setTxnType] = useState(TransactionType.Credit);
  const [priType, setPriType] = useState(AccountType.Client); const [priId, setPriId] = useState('');
  const [ctrType, setCtrType] = useState(AccountType.Cash); const [ctrId, setCtrId] = useState('');
  const [payMethod, setPayMethod] = useState(PM.Cash);
  const [amount, setAmount] = useState(''); const [currency, setCurrency] = useState(Currency.KES);
  const [description, setDescription] = useState(''); const [notes, setNotes] = useState('');
  const [exchRate, setExchRate] = useState('');
  const [accs, setAccs] = useState<{ cash: any[]; bank: any[]; mpesa: any[]; clients: any[] }>({ cash: [], bank: [], mpesa: [], clients: [] });
  // Currencies the bureau uses — clients get UGX / EUR sub-accounts when relevant
  const [companyCurrencies, setCompanyCurrencies] = useState<number[]>([]);
  // Edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState(''); const [editNotes, setEditNotes] = useState('');
  // View
  const [viewTxn, setViewTxn] = useState<TransactionDto | null>(null);

  // One request per keystroke or filter tap: only the answer for what is on screen now may fill the list.
  const listSeq = useRef(0);
  const loadTxns = useCallback(async (p = 1, append = false) => {
    const seq = append ? listSeq.current : ++listSeq.current;
    try {
      const filters: any = {};
      if (searchText.trim()) filters.search = searchText.trim();
      if (filterCurrency !== undefined) filters.currency = filterCurrency;
      if (filter === 'credit') filters.type = TransactionType.Credit;
      if (filter === 'debit') filters.type = TransactionType.Debit;
      const r = await api.getTransactions(p, 25, Object.keys(filters).length > 0 ? filters : undefined);
      if (seq !== listSeq.current) return;
      if (r.success && r.data) { setTxns(prev => append ? [...prev, ...(r.data.items || [])] : (r.data.items || [])); setTotalPages(r.data.totalPages || 1); setPage(p); }
    } catch {}
  }, [searchText, filterCurrency, filter]);
  const loadAccs = useCallback(async () => {
    try { const [c, b, m, cl] = await Promise.all([api.getCashAccounts(), api.getBankAccounts(), api.getMpesaAgents(), api.getAllClients()]);
      // Every client (not the first 500), and only accounts that may take a posting: the
      // server refuses a switched-off bank account or wallet and an archived client.
      const active = (xs: any[]) => (xs || []).filter((x: any) => x.isActive !== false);
      setAccs({ cash: c.success ? c.data : [], bank: b.success ? active(b.data) : [], mpesa: m.success ? active(m.data) : [], clients: active(cl) });
      api.getCompanyCurrencies().then((r: any) => { if (r?.success && r.data?.currencies) setCompanyCurrencies(r.data.currencies.map((x: any) => x.value)); }).catch(() => {});
    } catch {}
  }, []);
  useEffect(() => { (async () => { await loadTxns(); setLoading(false); Animated.spring(headerAnim, { toValue: 1, tension: 50, friction: 9, useNativeDriver: true }).start(); })(); }, []);
  useEffect(() => { loadTxns(1); }, [filter, filterCurrency, searchText]);
  const onRefresh = async () => { setRefreshing(true); await loadTxns(1); setRefreshing(false); };

  // Account builders
  const getAccList = (t: number): AccOpt[] => {
    if (t === AccountType.Cash) return accs.cash.map(a => ({ id: a.id, name: `Cash ${currencyCode(a.currency)}`, type: t, currency: a.currency, balance: a.balance }));
    if (t === AccountType.Bank) return accs.bank.map(a => ({ id: a.id, name: `${a.bankName} - ${a.accountName}`, type: t, currency: a.currency, balance: a.balance }));
    if (t === AccountType.Mpesa) return accs.mpesa.map(a => ({ id: a.id, name: `${a.agentName} ${a.agentNumber || ''}`.trim(), type: t, currency: a.currency ?? base, balance: a.balance })); // the wallet's own currency (M-Pesa = KES)
    if (t === AccountType.Client) { const l: AccOpt[] = []; accs.clients.forEach((c: any) => {
      // Home currency and USD always; others when the bureau uses them or the client holds them
      const others: any[] = c.otherBalances || [];
      const curs = new Set<number>([base, Currency.USD, ...companyCurrencies, ...others.map((o) => o.currency)]);
      [...curs].sort((x, y) => x - y).forEach((cur) => {
        const code = currencyCode(cur);
        const balance = cur === Currency.KES ? c.balanceKES || 0 : cur === Currency.USD ? c.balanceUSD || 0 : others.find((o) => o.currency === cur)?.balance || 0;
        l.push({ id: `${c.id}_${code}`, name: `${c.fullName} (${c.code}) ${code}`, type: t, currency: cur, balance, clientId: c.id });
      });
    }); return l; }
    return [];
  };
  // "<clientId>_KES" / "_USD" / "_UGX" / "_EUR"
  const getRealId = (id: string) => (/_[A-Z]{3}$/.test(id) ? id.slice(0, -4) : id);
  const priAcc = useMemo(() => getAccList(priType).find(a => a.id === priId) || null, [priType, priId, accs, companyCurrencies]);
  const ctrAcc = useMemo(() => getAccList(ctrType).find(a => a.id === ctrId) || null, [ctrType, ctrId, accs, companyCurrencies]);
  const isIncrease = useMemo(() => isAsset(priType) ? txnType === TransactionType.Debit : txnType === TransactionType.Credit, [priType, txnType]);
  const needsFx = priAcc && ctrAcc && priAcc.currency !== ctrAcc.currency;

  useEffect(() => { if (ctrAcc) setCurrency(ctrAcc.currency); }, [ctrAcc]);
  useEffect(() => { setTxnType(isAsset(priType) ? TransactionType.Debit : TransactionType.Credit); setPriId(''); }, [priType]);
  useEffect(() => { const m: Record<number, number> = { 0: AccountType.Cash, 1: AccountType.Bank, 2: AccountType.Mpesa, 3: AccountType.Client }; setCtrType(m[payMethod] ?? AccountType.Cash); setCtrId(''); }, [payMethod]);

  const resetForm = () => { setAmount(''); setDescription(''); setNotes(''); setPriId(''); setCtrId(''); setExchRate(''); setPriType(AccountType.Client); setPayMethod(PM.Cash); };

  // PIN-gated submit — check backend if PIN is required
  const handleCreateWithPin = async () => {
    // A reversal whose PIN box was closed must not run when this PIN is entered.
    setPendingReverse(null);
    if (!priId || !ctrId || !amount || !description) { Toast.show({ type: 'error', text1: 'Missing fields', text2: 'Fill all required fields' }); return; }
    try {
      const status = await api.getTransactionPinStatus();
      if (status.success && status.data?.isEnabled && status.data?.hasPin) {
        setPinDigits(['', '', '', '']); setPinError(''); setPinVerifying(false);
        setShowPinModal(true);
        setTimeout(() => pinRefs[0].current?.focus(), 200);
      } else {
        handleCreate();
      }
    } catch { handleCreate(); }
  };

  const handlePinDigit = async (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const arr = [...pinDigits];
    arr[index] = value;
    setPinDigits(arr);
    setPinError('');
    if (value && index < 3) { pinRefs[index + 1].current?.focus(); }
    // Auto-submit when all 4 filled
    if (value && index === 3 && arr.every(d => d)) {
      const pin = arr.join('');
      setPinVerifying(true);
      try {
        const res = await api.verifyTransactionPinBackend(pin);
        if (res.success) { 
          setShowPinModal(false);
          if (pendingReverse) {
            confirmReverse(pendingReverse.id, pendingReverse.code);
            setPendingReverse(null);
          } else {
            handleCreate();
          }
        }
        else { setPinError(res.message || 'Incorrect PIN'); setPinDigits(['', '', '', '']); setTimeout(() => pinRefs[0].current?.focus(), 100); }
      } catch { setPinError('Failed to verify'); setPinDigits(['', '', '', '']); setTimeout(() => pinRefs[0].current?.focus(), 100); }
      setPinVerifying(false);
    }
  };

  const handlePinKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !pinDigits[index] && index > 0) { pinRefs[index - 1].current?.focus(); }
  };

  const handleForgotPinReset = async () => {
    Alert.alert('Contact Administrator', 'Please contact your bureau administrator to reset or change the transaction PIN.');
  };

  const handleCreate = async () => {
    if (!priId || !ctrId || !amount || !description) { Toast.show({ type: 'error', text1: 'Missing fields', text2: 'Fill all required fields' }); return; }
    if (priType === ctrType && priId === ctrId) { Toast.show({ type: 'error', text1: 'Same account', text2: 'Source and destination must differ' }); return; }
    if (anyBadAmount(amount, needsFx ? exchRate : '') || !(parseAmount(amount) > 0)) { Toast.show({ type: 'error', text1: 'Amount not understood', text2: 'Type digits only, e.g. 1500 or 1,500.50' }); return; }
    if (needsFx && (!exchRate || !(parseAmount(exchRate) > 0))) { Toast.show({ type: 'error', text1: 'Enter exchange rate' }); return; }
    setFormLoading(true);
    try {
      const fx = !!needsFx; let fa = parseAmount(amount); const pc = priAcc?.currency ?? currency; const cc = ctrAcc?.currency ?? currency;
      if (fx && priAcc && ctrAcc) fa = convertAmount(parseAmount(amount), ctrAcc.currency, priAcc.currency, parseAmount(exchRate), base);
      const txPayload = { transactionType: txnType, sourceAccountType: priType, sourceAccountId: getRealId(priId), destAccountType: ctrType, destAccountId: getRealId(ctrId), amount: fa, currency: pc, counterAmount: fx ? parseAmount(amount) : undefined, counterCurrency: fx ? cc : undefined, exchangeRate: fx ? parseAmount(exchRate) : undefined, paymentMethod: payMethod, description, notes: notes || undefined };
      // One key per submission: a second press after a timeout can't record it twice.
      const res = await api.withIdempotencyKey(api.submissionKey(submitSession.current, txPayload), () => api.createTransaction(txPayload));
      if (res.success) {
        submitSession.current = api.newIdempotencyKey();
        const lb = isIncrease ? (isAsset(priType) ? 'Received' : 'Deposited') : (isAsset(priType) ? 'Paid out' : 'Withdrawn');
        const txnCode = res.data?.code || '';
        Toast.show({ type: 'success', text1: `${lb} successfully`, text2: `Code: ${txnCode}` });
        setModal('none'); resetForm(); loadTxns(1);
        // If client transaction, offer WhatsApp share
        const isClientPri = priType === AccountType.Client;
        const clientAcc = isClientPri ? priAcc : (ctrType === AccountType.Client ? ctrAcc : null);
        if (clientAcc) {
          const clientData = accs.clients.find((c: any) => c.id === (clientAcc.clientId || getRealId(clientAcc.id)));
          const clientPhone = clientData?.whatsAppNumber;
          if (clientPhone) {
            const cur = getCurrencyLabel(clientAcc.currency);
            // Get balance from response
            const balAfter = isClientPri ? res.data?.sourceBalanceAfter : res.data?.destBalanceAfter;
            const txnCurNum = isClientPri ? res.data?.currency : (res.data?.counterCurrency ?? res.data?.currency);
            // Balance in the transaction's own currency (UGX used to be labelled USD)
            const balCur = txnCurNum ?? clientAcc.currency ?? Currency.KES;
            const balanceStr = `${currencyCode(balCur)} ${(balAfter ?? clientAcc.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

            setTimeout(() => Alert.alert('Share Confirmation?', `Send transaction confirmation to ${clientAcc.name.split(' (')[0]} via WhatsApp?`, [
              { text: 'Skip', style: 'cancel' },
              { text: 'Share via WhatsApp', onPress: () => shareViaWhatsApp(clientPhone, buildTransactionMessage({
                clientName: clientAcc.name.split(' (')[0], type: isIncrease ? 'Credit' : 'Debit',
                // The client's own amount: on a forex entry with the client as the counter
                // account that is the counter amount, not the primary amount typed.
                amount: Number(isClientPri ? (res.data?.amount ?? parseAmount(amount)) : (res.data?.counterAmount ?? res.data?.amount ?? parseAmount(amount))).toLocaleString('en-US', { minimumFractionDigits: 2 }),
                currency: cur, balance: balanceStr, code: txnCode, description,
                date: new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
              })) },
            ]), 500);
          }
        }
      }
      else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
    } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.message }); }
    setFormLoading(false);
  };
  const handleEdit = async () => { if (!editId) return; setFormLoading(true); try { const r = await api.updateTransaction(editId, { description: editDesc, notes: editNotes || undefined }); if (r.success) { Toast.show({ type: 'success', text1: 'Updated' }); setModal('none'); setEditId(null); loadTxns(1); } else Toast.show({ type: 'error', text1: 'Failed', text2: r.message }); } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.message }); } setFormLoading(false); };

  // PIN-protected reverse
  const [pendingReverse, setPendingReverse] = useState<{ id: string; code: string } | null>(null);
  const handleDelete = async (id: string, code: string) => {
    try {
      const status = await api.getTransactionPinStatus();
      if (status.success && status.data?.isEnabled && status.data?.hasPin) {
        setPendingReverse({ id, code });
        setPinDigits(['', '', '', '']); setPinError(''); setPinVerifying(false);
        setShowPinModal(true);
        setTimeout(() => pinRefs[0].current?.focus(), 200);
        return;
      }
    } catch {}
    confirmReverse(id, code);
  };
  const confirmReverse = (id: string, code: string) => {
    Alert.alert('Reverse', `Reverse ${code}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Reverse', style: 'destructive', onPress: async () => {
      const prev = txns;
      setTxns(list => list.filter(t => (t.id || (t as any).transactionId) !== id)); // optimistic: row vanishes instantly
      try {
        const r = await api.deleteTransaction(id, 'Reversed from mobile');
        if (r.success) { Toast.show({ type: 'success', text1: 'Reversed' }); loadTxns(1); /* reconcile balances */ }
        else { setTxns(prev); Toast.show({ type: 'error', text1: 'Failed', text2: r.message }); }
      } catch (e: any) { setTxns(prev); Toast.show({ type: 'error', text1: 'Error', text2: e.message }); }
    }}]);
  };
  const handleAction = (item: TransactionDto) => {
    Alert.alert(item.code, item.description, [
      { text: 'View', onPress: async () => { try { const r = await api.getTransactionById(item.id); setViewTxn(r.success ? r.data : item); } catch { setViewTxn(item); } setModal('view'); }},
      { text: 'Edit', onPress: () => { setEditId(item.id); setEditDesc(item.description); setEditNotes(item.notes || ''); setModal('edit'); }},
      { text: 'Reverse', style: 'destructive', onPress: () => handleDelete(item.id, item.code) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const filters: { key: FilterType; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'credit', label: 'Credits' }, { key: 'debit', label: 'Debits' }];

  const AccTypeSel = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
    <View style={{ marginBottom: spacing.xs }}><Text style={s.fieldLabel}>{label} *</Text>
      <View style={s.chipRow}>{[{ v: AccountType.Client, l: 'Client', i: 'person' as const }, { v: AccountType.Cash, l: 'Cash', i: 'wallet' as const }, { v: AccountType.Bank, l: 'Bank', i: 'business' as const }, { v: AccountType.Mpesa, l: 'Mobile money', i: 'phone-portrait' as const }].map(t => (
        <TouchableOpacity key={t.v} style={[s.chip, value === t.v && s.chipActive]} onPress={() => onChange(t.v)}>
          <Ionicons name={t.i} size={13} color={value === t.v ? colors.primary : colors.textTertiary} /><Text style={[s.chipText, value === t.v && s.chipTextActive]}>{t.l}</Text>
        </TouchableOpacity>))}</View></View>);

  const [accSearch, setAccSearch] = useState('');
  const [accSearchCtr, setAccSearchCtr] = useState('');

  // Render function (NOT a component) — avoids TextInput remount/focus loss on re-render
  const renderAccPicker = (type: number, sel: string, onSel: (id: string) => void, searchVal: string, setSearchVal: (v: string) => void) => {
    const allList = getAccList(type);
    if (!allList.length) return <Text style={s.noAcc}>No accounts</Text>;

    // Small lists → horizontal chips
    if (type !== AccountType.Client && allList.length <= 10) {
      return (<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
        {allList.map(a => (<TouchableOpacity key={a.id} style={[s.accChip, sel === a.id && s.accChipActive]} onPress={() => onSel(a.id)}>
          <Text style={[s.accName, sel === a.id && { color: colors.primary }]} numberOfLines={1}>{a.name}</Text>
          <Text style={[s.accBal, sel === a.id && { color: colors.primary }]}>{formatCurrency(a.balance, a.currency)}</Text>
        </TouchableOpacity>))}</ScrollView>);
    }

    // Large lists → search + vertical scroll
    const matches = searchVal.trim() ? allList.filter(a => a.name.toLowerCase().includes(searchVal.toLowerCase())) : allList;
    const selectedAcc = allList.find(a => a.id === sel);

    return (
      <View style={{ marginBottom: spacing.sm }}>
        {selectedAcc && (
          <View style={[s.accChipActive, { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, borderRadius: borderRadius.md, marginBottom: spacing.sm }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.primary }}>{selectedAcc.name}</Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.primary }}>{formatCurrency(selectedAcc.balance, selectedAcc.currency)}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear" onPress={() => { onSel(''); setSearchVal(''); }}><Ionicons name="close-circle" size={20} color={colors.primary} /></TouchableOpacity>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, height: 42, marginBottom: spacing.xs }}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput style={{ flex: 1, marginLeft: spacing.sm, fontSize: fontSize.sm, color: colors.text, paddingVertical: 0 }}
            placeholder="Search by name..." placeholderTextColor={colors.textTertiary}
            value={searchVal} onChangeText={setSearchVal} autoCorrect={false} />
          {searchVal ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={() => setSearchVal('')}><Ionicons name="close" size={16} color={colors.textTertiary} /></TouchableOpacity> : null}
        </View>
        <View style={{ maxHeight: 220, borderWidth: matches.length > 0 ? 1 : 0, borderColor: colors.borderLight, borderRadius: borderRadius.md, overflow: 'hidden' }}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {matches.map(a => (
              <TouchableOpacity key={a.id} style={[s.accListItem, sel === a.id && { backgroundColor: colors.infoLight }]} onPress={() => { onSel(a.id); setSearchVal(''); }}>
                <Text style={[s.accName, sel === a.id && { color: colors.primary }]} numberOfLines={1}>{a.name}</Text>
                <Text style={[s.accBal, sel === a.id && { color: colors.primary }]}>{formatCurrency(a.balance, a.currency)}</Text>
              </TouchableOpacity>
            ))}
            {matches.length === 0 && <Text style={[s.noAcc, { padding: spacing.md }]}>No matching accounts</Text>}
          </ScrollView>
        </View>
      </View>
    );
  };


  if (loading) return <LoadingScreen message="Loading transactions..." />;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}><Text style={s.title}>Transactions</Text>
        <TouchableOpacity onPress={() => { resetForm(); setModal('create'); loadAccs(); }}>
          <LinearGradient colors={colors.gradients.primary} style={s.addBtn} start={{x:0,y:0}} end={{x:1,y:0}}>
            <Ionicons name="add" size={20} color="#FFF" /><Text style={s.addBtnText}>New</Text>
          </LinearGradient></TouchableOpacity></View>
      <View style={s.filterRow}>{filters.map(f => (<TouchableOpacity key={f.key} onPress={() => setFilter(f.key)} style={[s.filterChip, filter === f.key && s.filterChipActive]}><Text style={[s.filterText, filter === f.key && s.filterTextActive]}>{f.label}</Text></TouchableOpacity>))}</View>
      {/* Search + Currency Filter */}
      <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, height: 40, marginBottom: spacing.sm }}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput style={{ flex: 1, marginLeft: spacing.sm, fontSize: fontSize.sm, color: colors.text, paddingVertical: 0 }}
            placeholder="Search by code, description..." placeholderTextColor={colors.textTertiary}
            value={searchText} onChangeText={setSearchText} autoCorrect={false} returnKeyType="search" />
          {searchText ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear" onPress={() => setSearchText('')}><Ionicons name="close-circle" size={16} color={colors.textTertiary} /></TouchableOpacity> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TouchableOpacity style={[s.filterChip, filterCurrency === undefined && s.filterChipActive]} onPress={() => setFilterCurrency(undefined)}>
            <Text style={[s.filterText, filterCurrency === undefined && s.filterTextActive]}>All</Text>
          </TouchableOpacity>
          {allowedCurrenciesFor(base).map((c) => (
            <TouchableOpacity key={c} style={[s.filterChip, filterCurrency === c && { backgroundColor: CURRENCY_COLOR[c] }]} onPress={() => setFilterCurrency(filterCurrency === c ? undefined : c)}>
              <Text style={[s.filterText, filterCurrency === c && { color: '#FFF' }]}>{currencyCode(c)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <FlatList data={txns} keyExtractor={i => i.id} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={() => page < totalPages && loadTxns(page + 1, true)} ListEmptyComponent={<EmptyState icon="receipt-outline" title="No transactions" />}
        renderItem={({ item }) => { const cr = isAsset(item.sourceAccountType) ? item.transactionType === TransactionType.Debit : item.transactionType === TransactionType.Credit; const rev = !!item.isReversed; return (
          <TouchableOpacity style={[s.txnCard, shadows.sm]} onPress={() => handleAction(item)} activeOpacity={0.7}>
            <View style={[s.txnIcon, { backgroundColor: cr ? 'rgba(57,217,176,0.12)' : 'rgba(255,107,129,0.12)' }]}><Ionicons name={cr ? 'arrow-down' : 'arrow-up'} size={16} color={cr ? '#16A34A' : '#DC2626'} /></View>
            <View style={s.txnText}><Text style={[s.txnDesc, rev && { textDecorationLine: 'line-through', color: colors.textTertiary }]} numberOfLines={1}>{item.description}</Text>
              {(item.isReversed || item.isReversal) && <Text style={{ fontSize: 10, fontWeight: '700' as any, color: '#F6B45E', letterSpacing: 0.4 }}>{item.isReversal ? 'REVERSAL' : 'REVERSED'}</Text>}
              <Text style={s.txnMeta}>{item.code} · {getAccountTypeLabel(item.sourceAccountType)} → {getAccountTypeLabel(item.destAccountType)} · {formatDateTime(item.transactionDate || item.createdAt)}</Text></View>
            <View style={{ alignItems: 'flex-end' }}><Text style={[s.txnAmt, { color: cr ? '#39D9B0' : '#FF6B81' }, rev && { textDecorationLine: 'line-through' }]}>{cr ? '+' : '-'}{formatCurrency(item.amount, item.currency)}</Text>
              {item.counterAmount != null && <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>{formatCurrency(item.counterAmount, item.counterCurrency ?? 0)}</Text>}</View>
          </TouchableOpacity>); }} />

      {/* ===== CREATE ===== */}
      <ModalSheet visible={modal === 'create'} onClose={() => setModal('none')}
        title={isAsset(priType) ? (isIncrease ? 'Receive Money' : 'Pay Out') : (isIncrease ? 'Client Deposit' : 'Client Withdrawal')}
        icon={isIncrease ? 'add-circle-outline' : 'remove-circle-outline'}
        iconColor={isIncrease ? '#059669' : '#DC2626'}
        iconBg={isIncrease ? 'rgba(57,217,176,0.12)' : 'rgba(255,107,129,0.12)'}>
        <FormSection label="Action">
          <ChipGroup options={[
            { value: 'increase', label: isAsset(priType) ? '↑ Receive' : '↑ Deposit', color: '#39D9B0' },
            { value: 'decrease', label: isAsset(priType) ? '↓ Pay Out' : '↓ Withdraw', color: '#FF6B81' },
          ]} selected={isIncrease ? 'increase' : 'decrease'} onSelect={(v: string) => setTxnType(v === 'increase' ? (isAsset(priType) ? TransactionType.Debit : TransactionType.Credit) : (isAsset(priType) ? TransactionType.Credit : TransactionType.Debit))} />
        </FormSection>
        <AccTypeSel label="Primary Account" value={priType} onChange={v => { setPriType(v); setAccSearch(''); }} />
        {renderAccPicker(priType, priId, setPriId, accSearch, setAccSearch)}
        <FormSection label="Payment Via">
          <ChipGroup options={[{ value: PM.Cash, label: 'Cash' }, { value: PM.Bank, label: 'Bank' }, { value: PM.Mpesa, label: 'Mobile money' }, { value: PM.Transfer, label: 'Account' }]} selected={payMethod} onSelect={setPayMethod} />
        </FormSection>
        <FormSection label="Counter Account">
          {renderAccPicker(ctrType, ctrId, setCtrId, accSearchCtr, setAccSearchCtr)}
        </FormSection>
        <FormSection label={`Amount (${getCurrencyLabel(ctrAcc?.currency ?? currency)})`}>
          <Input label="" value={amount} onChangeText={setAmount} keyboardType="numeric" icon="cash-outline" placeholder="0.00" />
        </FormSection>
        {needsFx && (<View style={{ backgroundColor: 'rgba(246,180,94,0.12)', borderWidth: 1, borderColor: 'rgba(246,180,94,0.32)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: '700' as any, color: '#F6B45E', marginBottom: 8 }}>Cross-Currency</Text>
          <Input label={`Rate (${rateLabel(base, ctrAcc?.currency, priAcc?.currency)})`} value={exchRate} onChangeText={setExchRate} keyboardType="numeric" icon="swap-horizontal-outline" placeholder={base === Currency.UGX ? "3700" : "130.50"} />
          {amount && exchRate && parseAmount(exchRate) > 0 && ctrAcc && priAcc && (<View style={{ backgroundColor: 'rgba(91,156,255,0.12)', borderRadius: 8, padding: 8, marginTop: 4 }}>
            <Text style={{ fontSize: 13, color: '#7FB3FF', fontWeight: '700' as any }}>{`${currencyCode(ctrAcc.currency)} ${parseAmount(amount).toLocaleString()} ${ctrAcc.currency === Currency.KES ? '÷' : '×'} ${exchRate} = ${currencyCode(priAcc.currency)} ${convertAmount(parseAmount(amount), ctrAcc.currency, priAcc.currency, parseAmount(exchRate), base).toFixed(2)}`}</Text></View>)}
        </View>)}
        <FormSection label="Description">
          <Input label="" value={description} onChangeText={setDescription} icon="document-text-outline" placeholder="e.g. Client deposit, transfer..." />
        </FormSection>
        <FormSection label="Notes (optional)">
          <Input label="" value={notes} onChangeText={setNotes} icon="create-outline" placeholder="Additional notes" multiline />
        </FormSection>
        <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 16, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: isIncrease ? '#059669' : '#DC2626' }}>
          <Text style={{ fontSize: 11, fontWeight: '700' as any, color: colors.textTertiary, letterSpacing: 1, marginBottom: 8 }}>SUMMARY</Text>
          <InfoRow label="Action" value={`${isIncrease ? '↑ Increase' : '↓ Decrease'} (${txnType === TransactionType.Debit ? 'DR' : 'CR'})`} valueColor={isIncrease ? '#059669' : '#DC2626'} />
          <InfoRow label="Account" value={priAcc?.name || '—'} />
          <InfoRow label="Via" value={ctrAcc?.name || '—'} />
          <InfoRow label="Amount" value={`${getCurrencyLabel(ctrAcc?.currency ?? currency)} ${amount || '0.00'}`} />
        </View>
        <ActionBtn title={isIncrease ? (isAsset(priType) ? 'Receive Money' : 'Deposit') : (isAsset(priType) ? 'Pay Out' : 'Withdraw')} onPress={handleCreateWithPin} loading={formLoading}
          icon={isIncrease ? 'add-circle-outline' : 'remove-circle-outline'} gradient={isIncrease ? ['#059669', '#10B981'] : ['#DC2626', '#EF4444']} />
      </ModalSheet>

      {/* ===== EDIT ===== */}
      <ModalSheet visible={modal === 'edit'} onClose={() => { setModal('none'); setEditId(null); }} title="Edit Transaction" icon="create-outline" iconColor="#D97706" iconBg="rgba(246,180,94,0.12)">
        <FormSection label="Description">
          <Input label="" value={editDesc} onChangeText={setEditDesc} icon="document-text-outline" placeholder="Description" />
        </FormSection>
        <FormSection label="Notes">
          <Input label="" value={editNotes} onChangeText={setEditNotes} icon="create-outline" placeholder="Notes" multiline />
        </FormSection>
        <ActionBtn title="Update Transaction" onPress={handleEdit} loading={formLoading} icon="checkmark-circle-outline" gradient={['#D97706', '#F59E0B']} />
      </ModalSheet>

      {/* ===== VIEW DETAIL ===== */}
      <ModalSheet visible={modal === 'view' && !!viewTxn} onClose={() => { setModal('none'); setViewTxn(null); }} title="Transaction Details" icon="receipt-outline" iconColor="#4F46E5" iconBg="rgba(91,156,255,0.12)">
        {viewTxn && (() => {
          // Same rule as the list: money in for the SOURCE account — a till gains on Debit,
          // a client on Credit. (This used to colour every Credit green, so cash paid out
          // showed green here and red in the list.)
          const viewIn = isAsset(viewTxn.sourceAccountType) ? viewTxn.transactionType === TransactionType.Debit : viewTxn.transactionType === TransactionType.Credit;
          const inOut = viewIn ? '#39D9B0' : '#FF6B81';
          return (<>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '600' as any, color: colors.textTertiary }}>{viewTxn.code}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: viewIn ? 'rgba(57,217,176,0.12)' : 'rgba(255,107,129,0.12)' }}>
                <Text style={{ fontSize: 12, fontWeight: '700' as any, color: inOut }}>{viewTxn.transactionType === TransactionType.Credit ? 'CREDIT' : 'DEBIT'}</Text>
              </View>
              {(viewTxn.isReversed || viewTxn.isReversal) && <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(246,180,94,0.12)' }}><Text style={{ fontSize: 12, fontWeight: '700' as any, color: '#F6B45E' }}>{viewTxn.isReversal ? 'REVERSAL' : 'REVERSED'}</Text></View>}
            </View>
            <Text style={{ fontSize: 28, fontWeight: '800' as any, color: inOut, marginTop: 12 }}>{viewIn ? '+' : '-'}{formatCurrency(viewTxn.amount, viewTxn.currency)}</Text>
            {viewTxn.counterAmount != null && <Text style={{ fontSize: 14, color: '#F6B45E', marginTop: 4 }}>Counter: {formatCurrency(viewTxn.counterAmount, viewTxn.counterCurrency ?? 0)}</Text>}
            {viewTxn.exchangeRate != null && <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>Rate: {viewTxn.exchangeRate} ({rateLabel(base, viewTxn.counterCurrency ?? undefined, viewTxn.currency)})</Text>}
          </View>
          <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 11, fontWeight: '700' as any, color: colors.textTertiary, letterSpacing: 1, marginBottom: 8 }}>DETAILS</Text>
            <InfoRow label="Description" value={viewTxn.description} />
            {viewTxn.notes ? <InfoRow label="Notes" value={viewTxn.notes} /> : null}
            <InfoRow label="Date" value={formatDateTime(viewTxn.transactionDate || viewTxn.createdAt)} />
            {viewTxn.reference ? <InfoRow label="Reference" value={viewTxn.reference} /> : null}
          </View>
          <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 11, fontWeight: '700' as any, color: colors.textTertiary, letterSpacing: 1, marginBottom: 8 }}>SOURCE ACCOUNT</Text>
            <InfoRow label="Type" value={getAccountTypeLabel(viewTxn.sourceAccountType)} />
            <InfoRow label="Name" value={viewTxn.sourceAccountName || '—'} />
            {viewTxn.sourceBalanceBefore != null && <InfoRow label="Before" value={formatCurrency(viewTxn.sourceBalanceBefore, viewTxn.currency)} />}
            {viewTxn.sourceBalanceAfter != null && <InfoRow label="After" value={formatCurrency(viewTxn.sourceBalanceAfter, viewTxn.currency)} valueColor={(viewTxn.sourceBalanceAfter ?? 0) >= (viewTxn.sourceBalanceBefore ?? 0) ? '#059669' : '#DC2626'} />}
          </View>
          <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 11, fontWeight: '700' as any, color: colors.textTertiary, letterSpacing: 1, marginBottom: 8 }}>DESTINATION ACCOUNT</Text>
            <InfoRow label="Type" value={getAccountTypeLabel(viewTxn.destAccountType)} />
            <InfoRow label="Name" value={viewTxn.destAccountName || '—'} />
            {viewTxn.destBalanceBefore != null && <InfoRow label="Before" value={formatCurrency(viewTxn.destBalanceBefore, viewTxn.counterCurrency ?? viewTxn.currency)} />}
            {viewTxn.destBalanceAfter != null && <InfoRow label="After" value={formatCurrency(viewTxn.destBalanceAfter, viewTxn.counterCurrency ?? viewTxn.currency)} valueColor={(viewTxn.destBalanceAfter ?? 0) >= (viewTxn.destBalanceBefore ?? 0) ? '#059669' : '#DC2626'} />}
          </View>
        </>); })()}
      </ModalSheet>

      {/* PIN Modal — Beautiful 4-box design */}
      <Modal visible={showPinModal} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg }} activeOpacity={1} onPress={() => { setShowPinModal(false); setPendingReverse(null); }}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 24, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(91,156,255,0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="lock-closed" size={28} color="#4F46E5" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700' as any, color: colors.text }}>Enter Bureau PIN</Text>
            <Text style={{ fontSize: 13, color: colors.textTertiary, marginTop: 4, textAlign: 'center' }}>Enter the 4-digit bureau PIN to continue</Text>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 12 }}>
              {pinDigits.map((d, i) => (
                <TextInput key={i} ref={pinRefs[i]} value={d}
                  onChangeText={v => handlePinDigit(i, v)}
                  onKeyPress={({ nativeEvent }) => handlePinKeyPress(i, nativeEvent.key)}
                  style={{ width: 56, height: 56, borderWidth: 2, borderColor: pinError ? '#DC2626' : d ? '#4F46E5' : 'rgba(255,255,255,0.12)', borderRadius: 14, textAlign: 'center', fontSize: 24, fontWeight: '700' as any, color: colors.text, backgroundColor: colors.surfaceAlt }}
                  keyboardType="numeric" maxLength={1} secureTextEntry editable={!pinVerifying}
                />
              ))}
            </View>

            {pinVerifying && <Text style={{ color: '#4F46E5', fontSize: 13, fontWeight: '600' as any, marginBottom: 8 }}>Verifying...</Text>}
            {pinError ? <Text style={{ color: '#FF6B81', fontSize: 13, marginBottom: 8 }}>{pinError}</Text> : null}

            <TouchableOpacity style={{ marginTop: 8 }} onPress={handleForgotPinReset}>
              <Text style={{ color: colors.textTertiary, fontSize: 11, textAlign: 'center' }}>Contact your administrator if you don't know the PIN</Text>
            </TouchableOpacity>

            <TouchableOpacity style={{ width: '100%', paddingVertical: 14, backgroundColor: colors.surfaceAlt, borderRadius: 12, alignItems: 'center', marginTop: 20 }} onPress={() => { setShowPinModal(false); setPendingReverse(null); }}>
              <Text style={{ color: colors.textTertiary, fontWeight: '600' as any, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      {showPinModal && (
          <Toast config={toastConfig} position="top" topOffset={insets.top + 12} />
        )}
      
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.md, gap: 4 },
  addBtnText: { color: '#FFF', fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  filterRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  filterChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt },
  filterChipActive: { backgroundColor: colors.primary },
  filterText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  filterTextActive: { color: '#FFF' },
  txnCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm },
  txnIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  txnText: { flex: 1 },
  txnDesc: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  txnMeta: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  txnAmt: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  modalCont: { flex: 1, backgroundColor: colors.background },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: 'transparent' },
  chipActive: { backgroundColor: colors.infoLight, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: fontWeight.bold },
  typeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: 'transparent' },
  typeText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textSecondary },
  noAcc: { fontSize: fontSize.sm, color: colors.textTertiary, fontStyle: 'italic', marginBottom: spacing.md },
  accChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.md, backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: 'transparent', marginRight: spacing.sm, minWidth: 130 },
  accChipActive: { backgroundColor: colors.infoLight, borderColor: colors.primary },
  accName: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text },
  accBal: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  accListItem: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  summaryCard: { borderLeftWidth: 4, backgroundColor: colors.surfaceAlt, padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.lg, marginTop: spacing.sm },
  sumTitle: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textSecondary, letterSpacing: 1, marginBottom: spacing.sm },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  sumLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  sumVal: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text, maxWidth: '55%', textAlign: 'right' },
  vCodeCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  vCode: { fontSize: fontSize.lg, fontWeight: fontWeight.extrabold, color: colors.text },
  vBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.sm },
  vAmtCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.md, alignItems: 'center' },
  vAmtLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textTertiary, letterSpacing: 1 },
  vAmtVal: { fontSize: 28, fontWeight: fontWeight.extrabold, marginTop: 4 },
  vCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.md },
  vSection: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textSecondary, letterSpacing: 0.5, marginBottom: spacing.sm },
  dRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  dLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  dVal: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, maxWidth: '60%', textAlign: 'right' },
});
