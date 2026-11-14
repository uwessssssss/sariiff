import { parseAmount, anyBadAmount } from "../../utils/amount";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Animated, Modal, ScrollView, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../../components/toastConfig';
import { useAuth } from '../../hooks/useAuth';
import * as api from '../../services/api';
import { shareViaWhatsApp, buildCredentialMessage, buildPasswordResetMessage } from '../../utils/notifications';
import { ClientDto, ClientType, formatCurrency, Currency, formatDate, getAccountTypeLabel, currencyCode, CURRENCY_COLOR, allowedCurrenciesFor } from '../../types';
import { useBaseCurrency } from '../../hooks/useBaseCurrency';
import { Button, Input, EmptyState, LoadingScreen, ModalSheet, ActionBtn, InfoRow, SummaryCard, SummaryGrid } from '../../components/ui';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';

type ViewMode = 'list' | 'detail' | 'create';

export default function ClientsScreen() {
  const { base } = useBaseCurrency(); // statements open in the home currency
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Detail/Edit
  const [selectedClient, setSelectedClient] = useState<ClientDto | null>(null);
  const [statement, setStatement] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [alertRules, setAlertRules] = useState<any[]>([]);
  const [alertCurrency, setAlertCurrency] = useState(0);
  const [alertThreshold, setAlertThreshold] = useState('');
  const [stmtCurrency, setStmtCurrency] = useState<number>(Currency.KES);
  const [viewStmtTxn, setViewStmtTxn] = useState<any>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [pinError, setPinError] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);
  const pinRefs = [useRef<any>(null), useRef<any>(null), useRef<any>(null), useRef<any>(null)];
  const [pendingReverseTxnId, setPendingReverseTxnId] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editIdPassport, setEditIdPassport] = useState('');
  const [resetPw, setResetPw] = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [idPassport, setIdPassport] = useState('');
  const [clientType, setClientType] = useState(ClientType.Permanent);
  const [openingKES, setOpeningKES] = useState('');
  const [openingUSD, setOpeningUSD] = useState('');
  const [openingHome, setOpeningHome] = useState(''); // UGX etc. when that's the home currency
  const [password, setPassword] = useState('');

  const headerAnim = useRef(new Animated.Value(0)).current;

  const loadClients = useCallback(async (p = 1, searchTerm = '') => {
    try {
      const res = await api.getClients(p, 25, searchTerm);
      if (res.success && res.data) {
        setClients(prev => p === 1 ? (res.data.items || []) : [...prev, ...(res.data.items || [])]);
        setTotalPages(res.data.totalPages); setPage(p);
      }
    } catch {}
  }, []);

  useEffect(() => {
    (async () => { await loadClients(); setLoading(false);
      Animated.spring(headerAnim, { toValue: 1, tension: 50, friction: 9, useNativeDriver: true }).start();
    })();
  }, []);

  const onRefresh = async () => { setRefreshing(true); await loadClients(1, search); setRefreshing(false); };

  const loadAlerts = async (clientId?: string) => {
    try { const res = await api.getBalanceAlerts(clientId); if (res.success) setAlertRules(res.data || []); } catch {}
  };
  const openAlerts = async () => {
    if (!selectedClient) return;
    await loadAlerts(selectedClient.id); setAlertThreshold(''); setShowAlerts(true);
  };
  const createAlert = async () => {
    if (!selectedClient || !alertThreshold) { Toast.show({ type: 'error', text1: 'Enter threshold amount' }); return; }
    if (anyBadAmount(alertThreshold) || !(parseAmount(alertThreshold) > 0)) { Toast.show({ type: 'error', text1: 'Amount not understood', text2: 'Type digits only, e.g. 1500 or 1,500.50' }); return; }
    const res = await api.createBalanceAlert({ clientId: selectedClient.id, currency: alertCurrency, direction: 0, threshold: parseAmount(alertThreshold) });
    if (res.success) { Toast.show({ type: 'success', text1: 'Alert created' }); setAlertThreshold(''); await loadAlerts(selectedClient.id); }
    else Toast.show({ type: 'error', text1: res.message });
  };
  const deleteAlert = async (id: string) => {
    Alert.alert('Delete Alert', 'Remove this alert rule?', [{ text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const prev = alertRules;
        setAlertRules(l => l.filter(r => r.id !== id)); // optimistic
        const res = await api.deleteBalanceAlert(id);
        if (res.success) { if (selectedClient) await loadAlerts(selectedClient.id); }
        else { setAlertRules(prev); Toast.show({ type: 'error', text1: 'Failed', text2: res.message }); }
      } }]);
  };

  // Only the latest statement request may fill the sheet: on a slow line, client A's answer
  // (or the KES one, after tapping USD) could land after client B's and show the wrong account.
  const stmtSeq = useRef(0);
  const openClientDetail = async (client: ClientDto) => {
    const seq = ++stmtSeq.current;
    setSelectedClient(client);
    setShowDetail(true);
    setStmtCurrency(base);
    setStatement(null);
    try {
      const res = await api.getClientStatement(client.id, undefined, undefined, base);
      if (res.success && seq === stmtSeq.current) setStatement(res.data);
    } catch {}
  };

  const loadStatementCurrency = async (cur: number) => {
    if (!selectedClient) return;
    const seq = ++stmtSeq.current;
    setStmtCurrency(cur);
    setStatement(null);
    try {
      const res = await api.getClientStatement(selectedClient.id, undefined, undefined, cur);
      if (res.success && seq === stmtSeq.current) setStatement(res.data);
    } catch {}
  };

  const showTxnDetail = (t: any) => {
    setViewStmtTxn(t);
  };

  const handleCreate = async () => {
    if (!fullName.trim() || !phone.trim()) {
      Toast.show({ type: 'error', text1: 'Required', text2: 'Name and phone are required' }); return;
    }
    if (anyBadAmount(openingKES, openingUSD, openingHome)) { Toast.show({ type: 'error', text1: 'Amount not understood', text2: 'Type digits only, e.g. 1500 or 1,500.50' }); return; }
    setFormLoading(true);
    try {
      const res = await api.createClient({
        fullName, whatsAppNumber: phone, email: email || undefined,
        idPassport: idPassport || undefined, clientType,
        openingBalanceKES: parseAmount(openingKES) || 0,
        openingBalanceUSD: parseAmount(openingUSD) || 0,
        openingBalanceHome: parseAmount(openingHome) || 0,
        password: password || undefined,
      });
      if (res.success) {
        const code = res.data?.code || '';
        Toast.show({ type: 'success', text1: 'Client created', text2: code });
        setShowCreate(false); resetForm(); loadClients(1);
        // Offer to share credentials via WhatsApp
        if (phone && password && clientType === ClientType.Permanent) {
          setTimeout(() => Alert.alert('Share Credentials?', `Send login details to ${fullName} via WhatsApp?`, [
            { text: 'Skip', style: 'cancel' },
            { text: 'Share via WhatsApp', onPress: () => shareViaWhatsApp(phone, buildCredentialMessage({ role: 'client', fullName, code, password, companyName: user?.companyName })) },
          ]), 500);
        }
      } else { Toast.show({ type: 'error', text1: 'Failed', text2: res.message }); }
    } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.message }); }
    setFormLoading(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Client', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const prev = clients;
        setClients(list => list.filter(c => c.id !== id)); // optimistic
        setShowDetail(false);
        const res = await api.deleteClient(id);
        if (res.success) { Toast.show({ type: 'success', text1: 'Client deleted' }); loadClients(1); }
        else { setClients(prev); Toast.show({ type: 'error', text1: 'Failed', text2: res.message }); }
      }},
    ]);
  };

  const openEdit = () => {
    if (!selectedClient) return;
    setEditName(selectedClient.fullName); setEditPhone(selectedClient.whatsAppNumber);
    setEditEmail(selectedClient.email || ''); setEditIdPassport(selectedClient.idPassport || '');
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    if (!selectedClient || !editName.trim()) { Toast.show({ type: 'error', text1: 'Name required' }); return; }
    setFormLoading(true);
    const res = await api.updateClient(selectedClient.id, { fullName: editName, whatsAppNumber: editPhone, email: editEmail || undefined, idPassport: editIdPassport || undefined });
    if (res.success) { Toast.show({ type: 'success', text1: 'Client updated' }); setShowEdit(false); setShowDetail(false); loadClients(1); }
    else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
    setFormLoading(false);
  };

  const [showResetPw, setShowResetPw] = useState(false);
  // The same sheet asks for the password when a walk-in client is made permanent.
  const [pwForConvert, setPwForConvert] = useState(false);

  const handleResetPassword = () => {
    if (!selectedClient) return;
    setPwForConvert(false);
    setResetPw('');
    setShowResetPw(true);
  };

  const submitResetPassword = async () => {
    if (!selectedClient || !resetPw || resetPw.length < 8) {
      Toast.show({ type: 'error', text1: 'Password must be at least 8 characters' }); return;
    }
    setFormLoading(true);
    try {
      const res = pwForConvert
        ? await api.convertClientToPermanent(selectedClient.id, resetPw)
        : await api.resetClientPassword(selectedClient.id, resetPw);
      if (res.success && pwForConvert) {
        Toast.show({ type: 'success', text1: 'Converted to permanent' });
        setShowResetPw(false); setShowDetail(false); loadClients(1);
        if (selectedClient?.whatsAppNumber) {
          const pw = resetPw;
          setTimeout(() => Alert.alert('Share Login Details?', `Send the login details to ${selectedClient.fullName} via WhatsApp?`, [
            { text: 'Skip', style: 'cancel' },
            { text: 'Share via WhatsApp', onPress: () => shareViaWhatsApp(selectedClient.whatsAppNumber, buildCredentialMessage({ role: 'client', fullName: selectedClient.fullName, code: selectedClient.code, password: pw, companyName: user?.companyName })) },
          ]), 500);
        }
        setResetPw('');
      } else if (res.success) {
        Toast.show({ type: 'success', text1: 'Password reset successfully' });
        setShowResetPw(false);
        // Share new password via WhatsApp
        if (selectedClient?.whatsAppNumber) {
          setTimeout(() => Alert.alert('Share New Password?', `Send the new password to ${selectedClient.fullName} via WhatsApp?`, [
            { text: 'Skip', style: 'cancel' },
            { text: 'Share via WhatsApp', onPress: () => shareViaWhatsApp(selectedClient.whatsAppNumber, buildPasswordResetMessage({ fullName: selectedClient.fullName, code: selectedClient.code, newPassword: resetPw })) },
          ]), 500);
        }
        setResetPw('');
      }
      else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
    } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.message }); }
    setFormLoading(false);
  };

  // Staff choose the client's first password. It used to be "Change@123" for EVERY converted
  // client: anyone knowing a client's code and phone number could sign in as them.
  const handleConvert = () => {
    if (!selectedClient || selectedClient.clientType !== ClientType.WalkIn) return;
    setPwForConvert(true);
    setResetPw('');
    setShowResetPw(true);
  };

  const handleReverseTxn = async (txnId: string) => {
    if (!selectedClient) return;
    try {
      const status = await api.getTransactionPinStatus();
      if (status.success && status.data?.isEnabled && status.data?.hasPin) {
        setPendingReverseTxnId(txnId);
        setPinDigits(['', '', '', '']); setPinError(''); setPinVerifying(false);
        setShowPinModal(true);
        setTimeout(() => pinRefs[0].current?.focus(), 200);
        return;
      }
    } catch {}
    confirmReverseTxn(txnId);
  };

  const confirmReverseTxn = (txnId: string) => {
    if (!selectedClient) return;
    Alert.alert('Reverse Transaction', 'This will create a reversal entry.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reverse', style: 'destructive', onPress: async () => {
        const res = await api.reverseClientTransaction(selectedClient.id, txnId, 'Reversed from mobile');
        if (res.success) { Toast.show({ type: 'success', text1: 'Transaction reversed' }); openClientDetail(selectedClient); }
        else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
      }},
    ]);
  };

  const handlePinDigit = async (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const arr = [...pinDigits]; arr[index] = value; setPinDigits(arr); setPinError('');
    if (value && index < 3) { pinRefs[index + 1].current?.focus(); }
    if (value && index === 3 && arr.every(d => d)) {
      setPinVerifying(true);
      try {
        const res = await api.verifyTransactionPinBackend(arr.join(''));
        if (res.success) { setShowPinModal(false); confirmReverseTxn(pendingReverseTxnId); setPendingReverseTxnId(''); }
        else { setPinError(res.message || 'Incorrect PIN'); setPinDigits(['', '', '', '']); setTimeout(() => pinRefs[0].current?.focus(), 100); }
      } catch { setPinError('Failed to verify'); setPinDigits(['', '', '', '']); setTimeout(() => pinRefs[0].current?.focus(), 100); }
      setPinVerifying(false);
    }
  };

  const handlePinKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !pinDigits[index] && index > 0) { pinRefs[index - 1].current?.focus(); }
  };

  const resetForm = () => { setFullName(''); setPhone(''); setEmail(''); setIdPassport(''); setOpeningKES(''); setOpeningUSD(''); setOpeningHome(''); setPassword(''); };

  if (loading) return <LoadingScreen message="Loading clients..." />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Clients</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)}>
          <LinearGradient colors={colors.gradients.primary} style={styles.addBtn} start={{x:0,y:0}} end={{x:1,y:0}}>
            <Ionicons name="person-add" size={18} color="#FFF" /><Text style={styles.addBtnText}>Add</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search clients..."
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={(t) => { setSearch(t); loadClients(1, t); }}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear" onPress={() => { setSearch(''); loadClients(1, ''); }}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList data={clients} keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={() => page < totalPages && loadClients(page + 1, search)}
        ListEmptyComponent={<EmptyState icon="people-outline" title="No clients found" />}
        renderItem={({ item }) => {
          return (
          <TouchableOpacity style={[styles.clientCard, shadows.sm]} onPress={() => openClientDetail(item)} activeOpacity={0.7}>
            <View style={[styles.avatar, { backgroundColor: item.clientType === ClientType.WalkIn ? 'rgba(246,180,94,0.12)' : 'rgba(91,156,255,0.12)' }]}>
              <Text style={[styles.avatarText, { color: item.clientType === ClientType.WalkIn ? '#F6B45E' : '#7FB3FF' }]}>
                {item.fullName.charAt(0)}
              </Text>
            </View>
            <View style={styles.clientInfo}>
              <Text style={styles.clientName}>{item.fullName}</Text>
              <Text style={styles.clientMeta}>{item.code} · {item.whatsAppNumber}</Text>
            </View>
            <View style={styles.clientBalances}>
              <Text style={[styles.balKES, { color: (item.balanceKES || 0) < 0 ? '#FF6B81' : (item.balanceKES || 0) > 0 ? '#39D9B0' : colors.textTertiary }]}>{formatCurrency(item.balanceKES, Currency.KES)}</Text>
              <Text style={[styles.balUSD, { color: (item.balanceUSD || 0) < 0 ? '#FF6B81' : (item.balanceUSD || 0) > 0 ? '#3B82F6' : colors.textTertiary }]}>{formatCurrency(item.balanceUSD, Currency.USD)}</Text>
              {(item.otherBalances || []).filter((b: any) => b.balance).map((b: any) => (
                <Text key={b.currency} style={[styles.balUSD, { color: b.balance < 0 ? '#FF6B81' : CURRENCY_COLOR[b.currency] || colors.textSecondary }]}>
                  {formatCurrency(b.balance, b.currency)}
                </Text>
              ))}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
          );
        }}
      />

      {/* Client Detail Modal */}
      <ModalSheet visible={showDetail} onClose={() => { setShowDetail(false); setStatement(null); }}
        title={selectedClient?.fullName || 'Client'} icon="person-outline" iconColor={colors.primary} iconBg="rgba(91,156,255,0.14)">
        {selectedClient && (<>
          {/* Balances (Nov 2026): the bureau's home currency first, then any other currency the
              client holds; KES/USD at zero are left out in a Ugandan bureau. Same cards as home. */}
          {(() => {
            const all = [
              { currency: Currency.KES, balance: selectedClient.balanceKES || 0 },
              { currency: Currency.USD, balance: selectedClient.balanceUSD || 0 },
              ...(selectedClient.otherBalances || []).map((b) => ({ currency: b.currency, balance: b.balance || 0 })),
            ];
            const rows = all
              .filter((r) => r.currency === base || r.balance)
              .sort((a, b) => (a.currency === base ? -1 : b.currency === base ? 1 : Math.abs(b.balance) - Math.abs(a.balance)));
            return (
              <SummaryGrid style={{ marginBottom: 16 }}>
                {rows.map((r) => (
                  <SummaryCard
                    key={r.currency}
                    tone={r.balance < 0 ? 'out' : r.balance > 0 ? 'in' : 'neutral'}
                    icon={r.currency === Currency.USD ? 'logo-usd' : 'cash-outline'}
                    label={`Balance · ${currencyCode(r.currency)}`}
                    value={formatCurrency(r.balance, r.currency)}
                    valueColor={r.balance < 0 ? colors.danger : undefined}
                    caption={r.balance < 0 ? 'Owes the bureau' : r.balance > 0 ? 'Bureau holds for client' : 'Settled'}
                  />
                ))}
              </SummaryGrid>
            );
          })()}

          {/* Client Info */}
          <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <InfoRow label="Code" value={selectedClient.code} />
            <InfoRow label="Phone" value={selectedClient.whatsAppNumber} />
            <InfoRow label="Email" value={selectedClient.email || '—'} />
            <InfoRow label="ID/Passport" value={selectedClient.idPassport || '—'} />
            <InfoRow label="Type" value={selectedClient.clientType === ClientType.WalkIn ? 'Walk-In' : 'Permanent'} />
            <InfoRow label="Status" value={selectedClient.isActive ? 'Active' : 'Inactive'} valueColor={selectedClient.isActive ? '#059669' : '#DC2626'} />
            <InfoRow label="Created" value={formatDate(selectedClient.createdAt)} />
          </View>

          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(91,156,255,0.12)', paddingVertical: 12, borderRadius: 12 }} onPress={openEdit}>
              <Ionicons name="create-outline" size={16} color="#2563EB" /><Text style={{ color: '#7FB3FF', fontWeight: '600' as any, fontSize: 13 }}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(246,180,94,0.12)', paddingVertical: 12, borderRadius: 12 }} onPress={handleResetPassword}>
              <Ionicons name="key-outline" size={16} color="#D97706" /><Text style={{ color: '#F6B45E', fontWeight: '600' as any, fontSize: 13 }}>Reset PW</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(91,156,255,0.12)', paddingVertical: 12, borderRadius: 12 }} onPress={openAlerts}>
              <Ionicons name="notifications-outline" size={16} color="#4F46E5" /><Text style={{ color: '#4F46E5', fontWeight: '600' as any, fontSize: 13 }}>Alerts</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,107,129,0.12)', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 }} onPress={() => selectedClient && handleDelete(selectedClient.id)}>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
            </TouchableOpacity>
          </View>
          {selectedClient.phoneLoginLinked && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
              <Ionicons name="phone-portrait-outline" size={18} color={colors.textTertiary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600' as any, fontSize: 13 }}>Phone login: linked</Text>
                <Text style={{ color: colors.textTertiary, fontSize: 12 }}>Unlink if the phone is lost. Balances stay.</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Unlink phone login"
                onPress={() =>
                  Alert.alert('Unlink phone login?', `${selectedClient.fullName} can still sign in with code and password.`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Unlink',
                      style: 'destructive',
                      onPress: async () => {
                        const r = await api.unlinkClientPhoneLogin(selectedClient.id);
                        if (!r.success) { Toast.show({ type: 'error', text1: "Couldn't unlink", text2: r.message }); return; }
                        Toast.show({ type: 'success', text1: 'Phone login unlinked' });
                        setSelectedClient({ ...selectedClient, phoneLoginLinked: false });
                      },
                    },
                  ])
                }
              >
                <Text style={{ color: colors.danger, fontWeight: '600' as any, fontSize: 13 }}>Unlink</Text>
              </TouchableOpacity>
            </View>
          )}
          {selectedClient.clientType === ClientType.WalkIn && (
            <ActionBtn title="Convert to Permanent" onPress={handleConvert} icon="arrow-up-circle-outline" gradient={['#059669', '#10B981']} />
          )}
                {/* Edit Form (inline) */}
                {showEdit && (
                  <View style={[styles.infoCard, shadows.sm, { marginTop: spacing.md }]}>
                    <Text style={styles.sectionTitle}>Edit Client</Text>
                    <Input label="Full Name *" value={editName} onChangeText={setEditName} icon="person-outline" />
                    <Input label="Phone" value={editPhone} onChangeText={setEditPhone} icon="call-outline" keyboardType="phone-pad" />
                    <Input label="Email" value={editEmail} onChangeText={setEditEmail} icon="mail-outline" keyboardType="email-address" />
                    <Input label="ID/Passport" value={editIdPassport} onChangeText={setEditIdPassport} icon="card-outline" />
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <View style={{ flex: 1 }}><Button title="Save" onPress={handleUpdate} loading={formLoading} icon="checkmark-circle-outline" /></View>
                      <View style={{ flex: 1 }}><Button title="Cancel" onPress={() => setShowEdit(false)} variant="outline" /></View>
                    </View>
                  </View>
                )}
                {/* Statement Currency Tabs */}
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, marginTop: spacing.sm }}>
                  {[Currency.KES, Currency.USD, ...(selectedClient?.otherBalances || []).map((b) => b.currency)].map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.chip, stmtCurrency === c && { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: CURRENCY_COLOR[c] || '#475569' }]}
                      onPress={() => loadStatementCurrency(c)}
                    >
                      <Text style={[styles.chipText, stmtCurrency === c && { color: CURRENCY_COLOR[c] || '#475569', fontWeight: '700' as any }]}>{currencyCode(c)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {statement && (
                  <View style={[styles.stmtSummary, shadows.sm]}>
                    <View style={styles.infoRow}><Text style={styles.infoLabel}>Opening Balance</Text><Text style={styles.infoValue}>{formatCurrency(statement.openingBalance || 0, stmtCurrency)}</Text></View>
                    <View style={styles.infoRow}><Text style={styles.infoLabel}>Total Credits</Text><Text style={[styles.infoValue, { color: '#39D9B0' }]}>+{formatCurrency(statement.totalCredits || statement.totalCredit || 0, stmtCurrency)}</Text></View>
                    <View style={styles.infoRow}><Text style={styles.infoLabel}>Total Debits</Text><Text style={[styles.infoValue, { color: '#FF6B81' }]}>-{formatCurrency(statement.totalDebits || statement.totalDebit || 0, stmtCurrency)}</Text></View>
                    <View style={styles.infoRow}><Text style={[styles.infoLabel, { fontWeight: fontWeight.bold }]}>Closing Balance</Text><Text style={[styles.infoValue, { fontWeight: fontWeight.extrabold as any, color: (statement.closingBalance || 0) < 0 ? '#FF6B81' : (statement.closingBalance || 0) > 0 ? '#39D9B0' : colors.text }]}>{formatCurrency(statement.closingBalance || 0, stmtCurrency)}</Text></View>
                  </View>
                )}
                <Text style={styles.sectionTitle}>Transactions ({currencyCode(stmtCurrency)})</Text>
                {(statement?.transactions || []).length > 0 ? statement.transactions.slice(0, 30).map((t: any, i: number) => (
                  <TouchableOpacity key={i} style={styles.stmtRow} onPress={() => showTxnDetail(t)} onLongPress={() => t.transactionId && handleReverseTxn(t.transactionId)} activeOpacity={0.7}>
                    <View style={styles.stmtLeft}>
                      <Text style={styles.stmtDesc} numberOfLines={1}>{t.description}</Text>
                      <Text style={styles.stmtDate}>{t.relatedAccount?.accountName ? `${t.relatedAccount.accountName} · ` : ''}{formatDate(t.date || t.transactionDate)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.stmtAmount, { color: t.credit ? '#39D9B0' : '#FF6B81' }]}>
                        {t.credit ? `+${formatCurrency(t.credit, stmtCurrency)}` : `-${formatCurrency(t.debit || t.amount, stmtCurrency)}`}
                      </Text>
                      {t.balanceAfter !== undefined && <Text style={styles.stmtBal}>Bal: {formatCurrency(t.balanceAfter, stmtCurrency)}</Text>}
                    </View>
                  </TouchableOpacity>
                )) : <Text style={styles.noData}>{statement ? 'No transactions' : 'Loading...'}</Text>}
              </>
            )}

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
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>Code</Text><Text style={styles.infoValue}>{viewStmtTxn.transactionCode || '—'}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>Description</Text><Text style={styles.infoValue} numberOfLines={2}>{viewStmtTxn.description}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>Action</Text><Text style={[styles.infoValue, { color: viewStmtTxn.credit ? '#39D9B0' : '#FF6B81' }]}>{viewStmtTxn.thisAccountAction || (viewStmtTxn.credit ? 'Credit' : 'Debit')}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>Amount</Text><Text style={[styles.infoValue, { fontWeight: fontWeight.bold }]}>{formatCurrency(viewStmtTxn.amount || viewStmtTxn.credit || viewStmtTxn.debit || 0, stmtCurrency)}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>Balance Before</Text><Text style={styles.infoValue}>{formatCurrency(viewStmtTxn.balanceBefore ?? 0, stmtCurrency)}</Text></View>
                  <View style={styles.infoRow}><Text style={styles.infoLabel}>Balance After</Text><Text style={[styles.infoValue, { fontWeight: fontWeight.bold }]}>{formatCurrency(viewStmtTxn.balanceAfter ?? 0, stmtCurrency)}</Text></View>
                  {viewStmtTxn.reference ? <View style={styles.infoRow}><Text style={styles.infoLabel}>Reference</Text><Text style={styles.infoValue}>{viewStmtTxn.reference}</Text></View> : null}
                  {viewStmtTxn.notes ? <View style={styles.infoRow}><Text style={styles.infoLabel}>Notes</Text><Text style={styles.infoValue} numberOfLines={3}>{viewStmtTxn.notes}</Text></View> : null}
                  {viewStmtTxn.relatedAccount && (<>
                    <View style={{ height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.md }} />
                    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.primary, marginBottom: spacing.sm }}>Related Account</Text>
                    <View style={styles.infoRow}><Text style={styles.infoLabel}>Name</Text><Text style={styles.infoValue}>{viewStmtTxn.relatedAccount.accountName || '—'}</Text></View>
                    <View style={styles.infoRow}><Text style={styles.infoLabel}>Type</Text><Text style={styles.infoValue}>{getAccountTypeLabel(viewStmtTxn.relatedAccount.accountType)}</Text></View>
                    <View style={styles.infoRow}><Text style={styles.infoLabel}>Action</Text><Text style={styles.infoValue}>{viewStmtTxn.relatedAccount.action || '—'}</Text></View>
                    {viewStmtTxn.relatedAccount.amount != null && <View style={styles.infoRow}><Text style={styles.infoLabel}>Amount</Text><Text style={styles.infoValue}>{formatCurrency(viewStmtTxn.relatedAccount.amount, viewStmtTxn.relatedAccount.currency ?? stmtCurrency)}</Text></View>}
                  </>)}
                </>)}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
        {/* Reset Password Modal */}
        <Modal visible={showResetPw} transparent animationType="fade" onRequestClose={() => setShowResetPw(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg }} activeOpacity={1} onPress={() => setShowResetPw(false)}>
            <TouchableOpacity activeOpacity={1} style={{ backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm }}>{pwForConvert ? 'Make Permanent' : 'Reset Password'}</Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg }}>{pwForConvert ? `Choose a sign-in password for ${selectedClient?.fullName}` : `Enter a new password for ${selectedClient?.fullName}`}</Text>
              <Input label="New Password *" value={resetPw} onChangeText={setResetPw} icon="lock-closed-outline" placeholder="Minimum 8 characters" secureTextEntry />
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}><Button title={pwForConvert ? 'Make Permanent' : 'Reset Password'} onPress={submitResetPassword} loading={formLoading} icon="key-outline" /></View>
                <View style={{ flex: 1 }}><Button title="Cancel" onPress={() => setShowResetPw(false)} variant="outline" /></View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        {showResetPw && (
          <Toast config={toastConfig} position="top" topOffset={insets.top + 12} />
        )}
      
      </Modal>
      </ModalSheet>

      {/* Create Client Modal */}
      <ModalSheet visible={showCreate} onClose={() => setShowCreate(false)} title="New Client" icon="person-add-outline" iconColor="#059669" iconBg="rgba(57,217,176,0.12)">
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            <Input label="Full Name *" value={fullName} onChangeText={setFullName} icon="person-outline" placeholder="Client name" />
            <Input label="WhatsApp Number *" value={phone} onChangeText={setPhone} icon="call-outline" placeholder={base === 2 ? "+256..." : "+254..."} keyboardType="phone-pad" />
            <Input label="Email" value={email} onChangeText={setEmail} icon="mail-outline" placeholder="email@example.com" keyboardType="email-address" />
            <Input label="ID/Passport" value={idPassport} onChangeText={setIdPassport} icon="card-outline" placeholder="ID number" />
            <Text style={styles.fieldLabel}>Client Type</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity style={[styles.chip, clientType === ClientType.Permanent && styles.chipActive]} onPress={() => setClientType(ClientType.Permanent)}>
                <Text style={[styles.chipText, clientType === ClientType.Permanent && styles.chipTextActive]}>Permanent</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.chip, clientType === ClientType.WalkIn && styles.chipActive]} onPress={() => setClientType(ClientType.WalkIn)}>
                <Text style={[styles.chipText, clientType === ClientType.WalkIn && styles.chipTextActive]}>Walk-In</Text>
              </TouchableOpacity>
            </View>
            {base !== Currency.KES && base !== Currency.USD && (
              <Input label={`Opening Balance ${currencyCode(base)}`} value={openingHome} onChangeText={setOpeningHome} keyboardType="numeric" icon="cash-outline" placeholder="0.00" />
            )}
            <Input label="Opening Balance KES" value={openingKES} onChangeText={setOpeningKES} keyboardType="numeric" icon="cash-outline" placeholder="0.00" />
            <Input label="Opening Balance USD" value={openingUSD} onChangeText={setOpeningUSD} keyboardType="numeric" icon="logo-usd" placeholder="0.00" />
            {clientType === ClientType.Permanent && (
              <Input label="Password (for login)" value={password} onChangeText={setPassword} icon="lock-closed-outline" placeholder="Min 8 characters" secureTextEntry />
            )}
            <Button title="Create Client" onPress={handleCreate} loading={formLoading} icon="person-add-outline" size="lg" />
          </ScrollView>
      </ModalSheet>

      {/* Balance Alert Modal */}
      <Modal visible={showAlerts} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg }} activeOpacity={1} onPress={() => setShowAlerts(false)}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>🔔 Balance Alerts</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={() => setShowAlerts(false)}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md }}>{selectedClient?.fullName}</Text>

            {/* Existing rules */}
            {alertRules.length > 0 ? (
              <View style={{ marginBottom: spacing.lg }}>
                {alertRules.map((r: any) => (
                  <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
                        ⚠️ {currencyCode(r.currency)} below {(r.threshold || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </Text>
                      <Text style={{ fontSize: fontSize.xs, color: r.isActive ? '#39D9B0' : colors.textTertiary }}>{r.isActive ? 'Active' : 'Disabled'}</Text>
                    </View>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete" onPress={() => deleteAlert(r.id)} style={{ padding: spacing.sm }}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary, textAlign: 'center', marginBottom: spacing.lg }}>No alerts set for this client</Text>
            )}

            {/* Create new rule */}
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm }}>Add Alert — Notify when balance drops below:</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
              {allowedCurrenciesFor(base).map((c) => (
                <TouchableOpacity key={c} style={[styles.chip, alertCurrency === c && styles.chipActive, { flex: 1, alignItems: 'center' }]} onPress={() => setAlertCurrency(c)}>
                  <Text style={[styles.chipText, alertCurrency === c && styles.chipTextActive]}>{currencyCode(c)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={{ borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.md, marginBottom: spacing.md }}
              placeholder="Threshold amount" keyboardType="numeric" value={alertThreshold}
              onChangeText={setAlertThreshold} placeholderTextColor={colors.textTertiary} />
            <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: spacing.md, alignItems: 'center' }} onPress={createAlert}>
              <Text style={{ color: '#FFF', fontWeight: fontWeight.bold, fontSize: fontSize.md }}>Create Alert</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      {showAlerts && (
          <Toast config={toastConfig} position="top" topOffset={insets.top + 12} />
        )}
      
      </Modal>

      {/* PIN Modal */}
      <Modal visible={showPinModal} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }} activeOpacity={1} onPress={() => setShowPinModal(false)}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 24, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(91,156,255,0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="lock-closed" size={28} color="#4F46E5" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700' as any, color: colors.text }}>Enter Bureau PIN</Text>
            <Text style={{ fontSize: 13, color: colors.textTertiary, marginTop: 4, textAlign: 'center' }}>Enter the 4-digit PIN to reverse this transaction</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 12 }}>
              {pinDigits.map((d, i) => (
                <TextInput key={i} ref={pinRefs[i]} value={d}
                  onChangeText={v => handlePinDigit(i, v)}
                  onKeyPress={({ nativeEvent }) => handlePinKeyPress(i, nativeEvent.key)}
                  style={{ width: 56, height: 56, borderWidth: 2, borderColor: pinError ? '#DC2626' : d ? '#4F46E5' : 'rgba(255,255,255,0.12)', borderRadius: 14, textAlign: 'center', fontSize: 24, fontWeight: '700' as any, color: colors.text, backgroundColor: colors.surfaceAlt }}
                  keyboardType="numeric" maxLength={1} secureTextEntry editable={!pinVerifying} />
              ))}
            </View>
            {pinVerifying && <Text style={{ color: '#4F46E5', fontSize: 13, fontWeight: '600' as any, marginBottom: 8 }}>Verifying...</Text>}
            {pinError ? <Text style={{ color: '#FF6B81', fontSize: 13, marginBottom: 8 }}>{pinError}</Text> : null}
            <Text style={{ color: colors.textTertiary, fontSize: 11, textAlign: 'center', marginTop: 8 }}>Contact your administrator if you don't know the PIN</Text>
            <TouchableOpacity style={{ width: '100%', paddingVertical: 14, backgroundColor: colors.surfaceAlt, borderRadius: 12, alignItems: 'center', marginTop: 20 }} onPress={() => setShowPinModal(false)}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.md, gap: 4 },
  addBtnText: { color: '#FFF', fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  searchRow: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, borderWidth: 2, borderColor: colors.border, height: 44, gap: spacing.sm },
  searchInput: { flex: 1, fontSize: fontSize.md, color: colors.text, height: '100%' },
  clientCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  avatarText: { fontSize: fontSize.lg, fontWeight: fontWeight.extrabold },
  clientInfo: { flex: 1 },
  clientName: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  clientMeta: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  clientBalances: { alignItems: 'flex-end', marginRight: spacing.sm },
  balKES: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: '#10B981' },
  balUSD: { fontSize: fontSize.xs, color: '#3B82F6', marginTop: 2 },
  // Modal
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  detailRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  detailCard: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg, alignItems: 'center' },
  detailLabel: { fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: 4 },
  detailValue: { fontSize: fontSize.xl, fontWeight: fontWeight.extrabold },
  infoCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  infoLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  infoValue: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md },
  stmtRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  stmtLeft: { flex: 1 },
  stmtDesc: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text, flex: 1 },
  stmtDate: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  stmtAmount: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  stmtBal: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  stmtSummary: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  deleteBtn: { padding: spacing.sm, borderRadius: borderRadius.sm },
  noData: { fontSize: fontSize.sm, color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.xl },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: 'transparent' },
  chipActive: { backgroundColor: colors.infoLight, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: fontWeight.bold },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full },
  actionBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
});
