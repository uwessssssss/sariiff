import { AccountType, Currency, ExchangeFloatDto, ExchangeRateDto, ExchangeTransactionDto, currencyCode, foreignCurrenciesFor } from "../../../../types";
import { Alert, Animated } from "react-native";
import { ModalType } from "../helpers";
import Toast from "react-native-toast-message";
import * as api from "../../../../services/api";
import { buildExchangeMessage, shareViaWhatsApp } from "../../../../utils/notifications";
import { useBaseCurrency } from "../../../../hooks/useBaseCurrency";
import { useCallback, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** ExchangeScreen: state (part 1 of 2 of useExchangeScreen). */
export function useExchangeScreenState() {
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
  const [direction, setDirection] = useState(0);
 // 0 = foreign → {baseCode}, 1 = {baseCode} → foreign
  const [exchAmount, setExchAmount] = useState("");
  const [exchClientName, setExchClientName] = useState("");
  const [exchNotes, setExchNotes] = useState("");
  const [floatAmount, setFloatAmount] = useState("");
  const [floatCurrency, setFloatCurrency] = useState(0);
 // {baseCode}, USD, UGX or EUR
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
    // A void whose PIN box was closed must not run when the PIN for THIS exchange is entered.
    setPendingVoidId("");
    setPendingVoidCode("");
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
        // switched-off accounts are refused by the server for float moves
        bank: b.success ? (b.data || []).filter((x: any) => x.isActive !== false) : [],
        mpesa: m.success ? (m.data || []).filter((x: any) => x.isActive !== false) : [],
      });
      setExchClients(cl.success ? cl.data : []);
    } catch {}
  };
  const [exchType, setExchType] = useState(0);
 // 0=Cash, 1=FromAccount
  const [floatPurchaseRate, setFloatPurchaseRate] = useState("");

  return {
    submitSession,
    base,
    baseCode,
    insets,
    rate,
    setRate,
    rates,
    setRates,
    fxCurrency,
    setFxCurrency,
    rateCurrency,
    setRateCurrency,
    dailyOtherCounts,
    setDailyOtherCounts,
    float,
    setFloat,
    txns,
    setTxns,
    loading,
    setLoading,
    refreshing,
    setRefreshing,
    modal,
    setModal,
    detailTxn,
    setDetailTxn,
    formLoading,
    setFormLoading,
    anims,
    buyRate,
    setBuyRate,
    sellRate,
    setSellRate,
    direction,
    setDirection,
    exchAmount,
    setExchAmount,
    exchClientName,
    setExchClientName,
    exchNotes,
    setExchNotes,
    floatAmount,
    setFloatAmount,
    floatCurrency,
    setFloatCurrency,
    floatSrcType,
    setFloatSrcType,
    floatSrcId,
    setFloatSrcId,
    floatAccounts,
    setFloatAccounts,
    exchClients,
    setExchClients,
    exchClientId,
    setExchClientId,
    exchClientSearch,
    setExchClientSearch,
    exchCustomRate,
    setExchCustomRate,
    settleCurrency,
    setSettleCurrency,
    settleAccId,
    setSettleAccId,
    rateHistoryData,
    setRateHistoryData,
    todaySummary,
    setTodaySummary,
    floatHistory,
    setFloatHistory,
    showHistory,
    setShowHistory,
    dailyKesCount,
    setDailyKesCount,
    dailyUsdCount,
    setDailyUsdCount,
    dailyNotes,
    setDailyNotes,
    showPinModal,
    setShowPinModal,
    pinDigits,
    setPinDigits,
    pinError,
    setPinError,
    pinVerifying,
    setPinVerifying,
    pinRefs,
    pendingVoidId,
    setPendingVoidId,
    pendingVoidCode,
    setPendingVoidCode,
    boardRate,
    customRateNum,
    customRateGiven,
    customRateOutOfBand,
    customRateValid,
    effectiveRate,
    handleVoidExchange,
    confirmVoidExchange,
    handleSettleProfit,
    loadRateHistory,
    handleDailyFloat,
    load,
    onRefresh,
    makeAnim,
    handleSetRate,
    handleExchangeWithPin,
    handlePinDigit,
    handlePinKeyPress,
    handleExchange,
    handleFloatOp,
    loadFloatAccounts,
    exchType,
    setExchType,
    floatPurchaseRate,
    setFloatPurchaseRate,
  };
}
