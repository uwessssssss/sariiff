import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { toastConfig } from "../../components/toastConfig";
import * as api from "../../services/api";
import {
  ClientTransactionDto,
  Currency,
  formatDateTime,
  formatCurrency,
  currencyCode,
} from "../../types";
import { EmptyState, InfoRow, Shimmer } from "../../components/ui";
import {
  colors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  shadows,
} from "../../theme";
import { localDate } from '../../utils/dates';

type CurrencyFilter = "all" | "kes" | "usd" | "ugx" | "eur";
type TypeFilter = "all" | "credit" | "debit";

// Builds a branded HTML statement that expo-print renders into a real PDF.
function buildStatementHtml(s: any): string {
  const esc = (v: any) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const stCur = s?.currency;
  const curOf = (c: any) => currencyCode(c);
  const money = (n: any, c: any = stCur) =>
    `${curOf(c)} ${Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const d = (v: any) => {
    const dt = new Date(v);
    return isNaN(dt.getTime()) ? esc(v) : dt.toLocaleDateString("en-GB");
  };
  const period =
    (s?.periodStart ? d(s.periodStart) : "—") +
    " to " +
    (s?.periodEnd ? d(s.periodEnd) : "—");

  const rows = (s?.transactions || [])
    .map((t: any) => {
      // Credit = money IN (positive, green); Debit = money OUT (negative, red).
      const isIn = t?.type === "Credit";
      const amt = Number(t?.amount || 0);
      const color = isIn ? "#059669" : "#DC2626";
      const sign = isIn ? "+" : "-";
      const c = t?.currency ?? stCur;
      return `<tr>
        <td>${d(t?.date || t?.createdAt)}</td>
        <td>${esc(t?.description || t?.reference || t?.code || "")}</td>
        <td style="text-align:right;color:${color};font-weight:600;">${sign}${money(amt, c)}</td>
        <td style="text-align:right;">${money(t?.balanceAfter, c)}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    * { font-family: -apple-system, Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; }
    body { margin: 0; padding: 28px; color: #0f172a; }
    .head { border-bottom: 3px solid #1D9E75; padding-bottom: 12px; margin-bottom: 16px; }
    .brand { color: #1D9E75; font-size: 22px; font-weight: 800; letter-spacing: .5px; }
    .title { font-size: 13px; color: #64748b; margin-top: 2px; }
    .meta { font-size: 12px; line-height: 1.7; margin: 12px 0 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { text-align: left; background: #f1f5f9; padding: 7px 8px; color: #475569; border-bottom: 1px solid #e2e8f0; }
    th:nth-child(3), th:nth-child(4) { text-align: right; }
    td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
    .summary { margin-top: 18px; border-top: 2px solid #e2e8f0; padding-top: 12px; font-size: 12px; width: 300px; margin-left: auto; }
    .summary .row { display: flex; justify-content: space-between; padding: 3px 0; }
    .summary .net { font-weight: 700; border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 6px; }
    .foot { margin-top: 24px; font-size: 10px; color: #94a3b8; text-align: center; }
  </style></head>
  <body>
    <div class="head">
      <div class="brand">Sarif</div>
      <div class="title">Account Statement</div>
    </div>
    <div class="meta">
      <b>${esc(s?.accountName || "")}</b> &nbsp;&middot;&nbsp; ${esc(s?.accountCode || "")}<br/>
      Currency: <b>${curOf(stCur)}</b><br/>
      Period: <b>${period}</b><br/>
      Opening Balance: <b>${money(s?.openingBalance)}</b>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Balance</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px;">No transactions in this period</td></tr>`}</tbody>
    </table>
    <div class="summary">
      <div class="row"><span>Total In (Credits)</span><span style="color:#059669;">+${money(s?.totalCredits)}</span></div>
      <div class="row"><span>Total Out (Debits)</span><span style="color:#DC2626;">-${money(s?.totalDebits)}</span></div>
      <div class="row net"><span>Net Movement</span><span style="color:${Number(s?.netMovement || 0) >= 0 ? "#059669" : "#DC2626"};">${Number(s?.netMovement || 0) < 0 ? "-" : "+"}${money(Math.abs(Number(s?.netMovement || 0)))}</span></div>
      <div class="row net"><span>Closing Balance</span><span>${money(s?.closingBalance)}</span></div>
    </div>
    <div class="foot">Generated ${new Date().toLocaleString("en-GB")} &middot; Sarif</div>
  </body></html>`;
}

// Single-transaction receipt as a real PDF (Credit = +/green, Debit = -/red).
function buildReceiptHtml(t: any): string {
  const esc = (v: any) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const curOf = (c: any) => currencyCode(c);
  const money = (n: any, c: any) =>
    `${curOf(c)} ${Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const isIn = t?.type === "Credit";
  const color = isIn ? "#059669" : "#DC2626";
  const sign = isIn ? "+" : "-";
  const when = new Date(t?.date || t?.createdAt);
  const whenStr = isNaN(when.getTime())
    ? esc(t?.date)
    : when.toLocaleString("en-GB");
  const row = (label: string, val: string) =>
    `<div class="row"><span class="l">${label}</span><span class="v">${val}</span></div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    * { font-family: -apple-system, Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; }
    body { margin: 0; padding: 32px; color: #0f172a; }
    .card { max-width: 460px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; }
    .head { background: #1D9E75; color: #fff; padding: 18px 22px; }
    .brand { font-size: 20px; font-weight: 800; letter-spacing: .5px; }
    .sub { font-size: 12px; opacity: .9; margin-top: 2px; }
    .amount { text-align: center; padding: 22px; border-bottom: 1px solid #f1f5f9; }
    .amount .big { font-size: 30px; font-weight: 800; color: ${color}; }
    .amount .tag { font-size: 12px; color: #64748b; margin-top: 4px; }
    .body { padding: 18px 22px; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f8fafc; font-size: 13px; }
    .row .l { color: #64748b; }
    .row .v { color: #0f172a; font-weight: 600; text-align: right; max-width: 60%; }
    .foot { text-align: center; font-size: 10px; color: #94a3b8; padding: 14px; }
  </style></head>
  <body>
    <div class="card">
      <div class="head">
        <div class="brand">Sarif</div>
        <div class="sub">Transaction Receipt</div>
      </div>
      <div class="amount">
        <div class="big">${sign}${money(t?.amount, t?.currency)}</div>
        <div class="tag">${isIn ? "Credit · Money In" : "Debit · Money Out"}</div>
      </div>
      <div class="body">
        ${row("Reference", esc(t?.code || t?.reference || "—"))}
        ${row("Date", whenStr)}
        ${t?.description ? row("Description", esc(t.description)) : ""}
        ${t?.counterAccountName ? row("Counterparty", esc(t.counterAccountName)) : ""}
        ${row("Balance After", money(t?.balanceAfter, t?.currency))}
      </div>
      <div class="foot">Generated ${new Date().toLocaleString("en-GB")} &middot; Sarif</div>
    </div>
  </body></html>`;
}

// Generate the receipt PDF on-device and share it.
async function shareReceipt(t: any): Promise<void> {
  try {
    Toast.show({ type: "info", text1: "Generating receipt..." });
    const Print = require("expo-print");
    const Sharing = require("expo-sharing");
    const { uri } = await Print.printToFileAsync({ html: buildReceiptHtml(t) });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `receipt_${t?.code || "txn"}.pdf`,
        UTI: "com.adobe.pdf",
      });
      Toast.show({ type: "success", text1: "Receipt shared" });
    } else {
      Toast.show({ type: "error", text1: "Sharing not available" });
    }
  } catch (e: any) {
    Toast.show({
      type: "error",
      text1: "Receipt failed",
      text2: e?.message || "Could not generate receipt",
    });
  }
}

export default function StatementsScreen() {
  const insets = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<ClientTransactionDto[]>([]);
  const [selectedTxn, setSelectedTxn] = useState<ClientTransactionDto | null>(
    null,
  );
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const headerAnim = useRef(new Animated.Value(0)).current;

  const getCurrencyParam = (): number | undefined => {
    if (currencyFilter === "kes") return Currency.KES;
    if (currencyFilter === "usd") return Currency.USD;
    if (currencyFilter === "ugx") return Currency.UGX;
    if (currencyFilter === "eur") return Currency.EUR;
    return undefined;
  };

  const getTypeParam = (): number | undefined => {
    if (typeFilter === "credit") return 1;
    if (typeFilter === "debit") return 0;
    return undefined;
  };

  const loadTransactions = useCallback(
    async (pageNum = 1, append = false) => {
      try {
        const res = await api.getClientTransactions(
          pageNum,
          25,
          getCurrencyParam(),
          getTypeParam(),
        );
        if (res.success && res.data) {
          setTransactions((prev) =>
            append ? [...prev, ...(res.data.items || [])] : (res.data.items || []),
          );
          setTotalPages(res.data.totalPages);
          setPage(pageNum);
        }
      } catch {}
    },
    [currencyFilter, typeFilter],
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadTransactions(1);
      setLoading(false);
      Animated.spring(headerAnim, {
        toValue: 1,
        tension: 50,
        friction: 9,
        useNativeDriver: true,
      }).start();
    })();
  }, [currencyFilter, typeFilter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTransactions(1);
    setRefreshing(false);
  };

  const onLoadMore = async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await loadTransactions(page + 1, true);
    setLoadingMore(false);
  };

  const currencyFilters: { key: CurrencyFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "kes", label: "KES" },
    { key: "usd", label: "USD" },
    { key: "ugx", label: "UGX" },
    { key: "eur", label: "EUR" },
  ];

  const typeFilters: {
    key: TypeFilter;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    { key: "all", label: "All", icon: "layers-outline" },
    { key: "credit", label: "In", icon: "arrow-down" },
    { key: "debit", label: "Out", icon: "arrow-up" },
  ];

  const handleDownloadPdf = async () => {
    try {
      Toast.show({ type: "info", text1: "Generating statement PDF..." });
      const Print = require("expo-print");
      const Sharing = require("expo-sharing");

      const today = localDate();
      const yearAgo = localDate(new Date(Date.now() - 365 * 86400000));

      // Pull the full statement (not the paginated list) so the PDF is complete.
      const res = await api.getClientPortalStatement(
        yearAgo,
        today,
        getCurrencyParam(),
      );
      if (!res.success || !res.data) {
        Toast.show({
          type: "error",
          text1: "PDF download failed",
          text2: res.message || "Could not load statement data",
        });
        return;
      }

      // Render HTML into a real PDF on-device, then share it.
      const { uri } = await Print.printToFileAsync({
        html: buildStatementHtml(res.data),
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `statement_${today}.pdf`,
          UTI: "com.adobe.pdf",
        });
        Toast.show({ type: "success", text1: "Statement PDF shared" });
      } else {
        Toast.show({
          type: "error",
          text1: "Sharing is not available on this device",
        });
      }
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "PDF download failed",
        text2: e?.message || "Could not generate PDF",
      });
    }
  };

  const handleExportCsv = async () => {
    Toast.show({ type: "info", text1: "Exporting transactions..." });
    const today = localDate();
    const result = await api.downloadAndShareFile(
      "/api/portal/transactions/export",
      `transactions_${today}.csv`,
    );
    if (result.success) {
      Toast.show({ type: "success", text1: "CSV exported" });
    } else {
      Toast.show({
        type: "error",
        text1: "Export failed",
        text2: result.error,
      });
    }
  };

  const handleTxnTap = async (item: ClientTransactionDto) => {
    Alert.alert(item.code || "Transaction", item.description, [
      {
        text: "View Receipt",
        onPress: async () => {
          Toast.show({ type: "info", text1: "Downloading receipt..." });
          const result = await api.downloadAndShareFile(
            `/api/portal/transactions/${item.id}/receipt`,
            `receipt_${item.code || "txn"}.pdf`,
          );
          if (result.success) {
            Toast.show({ type: "success", text1: "Receipt shared" });
          } else {
            Toast.show({
              type: "error",
              text1: "Receipt failed",
              text2: result.error,
            });
          }
        },
      },
      { text: "Close", style: "cancel" },
    ]);
  };

  const renderTransaction = ({ item }: { item: ClientTransactionDto }) => {
    const isCredit = item.type === "Credit";
    return (
      <TouchableOpacity
        style={[styles.txnCard, shadows.sm]}
        activeOpacity={0.7}
        onPress={() => setSelectedTxn(item)}
      >
        <View
          style={[
            styles.txnIcon,
            {
              backgroundColor: isCredit
                ? colors.successLight
                : colors.dangerLight,
            },
          ]}
        >
          <Ionicons
            name={isCredit ? "arrow-down" : "arrow-up"}
            size={16}
            color={isCredit ? colors.success : colors.danger}
          />
        </View>
        <View style={styles.txnInfo}>
          <Text style={styles.txnDescription} numberOfLines={1}>
            {item.description}
          </Text>
          <Text style={styles.txnDate}>
            <Text
              style={{
                color: item.currency === 1 ? "#3B82F6" : item.currency === 2 ? "#F6B45E" : item.currency === 3 ? "#7C3AED" : "#10B981",
                fontWeight: "700",
              }}
            >
              {currencyCode(item.currency)}
            </Text>
            {" · "}
            {formatDateTime(item.date)}
          </Text>
        </View>
        <View style={styles.txnRight}>
          <Text
            style={[
              styles.txnAmount,
              { color: isCredit ? colors.success : colors.danger },
            ]}
          >
            {isCredit ? "+" : "-"}
            {formatCurrency(item.amount || 0, item.currency)}
          </Text>
          <Text style={styles.txnBalance}>
            Bal: {formatCurrency(item.balanceAfter ?? 0, item.currency)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View
        style={[
          styles.header,
          {
            opacity: headerAnim,
            transform: [
              {
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View>
          <Text style={styles.title}>Statements</Text>
          <Text style={styles.subtitle}>Your transaction history</Text>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Statement"
            onPress={handleDownloadPdf}
            style={styles.dlBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="document-outline"
              size={18}
              color={colors.primary}
            />
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Download"
            onPress={handleExportCsv}
            style={styles.dlBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="download-outline"
              size={18}
              color={colors.success}
            />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Currency Filters */}
      <View style={styles.filterSection}>
        <View style={styles.filterRow}>
          {currencyFilters.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterPill,
                currencyFilter === f.key && styles.filterPillActive,
              ]}
              onPress={() => setCurrencyFilter(f.key)}
            >
              <Text
                style={[
                  styles.filterText,
                  currencyFilter === f.key && styles.filterTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={styles.filterSpacer} />
          {typeFilters.map((f) => (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Show ${f.key === "all" ? "all transactions" : f.key === "credit" ? "money in" : "money out"}`}               key={f.key}
              style={[
                styles.typeBtn,
                typeFilter === f.key && styles.typeBtnActive,
              ]}
              onPress={() => setTypeFilter(f.key)}
            >
              <Ionicons
                name={f.icon}
                size={14}
                color={typeFilter === f.key ? "#FFF" : colors.textTertiary}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Shimmer
              key={i}
              height={72}
              radius={borderRadius.md}
              style={{ marginBottom: spacing.sm }}
            />
          ))}
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={renderTransaction}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <EmptyState
              icon="document-text-outline"
              title="No transactions"
              subtitle="Your transaction history will appear here"
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                style={{ padding: 20 }}
                color={colors.primary}
              />
            ) : (
              <View style={{ height: 100 }} />
            )
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Transaction Detail Modal */}
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
              maxHeight: "85%",
            }}
          >
            {selectedTxn && (
              <>
                {/* Hero Amount */}
                <LinearGradient
                  colors={
                    selectedTxn.type === "Credit"
                      ? ["#059669", "#10B981"]
                      : ["#DC2626", "#EF4444"]
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
                    {formatCurrency(selectedTxn.amount, selectedTxn.currency)}
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
                <ScrollView style={{ padding: 20, flexShrink: 1 }}>
                  <InfoRow
                    label="Description"
                    value={selectedTxn.description}
                    stacked
                  />
                  <InfoRow
                    label="Date"
                    value={formatDateTime(selectedTxn.date)}
                  />
                  <InfoRow
                    label="Balance Before"
                    value={formatCurrency(
                      selectedTxn.balanceBefore ?? 0,
                      selectedTxn.currency,
                    )}
                  />
                  <InfoRow
                    label="Balance After"
                    value={formatCurrency(
                      selectedTxn.balanceAfter ?? 0,
                      selectedTxn.currency,
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
                    <InfoRow label="Notes" value={selectedTxn.notes} stacked />
                  ) : null}

                  {/* Download Receipt */}
                  <TouchableOpacity
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(91,156,255,0.12)",
                      borderRadius: 12,
                      padding: 14,
                      marginTop: 16,
                      gap: 8,
                    }}
                    onPress={() => shareReceipt(selectedTxn)}
                  >
                    <Ionicons
                      name="download-outline"
                      size={18}
                      color="#4F46E5"
                    />
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700" as any,
                        color: "#4F46E5",
                      }}
                    >
                      Download Receipt
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSelectedTxn(null)}
                    style={{
                      marginTop: 12,
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
                </ScrollView>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      {!!selectedTxn && (
          <Toast config={toastConfig} position="top" topOffset={insets.top + 12} />
        )}
      
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.extrabold,
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },

  // Filters
  filterSection: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  filterRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  filterPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  filterTextActive: { color: "#FFF" },
  filterSpacer: { flex: 1 },
  typeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  typeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  // List
  list: { paddingHorizontal: spacing.lg },

  // Transaction Card
  txnCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  txnIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  txnInfo: { flex: 1, marginRight: spacing.sm },
  txnDescription: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.text,
    flex: 1,
  },
  txnDate: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  txnRight: { alignItems: "flex-end" },
  txnAmount: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  txnBalance: { fontSize: 10, color: colors.textTertiary, marginTop: 2 },
  dRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  dLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  dValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    maxWidth: "60%",
    textAlign: "right",
  },
});
