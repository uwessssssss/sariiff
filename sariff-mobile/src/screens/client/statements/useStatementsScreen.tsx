import { Alert, Animated, Text, TouchableOpacity, View } from "react-native";
import { ClientTransactionDto, Currency, balanceRowsFrom, currencyCode, formatCurrency, formatDateTime } from "../../../types";
import { CurrencyFilter, TypeFilter, buildStatementHtml, styles } from "./helpers";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import * as api from "../../../services/api";
import { colors, shadows } from "../../../theme";
import { localDate } from "../../../utils/dates";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** All of StatementsScreen's state, effects and handlers. The screen and its sections read them from here. */
export function useStatementsScreen() {
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
  // Tapping KES then USD quickly sends two requests; only answers for the filters now on
  // screen may fill the list (a late KES page showed under the USD chip).
  const listSeq = useRef(0);
  const loadTransactions = useCallback(
    async (pageNum = 1, append = false) => {
      const seq = append ? listSeq.current : ++listSeq.current;
      try {
        const res = await api.getClientTransactions(
          pageNum,
          25,
          getCurrencyParam(),
          getTypeParam(),
        );
        if (seq !== listSeq.current) return;
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
  // ---- This month's statement summary (Nov 2026): a statement is opening balance, money in,
  // money out and closing balance — the screen used to be a bare list of transactions.
  const [mainCurrency, setMainCurrency] = useState<number | null>(null);
  const [summary, setSummary] = useState<any>(null);
  useEffect(() => {
    api.getClientProfile().then((r: any) => {
      const rows = balanceRowsFrom(r?.data).slice().sort((a, b) =>
        (Math.abs(b.totalIn) + Math.abs(b.totalOut) + Math.abs(b.balance)) - (Math.abs(a.totalIn) + Math.abs(a.totalOut) + Math.abs(a.balance)));
      setMainCurrency(rows[0]?.currency ?? Currency.KES);
    }).catch(() => setMainCurrency(Currency.KES));
  }, []);
  const summaryCurrency = getCurrencyParam() ?? mainCurrency;
  useEffect(() => {
    if (summaryCurrency === null || summaryCurrency === undefined) return;
    const now = new Date();
    const first = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
    let current = true;   // a late answer for the previous currency must not replace this one
    api.getClientPortalStatement(first, localDate(), summaryCurrency)
      .then((r: any) => { if (current) setSummary(r?.success ? { ...r.data, currency: summaryCurrency } : null); })
      .catch(() => { if (current) setSummary(null); });
    return () => { current = false; };
  }, [summaryCurrency]);
  const SummaryHeader = summary ? (
    <View style={styles.sumCard} accessible accessibilityLabel={`This month in ${currencyCode(summary.currency)}: opening ${formatCurrency(summary.openingBalance, summary.currency)}, in ${formatCurrency(summary.totalCredits, summary.currency)}, out ${formatCurrency(summary.totalDebits, summary.currency)}, closing ${formatCurrency(summary.closingBalance, summary.currency)}`}>
      <View style={styles.sumHead}>
        <Text style={styles.sumEyebrow}>This month · {currencyCode(summary.currency)}</Text>
        {currencyFilter === "all" && <Text style={styles.sumHint}>Pick a currency above to switch</Text>}
      </View>
      <View style={styles.sumRow}>
        <View style={styles.sumCell}>
          <Text style={styles.sumLabel}>Opening</Text>
          <Text style={styles.sumValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{formatCurrency(summary.openingBalance, summary.currency)}</Text>
        </View>
        <View style={[styles.sumCell, styles.sumDivider]}>
          <Text style={styles.sumLabel}>Closing</Text>
          <Text style={[styles.sumValue, Number(summary.closingBalance) < 0 && { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{formatCurrency(summary.closingBalance, summary.currency)}</Text>
        </View>
      </View>
      <View style={[styles.sumRow, styles.sumRowTop]}>
        <View style={styles.sumCell}>
          <Text style={styles.sumLabel}>Money in</Text>
          <Text style={[styles.sumSmall, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>+{formatCurrency(summary.totalCredits, summary.currency)}</Text>
        </View>
        <View style={[styles.sumCell, styles.sumDivider]}>
          <Text style={styles.sumLabel}>Money out</Text>
          <Text style={[styles.sumSmall, { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>−{formatCurrency(summary.totalDebits, summary.currency)}</Text>
        </View>
      </View>
    </View>
  ) : null;
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

  return {
    insets,
    transactions,
    setTransactions,
    selectedTxn,
    setSelectedTxn,
    currencyFilter,
    setCurrencyFilter,
    typeFilter,
    setTypeFilter,
    page,
    setPage,
    totalPages,
    setTotalPages,
    loading,
    setLoading,
    refreshing,
    setRefreshing,
    loadingMore,
    setLoadingMore,
    headerAnim,
    getCurrencyParam,
    getTypeParam,
    loadTransactions,
    mainCurrency,
    setMainCurrency,
    summary,
    setSummary,
    summaryCurrency,
    SummaryHeader,
    onRefresh,
    onLoadMore,
    currencyFilters,
    typeFilters,
    handleDownloadPdf,
    handleExportCsv,
    handleTxnTap,
    renderTransaction,
  };
}

export type StatementsScreenVM = ReturnType<typeof useStatementsScreen>;
