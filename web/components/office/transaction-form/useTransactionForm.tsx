"use client";

import { AccountOption, TransactionFormProps, convertAmount, isAssetAccount } from "./helpers";
import { AccountType, BankAccountDto, CashAccountDto, ClientDto, CreateTransactionDto, Currency, MpesaAgentDto, PaymentMethod, TransactionType, allPages, createTransaction, currencyCode, getBankAccounts, getCashAccounts, getClients, getCompanyCurrencies, getMpesaAgents, newIdempotencyKey, submissionKey, withIdempotencyKey } from "@/lib/api";
import { Minus, Plus } from "lucide-react";
import { buildTransactionMessage, fmt } from "@/lib/whatsapp";
import { checkPinStatus } from "@/components/ui/PinModal";
import { isCurrencyAllowed, useBaseCurrency } from "@/lib/useBaseCurrency";
import { localDate } from "@/lib/dates";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { type buildTransactionFormView } from "./buildTransactionFormView";

/** All of TransactionForm's state, effects and handlers. The screen and its sections read them from here. */
export function useTransactionForm({ onClose, onSuccess }: TransactionFormProps) {
  // One idempotency session per open form; renewed after each successful save.
  const submitSession = useRef(newIdempotencyKey());
  const { base } = useBaseCurrency();
  // Until an account is picked, the currency shown is the bureau's own (UGX in Uganda),
  // not KES. The picked account then sets it (setCurrency(counterAccount.currency)).
  const accountPickedRef = useRef(false);
  useEffect(() => {
    if (!accountPickedRef.current) setCurrency((c) => (c === Currency.KES && base !== Currency.KES ? base : c));
  }, [base]);
  // Form state
  const [transactionType, setTransactionType] = useState<TransactionType>(
    TransactionType.Credit,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PaymentMethod.Cash,
  );
  const [currency, setCurrency] = useState<Currency>(Currency.KES);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [dateValue, setDateValue] = useState(
    localDate(),
  );
  // Account selection
  const [primaryAccountType, setPrimaryAccountType] = useState<AccountType>(
    AccountType.Client,
  );
  const [primaryAccountId, setPrimaryAccountId] = useState("");
  const [counterAccountType, setCounterAccountType] = useState<AccountType>(
    AccountType.Cash,
  );
  const [counterAccountId, setCounterAccountId] = useState("");
  // Search states
  const [primarySearchTerm, setPrimarySearchTerm] = useState("");
  const [counterSearchTerm, setCounterSearchTerm] = useState("");
  // Data from API
  const [cashAccounts, setCashAccounts] = useState<CashAccountDto[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountDto[]>([]);
  const [mpesaAgents, setMpesaAgents] = useState<MpesaAgentDto[]>([]);
  const [clients, setClients] = useState<ClientDto[]>([]);
  // Currencies the bureau uses (so clients get UGX / EUR sub-accounts when relevant)
  const [companyCurrencies, setCompanyCurrencies] = useState<number[]>([]);
  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shareModal, setShareModal] = useState<{
    show: boolean;
    title: string;
    details: { label: string; value: string }[];
    phone: string;
    message: string;
  }>({ show: false, title: "", details: [], phone: "", message: "" });
  const [showPin, setShowPin] = useState(false);
  // ============================================================
  // DETERMINE BALANCE EFFECT
  // ============================================================
  // For ASSET accounts: Debit = Increase, Credit = Decrease
  // For LIABILITY (Client): Credit = Increase, Debit = Decrease
  const isBalanceIncrease = useMemo(() => {
    if (isAssetAccount(primaryAccountType)) {
      return transactionType === TransactionType.Debit;
    } else {
      return transactionType === TransactionType.Credit;
    }
  }, [primaryAccountType, transactionType]);
  // Fetch all accounts on mount
  useEffect(() => {
    const fetchAccounts = async () => {
      setIsLoading(true);
      try {
        const [cashRes, bankRes, mpesaRes, clientRes] = await Promise.all([
          getCashAccounts(),
          getBankAccounts(),
          getMpesaAgents(),
          allPages((p, n) => getClients(p, n)),
        ]);

        if (cashRes.success && cashRes.data) {
          setCashAccounts(cashRes.data.filter((a) => a.isActive !== false));
        }
        if (bankRes.success && bankRes.data) {
          setBankAccounts(bankRes.data.filter((a) => a.isActive !== false));
        }
        if (mpesaRes.success && mpesaRes.data) {
          setMpesaAgents(mpesaRes.data.filter((a) => a.isActive !== false));
        }
        if (clientRes.success && clientRes.data?.items) {
          setClients(clientRes.data.items.filter((c) => c.isActive !== false));
        }
        getCompanyCurrencies()
          .then((r) => {
            if (r.success && r.data?.currencies) {
              setCompanyCurrencies(r.data.currencies.map((c: any) => c.value));
            }
          })
          .catch(() => {});
      } catch (error) {
        console.error("Failed to fetch accounts:", error);
        toast.error("Failed to load accounts");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccounts();
  }, []);
  // Reset transaction type when primary account type changes
  // Default to the "increase" action for better UX
  useEffect(() => {
    if (isAssetAccount(primaryAccountType)) {
      setTransactionType(TransactionType.Debit); // Debit increases assets
    } else {
      setTransactionType(TransactionType.Credit); // Credit increases client balance
    }
  }, [primaryAccountType]);
  // Get accounts by type for dropdown
  const getAccountsByType = (type: AccountType): AccountOption[] => {
    switch (type) {
      case AccountType.Cash:
        return cashAccounts.map((a) => ({
          id: a.id,
          name: `Cash ${currencyCode(a.currency)}`,   // the API sends no name: this read "Cash 0" / "Cash 1"
          type: AccountType.Cash,
          currency: a.currency,
          balance: a.balance,
          isActive: a.isActive !== false,
        }));
      case AccountType.Bank:
        return bankAccounts.map((a) => ({
          id: a.id,
          name: `${a.bankName} - ${a.accountNumber}`,
          type: AccountType.Bank,
          currency: a.currency,
          balance: a.balance,
          isActive: a.isActive !== false,
          accountNumber: a.accountNumber,
        }));
      case AccountType.Mpesa:
        return mpesaAgents.map((a) => ({
          id: a.id,
          name: `${a.agentName} - ${a.agentNumber}`,
          type: AccountType.Mpesa,
          currency: a.currency ?? base, // the wallet's own currency (M-Pesa = KES even in Uganda)
          balance: a.balance,
          isActive: a.isActive !== false,
          agentNumber: a.agentNumber,
        }));
      case AccountType.Client:
        const clientAccounts: AccountOption[] = [];
        clients.forEach((c) => {
          // Home currency and USD always; others when the bureau uses them or
          // the client already holds a balance in them.
          const others: any[] = (c as any).otherBalances || [];
          // Home currency and USD always; Ugandan bureaus also KES. Anything the
          // country doesn't use (UGX in Kenya) only appears while the client
          // still holds a balance in it, so it can be settled.
          const codes = new Set<number>([base, Currency.USD, ...(base === Currency.UGX ? [Currency.KES] : [])]);
          companyCurrencies.filter((x) => isCurrencyAllowed(base, x)).forEach((x) => codes.add(x));
          others.filter((b) => isCurrencyAllowed(base, b.currency) || (b.balance ?? 0) !== 0).forEach((b) => codes.add(b.currency));
          [...codes]
            .sort((x, y) => x - y)
            .forEach((cur) => {
              const code = currencyCode(cur);
              const balance =
                cur === Currency.KES
                  ? c.balanceKES || 0
                  : cur === Currency.USD
                    ? c.balanceUSD || 0
                    : others.find((b) => b.currency === cur)?.balance || 0;
              clientAccounts.push({
                id: `${c.id}_${code}`,
                name: `${c.fullName} (${c.code}) - ${code}`,
                type: AccountType.Client,
                currency: cur as Currency,
                balance,
                isActive: c.isActive !== false,
                clientId: c.id,
                currencyType: code,
              });
            });
        });
        return clientAccounts;
      default:
        return [];
    }
  };
  // Get filtered accounts based on search term
  const getFilteredAccounts = (
    type: AccountType,
    searchTerm: string,
  ): AccountOption[] => {
    const accounts = getAccountsByType(type);
    if (!searchTerm.trim()) {
      return accounts;
    }
    const lowerSearch = searchTerm.toLowerCase();
    return accounts.filter(
      (account) =>
        account.name.toLowerCase().includes(lowerSearch) ||
        account.accountNumber?.toLowerCase().includes(lowerSearch) ||
        account.agentNumber?.toLowerCase().includes(lowerSearch),
    );
  };
  // Memoized filtered accounts
  const filteredPrimaryAccounts = useMemo(() => {
    return getFilteredAccounts(primaryAccountType, primarySearchTerm);
  }, [
    primaryAccountType,
    primarySearchTerm,
    clients,
    cashAccounts,
    bankAccounts,
    mpesaAgents,
  ]);
  const filteredCounterAccounts = useMemo(() => {
    const accounts = getFilteredAccounts(counterAccountType, counterSearchTerm);
    // Exclude the already-selected primary account if both account types are the same
    if (primaryAccountType === counterAccountType && primaryAccountId) {
      return accounts.filter((a) => a.id !== primaryAccountId);
    }
    return accounts;
  }, [
    counterAccountType,
    counterSearchTerm,
    clients,
    cashAccounts,
    bankAccounts,
    mpesaAgents,
    primaryAccountType,
    primaryAccountId,
  ]);
  // Get actual client ID from composite ID
  const getActualClientId = (compositeId: string): string => {
    // "<clientId>_KES" / "_USD" / "_UGX" / "_EUR"
    if (/_[A-Z]{3}$/.test(compositeId)) {
      return compositeId.slice(0, -4);
    }
    return compositeId;
  };
  // Get counter account type based on payment method
  const getCounterAccountTypeFromPayment = (
    method: PaymentMethod,
  ): AccountType => {
    switch (method) {
      case PaymentMethod.Cash:
        return AccountType.Cash;
      case PaymentMethod.Bank:
        return AccountType.Bank;
      case PaymentMethod.Mpesa:
        return AccountType.Mpesa;
      case PaymentMethod.AccountTransfer:
        return AccountType.Client;
      default:
        return AccountType.Cash;
    }
  };
  // Update counter account type when payment method changes
  useEffect(() => {
    const newCounterType = getCounterAccountTypeFromPayment(paymentMethod);
    setCounterAccountType(newCounterType);
    setCounterAccountId("");
    setCounterSearchTerm("");
  }, [paymentMethod]);
  // Clear counter account if it becomes the same as primary account
  useEffect(() => {
    if (
      primaryAccountType === counterAccountType &&
      primaryAccountId === counterAccountId &&
      primaryAccountId
    ) {
      setCounterAccountId("");
      setCounterSearchTerm("");
    }
  }, [primaryAccountId, primaryAccountType, counterAccountType]);
  // Reset search when primary account type changes
  useEffect(() => {
    setPrimarySearchTerm("");
    setPrimaryAccountId("");
  }, [primaryAccountType]);
  // Get selected accounts
  const primaryAccount = useMemo(() => {
    return (
      getAccountsByType(primaryAccountType).find(
        (a) => a.id === primaryAccountId,
      ) || null
    );
  }, [
    primaryAccountType,
    primaryAccountId,
    clients,
    cashAccounts,
    bankAccounts,
    mpesaAgents,
  ]);
  const counterAccount = useMemo(() => {
    return (
      getAccountsByType(counterAccountType).find(
        (a) => a.id === counterAccountId,
      ) || null
    );
  }, [
    counterAccountType,
    counterAccountId,
    clients,
    cashAccounts,
    bankAccounts,
    mpesaAgents,
  ]);
  // AUTO-SET CURRENCY based on counter account selection
  useEffect(() => {
    if (counterAccountId) accountPickedRef.current = true;
    if (counterAccount) {
      setCurrency(counterAccount.currency);
    }
  }, [counterAccount]);
  // Check if exchange rate is needed (currencies differ)
  const needsExchangeRate = (): boolean => {
    if (!primaryAccount || !counterAccount) return false;
    return primaryAccount.currency !== counterAccount.currency;
  };
  // Calculate converted amount for primary account
  const getConvertedAmount = (): {
    amount: number;
    currency: Currency;
  } | null => {
    if (!needsExchangeRate()) return null;
    if (!amount || !exchangeRate || !primaryAccount || !counterAccount)
      return null;

    const amountNum = parseFloat(amount);
    const rateNum = parseFloat(exchangeRate);

    if (isNaN(amountNum) || isNaN(rateNum) || rateNum <= 0) return null;

    return {
      amount: convertAmount(amountNum, counterAccount.currency, primaryAccount.currency, rateNum, base),
      currency: primaryAccount.currency,
    };
  };
  const convertedAmount = getConvertedAmount();
  // ============================================================
  // GET USER-FRIENDLY LABELS BASED ON ACCOUNT TYPE
  // ============================================================
  const getActionLabels = () => {
    if (isAssetAccount(primaryAccountType)) {
      // For ASSET accounts: Debit = IN (green), Credit = OUT (red)
      return {
        increase: {
          label: "Receive",
          description: "Money In (Debit)",
          type: TransactionType.Debit,
          icon: Plus,
          colorClass: "emerald",
        },
        decrease: {
          label: "Pay Out",
          description: "Money Out (Credit)",
          type: TransactionType.Credit,
          icon: Minus,
          colorClass: "red",
        },
      };
    } else {
      // For CLIENT accounts: Credit = deposit (green), Debit = withdraw (red)
      return {
        increase: {
          label: "Deposit",
          description: "Client Deposit (Credit)",
          type: TransactionType.Credit,
          icon: Plus,
          colorClass: "emerald",
        },
        decrease: {
          label: "Withdraw",
          description: "Client Withdrawal (Debit)",
          type: TransactionType.Debit,
          icon: Minus,
          colorClass: "red",
        },
      };
    }
  };
  const actionLabels = getActionLabels();
  // PIN-gated submit — check backend if PIN is required
  const handleSubmitWithPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const status = await checkPinStatus();
    if (status.isEnabled && status.hasPin) {
      setShowPin(true);
    } else {
      handleSubmit(); // No PIN required — proceed directly
    }
  };
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);

    try {
      if (!primaryAccountId) {
        throw new Error("Please select an account");
      }
      if (!counterAccountId) {
        throw new Error("Please select a counter account");
      }

      // Prevent selecting the same account on both sides
      if (
        primaryAccountType === counterAccountType &&
        primaryAccountId === counterAccountId
      ) {
        throw new Error(
          "Cannot select the same account on both sides. Please choose different accounts.",
        );
      }

      if (!amount || parseFloat(amount) <= 0) {
        throw new Error("Please enter a valid amount greater than 0");
      }
      if (!description.trim()) {
        throw new Error("Please enter a description");
      }
      if (
        needsExchangeRate() &&
        (!exchangeRate || parseFloat(exchangeRate) <= 0)
      ) {
        throw new Error("Please enter a valid exchange rate");
      }

      const actualPrimaryId =
        primaryAccountType === AccountType.Client
          ? getActualClientId(primaryAccountId)
          : primaryAccountId;
      const actualCounterId =
        counterAccountType === AccountType.Client
          ? getActualClientId(counterAccountId)
          : counterAccountId;

      const originalAmount = parseFloat(amount);
      let primaryAmount = originalAmount;
      let primaryCurrency = primaryAccount?.currency || currency;
      let counterCurrency = counterAccount?.currency || currency;

      if (needsExchangeRate() && primaryAccount && counterAccount) {
        const rateNum = parseFloat(exchangeRate);

        primaryAmount = convertAmount(
          originalAmount,
          counterAccount.currency,
          primaryAccount.currency,
          rateNum,
          base,
        );

        primaryCurrency = primaryAccount.currency;
        counterCurrency = counterAccount.currency;
      }

      const isForex = needsExchangeRate();

      const payload: CreateTransactionDto = {
        transactionType: transactionType,
        sourceAccountType: primaryAccountType,
        sourceAccountId: actualPrimaryId,
        destAccountType: counterAccountType,
        destAccountId: actualCounterId,
        amount: primaryAmount,
        currency: primaryCurrency,
        counterAmount: isForex ? originalAmount : undefined,
        counterCurrency: isForex ? counterCurrency : undefined,
        exchangeRate: isForex ? parseFloat(exchangeRate) : undefined,
        paymentMethod: paymentMethod,
        description: description.trim(),
        notes: notes.trim() || undefined,
        // The form asks for a "Transaction Date *" but never sent it: a back-dated entry was
        // recorded today. Today means now; an earlier day is recorded at noon that day (local).
        transactionDate:
          dateValue && dateValue !== localDate() ? new Date(`${dateValue}T12:00:00`).toISOString() : undefined,
      };

      // One key per submission: pressing again after a timeout can't record it twice.
      const result = await withIdempotencyKey(submissionKey(submitSession.current, payload), () => createTransaction(payload));

      if (!result.success) {
        throw new Error(result.message || "Failed to process transaction");
      }
      submitSession.current = newIdempotencyKey();

      const actionText = isBalanceIncrease
        ? isAssetAccount(primaryAccountType)
          ? "Received"
          : "Deposited"
        : isAssetAccount(primaryAccountType)
          ? "Paid out"
          : "Withdrawn";

      toast.success(
        `✅ ${actionText} successfully! Code: ${result.data?.code || "N/A"}`,
        { duration: 1000 },
      );

      // Show WhatsApp share modal if client is involved
      const isClientPri = primaryAccountType === AccountType.Client;
      const isClientCtr = counterAccountType === AccountType.Client;
      if (isClientPri || isClientCtr) {
        const rawId = isClientPri ? primaryAccountId : counterAccountId;
        // "_UGX" / "_EUR" accounts were not stripped, so a Ugandan client never got the share.
        const clientId = getActualClientId(rawId);
        const clientInfo = clients.find((c) => c.id === clientId);
        if (clientInfo?.whatsAppNumber) {
          const txnCode = result.data?.code || "";
          const cur = currency === Currency.KES ? "KES" : currency === Currency.UGX ? "UGX" : currency === Currency.EUR ? "EUR" : "USD";
          // Get actual balance from response
          const balAfter = isClientPri
            ? result.data?.sourceBalanceAfter
            : result.data?.destBalanceAfter;
          // The client's side of the entry: source leg in `currency`, destination
          // leg in `counterCurrency` when the two sides differ (FX).
          const clientCur: number | undefined = isClientPri
            ? result.data?.currency
            : (result.data?.counterCurrency ?? result.data?.currency ?? undefined);
          const codeOf = (c?: number) => (c === Currency.UGX ? "UGX" : c === Currency.EUR ? "EUR" : c === Currency.USD ? "USD" : c === Currency.KES ? "KES" : cur);

          // The client's own amount: on a forex entry the client side is the converted amount in
          // its own currency (the message said the typed amount with the other side's currency).
          const clientAmount: number = isClientPri
            ? (result.data?.amount ?? primaryAmount)
            : (result.data?.counterAmount ?? result.data?.amount ?? originalAmount);
          const clientCode = codeOf(clientCur);
          const msg = buildTransactionMessage({
            clientName: clientInfo.fullName,
            type: isBalanceIncrease ? "Credit" : "Debit",
            amount: fmt(clientAmount),
            currency: clientCode,
            balance: fmt(balAfter ?? 0),
            balanceCurrency: codeOf(clientCur),
            code: txnCode,
            description: description.trim(),
            date: new Date().toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          });

          setShareModal({
            show: true,
            title: `${actionText} Successfully`,
            details: [
              { label: "Reference", value: txnCode },
              { label: "Client", value: clientInfo.fullName },
              { label: "Amount", value: `${clientCode} ${fmt(clientAmount)}` },
              { label: "Balance", value: `${codeOf(clientCur)} ${fmt(balAfter ?? 0)}` },
              { label: "Description", value: description.trim() },
            ],
            phone: clientInfo.whatsAppNumber,
            message: msg,
          });
          if (onSuccess) onSuccess();
          return; // Modal will handle close
        }
      }

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error) {
      console.error("Transaction error:", error);
      toast.error(
        `❌ Transaction failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        { duration: 5000 },
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    onClose,
    onSuccess,
    submitSession,
    base,
    accountPickedRef,
    transactionType,
    setTransactionType,
    paymentMethod,
    setPaymentMethod,
    currency,
    setCurrency,
    amount,
    setAmount,
    description,
    setDescription,
    notes,
    setNotes,
    exchangeRate,
    setExchangeRate,
    dateValue,
    setDateValue,
    primaryAccountType,
    setPrimaryAccountType,
    primaryAccountId,
    setPrimaryAccountId,
    counterAccountType,
    setCounterAccountType,
    counterAccountId,
    setCounterAccountId,
    primarySearchTerm,
    setPrimarySearchTerm,
    counterSearchTerm,
    setCounterSearchTerm,
    cashAccounts,
    setCashAccounts,
    bankAccounts,
    setBankAccounts,
    mpesaAgents,
    setMpesaAgents,
    clients,
    setClients,
    companyCurrencies,
    setCompanyCurrencies,
    isLoading,
    setIsLoading,
    isSubmitting,
    setIsSubmitting,
    shareModal,
    setShareModal,
    showPin,
    setShowPin,
    isBalanceIncrease,
    getAccountsByType,
    getFilteredAccounts,
    filteredPrimaryAccounts,
    filteredCounterAccounts,
    getActualClientId,
    getCounterAccountTypeFromPayment,
    primaryAccount,
    counterAccount,
    needsExchangeRate,
    getConvertedAmount,
    convertedAmount,
    getActionLabels,
    actionLabels,
    handleSubmitWithPin,
    handleSubmit,
  };
}

export type TransactionFormVM = ReturnType<typeof useTransactionForm> & ReturnType<typeof buildTransactionFormView>;
