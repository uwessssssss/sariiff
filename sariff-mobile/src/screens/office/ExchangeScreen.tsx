import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Animated,
  Modal,
  Alert,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { toastConfig } from "../../components/toastConfig";
import * as api from "../../services/api";
import {
  ExchangeRateDto,
  ExchangeFloatDto,
  ExchangeTransactionDto,
  AccountType,
  formatCurrency,
  Currency,
  formatDateTime,
  currencyCode,
  currencyChips,
  CURRENCY_COLOR,
  floatCurrenciesFor,
  foreignCurrenciesFor,
} from "../../types";
import { useBaseCurrency } from "../../hooks/useBaseCurrency";
import {
  shareViaWhatsApp,
  buildExchangeMessage,
} from "../../utils/notifications";
import {
  Button,
  Input,
  EmptyState,
  LoadingScreen,
  SectionHeader,
  GradientCard,
  ModalSheet,
  FormSection,
  ChipGroup,
  ActionBtn,
  InfoRow,
} from "../../components/ui";
import {
  colors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  shadows,
  fonts,
} from "../../theme";

type ModalType =
  | "none"
  | "setRate"
  | "exchange"
  | "fundFloat"
  | "withdrawFloat"
  | "settleProfit"
  | "rateHistory"
  | "dailyFloat";

// UGX trades at ~0.03 KES per unit, so small rates need more decimals.
const fmtRate = (r: number) => (Math.abs(r) < 1 ? r.toFixed(4) : r.toFixed(2));

export default function ExchangeScreen() {
  const submitSession = useRef(api.newIdempotencyKey());
  // Home currency (KES in Kenya, UGX in Uganda): rates are "home per 1 foreign"
  const { base, baseCode } = useBaseCurrency();
  const insets = useSafeAreaInsets();
  const [rate, setRate] = useState<ExchangeRateDto | null>(null);
  // Active rate per foreign currency (USD, UGX, EUR) — only those that are set
  const [rates, setRates] = useState<Record<number, ExchangeRateDto>>({});
  // Foreign side of a new trade, and the currency being quoted in "Set rate"
  const [fxCurrency, setFxCurrency] = useState(Currency.USD);
  const [rateCurrency, setRateCurrency] = useState(Currency.USD);
  // UGX / EUR / ... physical counts for day open / close
  const [dailyOtherCounts, setDailyOtherCounts] = useState<Record<number, string>>({});
  const [float, setFloat] = useState<ExchangeFloatDto | null>(null);
  const [txns, setTxns] = useState<ExchangeTransactionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalType>("none");
  const [detailTxn, setDetailTxn] = useState<ExchangeTransactionDto | null>(
    null,
  );
  const [formLoading, setFormLoading] = useState(false);
  const anims = useRef(
    Array(6)
      .fill(null)
      .map(() => new Animated.Value(0)),
  ).current;

  // Form fields
  const [buyRate, setBuyRate] = useState("");
  const [sellRate, setSellRate] = useState("");
  const [direction, setDirection] = useState(0); // 0 = foreign → {baseCode}, 1 = {baseCode} → foreign
  const [exchAmount, setExchAmount] = useState("");
  const [exchClientName, setExchClientName] = useState("");
  const [exchNotes, setExchNotes] = useState("");
  const [floatAmount, setFloatAmount] = useState("");
  const [floatCurrency, setFloatCurrency] = useState(0); // {baseCode}, USD, UGX or EUR
  const [floatSrcType, setFloatSrcType] = useState(AccountType.Cash);
  const [floatSrcId, setFloatSrcId] = useState("");
  const [floatAccounts, setFloatAccounts] = useState<{
    cash: any[];
    bank: any[];
    mpesa: any[];
  }>({ cash: [], bank: [], mpesa: [] });
  const [exchClients, setExchClients] = useState<any[]>([]);
  const [exchClientId, setExchClientId] = useState<string | undefined>(
    undefined,
  );
  const [exchClientSearch, setExchClientSearch] = useState("");
  const [exchCustomRate, setExchCustomRate] = useState("");
  const [settleCurrency, setSettleCurrency] = useState(0);
  const [settleAccId, setSettleAccId] = useState("");
  const [rateHistoryData, setRateHistoryData] = useState<any[]>([]);
  const [todaySummary, setTodaySummary] = useState<any>(null);
  const [floatHistory, setFloatHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [dailyKesCount, setDailyKesCount] = useState("");
  const [dailyUsdCount, setDailyUsdCount] = useState("");
  const [dailyNotes, setDailyNotes] = useState("");
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinDigits, setPinDigits] = useState(["", "", "", ""]);
  const [pinError, setPinError] = useState("");
  const [pinVerifying, setPinVerifying] = useState(false);
  const pinRefs = [
    useRef<any>(null),
    useRef<any>(null),
    useRef<any>(null),
    useRef<any>(null),
  ];
  const [pendingVoidId, setPendingVoidId] = useState("");
  const [pendingVoidCode, setPendingVoidCode] = useState("");

  // The rate the server will use: a custom rate when it's a number within ±10% of
  // today's board rate (the API rejects anything else), otherwise the board rate.
  const boardRate = direction === 0 ? rates[fxCurrency]?.buyRate ?? 0 : rates[fxCurrency]?.sellRate ?? 0;
  const customRateNum = parseFloat(exchCustomRate);
  const customRateGiven = exchCustomRate.trim() !== "" && Number.isFinite(customRateNum) && customRateNum > 0;
  const customRateOutOfBand =
    customRateGiven && boardRate > 0 && (customRateNum < boardRate * 0.9 || customRateNum > boardRate * 1.1);
  const customRateValid = customRateGiven && !customRateOutOfBand;
  const effectiveRate = customRateValid ? customRateNum : boardRate;

  const handleVoidExchange = async (id: string, code: string) => {
    // Check PIN first
    try {
      const status = await api.getTransactionPinStatus();
      if (status.success && status.data?.isEnabled && status.data?.hasPin) {
        setPinDigits(["", "", "", ""]);
        setPinError("");
        setPinVerifying(false);
        // Store pending void action
        setPendingVoidId(id);
        setPendingVoidCode(code);
        setShowPinModal(true);
        setTimeout(() => pinRefs[0].current?.focus(), 200);
        return;
      }
    } catch {}
    // No PIN — proceed directly
    confirmVoidExchange(id, code);
  };

  const confirmVoidExchange = (id: string, code: string) => {
    Alert.alert(
      "Void Exchange",
      `Void transaction ${code}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Void",
          style: "destructive",
          onPress: async () => {
            const prev = txns;
            setTxns((list) => list.filter((t) => t.id !== id)); // optimistic: row vanishes; float balances reconcile on success
            try {
              const res = await api.voidExchange(id, "Voided from mobile");
              if (res.success) {
                Toast.show({ type: "success", text1: "Exchange voided" });
                load(); /* reconcile float + profit */
              } else {
                setTxns(prev);
                Toast.show({
                  type: "error",
                  text1: "Failed",
                  text2: res.message,
                });
              }
            } catch (e: any) {
              setTxns(prev);
              Toast.show({ type: "error", text1: "Error", text2: e.message });
            }
          },
        },
      ],
    );
  };

  const handleSettleProfit = async () => {
    if (!settleAccId) {
      Toast.show({ type: "error", text1: "Select destination account" });
      return;
    }
    setFormLoading(true);
    try {
      const profitAmount =
        settleCurrency === base ? float?.kesProfit || 0 : float?.usdProfit || 0;
      const res = await api.settleExchangeProfit({
        currency: settleCurrency,
        amount: profitAmount,
        destinationType: floatSrcType,
        destinationAccountId: settleAccId,
      });
      if (res.success) {
        Toast.show({ type: "success", text1: "Profit settled" });
        setModal("none");
        load();
      } else Toast.show({ type: "error", text1: "Failed", text2: res.message });
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Error", text2: e.message });
    }
    setFormLoading(false);
  };

  const loadRateHistory = async () => {
    setModal("rateHistory");
    try {
      const res = await api.getExchangeRateHistory();
      if (res.success)
        setRateHistoryData(
          Array.isArray(res.data) ? res.data : res.data?.items || [],
        );
    } catch {}
  };

  const handleDailyFloat = async (type: "opening" | "closing") => {
    if (!dailyKesCount || !dailyUsdCount) {
      Toast.show({ type: "error", text1: "Enter both counts" });
      return;
    }
    setFormLoading(true);
    try {
      const others = float?.otherBalances || [];
      if (others.some((o) => !dailyOtherCounts[o.currency])) {
        Toast.show({ type: "error", text1: `Enter the ${others.map((o) => o.currencyCode).join(" and ")} count too` });
        setFormLoading(false);
        return;
      }
      const dto = {
        kesCount: parseFloat(dailyKesCount),
        usdCount: parseFloat(dailyUsdCount),
        notes: dailyNotes || undefined,
        otherCounts: others.map((o) => ({ currency: o.currency, count: parseFloat(dailyOtherCounts[o.currency]) || 0 })),
      };
      const res =
        type === "opening"
          ? await api.recordOpeningFloat(dto)
          : await api.recordClosingFloat(dto);
      if (res.success) {
        Toast.show({
          type: "success",
          text1: `${type === "opening" ? "Opening" : "Closing"} float recorded`,
        });
        setModal("none");
        setDailyKesCount("");
        setDailyUsdCount("");
        setDailyOtherCounts({});
        setDailyNotes("");
        load();
      } else Toast.show({ type: "error", text1: "Failed", text2: res.message });
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Error", text2: e.message });
    }
    setFormLoading(false);
  };

  const load = useCallback(async () => {
    try {
      const [rateRes, floatRes, txnRes, summaryRes] = await Promise.all([
        api.getCurrentExchangeRate(),
        api.getExchangeFloat(),
        api.getExchangeTransactions(1, 20),
        api.getTodayFloatSummary(),
      ]);
      if (rateRes.success) setRate(rateRes.data);
      const extra = await Promise.all(foreignCurrenciesFor(base).filter((c) => c !== Currency.USD).map((c) => api.getCurrentExchangeRate(c).catch(() => null)));
      const next: Record<number, ExchangeRateDto> = {};
      if (rateRes.success && rateRes.data) next[Currency.USD] = rateRes.data;
      foreignCurrenciesFor(base).filter((c) => c !== Currency.USD).forEach((c, i) => {
        const r: any = extra[i];
        if (r && r.success && r.data) next[c] = r.data;
      });
      setRates(next);
      if (floatRes.success) setFloat(floatRes.data);
      if (txnRes.success && txnRes.data) setTxns(txnRes.data.items || []);
      if (summaryRes.success) setTodaySummary(summaryRes.data);
    } catch {}
  }, [base]);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
      anims.forEach((a, i) =>
        Animated.spring(a, {
          toValue: 1,
          tension: 60,
          friction: 9,
          useNativeDriver: true,
          delay: i * 70,
        }).start(),
      );
    })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };
  const makeAnim = (i: number) => ({
    opacity: anims[i],
    transform: [
      {
        translateY: anims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
    ],
  });

  const handleSetRate = async () => {
    if (!buyRate || !sellRate) {
      Toast.show({ type: "error", text1: "Enter both rates" });
      return;
    }
    setFormLoading(true);
    const res = await api.setExchangeRate(
      parseFloat(buyRate),
      parseFloat(sellRate),
      rateCurrency,
    );
    if (res.success) {
      Toast.show({ type: "success", text1: `${currencyCode(rateCurrency)} rate updated` });
      setModal("none");
      load();
    } else Toast.show({ type: "error", text1: "Failed", text2: res.message });
    setFormLoading(false);
  };

  const handleExchangeWithPin = async () => {
    if (!exchAmount) {
      Toast.show({ type: "error", text1: "Enter amount" });
      return;
    }
    try {
      const status = await api.getTransactionPinStatus();
      if (status.success && status.data?.isEnabled && status.data?.hasPin) {
        setPinDigits(["", "", "", ""]);
        setPinError("");
        setPinVerifying(false);
        setShowPinModal(true);
        setTimeout(() => pinRefs[0].current?.focus(), 200);
      } else {
        handleExchange();
      }
    } catch {
      handleExchange();
    }
  };

  const handlePinDigit = async (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const arr = [...pinDigits];
    arr[index] = value;
    setPinDigits(arr);
    setPinError("");
    if (value && index < 3) {
      pinRefs[index + 1].current?.focus();
    }
    if (value && index === 3 && arr.every((d) => d)) {
      setPinVerifying(true);
      try {
        const res = await api.verifyTransactionPinBackend(arr.join(""));
        if (res.success) {
          setShowPinModal(false);
          if (pendingVoidId) {
            confirmVoidExchange(pendingVoidId, pendingVoidCode);
            setPendingVoidId("");
            setPendingVoidCode("");
          } else {
            handleExchange();
          }
        } else {
          setPinError(res.message || "Incorrect PIN");
          setPinDigits(["", "", "", ""]);
          setTimeout(() => pinRefs[0].current?.focus(), 100);
        }
      } catch {
        setPinError("Failed to verify");
        setPinDigits(["", "", "", ""]);
        setTimeout(() => pinRefs[0].current?.focus(), 100);
      }
      setPinVerifying(false);
    }
  };

  const handlePinKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !pinDigits[index] && index > 0) {
      pinRefs[index - 1].current?.focus();
    }
  };

  const handleExchange = async () => {
    if (!exchAmount) {
      Toast.show({ type: "error", text1: "Enter amount" });
      return;
    }
    setFormLoading(true);
    const exPayload = {
      direction,
      foreignCurrency: fxCurrency,
      exchangeType: exchType,
      amount: parseFloat(exchAmount),
      clientId: exchClientId || undefined,
      clientName: exchClientName || "Walk-in",
      customRate: exchCustomRate ? parseFloat(exchCustomRate) : undefined,
      notes: exchNotes || undefined,
    };
    // One key per submission: a second press after a timeout can't record it twice.
    const res = await api.withIdempotencyKey(api.submissionKey(submitSession.current, exPayload), () => api.createExchange(exPayload));
    if (res.success) {
      submitSession.current = api.newIdempotencyKey();
      const exchCode = res.data?.code || "";
      const givenCode = currencyCode(res.data?.currencyGiven ?? (direction === 0 ? fxCurrency : base));
      const receivedCode = currencyCode(res.data?.currencyReceived ?? (direction === 0 ? base : fxCurrency));
      const dirLabel = `${givenCode} → ${receivedCode}`;
      Toast.show({
        type: "success",
        text1: "Exchange completed",
        text2: exchCode,
      });
      setModal("none");
      setExchAmount("");
      setExchClientName("");
      setExchClientId(undefined);
      setExchCustomRate("");
      load();
      // Share via WhatsApp if client has phone
      if (exchClientId && exchClients.length > 0) {
        const client = exchClients.find((c: any) => c.id === exchClientId);
        if (client?.whatsAppNumber) {
          const r =
            String(res.data?.exchangeRate || exchCustomRate || rates[fxCurrency]?.buyRate || 0); // the rate the server actually used
          setTimeout(
            () =>
              Alert.alert(
                "Share Confirmation?",
                `Send exchange confirmation to ${client.fullName} via WhatsApp?`,
                [
                  { text: "Skip", style: "cancel" },
                  {
                    text: "Share via WhatsApp",
                    onPress: () =>
                      shareViaWhatsApp(
                        client.whatsAppNumber,
                        buildExchangeMessage({
                          clientName: client.fullName,
                          direction: dirLabel,
                          amountGiven: parseFloat(exchAmount).toLocaleString(
                            "en-US",
                            { minimumFractionDigits: 2 },
                          ),
                          currencyGiven: givenCode,
                          amountReceived: res.data?.amountReceived
                            ? String(res.data.amountReceived)
                            : "—",
                          currencyReceived: receivedCode,
                          rate: r,
                          code: exchCode,
                          date: new Date().toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }),
                        }),
                      ),
                  },
                ],
              ),
            500,
          );
        }
      }
    } else Toast.show({ type: "error", text1: "Failed", text2: res.message });
    setFormLoading(false);
  };

  const handleFloatOp = async (op: "fund" | "withdraw") => {
    if (!floatAmount || !floatSrcId) {
      Toast.show({ type: "error", text1: "Enter amount and select account" });
      return;
    }
    if (op === "fund" && floatCurrency !== base && !floatPurchaseRate) {
      Toast.show({ type: "error", text1: `Enter purchase rate for ${currencyCode(floatCurrency)}` });
      return;
    }
    setFormLoading(true);
    let res;
    if (op === "fund") {
      res = await api.fundExchangeFloat({
        currency: floatCurrency,
        amount: parseFloat(floatAmount),
        sourceType: floatSrcType,
        sourceAccountId: floatSrcId,
        ...(floatCurrency !== base && floatPurchaseRate
          ? { purchaseRate: parseFloat(floatPurchaseRate) }
          : {}),
      });
    } else {
      res = await api.withdrawExchangeFloat({
        currency: floatCurrency,
        amount: parseFloat(floatAmount),
        destinationType: floatSrcType,
        destinationAccountId: floatSrcId,
      });
    }
    if (res.success) {
      Toast.show({
        type: "success",
        text1: `Float ${op === "fund" ? "funded" : "withdrawn"}`,
      });
      setModal("none");
      setFloatAmount("");
      setFloatSrcId("");
      setFloatPurchaseRate("");
      load();
    } else Toast.show({ type: "error", text1: "Failed", text2: res.message });
    setFormLoading(false);
  };

  const loadFloatAccounts = async () => {
    try {
      const [c, b, m, cl] = await Promise.all([
        api.getCashAccounts(),
        api.getBankAccounts(),
        api.getMpesaAgents(),
        api.getClientLookup(),
      ]);
      setFloatAccounts({
        cash: c.success ? c.data : [],
        bank: b.success ? b.data : [],
        mpesa: m.success ? m.data : [],
      });
      setExchClients(cl.success ? cl.data : []);
    } catch {}
  };

  const [exchType, setExchType] = useState(0); // 0=Cash, 1=FromAccount
  const [floatPurchaseRate, setFloatPurchaseRate] = useState("");

  // Searchable vertical client picker (mirrors the Transactions account picker — render fn avoids focus loss)
  const renderExchClientPicker = (required: boolean) => {
    const matches = exchClientSearch.trim()
      ? exchClients.filter((c: any) =>
          (c.fullName || "")
            .toLowerCase()
            .includes(exchClientSearch.toLowerCase()),
        )
      : exchClients;
    const selected = exchClients.find((c: any) => c.id === exchClientId);
    return (
      <View style={{ marginBottom: spacing.sm }}>
        {selected ? (
          <View
            style={[
              styles.chipActive,
              {
                flexDirection: "row",
                alignItems: "center",
                padding: spacing.md,
                borderRadius: borderRadius.md,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: fontSize.sm,
                  fontWeight: fontWeight.bold,
                  color: colors.primary,
                }}
              >
                {selected.fullName}
              </Text>
              {selected.code ? (
                <Text style={{ fontSize: fontSize.xs, color: colors.primary }}>
                  {selected.code}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear"
              onPress={() => {
                setExchClientId(undefined);
                if (required) setExchClientName("");
                setExchClientSearch("");
              }}
            >
              <Ionicons name="close-circle" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {!required && (
              <TouchableOpacity
                style={[
                  styles.chip,
                  !exchClientId && styles.chipActive,
                  {
                    alignSelf: "flex-start",
                    paddingHorizontal: 16,
                    marginBottom: spacing.sm,
                  },
                ]}
                onPress={() => setExchClientId(undefined)}
              >
                <Text
                  style={[
                    styles.chipText,
                    !exchClientId && styles.chipTextActive,
                  ]}
                >
                  Walk-in
                </Text>
              </TouchableOpacity>
            )}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.surfaceAlt,
                borderRadius: borderRadius.md,
                paddingHorizontal: spacing.md,
                height: 42,
                marginBottom: spacing.xs,
              }}
            >
              <Ionicons name="search" size={16} color={colors.textTertiary} />
              <TextInput
                style={{
                  flex: 1,
                  marginLeft: spacing.sm,
                  fontSize: fontSize.sm,
                  color: colors.text,
                  paddingVertical: 0,
                }}
                placeholder="Search client by name..."
                placeholderTextColor={colors.textTertiary}
                value={exchClientSearch}
                onChangeText={setExchClientSearch}
                autoCorrect={false}
              />
              {exchClientSearch ? (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={() => setExchClientSearch("")}>
                  <Ionicons
                    name="close"
                    size={16}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
            <View
              style={{
                maxHeight: 200,
                borderWidth: matches.length > 0 ? 1 : 0,
                borderColor: colors.borderLight,
                borderRadius: borderRadius.md,
                overflow: "hidden",
              }}
            >
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {matches.map((c: any) => (
                  <TouchableOpacity
                    key={c.id}
                    style={{
                      padding: spacing.md,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.borderLight,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                    onPress={() => {
                      setExchClientId(c.id);
                      setExchClientName(c.fullName);
                      setExchClientSearch("");
                    }}
                  >
                    <Text
                      style={{
                        fontSize: fontSize.sm,
                        color: colors.text,
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {c.fullName}
                    </Text>
                    {c.code ? (
                      <Text
                        style={{
                          fontSize: fontSize.xs,
                          color: colors.textTertiary,
                          marginLeft: spacing.sm,
                        }}
                      >
                        {c.code}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
                {matches.length === 0 && (
                  <Text
                    style={{
                      padding: spacing.md,
                      color: colors.textTertiary,
                      fontSize: fontSize.sm,
                    }}
                  >
                    No matching clients
                  </Text>
                )}
              </ScrollView>
            </View>
            {!required && !exchClientId && (
              <Input
                label=""
                value={exchClientName}
                onChangeText={setExchClientName}
                icon="person-outline"
                placeholder="Walk-in client name"
              />
            )}
          </>
        )}
      </View>
    );
  };

  const getFloatAccountList = (type: number) => {
    // settleProfit -> settle currency; withdraw -> float currency (money goes INTO that-currency account);
    // fund -> always the home currency: foreign float is bought with it at the purchase rate.
    const cur =
      modal === "settleProfit"
        ? settleCurrency
        : modal === "fundFloat"
          ? 0
          : floatCurrency;
    switch (type) {
      case AccountType.Cash:
        return floatAccounts.cash
          .filter((a: any) => a.currency === cur) // Filter by selected currency
          .map((a: any) => ({
            id: a.id,
            name: `Cash ${currencyCode(a.currency)}`,
          }));
      case AccountType.Bank:
        return floatAccounts.bank
          .filter((a: any) => a.currency === cur)
          .map((a: any) => ({ id: a.id, name: a.bankName }));
      case AccountType.Mpesa:
        // Each wallet holds its network's currency (M-Pesa = KES even in Uganda)
        return floatAccounts.mpesa
          .filter((a: any) => (a.currency ?? base) === cur)
          .map((a: any) => ({
            id: a.id,
            name: a.agentName,
          }));
      default:
        return [];
    }
  };

  if (loading) return <LoadingScreen message="Loading exchange..." />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Exchange</Text>
        <TouchableOpacity
          onPress={() => {
            setModal("exchange");
            loadFloatAccounts();
            if (rate) {
              setBuyRate(rate.buyRate.toString());
              setSellRate(rate.sellRate.toString());
            }
          }}
        >
          <LinearGradient
            colors={colors.gradients.primary}
            style={styles.addBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="swap-horizontal" size={18} color="#FFF" />
            <Text style={styles.addBtnText}>New</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: 100,
        }}
      >
        {/* Rate Card */}
        <Animated.View style={makeAnim(0)}>
          <LinearGradient
            colors={colors.gradients.dark}
            style={[styles.rateCard, shadows.xl]}
          >
            <View style={styles.rateRow}>
              <View style={styles.rateItem}>
                <Text style={styles.rateLabel}>BUY (USD→{baseCode})</Text>
                <Text
                  style={styles.rateValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {rate?.buyRate?.toFixed(2) || "—"}
                </Text>
              </View>
              <View style={styles.rateDivider} />
              <View style={styles.rateItem}>
                <Text style={styles.rateLabel}>SELL ({baseCode}→USD)</Text>
                <Text
                  style={styles.rateValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {rate?.sellRate?.toFixed(2) || "—"}
                </Text>
              </View>
            </View>
            {/* UGX / EUR rates, when set */}
            {foreignCurrenciesFor(base).filter((c) => c !== Currency.USD && rates[c]).map((c) => (
              <Text key={c} style={[styles.rateLabel, { marginTop: 8 }]}>
                {currencyCode(c)}: buy {fmtRate(rates[c].buyRate)} · sell {fmtRate(rates[c].sellRate)}
              </Text>
            ))}
            <TouchableOpacity
              style={styles.setRateBtn}
              onPress={() => {
                setModal("setRate");
                setRateCurrency(Currency.USD);
                if (rate) {
                  setBuyRate(rate.buyRate.toString());
                  setSellRate(rate.sellRate.toString());
                }
              }}
            >
              <Ionicons
                name="pricetags-outline"
                size={14}
                color={colors.gold}
              />
              <Text style={styles.setRateBtnText}>Set Rate</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        {/* Float Cards */}
        <Animated.View style={[styles.floatRow, makeAnim(1)]}>
          <GradientCard
            gradient={colors.gradients.emerald}
            icon="cash-outline"
            label={`Float ${baseCode}`}
            value={formatCurrency(float?.kesBalance || 0, base)}
            style={{ flex: 1 }}
          />
          <GradientCard
            gradient={colors.gradients.blue}
            icon="logo-usd"
            label="Float USD"
            value={formatCurrency(float?.usdBalance || 0, Currency.USD)}
            style={{ flex: 1 }}
          />
        </Animated.View>
        {(float?.otherBalances || []).length > 0 && (
          <Animated.View style={[styles.floatRow, makeAnim(1)]}>
            {(float?.otherBalances || []).map((o) => (
              <GradientCard
                key={o.currency}
                gradient={colors.gradients.dark}
                icon="cash-outline"
                label={`Float ${o.currencyCode}`}
                value={formatCurrency(o.balance, o.currency)}
                style={{ flex: 1 }}
              />
            ))}
          </Animated.View>
        )}

        {/* Action Buttons */}
        <Animated.View style={[styles.actionRow, makeAnim(2)]}>
          <TouchableOpacity
            style={[styles.actionBtn, shadows.sm]}
            onPress={() => {
              setModal("fundFloat");
              loadFloatAccounts();
            }}
          >
            <View
              style={[
                styles.actIconChip,
                { backgroundColor: "rgba(16,185,129,0.16)" },
              ]}
            >
              <Ionicons name="arrow-down-circle" size={19} color="#10B981" />
            </View>
            <Text style={styles.actionBtnText}>Fund Float</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, shadows.sm]}
            onPress={() => {
              setModal("withdrawFloat");
              loadFloatAccounts();
            }}
          >
            <View
              style={[
                styles.actIconChip,
                { backgroundColor: "rgba(239,68,68,0.14)" },
              ]}
            >
              <Ionicons name="arrow-up-circle" size={19} color="#EF4444" />
            </View>
            <Text style={styles.actionBtnText}>Withdraw</Text>
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={[styles.actionRow, makeAnim(2)]}>
          <TouchableOpacity
            style={[styles.actionBtn, shadows.sm]}
            onPress={loadRateHistory}
          >
            <View
              style={[
                styles.actIconChip,
                { backgroundColor: "rgba(139,92,246,0.16)" },
              ]}
            >
              <Ionicons name="stats-chart" size={18} color="#A78BFA" />
            </View>
            <Text style={styles.actionBtnText}>Rate History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, shadows.sm]}
            onPress={() => setModal("dailyFloat")}
          >
            <View
              style={[
                styles.actIconChip,
                { backgroundColor: "rgba(245,158,11,0.16)" },
              ]}
            >
              <Ionicons name="sunny" size={18} color="#FBBF24" />
            </View>
            <Text style={styles.actionBtnText}>Day Open/Close</Text>
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={[styles.actionRow, makeAnim(2)]}>
          <TouchableOpacity
            style={[styles.actionBtn, shadows.sm]}
            onPress={() => {
              setModal("settleProfit");
              loadFloatAccounts();
            }}
          >
            <View
              style={[
                styles.actIconChip,
                { backgroundColor: "rgba(233,185,73,0.18)" },
              ]}
            >
              <Ionicons name="cash" size={18} color="#F6D77E" />
            </View>
            <Text style={styles.actionBtnText}>Settle Profit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, shadows.sm]}
            onPress={async () => {
              const now = new Date();
              const from = new Date(
                now.getFullYear(),
                now.getMonth(),
                1,
              ).toISOString();
              const to = now.toISOString();
              const res = await api.getFloatHistory(from, to);
              if (res.success) setFloatHistory(res.data || []);
              setShowHistory(true);
            }}
          >
            <View
              style={[
                styles.actIconChip,
                { backgroundColor: "rgba(99,102,241,0.16)" },
              ]}
            >
              <Ionicons name="time" size={18} color="#818CF8" />
            </View>
            <Text style={styles.actionBtnText}>Float History</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Profit */}
        {float && (
          <Animated.View style={makeAnim(3)}>
            <View style={[styles.profitCard, shadows.sm]}>
              <Text style={styles.profitTitle}>Unrealised Profit</Text>
              <View style={styles.profitRow}>
                <View>
                  <Text style={styles.profitLabel}>{baseCode}</Text>
                  <Text
                    style={[styles.profitValue, { color: "#10B981" }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {formatCurrency(float.kesProfit, base)}
                  </Text>
                </View>
                <View>
                  <Text style={styles.profitLabel}>USD</Text>
                  <Text
                    style={[styles.profitValue, { color: "#3B82F6" }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {formatCurrency(float.usdProfit, Currency.USD)}
                  </Text>
                </View>
              </View>
              {(float.kesProfit > 0 || float.usdProfit > 0) && (
                <TouchableOpacity
                  style={styles.settleProfitBtn}
                  onPress={() => {
                    setModal("settleProfit");
                    loadFloatAccounts();
                  }}
                >
                  <Ionicons name="wallet-outline" size={16} color="#FFF" />
                  <Text style={styles.settleProfitText}>
                    Settle Profit to Cash
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}

        {/* Today's Summary Card */}
        {todaySummary && (
          <Animated.View style={[{ marginBottom: spacing.lg }, makeAnim(3)]}>
            <View
              style={[
                {
                  backgroundColor: colors.glass,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: borderRadius.lg,
                  padding: spacing.lg,
                },
                shadows.sm,
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: spacing.md,
                }}
              >
                <Text
                  style={{
                    fontSize: fontSize.md,
                    fontWeight: fontWeight.bold,
                    color: colors.text,
                  }}
                >
                  📊 Today's Summary
                </Text>
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 12,
                    backgroundColor: todaySummary.isClosed
                      ? "rgba(57,217,176,0.12)"
                      : todaySummary.openingKes > 0
                        ? "rgba(246,180,94,0.12)"
                        : "rgba(255,107,129,0.12)",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700" as any,
                      color: todaySummary.isClosed
                        ? "#166534"
                        : todaySummary.openingKes > 0
                          ? "#92400E"
                          : "#991B1B",
                    }}
                  >
                    {todaySummary.isClosed
                      ? "✅ Closed"
                      : todaySummary.openingKes > 0
                        ? "☀️ Open"
                        : "⏳ Not Started"}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(57,217,176,0.12)",
                    borderRadius: borderRadius.md,
                    padding: spacing.sm,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: fontSize.xs, color: "#39D9B0" }}>
                    Exchanges
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSize.lg,
                      fontWeight: fontWeight.bold,
                      color: "#39D9B0",
                    }}
                  >
                    {todaySummary.exchangeCount || 0}
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(91,156,255,0.12)",
                    borderRadius: borderRadius.md,
                    padding: spacing.sm,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: fontSize.xs, color: "#7FB3FF" }}>
                    {baseCode} Profit
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: fontWeight.bold,
                      color: "#7FB3FF",
                    }}
                  >
                    {formatCurrency(todaySummary.kesProfit || 0, base)}
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(154,123,255,0.12)",
                    borderRadius: borderRadius.md,
                    padding: spacing.sm,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: fontSize.xs, color: "#B9A3FF" }}>
                    USD Profit
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSize.md,
                      fontWeight: fontWeight.bold,
                      color: "#B9A3FF",
                    }}
                  >
                    {formatCurrency(todaySummary.usdProfit || 0, Currency.USD)}
                  </Text>
                </View>
              </View>
              {(todaySummary.kesVariance != null &&
                todaySummary.kesVariance !== 0) ||
              (todaySummary.usdVariance != null &&
                todaySummary.usdVariance !== 0) ? (
                <View
                  style={{
                    flexDirection: "row",
                    gap: spacing.sm,
                    marginTop: spacing.sm,
                    backgroundColor: "rgba(246,180,94,0.12)",
                    borderRadius: borderRadius.md,
                    padding: spacing.sm,
                  }}
                >
                  <Text
                    style={{ fontSize: fontSize.xs, color: "#F6B45E", flex: 1 }}
                  >
                    ⚠️ Variance: {baseCode}{" "}
                    {(todaySummary.kesVariance || 0).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}{" "}
                    | USD{" "}
                    {(todaySummary.usdVariance || 0).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </Text>
                </View>
              ) : null}
            </View>
          </Animated.View>
        )}

        {/* Transactions */}
        <Animated.View style={makeAnim(4)}>
          <SectionHeader title="Recent Exchanges" />
        </Animated.View>
        {txns.length === 0 ? (
          <EmptyState icon="swap-horizontal-outline" title="No exchanges yet" />
        ) : (
          txns.map((t, i) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.txnCard, shadows.sm]}
              activeOpacity={0.7}
              onPress={() => setDetailTxn(t)}
              onLongPress={() =>
                t.status !== "Voided" && handleVoidExchange(t.id, t.code)
              }
            >
              <View
                style={[
                  styles.txnIcon,
                  {
                    backgroundColor: t.direction === 0 ? "rgba(91,156,255,0.12)" : "rgba(246,180,94,0.12)",
                  },
                ]}
              >
                <Ionicons
                  name={t.direction === 0 ? "arrow-down" : "arrow-up"}
                  size={16}
                  color={t.direction === 0 ? "#2563EB" : "#D97706"}
                />
              </View>
              <View style={styles.txnText}>
                <Text style={styles.txnDesc}>
                  {t.clientName || "Walk-in"}
                  {t.status === "Voided" ? " [VOIDED]" : ""}
                </Text>
                <Text style={styles.txnMeta}>
                  {currencyCode(t.currencyGiven)}→{currencyCode(t.currencyReceived)} @ {fmtRate(t.exchangeRate)}{" "}
                  · {formatDateTime(t.date)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={[
                    styles.txnAmount,
                    t.status === "Voided" && {
                      textDecorationLine: "line-through",
                      color: colors.textTertiary,
                    },
                  ]}
                >
                  {formatCurrency(t.amountGiven, t.currencyGiven)}
                </Text>
                <Text style={[styles.txnProfit, { color: t.profit > 0 ? "#10B981" : t.profit < 0 ? "#FF6B81" : colors.textTertiary }]}>
                  {t.profit ? `${t.profit > 0 ? "+" : "-"}${formatCurrency(Math.abs(t.profit), base)}` : "—"}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Exchange Detail Modal */}
      <ModalSheet
        visible={!!detailTxn}
        onClose={() => setDetailTxn(null)}
        title="Exchange Details"
        icon="swap-horizontal-outline"
        iconColor="#4F46E5"
        iconBg="rgba(91,156,255,0.12)"
      >
        {detailTxn && (
          <>
            <View
              style={{
                backgroundColor: colors.glass,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <InfoRow label="Code" value={detailTxn.code} />
              <InfoRow
                label="Status"
                value={detailTxn.status}
                valueColor={
                  detailTxn.status === "Voided" ? colors.danger : colors.success
                }
              />
              <InfoRow
                label="Client"
                value={detailTxn.clientName || "Walk-in"}
              />
              <InfoRow
                label="Direction"
                value={`${currencyCode(detailTxn.currencyGiven)} → ${currencyCode(detailTxn.currencyReceived)}`}
              />
              <InfoRow label="Rate" value={String(detailTxn.exchangeRate)} />
              <InfoRow
                label="Amount Given"
                value={formatCurrency(
                  detailTxn.amountGiven,
                  detailTxn.currencyGiven,
                )}
                valueColor="#FF6B81"
              />
              <InfoRow
                label="Amount Received"
                value={formatCurrency(
                  detailTxn.amountReceived,
                  detailTxn.currencyReceived,
                )}
                valueColor="#39D9B0"
              />
              <InfoRow
                label="Profit"
                value={formatCurrency(
                  detailTxn.profit,
                  detailTxn.profitCurrency ?? base,
                )}
                valueColor="#10B981"
              />
              <InfoRow label="Date" value={formatDateTime(detailTxn.date)} />
            </View>
            {detailTxn.notes ? (
              <View
                style={{
                  backgroundColor: colors.glass,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <InfoRow label="Notes" value={detailTxn.notes} stacked />
              </View>
            ) : null}
            {detailTxn.status !== "Voided" && (
              <ActionBtn
                title="Void Exchange"
                onPress={() => {
                  const t = detailTxn;
                  setDetailTxn(null);
                  handleVoidExchange(t.id, t.code);
                }}
                icon="close-circle-outline"
                gradient={["#EF4444", "#F87171"]}
              />
            )}
          </>
        )}
      </ModalSheet>

      {/* Set Rate Modal */}
      <ModalSheet
        visible={modal === "setRate"}
        onClose={() => setModal("none")}
        title="Set Exchange Rate"
        icon="trending-up-outline"
        iconColor="#8B5CF6"
        iconBg="rgba(154,123,255,0.12)"
      >
        <FormSection label="Currency">
          <ChipGroup
            options={currencyChips(foreignCurrenciesFor(base))}
            selected={rateCurrency}
            onSelect={(v: number) => {
              setRateCurrency(v);
              setBuyRate(rates[v] ? String(rates[v].buyRate) : "");
              setSellRate(rates[v] ? String(rates[v].sellRate) : "");
            }}
          />
        </FormSection>
        <FormSection label={`Buy Rate (${baseCode} per 1 ${currencyCode(rateCurrency)})`}>
          <Input
            label=""
            value={buyRate}
            onChangeText={setBuyRate}
            keyboardType="numeric"
            icon="trending-up-outline"
            placeholder="128.50"
          />
        </FormSection>
        <FormSection label={`Sell Rate (${baseCode} per 1 ${currencyCode(rateCurrency)})`}>
          <Input
            label=""
            value={sellRate}
            onChangeText={setSellRate}
            keyboardType="numeric"
            icon="trending-down-outline"
            placeholder="129.50"
          />
        </FormSection>
        {rates[rateCurrency] && (
          <View
            style={{
              backgroundColor: colors.glass,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <InfoRow
              label="Current Buy"
              value={fmtRate(rates[rateCurrency].buyRate)}
              valueColor="#059669"
            />
            <InfoRow
              label="Current Sell"
              value={fmtRate(rates[rateCurrency].sellRate)}
              valueColor="#3B82F6"
            />
            <InfoRow
              label="Spread"
              value={fmtRate(rates[rateCurrency].sellRate - rates[rateCurrency].buyRate)}
              valueColor="#8B5CF6"
            />
          </View>
        )}
        <ActionBtn
          title="Update Rate"
          onPress={handleSetRate}
          loading={formLoading}
          icon="checkmark-circle-outline"
          gradient={["#7C3AED", "#8B5CF6"]}
        />
      </ModalSheet>

      {/* New Exchange Modal */}
      <ModalSheet
        visible={modal === "exchange"}
        onClose={() => setModal("none")}
        title="New Exchange"
        icon="swap-horizontal-outline"
        iconColor="#4F46E5"
        iconBg="rgba(91,156,255,0.12)"
      >
        <FormSection label="Exchange Type">
          <ChipGroup
            options={[
              { value: 0, label: "💵 Cash" },
              { value: 1, label: "📋 From Account" },
            ]}
            selected={exchType}
            onSelect={setExchType}
          />
        </FormSection>
        <FormSection label="Currency">
          {foreignCurrenciesFor(base).some((c) => rates[c]) ? (
            <ChipGroup
              options={currencyChips(foreignCurrenciesFor(base).filter((c) => rates[c]))}
              selected={fxCurrency}
              onSelect={setFxCurrency}
            />
          ) : (
            <Text style={{ color: "#FF6B81", fontSize: 13 }}>No exchange rate is set. Set a rate first.</Text>
          )}
        </FormSection>
        <FormSection label="Direction">
          <ChipGroup
            options={[
              { value: 0, label: `${currencyCode(fxCurrency)} → ${baseCode}`, color: "#39D9B0" },
              { value: 1, label: `${baseCode} → ${currencyCode(fxCurrency)}`, color: "#7FB3FF" },
            ]}
            selected={direction}
            onSelect={setDirection}
          />
        </FormSection>
        <FormSection label={`Amount the client gives (${direction === 0 ? currencyCode(fxCurrency) : "${baseCode}"})`}>
          <Input
            label=""
            value={exchAmount}
            onChangeText={setExchAmount}
            keyboardType="numeric"
            icon="cash-outline"
            placeholder="0.00"
          />
        </FormSection>
        {rates[fxCurrency] && exchAmount ? (
          <View
            style={{
              backgroundColor: "rgba(57,217,176,0.12)",
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Text
              style={{ fontSize: 13, color: "#39D9B0", textAlign: "center" }}
            >
              Rate{customRateValid ? " (custom)" : ""}:{" "}
              {fmtRate(effectiveRate)}{" "}
              → Client receives:{" "}
              {formatCurrency(
                parseFloat(exchAmount || "0") *
                  (direction === 0 ? effectiveRate : effectiveRate > 0 ? 1 / effectiveRate : 0),
                direction === 0 ? base : fxCurrency,
              )}
            </Text>
            {customRateOutOfBand ? (
              <Text style={{ fontSize: 12, color: "#FF6B81", textAlign: "center", marginTop: 6 }}>
                Custom rate must be within 10% of today's rate ({fmtRate(boardRate * 0.9)} – {fmtRate(boardRate * 1.1)}).
              </Text>
            ) : null}
          </View>
        ) : null}
        <FormSection label="Custom Rate (optional)">
          <Input
            label=""
            value={exchCustomRate}
            onChangeText={setExchCustomRate}
            keyboardType="numeric"
            icon="calculator-outline"
            placeholder="Leave blank for current rate"
          />
        </FormSection>
        {exchType === 1 ? (
          <FormSection label="Select Client">
            {renderExchClientPicker(true)}
          </FormSection>
        ) : (
          <FormSection label="Client (optional)">
            {renderExchClientPicker(false)}
          </FormSection>
        )}
        <ActionBtn
          title="Complete Exchange"
          onPress={handleExchangeWithPin}
          loading={formLoading}
          icon="swap-horizontal-outline"
          gradient={["#4F46E5", "#6366F1"]}
        />
      </ModalSheet>

      {/* Fund/Withdraw Float Modal */}
      <ModalSheet
        visible={modal === "fundFloat" || modal === "withdrawFloat"}
        onClose={() => setModal("none")}
        title={modal === "fundFloat" ? "Fund Float" : "Withdraw Float"}
        icon={
          modal === "fundFloat" ? "add-circle-outline" : "remove-circle-outline"
        }
        iconColor={modal === "fundFloat" ? "#059669" : "#DC2626"}
        iconBg={modal === "fundFloat" ? "rgba(57,217,176,0.12)" : "rgba(255,107,129,0.12)"}
      >
        <FormSection label="Currency">
          <ChipGroup
            options={currencyChips(floatCurrenciesFor(base))}
            selected={floatCurrency}
            onSelect={(v: number) => {
              setFloatCurrency(v);
              setFloatSrcId("");
              setFloatPurchaseRate("");
            }}
          />
        </FormSection>
        <FormSection label="Amount">
          <Input
            label=""
            value={floatAmount}
            onChangeText={setFloatAmount}
            keyboardType="numeric"
            icon="cash-outline"
            placeholder="0.00"
          />
        </FormSection>
        {modal === "fundFloat" && floatCurrency !== base && (
          <FormSection label={`Purchase Rate (${baseCode} per 1 ${currencyCode(floatCurrency)})`}>
            <Input
              label=""
              value={floatPurchaseRate}
              onChangeText={setFloatPurchaseRate}
              keyboardType="numeric"
              icon="calculator-outline"
              placeholder="e.g. 128.50"
            />
            {floatAmount && floatPurchaseRate && (
              <Text style={{ fontSize: 13, color: "#39D9B0", marginTop: 4 }}>
                Cost: {baseCode}{" "}
                {(
                  parseFloat(floatAmount) * parseFloat(floatPurchaseRate)
                ).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </Text>
            )}
          </FormSection>
        )}
        <FormSection label="Account Type">
          <ChipGroup
            options={[
              { value: AccountType.Cash, label: "Cash" },
              { value: AccountType.Bank, label: "Bank" },
              ...(modal === "fundFloat" || floatCurrency === 0
                ? [{ value: AccountType.Mpesa, label: "Mobile money" }]
                : []),
            ]}
            selected={floatSrcType}
            onSelect={(v: number) => {
              setFloatSrcType(v);
              setFloatSrcId("");
            }}
          />
        </FormSection>
        <FormSection
          label={
            modal === "fundFloat" ? `Pay From (${baseCode} Account)` : "Select Account"
          }
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {getFloatAccountList(floatSrcType).map((a: any) => (
              <TouchableOpacity
                key={a.id}
                style={[
                  styles.chip,
                  floatSrcId === a.id && styles.chipActive,
                  { paddingHorizontal: 16 },
                ]}
                onPress={() => setFloatSrcId(a.id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    floatSrcId === a.id && styles.chipTextActive,
                  ]}
                >
                  {a.name}
                </Text>
              </TouchableOpacity>
            ))}
            {getFloatAccountList(floatSrcType).length === 0 && (
              <Text style={{ color: colors.textTertiary, fontSize: 13 }}>
                No{" "}
                {modal !== "fundFloat" ? currencyCode(floatCurrency) : `${baseCode}`}{" "}
                accounts
              </Text>
            )}
          </View>
        </FormSection>
        <ActionBtn
          title={modal === "fundFloat" ? "Fund Float" : "Withdraw Float"}
          onPress={() =>
            handleFloatOp(modal === "fundFloat" ? "fund" : "withdraw")
          }
          loading={formLoading}
          icon={
            modal === "fundFloat"
              ? "add-circle-outline"
              : "remove-circle-outline"
          }
          gradient={
            modal === "fundFloat"
              ? ["#059669", "#10B981"]
              : ["#DC2626", "#EF4444"]
          }
        />
      </ModalSheet>

      {/* Settle Profit Modal */}
      <ModalSheet
        visible={modal === "settleProfit"}
        onClose={() => setModal("none")}
        title="Settle Profit"
        icon="wallet-outline"
        iconColor="#D97706"
        iconBg="rgba(246,180,94,0.12)"
      >
        {float && (
          <View
            style={{
              backgroundColor: colors.glass,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <InfoRow
              label={`${baseCode} Profit Available`}
              value={formatCurrency(float.kesProfit, base)}
              valueColor="#059669"
            />
            <InfoRow
              label="USD Profit Available"
              value={formatCurrency(float.usdProfit, Currency.USD)}
              valueColor="#2563EB"
            />
          </View>
        )}
        <FormSection label="Currency">
          <ChipGroup
            options={[
              {
                value: 0,
                label: `${baseCode} (${formatCurrency(float?.kesProfit || 0, base)})`,
                color: "#39D9B0",
              },
              {
                value: 1,
                label: `USD (${formatCurrency(float?.usdProfit || 0, Currency.USD)})`,
                color: "#7FB3FF",
              },
            ]}
            selected={settleCurrency}
            onSelect={(v: number) => {
              setSettleCurrency(v);
              setSettleAccId("");
              setFloatSrcType(AccountType.Cash);
            }}
          />
        </FormSection>
        <FormSection label="Destination Account Type">
          <ChipGroup
            options={[
              { value: AccountType.Cash, label: "Cash" },
              { value: AccountType.Bank, label: "Bank" },
              ...(settleCurrency === 0
                ? [{ value: AccountType.Mpesa, label: "Mobile money" }]
                : []),
            ]}
            selected={floatSrcType}
            onSelect={(v: number) => {
              setFloatSrcType(v);
              setSettleAccId("");
            }}
          />
        </FormSection>
        <FormSection label="Destination Account">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {getFloatAccountList(floatSrcType).map((a: any) => (
              <TouchableOpacity
                key={a.id}
                style={[
                  styles.chip,
                  settleAccId === a.id && styles.chipActive,
                  { paddingHorizontal: 16 },
                ]}
                onPress={() => setSettleAccId(a.id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    settleAccId === a.id && styles.chipTextActive,
                  ]}
                >
                  {a.name}
                </Text>
              </TouchableOpacity>
            ))}
            {getFloatAccountList(floatSrcType).length === 0 && (
              <Text style={{ color: "#9CA3AF", fontSize: 13 }}>
                No {currencyCode(settleCurrency)} accounts
              </Text>
            )}
          </View>
        </FormSection>
        <ActionBtn
          title="Settle Profit"
          onPress={handleSettleProfit}
          loading={formLoading}
          icon="wallet-outline"
          gradient={["#D97706", "#F59E0B"]}
        />
      </ModalSheet>

      {/* Rate History Modal */}
      <ModalSheet
        visible={modal === "rateHistory"}
        onClose={() => setModal("none")}
        title="Rate History"
        icon="trending-up-outline"
        iconColor="#8B5CF6"
        iconBg="rgba(154,123,255,0.12)"
      >
        {rateHistoryData.length === 0 ? (
          <Text
            style={{
              color: colors.textTertiary,
              textAlign: "center",
              padding: 40,
            }}
          >
            No rate history
          </Text>
        ) : (
          rateHistoryData.slice(0, 20).map((r: any, i: number) => (
            <View
              key={i}
              style={[
                {
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderColor: colors.border,
                },
                i === 0 && {
                  backgroundColor: "rgba(91,156,255,0.16)",
                  marginHorizontal: -20,
                  paddingHorizontal: 20,
                  borderRadius: 12,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: i === 0 ? ("700" as any) : ("500" as any),
                    color: colors.text,
                  }}
                >
                  {new Date(r.effectiveFrom || r.createdAt).toLocaleDateString(
                    "en-GB",
                    { day: "numeric", month: "short", year: "numeric" },
                  )}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                  {new Date(r.effectiveFrom || r.createdAt).toLocaleTimeString(
                    "en-GB",
                    { hour: "2-digit", minute: "2-digit" },
                  )}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", marginRight: 16 }}>
                <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                  Buy
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700" as any,
                    color: "#39D9B0",
                  }}
                >
                  {(r.buyRate || 0).toFixed(2)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                  Sell
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700" as any,
                    color: "#7FB3FF",
                  }}
                >
                  {(r.sellRate || 0).toFixed(2)}
                </Text>
              </View>
            </View>
          ))
        )}
      </ModalSheet>

      {/* Daily Float Modal */}
      <ModalSheet
        visible={modal === "dailyFloat"}
        onClose={() => setModal("none")}
        title="Daily Float Verification"
        icon="clipboard-outline"
        iconColor="#F59E0B"
        iconBg="rgba(246,180,94,0.12)"
      >
        <View
          style={{
            backgroundColor: colors.glass,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <InfoRow
            label={`System ${baseCode}`}
            value={formatCurrency(float?.kesBalance || 0, base)}
            valueColor="#059669"
          />
          <InfoRow
            label="System USD"
            value={formatCurrency(float?.usdBalance || 0, Currency.USD)}
            valueColor="#2563EB"
          />
          {(float?.otherBalances || []).map((o) => (
            <InfoRow
              key={o.currency}
              label={`System ${o.currencyCode}`}
              value={formatCurrency(o.balance, o.currency)}
              valueColor={CURRENCY_COLOR[o.currency]}
            />
          ))}
        </View>
        <FormSection label={`Physical ${baseCode} Count`}>
          <Input
            label=""
            value={dailyKesCount}
            onChangeText={setDailyKesCount}
            keyboardType="numeric"
            icon="cash-outline"
            placeholder={`Count physical ${baseCode}`}
          />
        </FormSection>
        <FormSection label="Physical USD Count">
          <Input
            label=""
            value={dailyUsdCount}
            onChangeText={setDailyUsdCount}
            keyboardType="numeric"
            icon="logo-usd"
            placeholder="Count physical USD"
          />
        </FormSection>
        {(float?.otherBalances || []).map((o) => (
          <FormSection key={o.currency} label={`Physical ${o.currencyCode} Count`}>
            <Input
              label=""
              value={dailyOtherCounts[o.currency] ?? ""}
              onChangeText={(v: string) => setDailyOtherCounts((p) => ({ ...p, [o.currency]: v }))}
              keyboardType="numeric"
              icon="cash-outline"
              placeholder={`Count physical ${o.currencyCode}`}
            />
            {dailyOtherCounts[o.currency] ? (
              <Text style={{ fontSize: 12, marginTop: 4, color: parseFloat(dailyOtherCounts[o.currency]) - o.balance === 0 ? "#39D9B0" : "#FF6B81" }}>
                Variance: {parseFloat(dailyOtherCounts[o.currency]) - o.balance >= 0 ? "+" : ""}
                {(parseFloat(dailyOtherCounts[o.currency]) - o.balance).toFixed(2)}
              </Text>
            ) : null}
          </FormSection>
        ))}
        {dailyKesCount && dailyUsdCount && (
          <View
            style={{
              backgroundColor:
                parseFloat(dailyKesCount) - (float?.kesBalance || 0) === 0 &&
                parseFloat(dailyUsdCount) - (float?.usdBalance || 0) === 0
                  ? "rgba(57,217,176,0.12)"
                  : "rgba(246,180,94,0.12)",
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600" as any,
                color: "#9AA6BE",
                marginBottom: 4,
              }}
            >
              Variance
            </Text>
            <InfoRow
              label={`${baseCode}`}
              value={`${parseFloat(dailyKesCount) - (float?.kesBalance || 0) >= 0 ? "+" : ""}${(parseFloat(dailyKesCount) - (float?.kesBalance || 0)).toFixed(2)}`}
              valueColor={
                parseFloat(dailyKesCount) - (float?.kesBalance || 0) === 0
                  ? "#059669"
                  : "#DC2626"
              }
            />
            <InfoRow
              label="USD"
              value={`${parseFloat(dailyUsdCount) - (float?.usdBalance || 0) >= 0 ? "+" : ""}${(parseFloat(dailyUsdCount) - (float?.usdBalance || 0)).toFixed(2)}`}
              valueColor={
                parseFloat(dailyUsdCount) - (float?.usdBalance || 0) === 0
                  ? "#059669"
                  : "#DC2626"
              }
            />
          </View>
        )}
        <FormSection label="Notes (optional)">
          <Input
            label=""
            value={dailyNotes}
            onChangeText={setDailyNotes}
            icon="document-text-outline"
            placeholder="Shift notes..."
            multiline
          />
        </FormSection>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <ActionBtn
              title="☀️ Opening"
              onPress={() => handleDailyFloat("opening")}
              loading={formLoading}
              gradient={["#D97706", "#F59E0B"]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <ActionBtn
              title="🌙 Closing"
              onPress={() => handleDailyFloat("closing")}
              loading={formLoading}
              gradient={["#4F46E5", "#6366F1"]}
            />
          </View>
        </View>
      </ModalSheet>
      {/* Float History Modal */}
      <Modal visible={showHistory} transparent animationType="fade">
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: spacing.md,
          }}
          activeOpacity={1}
          onPress={() => setShowHistory(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 16,
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: spacing.lg,
                borderBottomWidth: 1,
                borderColor: colors.borderLight,
              }}
            >
              <Text
                style={{
                  fontSize: fontSize.lg,
                  fontWeight: fontWeight.bold,
                  color: colors.text,
                }}
              >
                📅 Float History
              </Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={() => setShowHistory(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: spacing.md }}>
              {floatHistory.length === 0 ? (
                <Text
                  style={{
                    textAlign: "center",
                    color: colors.textTertiary,
                    padding: spacing.xl,
                  }}
                >
                  No daily records yet. Start by recording an opening float.
                </Text>
              ) : (
                floatHistory.map((day: any, i: number) => (
                  <View
                    key={i}
                    style={{
                      marginBottom: spacing.md,
                      backgroundColor: colors.glass,
                      borderRadius: borderRadius.md,
                      padding: spacing.md,
                      borderLeftWidth: 4,
                      borderLeftColor: day.isClosed ? "#10B981" : "#F59E0B",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fontSize.sm,
                          fontWeight: fontWeight.bold,
                          color: colors.text,
                        }}
                      >
                        {new Date(day.date).toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 10,
                          backgroundColor: day.isClosed ? "rgba(57,217,176,0.12)" : "rgba(246,180,94,0.12)",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "700" as any,
                            color: day.isClosed ? "#39D9B0" : "#F6B45E",
                          }}
                        >
                          {day.isClosed ? "Closed" : "Open"}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: spacing.sm }}>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{ fontSize: 10, color: colors.textTertiary }}
                        >
                          Exchanges
                        </Text>
                        <Text
                          style={{
                            fontSize: fontSize.sm,
                            fontWeight: fontWeight.bold,
                            color: colors.text,
                          }}
                        >
                          {day.exchangeCount || 0}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{ fontSize: 10, color: colors.textTertiary }}
                        >
                          {baseCode} Profit
                        </Text>
                        <Text
                          style={{
                            fontSize: fontSize.sm,
                            fontWeight: fontWeight.bold,
                            color: "#10B981",
                          }}
                        >
                          {formatCurrency(day.kesProfit || 0, base)}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{ fontSize: 10, color: colors.textTertiary }}
                        >
                          USD Profit
                        </Text>
                        <Text
                          style={{
                            fontSize: fontSize.sm,
                            fontWeight: fontWeight.bold,
                            color: "#3B82F6",
                          }}
                        >
                          {formatCurrency(day.usdProfit || 0, Currency.USD)}
                        </Text>
                      </View>
                    </View>
                    {day.isClosed &&
                      (day.kesVariance !== 0 || day.usdVariance !== 0) && (
                        <View
                          style={{
                            flexDirection: "row",
                            marginTop: 6,
                            gap: spacing.sm,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              color:
                                (day.kesVariance || 0) === 0
                                  ? "#10B981"
                                  : "#DC2626",
                            }}
                          >
                            {baseCode} var: {(day.kesVariance || 0).toFixed(2)}
                          </Text>
                          <Text
                            style={{
                              fontSize: 10,
                              color:
                                (day.usdVariance || 0) === 0
                                  ? "#10B981"
                                  : "#DC2626",
                            }}
                          >
                            USD var: {(day.usdVariance || 0).toFixed(2)}
                          </Text>
                        </View>
                      )}
                  </View>
                ))
              )}
              <View style={{ height: 20 }} />
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* PIN Modal — Beautiful 4-box design */}
      <Modal visible={showPinModal} transparent animationType="fade">
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: spacing.lg,
          }}
          activeOpacity={1}
          onPress={() => setShowPinModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              backgroundColor: "#161A26",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.09)",
              borderRadius: 20,
              padding: 24,
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "rgba(91,156,255,0.12)",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Ionicons name="lock-closed" size={28} color="#4F46E5" />
            </View>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700" as any,
                color: "#F4F6FB",
              }}
            >
              Enter Bureau PIN
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: "#9AA6BE",
                marginTop: 4,
                textAlign: "center",
              }}
            >
              Enter the 4-digit bureau PIN to continue
            </Text>
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                marginTop: 24,
                marginBottom: 12,
              }}
            >
              {pinDigits.map((d, i) => (
                <TextInput
                  key={i}
                  ref={pinRefs[i]}
                  value={d}
                  onChangeText={(v) => handlePinDigit(i, v)}
                  onKeyPress={({ nativeEvent }) =>
                    handlePinKeyPress(i, nativeEvent.key)
                  }
                  style={{
                    width: 56,
                    height: 56,
                    borderWidth: 2,
                    borderColor: pinError
                      ? "#DC2626"
                      : d
                        ? "#4F46E5"
                        : "rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    textAlign: "center",
                    fontSize: 24,
                    fontWeight: "700" as any,
                    color: "#F4F6FB",
                    backgroundColor: "rgba(255,255,255,0.06)",
                  }}
                  keyboardType="numeric"
                  maxLength={1}
                  secureTextEntry
                  editable={!pinVerifying}
                />
              ))}
            </View>
            {pinVerifying && (
              <Text
                style={{
                  color: "#4F46E5",
                  fontSize: 13,
                  fontWeight: "600" as any,
                  marginBottom: 8,
                }}
              >
                Verifying...
              </Text>
            )}
            {pinError ? (
              <Text style={{ color: "#FF6B81", fontSize: 13, marginBottom: 8 }}>
                {pinError}
              </Text>
            ) : null}
            <Text
              style={{
                color: "#9CA3AF",
                fontSize: 11,
                textAlign: "center",
                marginTop: 8,
              }}
            >
              Contact your administrator if you don't know the PIN
            </Text>
            <TouchableOpacity
              style={{
                width: "100%",
                paddingVertical: 14,
                backgroundColor: "rgba(255,255,255,0.06)",
                borderRadius: 12,
                alignItems: "center",
                marginTop: 20,
              }}
              onPress={() => setShowPinModal(false)}
            >
              <Text
                style={{
                  color: "#9AA6BE",
                  fontWeight: "600" as any,
                  fontSize: 15,
                }}
              >
                Cancel
              </Text>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: 4,
  },
  addBtnText: {
    color: "#FFF",
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  rateCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  rateRow: { flexDirection: "row", alignItems: "center" },
  rateItem: { flex: 1, alignItems: "center" },
  rateLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 1,
    marginBottom: 4,
  },
  rateValue: {
    fontSize: 28,
    fontWeight: "800" as any,
    fontFamily: fonts.display,
    color: "#FFF",
  },
  rateDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  setRateBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    marginTop: spacing.md,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  setRateBtnText: {
    color: colors.primaryLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  floatRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  actIconChip: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  actionBtnText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  profitCard: {
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  profitTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  profitRow: { flexDirection: "row", justifyContent: "space-around" },
  profitLabel: { fontSize: fontSize.xs, color: colors.textTertiary },
  profitValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    fontFamily: fonts.display,
    marginTop: 2,
  },
  settleProfitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  settleProfitText: {
    color: "#FFF",
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  txnCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  txnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  txnText: { flex: 1 },
  txnDesc: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  txnMeta: { fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 },
  txnAmount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  txnProfit: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    marginTop: 2,
  },
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  chipRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 2,
    borderColor: "transparent",
  },
  chipActive: {
    backgroundColor: colors.infoLight,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  chipTextActive: { color: colors.primary, fontWeight: fontWeight.bold },
  calcText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    backgroundColor: colors.infoLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
});
