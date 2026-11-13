import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Animated, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import * as api from '../../services/api';
import { ExpenseDto, Currency, AccountType, formatCurrency, formatDate, currencyCode, sumByCurrency, formatTotals } from '../../types';
import { useBaseCurrency } from '../../hooks/useBaseCurrency';
import { Input, EmptyState, LoadingScreen, ModalSheet, FormSection, ChipGroup, ActionBtn, InfoRow } from '../../components/ui';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';
import { localDate } from '../../utils/dates';

const paymentLabels: Record<number, string> = { 0: 'Cash', 1: 'Bank', 2: 'Mobile money' };
const paymentColors = ['#10B981', '#3B82F6', '#16A34A'];

export default function ExpensesScreen() {
  const { base } = useBaseCurrency();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [expenses, setExpenses] = useState<ExpenseDto[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [formLoading, setFormLoading] = useState(false);
  const headerAnim = useRef(new Animated.Value(0)).current;

  // Form
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<number>(Currency.KES);
  useEffect(() => setCurrency(base), [base]); // new expenses default to the home currency
  const [paymentMethod, setPaymentMethod] = useState(0); // 0=Cash,1=Bank,2=Mpesa
  const [reference, setReference] = useState('');
  const [accounts, setAccounts] = useState<{ cash: any[]; bank: any[]; mpesa: any[] }>({ cash: [], bank: [], mpesa: [] });
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');

  const load = useCallback(async () => {
    try {
      const [expRes, catRes] = await Promise.all([api.getExpenses(1, 50), api.getExpenseCategories()]);
      if (expRes.success && expRes.data) setExpenses(expRes.data.items || []);
      if (catRes.success) setCategories(catRes.data || []);
    } catch {}
  }, []);

  const loadAccounts = useCallback(async () => {
    const [c, b, m] = await Promise.all([api.getCashAccounts(), api.getBankAccounts(), api.getMpesaAgents()]);
    setAccounts({ cash: c.success ? c.data : [], bank: b.success ? b.data : [], mpesa: m.success ? m.data : [] });
  }, []);

  useEffect(() => {
    (async () => { await load(); setLoading(false);
      Animated.spring(headerAnim, { toValue: 1, tension: 50, friction: 9, useNativeDriver: true }).start();
    })();
  }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const getPaymentAccounts = () => {
    // Each account carries its currency: choosing it sets the expense currency, so a "Cash USD"
    // pick can't go out as KES. Switched-off accounts are refused by the server and not offered.
    const on = (xs: any[]) => (xs || []).filter((a: any) => a.isActive !== false);
    if (paymentMethod === 0) return accounts.cash.map(a => ({ id: a.id, name: `Cash ${currencyCode(a.currency)}`, currency: a.currency }));
    if (paymentMethod === 1) return on(accounts.bank).map(a => ({ id: a.id, name: `${a.bankName} (${a.accountName})`, currency: a.currency }));
    return on(accounts.mpesa).map(a => ({ id: a.id, name: a.agentName, currency: a.currency ?? base }));
  };

  const handleCreate = async () => {
    if (!categoryId || !description || !amount || !paymentAccountId) {
      Toast.show({ type: 'error', text1: 'Missing fields', text2: 'Fill all required fields' }); return;
    }
    setFormLoading(true);
    const accType = paymentMethod === 0 ? AccountType.Cash : paymentMethod === 1 ? AccountType.Bank : AccountType.Mpesa;
    const res = await api.createExpense({
      categoryId, description, vendorPayee: vendor || undefined, amount: parseFloat(amount),
      currency, paymentMethod, paymentAccountType: accType, paymentAccountId,
      reference: reference || undefined, expenseDate: localDate() + 'T12:00:00Z', // today's LOCAL date (an expense date is a calendar day)
    });
    if (res.success) { Toast.show({ type: 'success', text1: 'Expense recorded' }); setShowCreate(false); resetForm(); load(); }
    else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
    setFormLoading(false);
  };

  const resetForm = () => { setCategoryId(''); setDescription(''); setVendor(''); setAmount(''); setReference(''); setPaymentAccountId(''); };

  const handleDeleteExpense = (id: string) => {
    Alert.alert("Delete Expense", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        const prev = expenses;
        setExpenses(l => l.filter(e => e.id !== id)); // optimistic
        const res = await api.deleteExpense(id);
        if (res.success) { Toast.show({ type: "success", text1: "Expense deleted" }); load(); }
        else { setExpenses(prev); Toast.show({ type: "error", text1: "Failed", text2: res.message }); }
      }},
    ]);
  };

  const openEditExpense = (item: ExpenseDto) => {
    setEditingId(item.id);
    setDescription(item.description);
    setAmount(String(item.amount));
    setCurrency(item.currency);
    setVendor(item.vendorPayee || '');
    setReference(item.reference || '');
    if (item.categoryId) setCategoryId(item.categoryId);
    setPaymentMethod(item.paymentMethod);
    setShowCreate(true);
    loadAccounts();
  };

  const handleEdit = async () => {
    if (!editingId || !description || !amount) {
      Toast.show({ type: 'error', text1: 'Missing fields' }); return;
    }
    setFormLoading(true);
    const res = await api.updateExpense(editingId, {
      description, vendorPayee: vendor || undefined, amount: parseFloat(amount), reference: reference || undefined,
    });
    if (res.success) { Toast.show({ type: 'success', text1: 'Expense updated' }); setShowCreate(false); setEditingId(null); resetForm(); load(); }
    else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
    setFormLoading(false);
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const res = await api.createExpenseCategory({ name: newCatName.trim() });
    if (res.success) { Toast.show({ type: 'success', text1: 'Category added' }); setNewCatName(''); load(); }
    else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
  };

  const handleDeleteCategory = (id: string, name: string) => {
    Alert.alert('Delete Category', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const prev = categories;
        setCategories(l => l.filter(c => c.id !== id)); // optimistic
        const res = await api.deleteExpenseCategory(id);
        if (res.success) { Toast.show({ type: 'success', text1: 'Category deleted' }); load(); }
        else { setCategories(prev); Toast.show({ type: 'error', text1: 'Failed', text2: res.message }); }
      }},
    ]);
  };

  const totals = sumByCurrency(expenses, (e) => e.amount, (e) => e.currency, base);

  if (loading) return <LoadingScreen message="Loading expenses..." />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View style={[styles.header, { opacity: headerAnim }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={styles.backBtn}><Ionicons name="arrow-back" size={22} color={colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Expenses</Text>
        <TouchableOpacity onPress={() => { setEditingId(null); resetForm(); setShowCreate(true); loadAccounts(); }}>
          <LinearGradient colors={colors.gradients.primary} style={styles.addBtn} start={{x:0,y:0}} end={{x:1,y:0}}>
            <Ionicons name="add" size={18} color="#FFF" /><Text style={styles.addBtnText}>Add</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <LinearGradient colors={['#EF4444', '#DC2626']} style={[styles.summaryCard, shadows.lg]} start={{x:0,y:0}} end={{x:1,y:1}}>
          <Ionicons name="trending-down" size={20} color="rgba(255,255,255,0.8)" />
          <Text style={styles.summaryLabel}>TOTAL EXPENSES</Text>
          <Text style={styles.summaryValue} numberOfLines={totals.length || 1} adjustsFontSizeToFit>{formatTotals(totals, base)}</Text>
          <Text style={styles.summaryCount}>{expenses.length} {expenses.length === 1 ? 'record' : 'records'} shown</Text>
        </LinearGradient>
      </View>

      <FlatList data={expenses} keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<EmptyState icon="receipt-outline" title="No expenses" action="Record Expense" onAction={() => { setEditingId(null); resetForm(); setShowCreate(true); loadAccounts(); }} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.expCard, shadows.sm]} 
            onPress={() => setSelectedExpense(item)}
            onLongPress={() => {
              Alert.alert(item.description, `${paymentLabels[item.paymentMethod]} · ${formatCurrency(item.amount, item.currency)}`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Edit', onPress: () => { openEditExpense(item); loadAccounts(); } },
                { text: 'Delete', style: 'destructive', onPress: () => handleDeleteExpense(item.id) },
              ]);
            }}
            activeOpacity={0.7}>
            <View style={[styles.expIcon, { backgroundColor: paymentColors[item.paymentMethod] + '15' }]}>
              <Ionicons name={item.paymentMethod === 0 ? 'cash-outline' : item.paymentMethod === 1 ? 'business-outline' : 'phone-portrait-outline'} size={18} color={paymentColors[item.paymentMethod]} />
            </View>
            <View style={styles.expText}>
              <Text style={styles.expDesc} numberOfLines={1}>{item.description}</Text>
              <Text style={styles.expMeta}>{item.categoryName} · {paymentLabels[item.paymentMethod]} · {formatDate(item.expenseDate || item.createdAt)}</Text>
            </View>
            <Text style={styles.expAmount}>-{formatCurrency(item.amount, item.currency)}</Text>
          </TouchableOpacity>
        )}
      />

      {/* Create/Edit Expense Modal */}
      <ModalSheet visible={showCreate} onClose={() => { setShowCreate(false); setEditingId(null); resetForm(); }}
        title={editingId ? 'Edit Expense' : 'Record Expense'} icon="receipt-outline" iconColor="#DC2626" iconBg="rgba(255,107,129,0.12)">
        <FormSection label="Category (long-press to delete)">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {categories.map(c => (
              <TouchableOpacity key={c.id} style={[styles.chip, categoryId === c.id && styles.chipActive]} onPress={() => setCategoryId(c.id)} onLongPress={() => handleDeleteCategory(c.id, c.name)}>
                <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}><Input label="" placeholder="New category" value={newCatName} onChangeText={setNewCatName} /></View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add" onPress={handleAddCategory} style={{ justifyContent: 'center', paddingHorizontal: 14, backgroundColor: 'rgba(91,156,255,0.12)', borderRadius: 12, height: 48, marginTop: 4 }}>
              <Ionicons name="add-circle" size={22} color="#4F46E5" />
            </TouchableOpacity>
          </View>
        </FormSection>
        <FormSection label="Description">
          <Input label="" value={description} onChangeText={setDescription} icon="document-text-outline" placeholder="What was it for?" />
        </FormSection>
        <FormSection label="Vendor / Payee">
          <Input label="" value={vendor} onChangeText={setVendor} icon="storefront-outline" placeholder="Vendor name" />
        </FormSection>
        <FormSection label="Amount">
          <Input label="" value={amount} onChangeText={setAmount} keyboardType="numeric" icon="cash-outline" placeholder="0.00" />
        </FormSection>
        <FormSection label="Payment Method">
          <ChipGroup options={[{ value: 0, label: '💵 Cash' }, { value: 1, label: '🏦 Bank' }, { value: 2, label: '📱 Mobile money' }]} selected={paymentMethod} onSelect={(v: number) => { setPaymentMethod(v); setPaymentAccountId(''); }} />
        </FormSection>
        <FormSection label="Payment Account">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {getPaymentAccounts().map(a => (
              <TouchableOpacity key={a.id} style={[styles.chip, paymentAccountId === a.id && styles.chipActive, { paddingHorizontal: 16 }]} onPress={() => { setPaymentAccountId(a.id); if (a.currency !== undefined) setCurrency(a.currency); }}>
                <Text style={[styles.chipText, paymentAccountId === a.id && styles.chipTextActive]} numberOfLines={1}>{a.name}</Text>
              </TouchableOpacity>
            ))}
            {getPaymentAccounts().length === 0 && <Text style={{ color: colors.textTertiary, fontSize: 13 }}>No accounts available</Text>}
          </View>
        </FormSection>
        <FormSection label="Reference (optional)">
          <Input label="" value={reference} onChangeText={setReference} icon="barcode-outline" placeholder="Receipt number" />
        </FormSection>
        <ActionBtn title={editingId ? 'Update Expense' : 'Record Expense'} onPress={editingId ? handleEdit : handleCreate} loading={formLoading} icon="checkmark-circle-outline" gradient={['#DC2626', '#EF4444']} />
      </ModalSheet>

      {/* Expense Detail Modal */}
      <ModalSheet visible={!!selectedExpense} onClose={() => setSelectedExpense(null)} title="Expense Details" icon="receipt-outline" iconColor="#DC2626" iconBg="rgba(255,107,129,0.12)">
        {selectedExpense && (<>
          {/* Hero Amount */}
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,107,129,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Ionicons name={selectedExpense.paymentMethod === 0 ? 'cash-outline' : selectedExpense.paymentMethod === 1 ? 'business-outline' : 'phone-portrait-outline'} size={24} color="#DC2626" />
            </View>
            <Text style={{ fontSize: 28, fontWeight: '800' as any, color: '#FF6B81' }}>-{formatCurrency(selectedExpense.amount, selectedExpense.currency)}</Text>
            <Text style={{ fontSize: 13, color: colors.textTertiary, marginTop: 4 }}>{selectedExpense.code}</Text>
          </View>

          {/* Expense Info */}
          <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 11, fontWeight: '700' as any, color: colors.textTertiary, letterSpacing: 1, marginBottom: 8 }}>DETAILS</Text>
            <InfoRow label="Description" value={selectedExpense.description} />
            <InfoRow label="Category" value={selectedExpense.categoryName || '—'} />
            <InfoRow label="Vendor/Payee" value={selectedExpense.vendorPayee || '—'} />
            <InfoRow label="Date" value={formatDate(selectedExpense.expenseDate || selectedExpense.createdAt)} />
            {selectedExpense.reference ? <InfoRow label="Reference" value={selectedExpense.reference} /> : null}
          </View>

          {/* Payment Info */}
          <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 11, fontWeight: '700' as any, color: colors.textTertiary, letterSpacing: 1, marginBottom: 8 }}>PAYMENT</Text>
            <InfoRow label="Method" value={paymentLabels[selectedExpense.paymentMethod] || '—'} />
            <InfoRow label="Account" value={selectedExpense.paymentAccountName || selectedExpense.paymentAccountId || '—'} />
            <InfoRow label="Currency" value={currencyCode(selectedExpense.currency)} />
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <ActionBtn title="Edit" onPress={() => { setSelectedExpense(null); openEditExpense(selectedExpense); loadAccounts(); }} icon="create-outline" gradient={['#D97706', '#F59E0B']} />
            </View>
            <View style={{ flex: 1 }}>
              <ActionBtn title="Delete" onPress={() => {
                Alert.alert('Delete Expense', 'Are you sure?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => { handleDeleteExpense(selectedExpense.id); setSelectedExpense(null); } },
                ]);
              }} icon="trash-outline" gradient={['#DC2626', '#EF4444']} />
            </View>
          </View>
        </>)}
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
  summaryRow: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  summaryCard: { borderRadius: borderRadius.lg, padding: spacing.lg, overflow: 'hidden' },
  summaryLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: fontWeight.bold, marginTop: spacing.xs, letterSpacing: 1 },
  summaryValue: { color: '#FFF', fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, marginTop: spacing.xs },
  summaryCount: { color: 'rgba(255,255,255,0.6)', fontSize: fontSize.sm, marginTop: 2 },
  expCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm },
  expIcon: { width: 40, height: 40, borderRadius: borderRadius.sm, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  expText: { flex: 1 },
  expDesc: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text },
  expMeta: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  expAmount: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: '#FF6B81' },
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: 'transparent' },
  chipActive: { backgroundColor: colors.infoLight, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: fontWeight.bold },
});
