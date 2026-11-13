import { parseAmount, anyBadAmount } from "../../utils/amount";
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Modal, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import * as api from '../../services/api';
import { BankAccountDto, MpesaAgentDto, CashAccountDto, Currency, formatCurrency, formatDate, getAccountTypeLabel, currencyCode, CURRENCY_COLOR, providerLabel, MOBILE_MONEY_PROVIDERS, currencyChips, allowedCurrenciesFor, walletCurrency } from '../../types';
import { useBaseCurrency } from '../../hooks/useBaseCurrency';
import { Button, Input, EmptyState, LoadingScreen, SectionHeader, ModalSheet, FormSection, ChipGroup, ActionBtn } from '../../components/ui';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';

type ModalType = 'none' | 'createBank' | 'createMpesa' | 'editBank' | 'editMpesa' | 'statement';
type AccTab = 'cash' | 'bank' | 'mpesa';

export default function AccountsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [tab, setTab] = useState<AccTab>('cash');
  const [cash, setCash] = useState<CashAccountDto[]>([]);
  const [banks, setBanks] = useState<BankAccountDto[]>([]);
  const [mpesa, setMpesa] = useState<MpesaAgentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalType>('none');
  const [formLoading, setFormLoading] = useState(false);
  const [statement, setStatement] = useState<any>(null);
  const [stmtTitle, setStmtTitle] = useState('');
  const [stmtLoading, setStmtLoading] = useState(false);
  const [viewStmtTxn, setViewStmtTxn] = useState<any>(null);
  const [showCreateCash, setShowCreateCash] = useState(false);
  const [cashCurrency, setCashCurrency] = useState(0);
  const [cashOpenBal, setCashOpenBal] = useState("");
  const [editModal, setEditModal] = useState<"none"|"bank"|"mpesa">("none");
  const [editId, setEditId] = useState("");
  const [editBankName, setEditBankName] = useState("");
  const [editAccName, setEditAccName] = useState("");
  const [editBranch, setEditBranch] = useState("");
  const [editAgentName, setEditAgentName] = useState("");
  const [editStore, setEditStore] = useState("");

  // Bank form
  const [bankName, setBankName] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [accName, setAccName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  // Home currency (KES in Kenya, UGX in Uganda): default for new banks (wallets hold their network's currency)
  const { base } = useBaseCurrency();
  const [bankCurrency, setBankCurrency] = useState<number>(Currency.KES);
  useEffect(() => setBankCurrency(base), [base]);
  const [openingBal, setOpeningBal] = useState('');

  // M-Pesa form
  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentNumber, setAgentNumber] = useState('');
  const [storeNumber, setStoreNumber] = useState('');
  const [mpesaOpenBal, setMpesaOpenBal] = useState('');
  // Network: M-Pesa in Kenya, MTN MoMo by default in Uganda
  const [provider, setProvider] = useState(0);
  useEffect(() => setProvider(base === Currency.UGX ? 1 : 0), [base]);

  const load = useCallback(async () => {
    try {
      const [c, b, m] = await Promise.all([api.getCashAccounts(), api.getBankAccounts(), api.getMpesaAgents()]);
      if (c.success) setCash(c.data);
      if (b.success) setBanks(b.data);
      if (m.success) setMpesa(m.data);
    } catch {}
  }, []);

  useEffect(() => { (async () => { await load(); setLoading(false); })(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const viewStatement = async (type: string, idOrCurrency: string | number, name: string) => {
    setStmtTitle(name); setStatement(null); setStmtLoading(true); setModal('statement');
    try {
      let res;
      if (type === 'cash') {
        res = await api.getCashStatement(idOrCurrency as number);
      } else if (type === 'bank') {
        res = await api.getBankStatement(idOrCurrency as string);
      } else {
        res = await api.getMpesaStatement(idOrCurrency as string);
      }
      if (res.success && res.data) {
        setStatement(res.data);
      } else {
        // Try alternate field — maybe data is directly the statement
        if (res.data === null && res.success) {
          setStatement({ accountName: name, openingBalance: 0, closingBalance: 0, totalCredit: 0, totalDebit: 0, netMovement: 0, transactions: [] });
        } else {
          setStatement({ error: res.message || 'No statement data available' });
        }
      }
    } catch (e: any) {
      setStatement({ error: e.message || 'Failed to load statement' });
    }
    setStmtLoading(false);
  };

  const handleCreateBank = async () => {
    if (!bankName || !accNumber || !accName) { Toast.show({ type: 'error', text1: 'Fill required fields' }); return; }
    if (anyBadAmount(openingBal)) { Toast.show({ type: 'error', text1: 'Amount not understood', text2: 'Type digits only, e.g. 1500 or 1,500.50' }); return; }
    setFormLoading(true);
    const res = await api.createBankAccount({ bankName, accountNumber: accNumber, accountName: accName, branchCode, currency: bankCurrency, openingBalance: parseAmount(openingBal) || 0 });
    if (res.success) { Toast.show({ type: 'success', text1: 'Bank account created' }); setModal('none'); load(); }
    else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
    setFormLoading(false);
  };

  const handleCreateMpesa = async () => {
    if (!agentName || !agentPhone || !agentNumber) { Toast.show({ type: 'error', text1: 'Fill required fields' }); return; }
    if (anyBadAmount(mpesaOpenBal)) { Toast.show({ type: 'error', text1: 'Amount not understood', text2: 'Type digits only, e.g. 1500 or 1,500.50' }); return; }
    setFormLoading(true);
    const res = await api.createMpesaAgent({ agentName, phoneNumber: agentPhone, agentNumber, storeNumber, agentType: 0, openingBalance: parseAmount(mpesaOpenBal) || 0, provider } as any);
    if (res.success) { Toast.show({ type: 'success', text1: 'Mobile money agent created' }); setModal('none'); load(); }
    else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
    setFormLoading(false);
  };

  const handleDelete = (type: string, id: string, name: string) => {
    Alert.alert('Delete Account', `Delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const prevCash = cash, prevBanks = banks, prevMpesa = mpesa;
        if (type === 'bank') setBanks(l => l.filter(b => b.id !== id));
        else if (type === 'mpesa') setMpesa(l => l.filter(m => m.id !== id));
        else setCash(l => l.filter(c => c.id !== id)); // optimistic
        const res = type === 'bank' ? await api.deleteBankAccount(id) : type === 'mpesa' ? await api.deleteMpesaAgent(id) : await api.deleteCashAccount(id);
        if (res.success) { Toast.show({ type: 'success', text1: 'Deleted' }); load(); }
        else { setCash(prevCash); setBanks(prevBanks); setMpesa(prevMpesa); Toast.show({ type: 'error', text1: 'Failed', text2: res.message }); }
      }},
    ]);
  };

  const handleCreateCash = async () => {
    if (anyBadAmount(cashOpenBal)) { Toast.show({ type: 'error', text1: 'Amount not understood', text2: 'Type digits only, e.g. 1500 or 1,500.50' }); return; }
    setFormLoading(true);
    const res = await api.createCashAccount({ currency: cashCurrency, openingBalance: parseAmount(cashOpenBal) || 0 });
    if (res.success) { Toast.show({ type: 'success', text1: 'Cash account created' }); setShowCreateCash(false); setCashOpenBal(''); load(); }
    else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
    setFormLoading(false);
  };

  const openEditBank = (a: any) => {
    setEditId(a.id); setEditBankName(a.bankName); setEditAccName(a.accountName); setEditBranch(a.branchCode || '');
    setEditModal('bank');
  };
  const openEditMpesa = (a: any) => {
    setEditId(a.id); setEditAgentName(a.agentName); setEditStore(a.storeNumber || '');
    setEditModal('mpesa');
  };
  const handleEditBank = async () => {
    setFormLoading(true);
    const res = await api.updateBankAccount(editId, { bankName: editBankName, accountName: editAccName, branchCode: editBranch || undefined });
    if (res.success) { Toast.show({ type: 'success', text1: 'Bank updated' }); setEditModal('none'); load(); }
    else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
    setFormLoading(false);
  };
  const handleEditMpesa = async () => {
    setFormLoading(true);
    const res = await api.updateMpesaAgent(editId, { agentName: editAgentName, storeNumber: editStore || undefined });
    if (res.success) { Toast.show({ type: 'success', text1: 'Mobile money agent updated' }); setEditModal('none'); load(); }
    else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
    setFormLoading(false);
  };

  if (loading) return <LoadingScreen message="Loading accounts..." />;

  const tabs: { key: AccTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'cash', label: 'Cash', icon: 'cash-outline' },
    { key: 'bank', label: 'Banks', icon: 'business-outline' },
    { key: 'mpesa', label: 'Mobile money', icon: 'phone-portrait-outline' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={styles.backBtn}><Ionicons name="arrow-back" size={22} color={colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Accounts</Text>
        <TouchableOpacity onPress={() => {
          if (tab === 'cash') setShowCreateCash(true);
          else setModal(tab === 'bank' ? 'createBank' : 'createMpesa');
        }}>
          <LinearGradient colors={colors.gradients.primary} style={styles.addBtn} start={{x:0,y:0}} end={{x:1,y:0}}>
            <Ionicons name="add" size={18} color="#FFF" /><Text style={styles.addBtnText}>Add</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {tabs.map(t => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Ionicons name={t.icon} size={16} color={tab === t.key ? colors.primary : colors.textTertiary} />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}>
        {/* Cash */}
        {tab === 'cash' && cash.map(a => (
          <TouchableOpacity key={a.id} style={[styles.accCard, shadows.sm]} onPress={() => viewStatement('cash', a.currency, `Cash ${currencyCode(a.currency)}`)}
            onLongPress={() => Alert.alert(`Cash ${currencyCode(a.currency)}`, 'Choose action', [
              { text: 'Delete', style: 'destructive', onPress: () => handleDelete('cash', a.id, `Cash ${currencyCode(a.currency)}`) },
              { text: 'Cancel', style: 'cancel' },
            ])}>
            <View style={[styles.accIcon, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <Ionicons name="cash" size={20} color={CURRENCY_COLOR[a.currency] || '#16A34A'} />
            </View>
            <View style={styles.accInfo}>
              <Text style={styles.accName}>Cash {currencyCode(a.currency)}</Text>
              <Text style={styles.accMeta}>Opening: {formatCurrency(a.openingBalance, a.currency)}</Text>
            </View>
            <Text style={[styles.accBalance, (a.balance || 0) < 0 && { color: "#FF6B81" }]}>{formatCurrency(a.balance, a.currency)}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        ))}

        {/* Banks */}
        {tab === 'bank' && (banks.length === 0 ? <EmptyState icon="business-outline" title="No bank accounts" action="Add Bank" onAction={() => setModal('createBank')} /> :
          banks.map(a => (
            <TouchableOpacity key={a.id} style={[styles.accCard, shadows.sm]} onPress={() => viewStatement('bank', a.id, a.bankName)}
              onLongPress={() => Alert.alert(a.bankName, 'Choose action', [
                { text: 'Edit', onPress: () => openEditBank(a) },
                { text: 'Delete', style: 'destructive', onPress: () => handleDelete('bank', a.id, a.bankName) },
                { text: 'Cancel', style: 'cancel' },
              ])}>
              <View style={[styles.accIcon, { backgroundColor: 'rgba(91,156,255,0.12)' }]}><Ionicons name="business" size={20} color="#4F46E5" /></View>
              <View style={styles.accInfo}>
                <Text style={styles.accName}>{a.bankName}</Text>
                <Text style={styles.accMeta}>{a.accountName} · {a.accountNumber}</Text>
              </View>
              <Text style={[styles.accBalance, (a.balance || 0) < 0 && { color: "#FF6B81" }]}>{formatCurrency(a.balance, a.currency)}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ))
        )}

        {/* M-Pesa */}
        {tab === 'mpesa' && (mpesa.length === 0 ? <EmptyState icon="phone-portrait-outline" title="No mobile money agents" action="Add Agent" onAction={() => setModal('createMpesa')} /> :
          mpesa.map(a => (
            <TouchableOpacity key={a.id} style={[styles.accCard, shadows.sm]} onPress={() => viewStatement('mpesa', a.id, a.agentName)}
              onLongPress={() => Alert.alert(a.agentName, 'Choose action', [
                { text: 'Edit', onPress: () => openEditMpesa(a) },
                { text: 'Delete', style: 'destructive', onPress: () => handleDelete('mpesa', a.id, a.agentName) },
                { text: 'Cancel', style: 'cancel' },
              ])}>
              <View style={[styles.accIcon, { backgroundColor: 'rgba(57,217,176,0.12)' }]}><Ionicons name="phone-portrait" size={20} color="#16A34A" /></View>
              <View style={styles.accInfo}>
                <Text style={styles.accName}>{a.agentName}</Text>
                <Text style={styles.accMeta}>{providerLabel((a as any).provider)} · Agent {a.agentNumber} · {a.phoneNumber}</Text>
              </View>
              <Text style={[styles.accBalance, (a.balance || 0) < 0 && { color: "#FF6B81" }]}>{formatCurrency(a.balance, (a as any).currency ?? base)}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Modals */}
      <ModalSheet visible={modal !== 'none'} onClose={() => setModal('none')}
        title={modal === 'createBank' ? 'Add Bank Account' : modal === 'createMpesa' ? 'Add Mobile Money Agent' : stmtTitle}
        icon={modal === 'createBank' ? 'business-outline' : modal === 'createMpesa' ? 'phone-portrait-outline' : 'document-text-outline'}
        iconColor={modal === 'createBank' ? '#2563EB' : modal === 'createMpesa' ? '#059669' : '#4F46E5'}
        iconBg={modal === 'createBank' ? 'rgba(91,156,255,0.12)' : modal === 'createMpesa' ? 'rgba(57,217,176,0.12)' : 'rgba(91,156,255,0.12)'}>
            {modal === 'createBank' && (<>
              <FormSection label="Bank Details">
              <Input label="Bank Name" value={bankName} onChangeText={setBankName} icon="business-outline" placeholder="KCB, Equity..." />
              <Input label="Account Number" value={accNumber} onChangeText={setAccNumber} icon="card-outline" placeholder="1234567890" />
              <Input label="Account Name" value={accName} onChangeText={setAccName} icon="text-outline" placeholder="Company KES Account" />
              <Input label="Branch Code" value={branchCode} onChangeText={setBranchCode} icon="locate-outline" placeholder="001" />
              </FormSection>
              <FormSection label="Currency">
              <ChipGroup options={currencyChips(allowedCurrenciesFor(base))} selected={bankCurrency} onSelect={setBankCurrency} />
              </FormSection>
              <Input label="Opening Balance" value={openingBal} onChangeText={setOpeningBal} keyboardType="numeric" icon="cash-outline" placeholder="0.00" />
              <Button title="Create Bank Account" onPress={handleCreateBank} loading={formLoading} icon="checkmark-circle-outline" size="lg" />
            </>)}
            {modal === 'createMpesa' && (<>
              <FormSection label="Network">
                <ChipGroup
                  options={MOBILE_MONEY_PROVIDERS
                    .filter((p) => allowedCurrenciesFor(base).includes(walletCurrency(p.value, base)))
                    .map((p) => ({ value: p.value, label: `${p.label} (${currencyCode(walletCurrency(p.value, base))})` }))}
                  selected={provider} onSelect={setProvider} />
              </FormSection>
              <Input label="Agent Name *" value={agentName} onChangeText={setAgentName} icon="person-outline" placeholder="Main Till" />
              <Input label="Phone Number *" value={agentPhone} onChangeText={setAgentPhone} icon="call-outline" placeholder={base === Currency.UGX ? "+256..." : "+254..."} keyboardType="phone-pad" />
              <Input label="Agent Number *" value={agentNumber} onChangeText={setAgentNumber} icon="keypad-outline" placeholder="123456" />
              <Input label="Store Number" value={storeNumber} onChangeText={setStoreNumber} icon="storefront-outline" placeholder="789012" />
              <Input label={`Opening Balance (${currencyCode(walletCurrency(provider, base))})`} value={mpesaOpenBal} onChangeText={setMpesaOpenBal} keyboardType="numeric" icon="cash-outline" placeholder="0.00" />
              <Button title="Create Mobile Money Agent" onPress={handleCreateMpesa} loading={formLoading} icon="checkmark-circle-outline" size="lg" />
            </>)}
            {modal === 'statement' && (<>
              {stmtLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.loadingText, { marginTop: 12 }]}>Loading statement...</Text>
                </View>
              ) : !statement ? (
                <Text style={styles.loadingText}>No statement data</Text>
              ) : statement.error ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
                  <Text style={[styles.loadingText, { color: colors.danger, marginTop: 8 }]}>{statement.error}</Text>
                </View>
              ) : (<>
                <View style={[styles.stmtSummary, shadows.sm]}>
                  <View style={styles.stmtRow}><Text style={styles.stmtLabel}>Account</Text><Text style={styles.stmtValue}>{statement.accountName || stmtTitle}</Text></View>
                  <View style={styles.stmtRow}><Text style={styles.stmtLabel}>Opening Balance</Text><Text style={styles.stmtValue}>{formatCurrency(statement.openingBalance || 0, statement.currency)}</Text></View>
                  <View style={styles.stmtRow}><Text style={styles.stmtLabel}>Money In (Debits)</Text><Text style={[styles.stmtValue, { color: '#39D9B0' }]}>+{formatCurrency(statement.totalDebit || 0, statement.currency)}</Text></View>
                  <View style={styles.stmtRow}><Text style={styles.stmtLabel}>Money Out (Credits)</Text><Text style={[styles.stmtValue, { color: '#FF6B81' }]}>-{formatCurrency(statement.totalCredit || 0, statement.currency)}</Text></View>
                  <View style={styles.stmtRow}><Text style={styles.stmtLabel}>Net Movement</Text><Text style={[styles.stmtValue, { color: (statement.netMovement || 0) >= 0 ? '#39D9B0' : '#FF6B81' }]}>{formatCurrency(statement.netMovement || 0, statement.currency)}</Text></View>
                  <View style={[styles.stmtRow, { borderBottomWidth: 0 }]}><Text style={[styles.stmtLabel, { fontWeight: fontWeight.bold }]}>Closing Balance</Text><Text style={[styles.stmtValue, { fontWeight: fontWeight.extrabold, color: (statement.closingBalance || 0) < 0 ? "#FF6B81" : colors.text }]}>{formatCurrency(statement.closingBalance || 0, statement.currency)}</Text></View>
                </View>
                <SectionHeader title={`Transactions (${(statement.transactions || []).length})`} />
                {(statement.transactions || []).length === 0 ? (
                  <Text style={styles.loadingText}>No transactions in this period</Text>
                ) : (statement.transactions || []).slice(0, 30).map((t: any, i: number) => (
                  <TouchableOpacity key={i} style={styles.txnRow} onPress={() => setViewStmtTxn(t)} activeOpacity={0.7}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txnDesc} numberOfLines={1}>{t.description}</Text>
                      <Text style={styles.txnDate}>{t.relatedAccount?.accountName ? `${t.relatedAccount.accountName} · ` : ''}{t.thisAccountAction || ''} · {formatDate(t.date || t.transactionDate || t.createdAt)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.txnAmt, { color: t.debit ? '#39D9B0' : '#FF6B81' }]}>
                        {t.debit ? `+${formatCurrency(t.debit, t.currency)}` : `-${formatCurrency(t.credit || t.amount || 0, t.currency)}`}
                      </Text>
                      <Text style={styles.txnBal}>Bal: {formatCurrency(t.balanceAfter ?? 0, t.currency)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>)}
            </>)}

        {/* Transaction Detail Overlay */}
        <Modal visible={!!viewStmtTxn} transparent animationType="fade" onRequestClose={() => setViewStmtTxn(null)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg }} activeOpacity={1} onPress={() => setViewStmtTxn(null)}>
            <TouchableOpacity activeOpacity={1} style={{ backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, maxHeight: '80%' }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
                  <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>Transaction Detail</Text>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear" onPress={() => setViewStmtTxn(null)}><Ionicons name="close-circle" size={22} color={colors.textTertiary} /></TouchableOpacity>
                </View>
                {viewStmtTxn && (<>
                  <View style={styles.stmtRow}><Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Code</Text><Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text }}>{viewStmtTxn.transactionCode || '—'}</Text></View>
                  <View style={styles.stmtRow}><Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Description</Text><Text style={{ fontSize: fontSize.sm, color: colors.text }} numberOfLines={2}>{viewStmtTxn.description}</Text></View>
                  <View style={styles.stmtRow}><Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Action</Text><Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: viewStmtTxn.debit ? '#39D9B0' : '#FF6B81' }}>{viewStmtTxn.thisAccountAction || '—'}</Text></View>
                  <View style={styles.stmtRow}><Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Amount</Text><Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text }}>{formatCurrency(viewStmtTxn.amount || 0, viewStmtTxn.currency)}</Text></View>
                  <View style={styles.stmtRow}><Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Balance Before</Text><Text style={{ fontSize: fontSize.sm, color: colors.text }}>{formatCurrency(viewStmtTxn.balanceBefore ?? 0, viewStmtTxn.currency)}</Text></View>
                  <View style={styles.stmtRow}><Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Balance After</Text><Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text }}>{formatCurrency(viewStmtTxn.balanceAfter ?? 0, viewStmtTxn.currency)}</Text></View>
                  {viewStmtTxn.reference ? <View style={styles.stmtRow}><Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Reference</Text><Text style={{ fontSize: fontSize.sm, color: colors.text }}>{viewStmtTxn.reference}</Text></View> : null}
                  {viewStmtTxn.relatedAccount && (<>
                    <View style={{ height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.md }} />
                    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.primary, marginBottom: spacing.sm }}>Related Account</Text>
                    <View style={styles.stmtRow}><Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Name</Text><Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>{viewStmtTxn.relatedAccount.accountName || '—'}</Text></View>
                    <View style={styles.stmtRow}><Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Type</Text><Text style={{ fontSize: fontSize.sm, color: colors.text }}>{getAccountTypeLabel(viewStmtTxn.relatedAccount.accountType)}</Text></View>
                    <View style={styles.stmtRow}><Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Action</Text><Text style={{ fontSize: fontSize.sm, color: colors.text }}>{viewStmtTxn.relatedAccount.action || '—'}</Text></View>
                    {viewStmtTxn.relatedAccount.amount != null && <View style={styles.stmtRow}><Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Amount</Text><Text style={{ fontSize: fontSize.sm, color: colors.text }}>{formatCurrency(viewStmtTxn.relatedAccount.amount, viewStmtTxn.relatedAccount.currency ?? viewStmtTxn.currency)}</Text></View>}
                  </>)}
                </>)}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </ModalSheet>

      {/* Edit Bank/M-Pesa Modal */}
      <ModalSheet visible={editModal !== 'none'} onClose={() => setEditModal('none')}
        title={editModal === 'bank' ? 'Edit Bank Account' : 'Edit Mobile Money Agent'}
        icon={editModal === 'bank' ? 'business-outline' : 'phone-portrait-outline'}
        iconColor={editModal === 'bank' ? '#2563EB' : '#059669'}
        iconBg={editModal === 'bank' ? 'rgba(91,156,255,0.12)' : 'rgba(57,217,176,0.12)'}>
        {editModal === 'bank' && (<>
          <FormSection label="Bank Details">
            <Input label="Bank Name" value={editBankName} onChangeText={setEditBankName} icon="business-outline" placeholder="Bank name" />
            <Input label="Account Name" value={editAccName} onChangeText={setEditAccName} icon="card-outline" placeholder="Account name" />
            <Input label="Branch Code" value={editBranch} onChangeText={setEditBranch} icon="git-branch-outline" placeholder="Branch code" />
          </FormSection>
          <ActionBtn title="Update Bank Account" onPress={handleEditBank} loading={formLoading} icon="checkmark-circle-outline" gradient={['#2563EB', '#3B82F6']} />
        </>)}
        {editModal === 'mpesa' && (<>
          <FormSection label="Agent Details">
            <Input label="Agent Name" value={editAgentName} onChangeText={setEditAgentName} icon="person-outline" placeholder="Agent name" />
            <Input label="Store Number" value={editStore} onChangeText={setEditStore} icon="storefront-outline" placeholder="Store number" />
          </FormSection>
          <ActionBtn title="Update Mobile Money Agent" onPress={handleEditMpesa} loading={formLoading} icon="checkmark-circle-outline" gradient={['#059669', '#10B981']} />
        </>)}
      </ModalSheet>

      {/* Create Cash Account Modal */}
      <ModalSheet visible={showCreateCash} onClose={() => setShowCreateCash(false)} title="New Cash Account" icon="cash-outline" iconColor="#D97706" iconBg="rgba(246,180,94,0.12)">
        <FormSection label="Currency">
          <ChipGroup options={currencyChips(allowedCurrenciesFor(base))} selected={cashCurrency} onSelect={setCashCurrency} />
        </FormSection>
        <FormSection label="Opening Balance">
          <Input label="" value={cashOpenBal} onChangeText={setCashOpenBal} keyboardType="numeric" icon="cash-outline" placeholder="0.00" />
        </FormSection>
        <ActionBtn title="Create Cash Account" onPress={handleCreateCash} loading={formLoading} icon="checkmark-circle-outline" gradient={['#D97706', '#F59E0B']} />
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.md, gap: 4 },
  addBtnText: { color: '#FFF', fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  tabRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.md, backgroundColor: colors.surfaceAlt, gap: 4 },
  tabActive: { backgroundColor: colors.infoLight },
  tabText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  tabTextActive: { color: colors.primary },
  accCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm },
  accIcon: { width: 44, height: 44, borderRadius: borderRadius.sm, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  accInfo: { flex: 1 },
  accName: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  accMeta: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  accBalance: { fontSize: fontSize.md, fontWeight: fontWeight.extrabold, color: colors.text, marginRight: spacing.sm },
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, flex: 1 },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: 'transparent' },
  chipActive: { backgroundColor: colors.infoLight, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: fontWeight.bold },
  loadingText: { textAlign: 'center', color: colors.textSecondary, paddingVertical: spacing.xl },
  stmtSummary: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  stmtRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  stmtLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  stmtValue: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text },
  txnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  txnDesc: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text },
  txnDate: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  txnAmt: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  txnBal: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
});
