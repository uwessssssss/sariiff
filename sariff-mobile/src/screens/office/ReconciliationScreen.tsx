import { parseAmount, anyBadAmount } from "../../utils/amount";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Animated, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import * as api from '../../services/api';
import { AccountType, formatCurrency, formatDate, currencyCode } from '../../types';
import { Input, EmptyState, LoadingScreen, ModalSheet, FormSection, ChipGroup, ActionBtn } from '../../components/ui';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';

const statusConfig: Record<number, { label: string; color: string; bg: string }> = {
  0: { label: 'Pending', color: '#F6B45E', bg: 'rgba(246,180,94,0.12)' },
  1: { label: 'Matched', color: '#39D9B0', bg: 'rgba(57,217,176,0.12)' },
  2: { label: 'Unmatched', color: '#FF6B81', bg: 'rgba(255,107,129,0.12)' },
};

export default function ReconciliationScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const headerAnim = useRef(new Animated.Value(0)).current;

  // Create form
  const [accType, setAccType] = useState(AccountType.Cash);
  const [accId, setAccId] = useState('');
  const [actualBalance, setActualBalance] = useState('');
  const [reconcNotes, setReconcNotes] = useState('');
  const [cashAccs, setCashAccs] = useState<any[]>([]);
  const [bankAccs, setBankAccs] = useState<any[]>([]);
  const [mpesaAccs, setMpesaAccs] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await api.getReconciliations(1, 50);
      if (res.success && res.data) setItems(Array.isArray(res.data) ? res.data : res.data.items || []);
    } catch {}
  }, []);

  const loadFormAccounts = async () => {
    try {
      const [c, b, m] = await Promise.all([api.getCashAccounts(), api.getBankAccounts(), api.getMpesaAgents()]);
      setCashAccs(c.success ? c.data : []);
      setBankAccs(b.success ? b.data : []);
      setMpesaAccs(m.success ? m.data : []);
    } catch {}
  };

  useEffect(() => {
    (async () => { await load(); setLoading(false);
      Animated.spring(headerAnim, { toValue: 1, tension: 50, friction: 9, useNativeDriver: true }).start();
    })();
  }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const getAccList = () => {
    switch (accType) {
      case AccountType.Cash: return cashAccs.map(a => ({ id: a.id, name: `Cash ${currencyCode(a.currency)}` }));
      case AccountType.Bank: return bankAccs.map(a => ({ id: a.id, name: `${a.bankName} · ${currencyCode(a.currency)}` }));
      case AccountType.Mpesa: return mpesaAccs.map(a => ({ id: a.id, name: a.agentNumber ? `${a.agentName} · ${a.agentNumber}` : a.agentName }));
      default: return [];
    }
  };

  const handleCreate = async () => {
    if (!accId || !actualBalance) { Toast.show({ type: 'error', text1: 'Fill all required fields' }); return; }
    if (anyBadAmount(actualBalance)) { Toast.show({ type: 'error', text1: 'Amount not understood', text2: 'Type digits only, e.g. 1500 or 1,500.50' }); return; }
    setFormLoading(true);
    try {
      const res = await api.createReconciliation({ accountType: accType, accountId: accId, actualBalance: parseAmount(actualBalance), notes: reconcNotes || undefined });
      if (res.success) { Toast.show({ type: 'success', text1: 'Reconciliation created' }); setShowCreate(false); setActualBalance(''); setReconcNotes(''); load(); }
      else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
    } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.message }); }
    setFormLoading(false);
  };

  const handleComplete = (id: string, variance: number, currency: number) => {
    const hasVariance = Math.abs(variance) > 0.01;
    Alert.alert('Complete Reconciliation', hasVariance ? `Variance of ${formatCurrency(variance, currency)} found. Create adjustment?` : 'No variance. Mark as completed?', [
      { text: 'Cancel', style: 'cancel' },
      { text: hasVariance ? 'Adjust & Complete' : 'Complete', onPress: async () => {
        try {
          const res = await api.apiRequest<any>(`/api/reconciliation/${id}/complete`, {
            method: 'POST', body: JSON.stringify({ createAdjustment: hasVariance, adjustmentDescription: hasVariance ? 'Auto-adjustment from reconciliation' : undefined }),
          });
          if (res.success) { Toast.show({ type: 'success', text1: 'Reconciliation completed' }); load(); }
          else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
        } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.message }); }
      }},
    ]);
  };

  if (loading) return <LoadingScreen message="Loading reconciliation..." />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View style={[styles.header, { opacity: headerAnim }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={styles.backBtn}><Ionicons name="arrow-back" size={22} color={colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Reconciliation</Text>
        <TouchableOpacity onPress={() => { setShowCreate(true); loadFormAccounts(); }}>
          <LinearGradient colors={colors.gradients.primary} style={styles.addBtn} start={{x:0,y:0}} end={{x:1,y:0}}>
            <Ionicons name="add" size={18} color="#FFF" /><Text style={styles.addBtnText}>New</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      <FlatList data={items} keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<EmptyState icon="checkmark-done-outline" title="No reconciliations" subtitle="Create one to verify account balances" />}
        renderItem={({ item }) => {
          const st = statusConfig[item.status] || statusConfig[0];
          const variance = (item.variance != null) ? item.variance : (item.actualBalance || 0) - (item.expectedBalance || 0);
          return (
            <View style={[styles.reconCard, shadows.sm]}>
              <View style={styles.reconTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reconName}>{item.accountName || 'Account'}</Text>
                  <Text style={styles.reconMeta}>{formatDate(item.createdAt)}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: st.bg }]}>
                  <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>
              <View style={styles.reconRow}>
                <View style={styles.reconCol}><Text style={styles.reconLabel}>Expected</Text><Text style={styles.reconValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(item.expectedBalance || 0, item.currency ?? 0)}</Text></View>
                <View style={styles.reconCol}><Text style={styles.reconLabel}>Actual</Text><Text style={styles.reconValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(item.actualBalance || 0, item.currency ?? 0)}</Text></View>
                <View style={[styles.reconCol, { alignItems: 'flex-end' }]}><Text style={styles.reconLabel}>Variance</Text><Text style={[styles.reconValue, { color: Math.abs(variance) > 0.01 ? colors.danger : colors.success }]} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(variance, item.currency ?? 0)}</Text></View>
              </View>
              {item.status === 0 && (
                <TouchableOpacity style={styles.completeBtn} onPress={() => handleComplete(item.id, variance, item.currency ?? 0)}>
                  <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                  <Text style={styles.completeBtnText}>Complete</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {/* Create Modal */}
      <ModalSheet visible={showCreate} onClose={() => setShowCreate(false)} title="New Reconciliation" icon="checkmark-done-outline" iconColor="#8B5CF6" iconBg="rgba(154,123,255,0.12)">
        <FormSection label="Account Type">
          <ChipGroup options={[{ value: AccountType.Cash, label: 'Cash' }, { value: AccountType.Bank, label: 'Bank' }, { value: AccountType.Mpesa, label: 'Mobile money' }]}
            selected={accType} onSelect={(v: number) => { setAccType(v); setAccId(''); }} />
        </FormSection>
        <FormSection label="Account">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {getAccList().map(a => (
              <TouchableOpacity key={a.id} style={[styles.chip, accId === a.id && styles.chipActive, { paddingHorizontal: 16 }]} onPress={() => setAccId(a.id)}>
                <Text style={[styles.chipText, accId === a.id && styles.chipTextActive]}>{a.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </FormSection>
        <FormSection label="Actual Balance (physical count)">
          <Input label="" value={actualBalance} onChangeText={setActualBalance} keyboardType="numeric" icon="calculator-outline" placeholder="0.00" />
        </FormSection>
        <FormSection label="Notes">
          <Input label="" value={reconcNotes} onChangeText={setReconcNotes} icon="document-text-outline" placeholder="Reconciliation notes..." multiline />
        </FormSection>
        <ActionBtn title="Create Reconciliation" onPress={handleCreate} loading={formLoading} icon="checkmark-done-outline" gradient={['#7C3AED', '#8B5CF6']} />
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.md, gap: 4 },
  addBtnText: { color: '#FFF', fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  reconCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.sm },
  reconTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  reconName: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  reconMeta: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  badgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  reconRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md, gap: spacing.sm },
  reconCol: { flex: 1, minWidth: 0 },
  reconLabel: { fontSize: fontSize.xs, color: colors.textTertiary },
  reconValue: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text, marginTop: 2 },
  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success, borderRadius: borderRadius.md, paddingVertical: spacing.sm, gap: spacing.xs },
  completeBtnText: { color: '#FFF', fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: 'transparent' },
  chipActive: { backgroundColor: colors.infoLight, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: fontWeight.bold },
});
