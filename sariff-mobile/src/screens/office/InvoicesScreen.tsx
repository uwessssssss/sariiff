import { parseAmount, anyBadAmount } from "../../utils/amount";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Animated, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import * as api from '../../services/api';
import { Currency, amountText, formatCurrency, formatDate, currencyCode, allowedCurrenciesFor, sumByCurrency, formatTotals } from '../../types';
import { useBaseCurrency } from '../../hooks/useBaseCurrency';
import { Input, EmptyState, LoadingScreen, ModalSheet, FormSection, ActionBtn, InfoRow } from '../../components/ui';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../theme';
import { localDate } from '../../utils/dates';

const statusConfig: Record<number, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  0: { label: 'Draft', color: colors.textSecondary, bg: 'rgba(255,255,255,0.06)', icon: 'create-outline' },
  1: { label: 'Sent', color: '#7FB3FF', bg: 'rgba(91,156,255,0.12)', icon: 'send-outline' },
  2: { label: 'Paid', color: '#39D9B0', bg: 'rgba(57,217,176,0.12)', icon: 'checkmark-circle-outline' },
  3: { label: 'Cancelled', color: '#FF6B81', bg: 'rgba(255,107,129,0.12)', icon: 'close-circle-outline' },
};

// Builds a branded HTML invoice that expo-print renders into a real PDF
// on-device. (The backend's /api/invoice/{id}/pdf endpoint is a stub that
// returns "PDF generation not implemented", so it can never work.)
function buildInvoiceHtml(inv: any): string {
  const cur = currencyCode(inv.currency) + ' ';
  const fmt = (n: number) =>
    cur + amountText(Math.abs(n || 0), inv.currency);
  const d = (s: string) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const stMap: Record<number, { label: string; color: string }> = {
    0: { label: 'DRAFT', color: '#64748B' },
    1: { label: 'SENT', color: '#2563EB' },
    2: { label: 'PAID', color: '#16A34A' },
    3: { label: 'CANCELLED', color: '#DC2626' },
  };
  const st = stMap[inv.status] || stMap[0];
  const items: any[] = inv.items || [];
  const rows = items
    .map(
      (it: any, i: number) => `
      <tr style="background:${i % 2 ? '#F8FAFC' : '#fff'}">
        <td style="padding:9px 10px;border-bottom:1px solid #E2E8F0;">${it.description || '—'}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #E2E8F0;text-align:center;">${it.quantity ?? 1}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #E2E8F0;text-align:right;">${fmt(it.unitPrice)}</td>
        <td style="padding:9px 10px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:600;">${fmt(it.amount ?? (it.quantity || 1) * (it.unitPrice || 0))}</td>
      </tr>`,
    )
    .join('');
  const money = (label: string, val: number, opts?: { bold?: boolean; color?: string }) => `
    <tr><td style="padding:5px 10px;text-align:right;color:#475569;${opts?.bold ? 'font-weight:700;font-size:15px;' : ''}">${label}</td>
    <td style="padding:5px 10px;text-align:right;width:130px;${opts?.bold ? 'font-weight:700;font-size:15px;' : ''}${opts?.color ? `color:${opts.color};` : ''}">${fmt(val)}</td></tr>`;
  return `
  <html><head><meta charset="utf-8" /></head>
  <body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#0F172A;padding:28px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #4F46E5;padding-bottom:14px;">
      <div>
        <div style="font-size:24px;font-weight:800;color:#4F46E5;">Sarif</div>
        <div style="font-size:11px;color:#64748B;">Forex Bureau Services</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:20px;font-weight:800;letter-spacing:1px;">INVOICE</div>
        <div style="font-size:12px;color:#475569;">${inv.invoiceNumber || ''}</div>
        <div style="margin-top:6px;display:inline-block;padding:3px 12px;border:2px solid ${st.color};color:${st.color};font-weight:800;font-size:11px;letter-spacing:1px;">${st.label}</div>
      </div>
    </div>
    <table style="width:100%;margin-top:16px;font-size:12px;"><tr>
      <td style="vertical-align:top;">
        <div style="font-size:10px;color:#94A3B8;font-weight:700;letter-spacing:1px;">BILL TO</div>
        <div style="font-weight:700;font-size:14px;margin-top:2px;">${inv.clientName || '—'}</div>
        ${inv.clientEmail ? `<div style="color:#475569;">${inv.clientEmail}</div>` : ''}
        ${inv.clientPhone ? `<div style="color:#475569;">${inv.clientPhone}</div>` : ''}
        ${inv.clientAddress ? `<div style="color:#475569;">${inv.clientAddress}</div>` : ''}
      </td>
      <td style="vertical-align:top;text-align:right;color:#475569;">
        <div>Invoice date: <b>${d(inv.invoiceDate)}</b></div>
        <div>Due date: <b>${d(inv.dueDate)}</b></div>
      </td>
    </tr></table>
    <table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:12px;">
      <thead><tr style="background:#4F46E5;color:#fff;">
        <th style="padding:9px 10px;text-align:left;">Description</th>
        <th style="padding:9px 10px;text-align:center;width:60px;">Qty</th>
        <th style="padding:9px 10px;text-align:right;width:110px;">Unit Price</th>
        <th style="padding:9px 10px;text-align:right;width:120px;">Amount</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="4" style="padding:14px 10px;color:#94A3B8;">No line items</td></tr>`}</tbody>
    </table>
    <table style="width:100%;margin-top:10px;font-size:12px;">
      ${money('Subtotal', inv.subtotal ?? inv.total)}
      ${inv.taxAmount ? money(`Tax${inv.taxRate ? ` (${inv.taxRate}%)` : ''}`, inv.taxAmount) : ''}
      ${inv.discountAmount ? money('Discount', -inv.discountAmount) : ''}
      ${money('TOTAL', inv.total, { bold: true, color: '#4F46E5' })}
    </table>
    ${inv.notes ? `<div style="margin-top:16px;font-size:11px;"><b>Notes:</b> <span style="color:#475569;">${inv.notes}</span></div>` : ''}
    ${inv.terms ? `<div style="margin-top:6px;font-size:11px;"><b>Terms:</b> <span style="color:#475569;">${inv.terms}</span></div>` : ''}
    <div style="margin-top:26px;padding-top:10px;border-top:1px solid #E2E8F0;font-size:10px;color:#94A3B8;text-align:center;">
      Generated by Sarif · ${new Date().toLocaleString()}
    </div>
  </body></html>`;
}

export default function InvoicesScreen() {
  const { base } = useBaseCurrency();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  // The lookup gives the first 200 clients; typing searches the server for the rest.
  const [clientSearch, setClientSearch] = useState('');
  useEffect(() => {
    const term = clientSearch.trim();
    const t = setTimeout(() => { api.getClientLookup(term.length >= 2 ? term : '').then(r => r.success && setClients(r.data)).catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [clientSearch]);
  const headerAnim = useRef(new Animated.Value(0)).current;

  // Create form
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [dueDate] = useState(localDate(new Date(Date.now() + 30*86400000)));
  const [currency, setCurrency] = useState<number>(Currency.KES);
  useEffect(() => setCurrency(base), [base]); // new invoices default to the home currency
  // 0% like the web: forex services are generally VAT-exempt; a bureau that charges tax sets it per invoice
  const [taxRate, setTaxRate] = useState('0');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ description: '', quantity: '1', unitPrice: '' }]);

  const load = useCallback(async () => {
    try {
      const res = await api.getAllInvoices();
      if (res.success) setInvoices(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => { await load(); setLoading(false);
      Animated.spring(headerAnim, { toValue: 1, tension: 50, friction: 9, useNativeDriver: true }).start();
    })();
  }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const filtered = filter !== null ? invoices.filter(i => i.status === filter) : invoices;
  const totalPaid = sumByCurrency(invoices.filter(i => i.status === 2), (i) => i.total || 0, (i) => i.currency ?? base, base);
  const totalOutstanding = sumByCurrency(invoices.filter(i => i.status === 1), (i) => i.total || 0, (i) => i.currency ?? base, base);

  const handleCreate = async () => {
    if (!clientName || items.some(it => !it.description || !it.unitPrice)) {
      Toast.show({ type: 'error', text1: 'Fill all fields' }); return;
    }
    if (anyBadAmount(taxRate, ...items.flatMap((it: any) => [it.quantity, it.unitPrice]))) { Toast.show({ type: 'error', text1: 'Amount not understood', text2: 'Type digits only, e.g. 1500 or 1,500.50' }); return; }
    setFormLoading(true);
    try {
      const res = await api.createInvoice({
        clientId: clientId || undefined, clientName, clientEmail: clientEmail || undefined,
        dueDate, currency, taxRate: parseAmount(taxRate) || 0, discountAmount: 0,
        notes: notes || undefined, items: items.map(it => ({
          description: it.description, quantity: parseAmount(it.quantity) || 1, unitPrice: parseAmount(it.unitPrice) || 0,
        })),
      });
      if (res.success) { Toast.show({ type: 'success', text1: 'Invoice created' }); setShowCreate(false); load(); }
      else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
    } catch (e: any) { Toast.show({ type: 'error', text1: 'Error', text2: e.message }); }
    setFormLoading(false);
  };

  const handleStatusChange = (id: string, newStatus: number, label: string) => {
    Alert.alert(`Mark as ${label}?`, '', [
      { text: 'Cancel', style: 'cancel' },
      { text: label, onPress: async () => {
        const res = await api.updateInvoiceStatus(id, newStatus);
        if (res.success) { Toast.show({ type: 'success', text1: `Marked as ${label}` }); load(); }
        else Toast.show({ type: 'error', text1: 'Failed', text2: res.message });
      }},
    ]);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Invoice?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const prev = invoices;
        setInvoices(l => l.filter(inv => inv.id !== id)); // optimistic
        const res = await api.deleteInvoice(id);
        if (res.success) { Toast.show({ type: 'success', text1: 'Deleted' }); load(); }
        else { setInvoices(prev); Toast.show({ type: 'error', text1: 'Failed', text2: res.message }); }
      }},
    ]);
  };

  const handleDownloadPdf = async (id: string) => {
    Toast.show({ type: 'info', text1: 'Preparing invoice PDF...' });
    try {
      // Fetch the full invoice so line items are guaranteed present;
      // fall back to the list copy if the detail fetch fails.
      let inv: any = invoices.find(i => i.id === id);
      const res = await api.getInvoiceById(id).catch(() => null);
      if (res?.success && res.data) inv = res.data;
      if (!inv) { Toast.show({ type: 'error', text1: 'Invoice not found' }); return; }

      const Print = require('expo-print');
      const Sharing = require('expo-sharing');
      const { uri } = await Print.printToFileAsync({ html: buildInvoiceHtml(inv) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Invoice ${inv.invoiceNumber || ''}`,
          UTI: 'com.adobe.pdf',
        });
        Toast.show({ type: 'success', text1: 'Invoice PDF ready' });
      } else {
        Toast.show({ type: 'error', text1: 'Sharing not available on this device' });
      }
    } catch { Toast.show({ type: 'error', text1: 'Could not generate PDF' }); }
  };

  const addItem = () => setItems([...items, { description: '', quantity: '1', unitPrice: '' }]);
  const updateItem = (i: number, field: string, value: string) => {
    const n = [...items]; (n[i] as any)[field] = value; setItems(n);
  };
  const removeItem = (i: number) => items.length > 1 && setItems(items.filter((_, idx) => idx !== i));
  const subtotal = items.reduce((s, it) => s + (parseAmount(it.quantity) || 0) * (parseAmount(it.unitPrice) || 0), 0);
  const tax = subtotal * (parseAmount(taxRate) || 0) / 100;

  if (loading) return <LoadingScreen message="Loading invoices..." />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View style={[styles.header, { opacity: headerAnim }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={styles.backBtn}><Ionicons name="arrow-back" size={22} color={colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Invoices</Text>
        <TouchableOpacity onPress={() => { setShowCreate(true); api.getClientLookup().then(r => r.success && setClients(r.data)); }}>
          <LinearGradient colors={colors.gradients.primary} style={styles.addBtn} start={{x:0,y:0}} end={{x:1,y:0}}>
            <Ionicons name="add" size={18} color="#FFF" /><Text style={styles.addBtnText}>New</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <LinearGradient colors={['#10B981','#0D9488']} style={[styles.statCard, shadows.md]} start={{x:0,y:0}} end={{x:1,y:1}}>
          <Text style={styles.statLabel}>Paid</Text><Text style={styles.statValue} numberOfLines={totalPaid.length || 1} adjustsFontSizeToFit>{formatTotals(totalPaid, base)}</Text>
        </LinearGradient>
        <LinearGradient colors={['#3B82F6','#4F46E5']} style={[styles.statCard, shadows.md]} start={{x:0,y:0}} end={{x:1,y:1}}>
          <Text style={styles.statLabel}>Outstanding</Text><Text style={styles.statValue} numberOfLines={totalOutstanding.length || 1} adjustsFontSizeToFit>{formatTotals(totalOutstanding, base)}</Text>
        </LinearGradient>
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {[{ key: null, label: 'All' }, { key: 0, label: 'Draft' }, { key: 1, label: 'Sent' }, { key: 2, label: 'Paid' }].map(f => (
          <TouchableOpacity key={String(f.key)} onPress={() => setFilter(f.key as number | null)}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}>
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList data={filtered} keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<EmptyState icon="document-text-outline" title="No invoices" />}
        renderItem={({ item }) => {
          const st = statusConfig[item.status] || statusConfig[0];
          return (
            <TouchableOpacity style={[styles.invoiceCard, shadows.sm]} activeOpacity={0.7}
              onLongPress={() => handleDelete(item.id)}>
              <View style={styles.invoiceTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invoiceNumber}>{item.invoiceNumber}</Text>
                  <Text style={styles.invoiceClient}>{item.clientName}</Text>
                </View>
                <TouchableOpacity style={[styles.statusBadge, { backgroundColor: st.bg }]}
                  onPress={() => {
                    if (item.status === 0) handleStatusChange(item.id, 1, 'Sent');
                    else if (item.status === 1) handleStatusChange(item.id, 2, 'Paid');
                  }}>
                  <Ionicons name={st.icon} size={12} color={st.color} />
                  <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                  {item.status < 2 && <Ionicons name="chevron-forward" size={10} color={st.color} />}
                </TouchableOpacity>
              </View>
              <View style={styles.invoiceBottom}>
                <Text style={styles.invoiceDate}>Due: {formatDate(item.dueDate)}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Download" onPress={() => handleDownloadPdf(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="download-outline" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.invoiceTotal}>{formatCurrency(item.total, item.currency)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Create Invoice Modal */}
      <ModalSheet visible={showCreate} onClose={() => setShowCreate(false)} title="New Invoice" icon="document-text-outline" iconColor="#4F46E5" iconBg="rgba(91,156,255,0.12)">
            <FormSection label="Client">
            <Input label="Find client" value={clientSearch} onChangeText={setClientSearch} icon="search-outline" placeholder="Name, phone or code" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {clients.map(c => (
                  <TouchableOpacity key={c.id} style={[styles.chip, clientId === c.id && styles.chipActive]}
                    onPress={() => { setClientId(c.id); setClientName(c.fullName); setClientEmail(c.email || ''); }}>
                    <Text style={[styles.chipText, clientId === c.id && styles.chipTextActive]}>{c.fullName}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Input label="Client Name" value={clientName} onChangeText={setClientName} icon="person-outline" placeholder="Client name" />
            <Input label="Client Email" value={clientEmail} onChangeText={setClientEmail} icon="mail-outline" placeholder="email@example.com" />
            </FormSection>
            <FormSection label="Currency">
            <View style={styles.chipRow}>
              {allowedCurrenciesFor(base).map((v) => ({ v, l: currencyCode(v) })).map(c => (
                <TouchableOpacity key={c.v} style={[styles.chip, currency === c.v && styles.chipActive]} onPress={() => setCurrency(c.v)}>
                  <Text style={[styles.chipText, currency === c.v && styles.chipTextActive]}>{c.l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            </FormSection>
            <Input label="Tax Rate (%)" value={taxRate} onChangeText={setTaxRate} keyboardType="numeric" icon="calculator-outline" placeholder="16" />

            <FormSection label="Line Items">
            {items.map((item, i) => (
              <View key={i} style={styles.itemRow}>
                <View style={{ flex: 3 }}><Input label="" placeholder="Description" value={item.description} onChangeText={v => updateItem(i, 'description', v)} /></View>
                <View style={{ flex: 1 }}><Input label="" placeholder="Qty" value={item.quantity} onChangeText={v => updateItem(i, 'quantity', v)} keyboardType="numeric" /></View>
                <View style={{ flex: 1.5 }}><Input label="" placeholder="Price" value={item.unitPrice} onChangeText={v => updateItem(i, 'unitPrice', v)} keyboardType="numeric" /></View>
                {items.length > 1 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete" onPress={() => removeItem(i)} style={{ padding: 8 }}><Ionicons name="trash-outline" size={18} color={colors.danger} /></TouchableOpacity>}
              </View>
            ))}
            <TouchableOpacity onPress={addItem} style={styles.addItemBtn}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} /><Text style={styles.addItemText}>Add Line Item</Text>
            </TouchableOpacity>
            </FormSection>

            <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <InfoRow label="Subtotal" value={formatCurrency(subtotal, currency)} />
              <InfoRow label={`Tax (${taxRate}%)`} value={formatCurrency(tax, currency)} />
              <View style={{ borderTopWidth: 2, borderTopColor: '#111827', marginTop: 8, paddingTop: 8 }}>
                <InfoRow label="Total" value={formatCurrency(subtotal + tax, currency)} valueColor="#4F46E5" />
              </View>
            </View>

            <Input label="Notes" value={notes} onChangeText={setNotes} icon="document-text-outline" placeholder="Payment terms, notes..." multiline />
            <ActionBtn title="Create Invoice" onPress={handleCreate} loading={formLoading} icon="checkmark-circle-outline" gradient={['#4F46E5', '#6366F1']} />
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
  statsRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.lg },
  statCard: { flex: 1, borderRadius: borderRadius.lg, padding: spacing.lg },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs, fontWeight: fontWeight.semibold, textTransform: 'uppercase' as any },
  statValue: { color: '#FFF', fontSize: fontSize.lg, fontWeight: fontWeight.extrabold, marginTop: 2 },
  filterRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  filterChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt },
  filterChipActive: { backgroundColor: colors.primary },
  filterText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  filterTextActive: { color: '#FFF' },
  invoiceCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.sm },
  invoiceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  invoiceNumber: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
  invoiceClient: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full, gap: 3 },
  statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  invoiceBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: spacing.sm },
  invoiceDate: { fontSize: fontSize.sm, color: colors.textTertiary },
  invoiceTotal: { fontSize: fontSize.lg, fontWeight: fontWeight.extrabold, color: colors.text },
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full, backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: 'transparent' },
  chipActive: { backgroundColor: colors.infoLight, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: fontWeight.bold },
  itemRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-end' },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm, marginBottom: spacing.lg },
  addItemText: { color: colors.primary, fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  totalSection: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.lg },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  totalLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  totalValue: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text },
});
