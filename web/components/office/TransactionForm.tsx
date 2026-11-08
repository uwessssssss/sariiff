"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ArrowUpCircle,
  ArrowDownCircle,
  Wallet,
  CreditCard,
  Smartphone,
  ArrowLeftRight,
  Calendar,
  DollarSign,
  FileText,
  Building2,
  User,
  RefreshCw,
  Loader2,
  Search,
  Plus,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import { buildTransactionMessage, fmt } from "@/lib/whatsapp";
import { SuccessShareModal } from "@/components/ui/SuccessShareModal";
import { PinModal, checkPinStatus } from "@/components/ui/PinModal";
import {
  createTransaction,
  getBankAccounts,
  getMpesaAgents,
  getCashAccounts,
  getClients,
  TransactionType,
  AccountType,
  PaymentMethod,
  Currency,
  BankAccountDto,
  MpesaAgentDto,
  CashAccountDto,
  ClientDto,
  CreateTransactionDto,
  getCurrencyLabel,
  getCompanyCurrencies,
  currencyCode,
  withIdempotencyKey,
  submissionKey,
  newIdempotencyKey,
} from "@/lib/api";
import { useBaseCurrency, isCurrencyAllowed } from "@/lib/useBaseCurrency";
import { localDate } from "@/lib/dates";

interface TransactionFormProps {
  onClose: () => void;
  onSuccess?: () => void;
}

// Combined account interface for unified selection
interface AccountOption {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: number;
  isActive: boolean;
  accountNumber?: string;
  agentNumber?: string;
  clientId?: string;
  currencyType?: string;
}

// ============================================================
// CURRENCY CONVERSION (any pair)
// When one side is the bureau's home currency (KES in Kenya, UGX in Uganda) the
// rate is "home per 1 unit of the other currency" (how bureaus quote). For two
// foreign currencies (e.g. USD → EUR) the rate is "units of the receiving
// currency per 1 unit of the giving currency".
// ============================================================
function convertAmount(amount: number, from: number, to: number, rate: number, base: number): number {
  if (from === to) return amount;
  if (to === base) return amount * rate; // foreign → home
  if (from === base) return amount / rate; // home → foreign
  return amount * rate; // foreign → foreign
}
function rateLabel(base: number, from?: number, to?: number): string {
  if (from === undefined || to === undefined) return "rate";
  if (from === base) return `1 ${currencyCode(to)} = ? ${currencyCode(base)}`;
  if (to === base) return `1 ${currencyCode(from)} = ? ${currencyCode(base)}`;
  return `1 ${currencyCode(from)} = ? ${currencyCode(to)}`;
}

// ============================================================
// TRADITIONAL ACCOUNTING RULES
// ============================================================
// ASSET accounts (Cash, Bank, M-Pesa):
//   - DEBIT = Balance INCREASES (money comes IN)
//   - CREDIT = Balance DECREASES (money goes OUT)
//
// LIABILITY accounts (Client - we hold their money):
//   - DEBIT = Balance DECREASES (client withdraws)
//   - CREDIT = Balance INCREASES (client deposits)
// ============================================================

const isAssetAccount = (accountType: AccountType): boolean => {
  return (
    accountType === AccountType.Cash ||
    accountType === AccountType.Bank ||
    accountType === AccountType.Mpesa
  );
};

export function TransactionForm({ onClose, onSuccess }: TransactionFormProps) {
  // One idempotency session per open form; renewed after each successful save.
  const submitSession = useRef(newIdempotencyKey());
  const { base } = useBaseCurrency();
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
          getClients(1, 200),
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
          name: a.name || `Cash ${a.currency}`,
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
        const clientId =
          rawId.endsWith("_KES") || rawId.endsWith("_USD")
            ? rawId.slice(0, -4)
            : rawId;
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

          const msg = buildTransactionMessage({
            clientName: clientInfo.fullName,
            type: isBalanceIncrease ? "Credit" : "Debit",
            amount: fmt(parseFloat(amount)),
            currency: cur,
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
              { label: "Amount", value: `${cur} ${fmt(parseFloat(amount))}` },
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

  // Loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
        <div className="bg-white p-8 text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading accounts...</p>
        </div>
      </div>
    );
  }

  // Dynamic colors based on balance effect
  const headerGradient = isBalanceIncrease
    ? "bg-emerald-600"
    : "bg-red-600";

  const buttonGradient = isBalanceIncrease
    ? "hover:shadow-md bg-emerald-600"
    : "hover:shadow-md bg-red-600";

  const summaryBorderColor = isBalanceIncrease
    ? "bg-emerald-50 border-emerald-500"
    : "bg-red-50 border-red-500";

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 20 }}
        transition={{ type: "spring", damping: 30, stiffness: 400 }}
        className="bg-white shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-slate-200 rounded-lg"
      >
        {/* Header - Color based on balance effect */}
        <div
          className={`relative p-5 ${headerGradient} text-white transition-all duration-300`}
        >
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.15)_25%,rgba(255,255,255,.15)_50%,transparent_50%,transparent_75%,rgba(255,255,255,.15)_75%,rgba(255,255,255,.15))] bg-[length:20px_20px]"></div>

          <button aria-label="Close"
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 bg-white/10 hover:bg-white/20 transition-all"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 flex items-center justify-center border border-white/20 rounded-lg">
              {isBalanceIncrease ? (
                <ArrowUpCircle className="w-5 h-5" />
              ) : (
                <ArrowDownCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold">New Transaction</h2>
              <p className="text-xs opacity-90">
                {isBalanceIncrease ? "Balance Increase" : "Balance Decrease"} •{" "}
                {transactionType === TransactionType.Debit ? "Debit" : "Credit"}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmitWithPin}
          className="p-5 space-y-4 overflow-y-auto max-h-[calc(90vh-180px)]"
        >
          {/* Primary Account Selection FIRST */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
              <User className="w-3 h-3 inline mr-1" />
              Select Account *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={primaryAccountType}
                onChange={(e: any) => {
                  setPrimaryAccountType(Number(e.target.value) as AccountType);
                  setPrimaryAccountId("");
                  setPrimarySearchTerm("");
                }}
                className="px-3 py-2.5 border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-sm rounded-lg"
              >
                <option value={AccountType.Client}>Client</option>
                <option value={AccountType.Cash}>Cash</option>
                <option value={AccountType.Bank}>Bank</option>
                <option value={AccountType.Mpesa}>Mobile money</option>
              </select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={primarySearchTerm}
                  onChange={(e: any) => setPrimarySearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm rounded-lg"
                />
              </div>
            </div>
            <select
              value={primaryAccountId}
              onChange={(e: any) => setPrimaryAccountId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-sm rounded-lg"
              required
            >
              <option value="">Select account...</option>
              {filteredPrimaryAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} - {getCurrencyLabel(account.currency)}{" "}
                  {account.balance.toLocaleString()}
                </option>
              ))}
            </select>
            {primaryAccountType === AccountType.Client &&
              filteredPrimaryAccounts.length === 0 &&
              primarySearchTerm && (
                <p className="text-xs text-amber-600">
                  No clients found matching "{primarySearchTerm}"
                </p>
              )}
            {primaryAccountType === AccountType.Client && (
              <p className="text-xs text-slate-500">
                💡 Each client has separate KES and USD accounts
              </p>
            )}
          </div>

          {/* Transaction Type Toggle - DYNAMIC based on account type */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Transaction Type *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* INCREASE Button (Green) */}
              <button
                type="button"
                onClick={() => setTransactionType(actionLabels.increase.type)}
                className={`group relative p-3 border transition-all duration-200 rounded-lg ${
                  isBalanceIncrease
                    ? "border-emerald-500 bg-emerald-50 shadow-md "
                    : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 flex items-center justify-center transition-all ${
                      isBalanceIncrease
                        ? "bg-emerald-500 shadow-sm "
                        : "bg-slate-100 group-hover:bg-emerald-100"
                    }`}
                  >
                    <Plus
                      className={`w-4 h-4 ${
                        isBalanceIncrease ? "text-white" : "text-slate-500"
                      }`}
                    />
                  </div>
                  <div className="text-left">
                    <div
                      className={`text-sm font-semibold ${
                        isBalanceIncrease
                          ? "text-emerald-700"
                          : "text-slate-700"
                      }`}
                    >
                      {actionLabels.increase.label}
                    </div>
                    <div className="text-xs text-slate-500">
                      {actionLabels.increase.description}
                    </div>
                  </div>
                </div>
                <div className="absolute top-1 right-1 text-xs font-mono text-slate-400">
                  {actionLabels.increase.type === TransactionType.Debit
                    ? "DR"
                    : "CR"}
                </div>
              </button>

              {/* DECREASE Button (Red) */}
              <button
                type="button"
                onClick={() => setTransactionType(actionLabels.decrease.type)}
                className={`group relative p-3 border transition-all duration-200 rounded-lg ${
                  !isBalanceIncrease
                    ? "border-red-500 bg-red-50 shadow-md "
                    : "border-slate-200 bg-white hover:border-red-300 hover:bg-red-50/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 flex items-center justify-center transition-all ${
                      !isBalanceIncrease
                        ? "bg-red-500 shadow-sm "
                        : "bg-slate-100 group-hover:bg-red-100"
                    }`}
                  >
                    <Minus
                      className={`w-4 h-4 ${
                        !isBalanceIncrease ? "text-white" : "text-slate-500"
                      }`}
                    />
                  </div>
                  <div className="text-left">
                    <div
                      className={`text-sm font-semibold ${
                        !isBalanceIncrease ? "text-red-700" : "text-slate-700"
                      }`}
                    >
                      {actionLabels.decrease.label}
                    </div>
                    <div className="text-xs text-slate-500">
                      {actionLabels.decrease.description}
                    </div>
                  </div>
                </div>
                <div className="absolute top-1 right-1 text-xs font-mono text-slate-400">
                  {actionLabels.decrease.type === TransactionType.Debit
                    ? "DR"
                    : "CR"}
                </div>
              </button>
            </div>

            {/* Accounting hint */}
            <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded">
              <p className="text-xs text-slate-600 flex items-center gap-1">
                <span>📚</span>
                <span>
                  {isAssetAccount(primaryAccountType) ? (
                    <>
                      <strong>Asset account:</strong> Debit = Balance ↑
                      (increase), Credit = Balance ↓ (decrease)
                    </>
                  ) : (
                    <>
                      <strong>Client account:</strong> Credit = Balance ↑
                      (deposit), Debit = Balance ↓ (withdraw)
                    </>
                  )}
                </span>
              </p>
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Via (Counter Account) *
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod(PaymentMethod.Cash)}
                className={`group p-2.5 border transition-all rounded-lg ${
                  paymentMethod === PaymentMethod.Cash
                    ? "border-blue-500 bg-blue-50 shadow-sm "
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                }`}
              >
                <Wallet
                  className={`w-5 h-5 mx-auto mb-1 ${
                    paymentMethod === PaymentMethod.Cash
                      ? "text-blue-600"
                      : "text-slate-400 group-hover:text-blue-500"
                  }`}
                />
                <div
                  className={`text-xs font-semibold ${
                    paymentMethod === PaymentMethod.Cash
                      ? "text-blue-700"
                      : "text-slate-600"
                  }`}
                >
                  Cash
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod(PaymentMethod.Bank)}
                className={`group p-2.5 border transition-all rounded-lg ${
                  paymentMethod === PaymentMethod.Bank
                    ? "border-blue-500 bg-blue-50 shadow-sm "
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                }`}
              >
                <CreditCard
                  className={`w-5 h-5 mx-auto mb-1 ${
                    paymentMethod === PaymentMethod.Bank
                      ? "text-blue-600"
                      : "text-slate-400 group-hover:text-blue-500"
                  }`}
                />
                <div
                  className={`text-xs font-semibold ${
                    paymentMethod === PaymentMethod.Bank
                      ? "text-blue-700"
                      : "text-slate-600"
                  }`}
                >
                  Bank
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod(PaymentMethod.Mpesa)}
                className={`group p-2.5 border transition-all rounded-lg ${
                  paymentMethod === PaymentMethod.Mpesa
                    ? "border-blue-500 bg-blue-50 shadow-sm "
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                }`}
              >
                <Smartphone
                  className={`w-5 h-5 mx-auto mb-1 ${
                    paymentMethod === PaymentMethod.Mpesa
                      ? "text-blue-600"
                      : "text-slate-400 group-hover:text-blue-500"
                  }`}
                />
                <div
                  className={`text-xs font-semibold ${
                    paymentMethod === PaymentMethod.Mpesa
                      ? "text-blue-700"
                      : "text-slate-600"
                  }`}
                >
                  Mobile money
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod(PaymentMethod.AccountTransfer)}
                className={`group p-2.5 border transition-all rounded-lg ${
                  paymentMethod === PaymentMethod.AccountTransfer
                    ? "border-blue-500 bg-blue-50 shadow-sm "
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                }`}
              >
                <ArrowLeftRight
                  className={`w-5 h-5 mx-auto mb-1 ${
                    paymentMethod === PaymentMethod.AccountTransfer
                      ? "text-blue-600"
                      : "text-slate-400 group-hover:text-blue-500"
                  }`}
                />
                <div
                  className={`text-xs font-semibold ${
                    paymentMethod === PaymentMethod.AccountTransfer
                      ? "text-blue-700"
                      : "text-slate-600"
                  }`}
                >
                  Transfer
                </div>
              </button>
            </div>
          </div>

          {/* Counter Account Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
              {paymentMethod === PaymentMethod.Cash && (
                <>
                  <Wallet className="w-3 h-3 inline mr-1" />
                  Cash Account *
                </>
              )}
              {paymentMethod === PaymentMethod.Bank && (
                <>
                  <Building2 className="w-3 h-3 inline mr-1" />
                  Bank Account *
                </>
              )}
              {paymentMethod === PaymentMethod.Mpesa && (
                <>
                  <Smartphone className="w-3 h-3 inline mr-1" />
                  Mobile money agent *
                </>
              )}
              {paymentMethod === PaymentMethod.AccountTransfer && (
                <>
                  <ArrowLeftRight className="w-3 h-3 inline mr-1" />
                  Counter Account *
                </>
              )}
            </label>

            {paymentMethod === PaymentMethod.AccountTransfer && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={counterSearchTerm}
                  onChange={(e: any) => setCounterSearchTerm(e.target.value)}
                  placeholder="Search clients..."
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm rounded-lg"
                />
              </div>
            )}

            <select
              value={counterAccountId}
              onChange={(e: any) => setCounterAccountId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-sm rounded-lg"
              required
            >
              <option value="">
                Select{" "}
                {paymentMethod === PaymentMethod.Cash
                  ? "cash account"
                  : paymentMethod === PaymentMethod.Bank
                    ? "bank"
                    : paymentMethod === PaymentMethod.Mpesa
                      ? "mobile money agent"
                      : "account"}
                ...
              </option>
              {filteredCounterAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} - {getCurrencyLabel(account.currency)}{" "}
                  {account.balance.toLocaleString()}
                </option>
              ))}
            </select>
            {paymentMethod === PaymentMethod.AccountTransfer &&
              filteredCounterAccounts.length === 0 &&
              counterSearchTerm && (
                <p className="text-xs text-amber-600">
                  No clients found matching "{counterSearchTerm}"
                </p>
              )}
          </div>

          {/* Amount & Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                <DollarSign className="w-3 h-3 inline mr-1" />
                Amount (
                {counterAccount
                  ? getCurrencyLabel(counterAccount.currency)
                  : "Select account"}
                ) *
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e: any) => setAmount(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-sm rounded-lg"
                placeholder="0.00"
                step="0.01"
                min="0"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                Currency (Auto)
              </label>
              <div className="px-3 py-2.5 border border-slate-200 bg-slate-50 text-slate-700 font-semibold text-sm rounded-lg">
                {getCurrencyLabel(currency)}
              </div>
            </div>
          </div>

          {/* Exchange Rate (if needed) */}
          {needsExchangeRate() && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 p-3 bg-amber-50 border-l-4 border-amber-500">
                <RefreshCw
                  className="w-4 h-4 text-amber-600 animate-spin"
                  style={{ animationDuration: "3s" }}
                />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-amber-900">
                    Currency Exchange Required
                  </p>
                  <p className="text-xs text-amber-700">
                    {counterAccount?.name} (
                    {getCurrencyLabel(counterAccount?.currency!)}) →{" "}
                    {primaryAccount?.name} (
                    {getCurrencyLabel(primaryAccount?.currency!)})
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5">
                  <RefreshCw className="w-3 h-3 inline mr-1" />
                  Exchange Rate ({rateLabel(base, counterAccount?.currency, primaryAccount?.currency)}) *
                </label>
                <input
                  type="number"
                  value={exchangeRate}
                  onChange={(e: any) => setExchangeRate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-amber-300 bg-amber-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-semibold text-sm rounded-lg"
                  placeholder="e.g., 130.50"
                  step="any"
                  required
                />
              </div>

              {convertedAmount && amount && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-xs font-semibold text-blue-900 mb-1">
                    Conversion Preview
                  </p>
                  <div className="text-sm text-blue-800">
                    <span className="font-mono">
                      {getCurrencyLabel(counterAccount!.currency)}{" "}
                      {parseFloat(amount).toLocaleString()}
                    </span>
                    <span className="mx-2">
                      {counterAccount!.currency === Currency.KES ? "÷" : "×"}
                    </span>
                    <span className="font-mono">
                      {parseFloat(exchangeRate).toLocaleString()}
                    </span>
                    <span className="mx-2">=</span>
                    <span className="font-semibold text-emerald-700">
                      {getCurrencyLabel(convertedAmount.currency)}{" "}
                      {convertedAmount.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
              <FileText className="w-3 h-3 inline mr-1" />
              Description *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e: any) => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 border border-blue-300 text-slate-900 bg-blue-50/20 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium rounded-lg"
              placeholder="e.g., Client deposit, Cash receipt, Bank transfer..."
              required
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
              <Calendar className="w-3 h-3 inline mr-1" />
              Transaction Date *
            </label>
            <input
              type="date"
              value={dateValue}
              onChange={(e: any) => setDateValue(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm rounded-lg"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e: any) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm resize-none rounded-lg"
              rows={2}
              placeholder="Additional notes..."
            />
          </div>

          {/* Summary */}
          <div className={`p-3 border-l-4 ${summaryBorderColor}`}>
            <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">
              Transaction Summary
            </h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">Action:</span>
                <span
                  className={`font-semibold ${
                    isBalanceIncrease ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {isBalanceIncrease
                    ? actionLabels.increase.label
                    : actionLabels.decrease.label}{" "}
                  ({transactionType === TransactionType.Debit ? "DR" : "CR"})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Account:</span>
                <span className="font-semibold text-slate-900 truncate max-w-[200px]">
                  {primaryAccount?.name || "Not selected"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Via:</span>
                <span className="font-semibold text-slate-900 truncate max-w-[200px]">
                  {counterAccount?.name || "Not selected"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Amount:</span>
                <span className="font-semibold text-slate-900">
                  {getCurrencyLabel(currency)} {amount || "0.00"}
                </span>
              </div>
              {convertedAmount && (
                <div className="flex justify-between pt-1 border-t border-slate-200 mt-1">
                  <span className="text-slate-600">Converted:</span>
                  <span className="font-semibold text-amber-600">
                    {getCurrencyLabel(convertedAmount.currency)}{" "}
                    {convertedAmount.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Balance Effect:</span>
                <span
                  className={`font-semibold ${
                    isBalanceIncrease ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {isBalanceIncrease ? "↑ Increase" : "↓ Decrease"}
                </span>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-200 hover:bg-white hover:border-slate-300 transition-all font-semibold text-sm text-slate-700 rounded-lg"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmitWithPin}
            className={`flex-1 px-4 py-2.5 ${buttonGradient} text-white font-semibold text-sm transition-all shadow-md disabled:opacity-50`}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Processing...
              </>
            ) : (
              <>
                {isBalanceIncrease ? (
                  <Plus className="w-4 h-4 inline mr-1" />
                ) : (
                  <Minus className="w-4 h-4 inline mr-1" />
                )}
                {isBalanceIncrease
                  ? actionLabels.increase.label
                  : actionLabels.decrease.label}
              </>
            )}
          </button>
        </div>
      </motion.div>
      <SuccessShareModal
        isOpen={shareModal.show}
        onClose={() => {
          setShareModal((s) => ({ ...s, show: false }));
          onClose();
        }}
        title={shareModal.title}
        details={shareModal.details}
        whatsappPhone={shareModal.phone}
        whatsappMessage={shareModal.message}
      />
      <PinModal
        isOpen={showPin}
        onClose={() => setShowPin(false)}
        onVerified={() => {
          setShowPin(false);
          handleSubmit();
        }}
        title="Enter Transaction PIN"
      />
    </div>
  );
}
