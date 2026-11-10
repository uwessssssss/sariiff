"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Smartphone,
  Plus,
  Search,
  Filter,
  Wallet,
  Phone,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Download,
  X,
  Calendar,
  FileText,
  Edit3,
  Trash2,
  Activity,
  User,
  Hash,
  Zap,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getMpesaAgents,
  createMpesaAgent,
  updateMpesaAgent,
  deleteMpesaAgent,
  getMpesaStats,
  CreateMpesaAgentDto,
  apiRequest,
  Currency,
  currencyCode,
  walletCurrency,
  MOBILE_MONEY_PROVIDERS,
  providerLabel,
} from "@/lib/api";
import { useBaseCurrency, isCurrencyAllowed, useCountrySamples } from "@/lib/useBaseCurrency";
import { StatementModal, refreshOpenStatement } from "./StatementModal";
import { TransactionDetailsDialog, RelatedAccountDialog, ReverseTransactionDialog } from "./TransactionDialogs";
import { EditTransactionDialog } from "./EditTransactionDialog";

// Updated Transaction interface to match backend StatementLineDto
interface Transaction {
  id: string;
  code: string;
  date: string;
  reference: string;
  description: string;
  transactionType: number;
  thisAccountAction: string; // "Debit" or "Credit"
  debit: number | null;
  credit: number | null;
  amount: number;
  currency: number;
  balanceBefore: number;
  balanceAfter: number;
  exchangeRate?: number | null;
  counterAmount?: number | null;
  counterCurrency?: number | null;
  notes?: string | null;
  reconciliationStatus: number;
  relatedAccount?: {
    accountId: string;
    accountType: number;
    accountName: string;
    accountCode: string;
    currency: number;
    action: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    clientCode?: string | null;
    clientPhone?: string | null;
  };
}

// Updated MPesaAgent interface to match backend MpesaAgentDto
interface MPesaAgent {
  id: string;
  code: string;
  agentName: string;
  phoneNumber: string;
  agentNumber: string;
  storeNumber: string;
  agentType: number;
  provider: number; // 0 M-Pesa, 1 MTN MoMo, 2 Airtel Money
  currency: number; // the wallet's own currency (M-Pesa = KES even in Uganda)
  balance: number;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  isActive: boolean;
  createdAt: string;
}

// Updated MpesaStats interface to match backend
interface MpesaStats {
  totalAgents: number;
  totalBalance: number;
  totalDebit: number;
  totalCredit: number;
  netMovement: number;
  /** Every wallet currency held; the totals above are the home currency only. */
  byCurrency?: { currency: number; currencyCode: string; balance: number; totalDebit: number; totalCredit: number; netMovement: number }[];
}

interface FormData {
  agentName: string;
  phoneNumber: string;
  agentNumber: string;
  storeNumber: string;
  agentType: number;
  provider: number;
  openingBalance: number;
}

interface EditFormData {
  agentName: string;
  storeNumber: string;
  agentType: number;
  provider: number;
  isActive: boolean;
}

export function MPesaAccounts() {
  // Each wallet holds its NETWORK's currency (M-Pesa = KES, MTN MoMo = UGX, Airtel = home);
  // the summary cards show home-currency wallets, other currencies are listed under them.
  const { base, baseCode } = useBaseCurrency();
  const samples = useCountrySamples();
  const networks = MOBILE_MONEY_PROVIDERS.filter((p) => isCurrencyAllowed(base, walletCurrency(p.value, base)));
  // Data states
  const [allAgents, setAllAgents] = useState<MPesaAgent[]>([]);
  const [stats, setStats] = useState<MpesaStats>({
    totalAgents: 0,
    totalBalance: 0,
    totalDebit: 0,
    totalCredit: 0,
    netMovement: 0,
  });

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // UI states
  const [activeTab, setActiveTab] = useState<"all" | "outstanding">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<MPesaAgent | null>(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [showViewTransaction, setShowViewTransaction] = useState(false);
  const [showEditTransaction, setShowEditTransaction] = useState(false);
  const [showDeleteTransaction, setShowDeleteTransaction] = useState(false);
  const [showRelatedAccount, setShowRelatedAccount] = useState(false);
  const [showEditAgent, setShowEditAgent] = useState(false);
  const [showDeleteAgent, setShowDeleteAgent] = useState(false);
  const [agentsCurrentPage, setAgentsCurrentPage] = useState(1);
  const [agentsPerPage] = useState(10);

  // Form states
  const [formData, setFormData] = useState<FormData>({
    agentName: "",
    phoneNumber: "",
    agentNumber: "",
    storeNumber: "",
    agentType: 0,
    provider: 0,
    openingBalance: 0,
  });

  const [editFormData, setEditFormData] = useState<EditFormData>({
    agentName: "",
    storeNumber: "",
    agentType: 0,
    provider: 0,
    isActive: true,
  });

  // New agents default to the home market's main network (M-Pesa in Kenya, MTN in Uganda).
  const defaultProvider = base === Currency.UGX ? 1 : 0;
  useEffect(() => {
    setFormData((f) => ({ ...f, provider: defaultProvider }));
  }, [defaultProvider]);

  // Map backend DTO to frontend MPesaAgent interface
  const mapDtoToAgent = (dto: any): MPesaAgent => {
    return {
      id: dto.id,
      code: dto.code,
      agentName: dto.agentName,
      phoneNumber: dto.phoneNumber,
      agentNumber: dto.agentNumber,
      storeNumber: dto.storeNumber || "",
      agentType: dto.agentType || 0,
      provider: dto.provider ?? 0,
      currency: dto.currency ?? base,
      balance: dto.balance,
      openingBalance: dto.openingBalance,
      totalDebit: dto.totalDebit || 0,
      totalCredit: dto.totalCredit || 0,
      netMovement: dto.netMovement || 0,
      isActive: dto.isActive,
      createdAt: dto.createdAt || new Date().toISOString(),
    };
  };

  // Map backend transaction to frontend Transaction interface
  const mapTransactionToDisplay = (txn: any): Transaction => {
    return {
      id: txn.transactionId || txn.id || "",
      code: txn.transactionCode || txn.code || "",
      date: txn.date || txn.transactionDate || txn.createdAt || "",
      reference: txn.reference || txn.transactionCode || "",
      description: txn.description || "",
      transactionType: txn.transactionType ?? 0,
      thisAccountAction: txn.thisAccountAction || "",
      debit: txn.debit ?? null,
      credit: txn.credit ?? null,
      amount: txn.amount ?? 0,
      currency: txn.currency ?? 0,
      balanceBefore: txn.balanceBefore ?? 0,
      balanceAfter: txn.balanceAfter ?? 0,
      exchangeRate: txn.exchangeRate,
      counterAmount: txn.counterAmount,
      counterCurrency: txn.counterCurrency,
      notes: txn.notes,
      reconciliationStatus: txn.reconciliationStatus ?? 0,
      relatedAccount: txn.relatedAccount
        ? {
            accountId: txn.relatedAccount.accountId || "",
            accountType: txn.relatedAccount.accountType ?? 0,
            accountName: txn.relatedAccount.accountName || "Unknown Account",
            accountCode: txn.relatedAccount.accountCode || "",
            currency: txn.relatedAccount.currency ?? 0,
            action: txn.relatedAccount.action || "",
            amount: txn.relatedAccount.amount ?? 0,
            balanceBefore: txn.relatedAccount.balanceBefore ?? 0,
            balanceAfter: txn.relatedAccount.balanceAfter ?? 0,
            clientCode: txn.relatedAccount.clientCode,
            clientPhone: txn.relatedAccount.clientPhone,
          }
        : undefined,
    };
  };

  // Fetch all M-Pesa agents
  const fetchAgents = useCallback(async () => {
    try {
      const response = await getMpesaAgents();
      if (response.success && response.data) {
        const mappedAgents = response.data.map(mapDtoToAgent);
        setAllAgents(mappedAgents);
      }
    } catch (error) {
      console.error("Error fetching mobile money agents:", error);
      toast.error("Failed to fetch mobile money agents");
    }
  }, []);

  // Fetch M-Pesa stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await getMpesaStats();
      if (response.success && response.data) {
        setStats({
          totalAgents: response.data.totalAgents || 0,
          totalBalance: response.data.totalBalance || 0,
          totalDebit: response.data.totalDebit || 0,
          totalCredit: response.data.totalCredit || 0,
          netMovement: response.data.netMovement || 0,
          byCurrency: (response.data as any).byCurrency || [],
        });
      }
    } catch (error) {
      console.error("Error fetching mobile money stats:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchAgents(), fetchStats()]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchAgents, fetchStats]);

  // Refresh all data
  const handleRefresh = async () => {
    setIsLoading(true);
    await Promise.all([fetchAgents(), fetchStats()]);
    setIsLoading(false);
    toast.success("Data refreshed!");
  };

  // Create new M-Pesa agent
  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agentName || !formData.phoneNumber || !formData.agentNumber) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const createDto: CreateMpesaAgentDto = {
        agentName: formData.agentName,
        phoneNumber: formData.phoneNumber,
        agentNumber: formData.agentNumber,
        storeNumber: formData.storeNumber || undefined,
        agentType: formData.agentType,
        provider: formData.provider,
        openingBalance: formData.openingBalance,
      };

      const response = await createMpesaAgent(createDto);
      if (response.success) {
        toast.success("Mobile money agent created");
        setShowAddAgent(false);
        setFormData({
          agentName: "",
          phoneNumber: "",
          agentNumber: "",
          storeNumber: "",
          agentType: 0,
          provider: defaultProvider,
          openingBalance: 0,
        });
        await Promise.all([fetchAgents(), fetchStats()]);
      } else {
        toast.error(response.message || "Failed to create mobile money agent");
      }
    } catch (error) {
      console.error("Error creating mobile money agent:", error);
      toast.error("Failed to create mobile money agent");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update M-Pesa agent
  const handleUpdateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent) return;

    setIsSubmitting(true);
    try {
      const updateDto = {
        agentName: editFormData.agentName || undefined,
        storeNumber: editFormData.storeNumber || undefined,
        agentType: editFormData.agentType,
        provider: editFormData.provider,
        isActive: editFormData.isActive,
      };

      const response = await updateMpesaAgent(selectedAgent.id, updateDto);
      if (response.success) {
        toast.success("Mobile money agent updated");
        setShowEditAgent(false);
        setSelectedAgent(null);
        await Promise.all([fetchAgents(), fetchStats()]);
      } else {
        toast.error(response.message || "Failed to update mobile money agent");
      }
    } catch (error) {
      console.error("Error updating mobile money agent:", error);
      toast.error("Failed to update mobile money agent");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete M-Pesa agent
  const handleDeleteAgent = async () => {
    if (!selectedAgent) return;

    setIsSubmitting(true);
    try {
      const response = await deleteMpesaAgent(selectedAgent.id);
      if (response.success) {
        toast.success("Mobile money agent deleted");
        setShowDeleteAgent(false);
        setSelectedAgent(null);
        await Promise.all([fetchAgents(), fetchStats()]);
      } else {
        toast.error(response.message || "Failed to delete mobile money agent");
      }
    } catch (error) {
      console.error("Error deleting mobile money agent:", error);
      toast.error("Failed to delete mobile money agent");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered agents based on tab - accounts with outstanding balances
  const agentsWithOutstanding = allAgents.filter(
    (agent) => agent.balance !== 0,
  );

  const displayedAgents =
    activeTab === "outstanding" ? agentsWithOutstanding : allAgents;

  // Search filter
  const filteredAgents = displayedAgents.filter(
    (agent) =>
      agent.agentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.phoneNumber.includes(searchTerm) ||
      agent.agentNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.storeNumber.includes(searchTerm) ||
      agent.code.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Pagination for agents
  const indexOfLastAgent = agentsCurrentPage * agentsPerPage;
  const indexOfFirstAgent = indexOfLastAgent - agentsPerPage;
  const currentAgents = filteredAgents.slice(
    indexOfFirstAgent,
    indexOfLastAgent,
  );
  const totalAgentPages = Math.ceil(filteredAgents.length / agentsPerPage);

  const handleEditAgent = (agent: MPesaAgent) => {
    setSelectedAgent(agent);
    setEditFormData({
      agentName: agent.agentName,
      storeNumber: agent.storeNumber,
      agentType: agent.agentType,
      provider: agent.provider,
      isActive: agent.isActive,
    });
    setShowEditAgent(true);
  };

  const handleViewTransaction = (txn: Transaction) => {
    setSelectedTransaction(txn);
    setShowViewTransaction(true);
  };

  const handleEditTransaction = (txn: Transaction) => {
    setSelectedTransaction(txn);
    setShowEditTransaction(true);
  };

  const handleDeleteTransaction = (txn: Transaction) => {
    setSelectedTransaction(txn);
    setShowDeleteTransaction(true);
  };

  const confirmDeleteTransaction = async (reason = "") => {
    if (!selectedTransaction) return;

    setIsSubmitting(true);
    try {
      const result = await apiRequest<boolean>(
        `/api/transaction/${selectedTransaction.id}`,
        {
          method: "DELETE",
          body: JSON.stringify({ reason: reason || "User requested deletion" }),
        },
      );

      if (result.success) {
        toast.success(
          `Transaction ${
            selectedTransaction.reference || selectedTransaction.code
          } reversed`,
        );
        setShowDeleteTransaction(false);
        setSelectedTransaction(null);
        // Refresh the agent statement
        if (selectedAgent) {
          refreshOpenStatement();
        }
        // Also refresh stats
        fetchStats();
      } else {
        toast.error(result.message || "Failed to delete transaction");
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast.error("Failed to delete transaction");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading mobile money agents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Mobile money agents
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Balances and movements for each mobile money agent
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRefresh}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowAddAgent(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add agent
          </button>
        </div>
      </div>

      {/* Summary Cards - PREMIUM SHARP DESIGN */}
      <div className="grid md:grid-cols-4 gap-4">
        {/* Total Agents Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white   overflow-hidden group   transition-all duration-300"
        >
          {/* Background Pattern */}
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40"></div>

          <div className="relative p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-white/10 flex items-center justify-center border border-white/20 rounded-lg">
                <Phone className="w-6 h-6" />
              </div>
              <div className="bg-white/20 px-3 py-1 border border-white/30 rounded-lg">
                <span className="text-xs font-semibold  ">
                  Total
                </span>
              </div>
            </div>
            <p className="text-xs opacity-90 mb-1   font-semibold">
              Total Agents
            </p>
            <p className="text-2xl font-semibold tracking-tight">
              {stats.totalAgents || allAgents.length}
            </p>
            <div className="mt-3 pt-3 border-t border-white/20">
              <p className="text-xs">All mobile money agents</p>
            </div>
          </div>
        </motion.div>

        {/* Total Debit Card (Money IN for M-Pesa) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl bg-white border border-slate-200   hover:border-emerald-300 transition-all duration-300 group"
        >
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-emerald-100 flex items-center justify-center border border-emerald-200 group-hover:bg-emerald-200 transition-colors rounded-lg">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="bg-emerald-100 px-3 py-1 border border-emerald-200 rounded-lg">
                <span className="text-xs font-semibold text-emerald-700  ">
                  Debit - Money In
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-1 font-semibold">
              {baseCode} Total Debit
            </p>
            <p className="text-2xl font-semibold text-emerald-600 tracking-tight">
              {baseCode} {stats.totalDebit.toLocaleString()}
            </p>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 font-semibold">
                  Money In
                </p>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Total Credit Card (Money OUT for M-Pesa) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl bg-white border border-slate-200   hover:border-red-300 transition-all duration-300 group"
        >
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-red-100 flex items-center justify-center border border-red-200 group-hover:bg-red-200 transition-colors rounded-lg">
                <TrendingDown className="w-6 h-6 text-red-600" />
              </div>
              <div className="bg-red-100 px-3 py-1 border border-red-200 rounded-lg">
                <span className="text-xs font-semibold text-red-700  ">
                  Credit - Money Out
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-1 font-semibold">
              {baseCode} Total Credit
            </p>
            <p className="text-2xl font-semibold text-red-600 tracking-tight">
              {baseCode} {stats.totalCredit.toLocaleString()}
            </p>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 font-semibold">
                  Money Out
                </p>
                <TrendingDown className="w-4 h-4 text-red-500" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Net Movement Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl bg-white border border-slate-200 hover:border-slate-200 transition-all duration-300 group"
        >
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-[#E9EEF6] flex items-center justify-center border border-slate-200 group-hover:bg-blue-100 transition-colors rounded-lg">
                <Activity className="w-6 h-6 text-blue-600" />
              </div>
              <div className="bg-[#E9EEF6] px-3 py-1 border border-slate-200 rounded-lg">
                <span className="text-xs font-semibold text-[#0F172A]  ">
                  Net Movement
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-1 font-semibold">
              Net Movement
            </p>
            <p
              className={`text-2xl font-semibold tracking-tight ${
                stats.netMovement >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {stats.netMovement >= 0 ? "+" : ""}{baseCode}{" "}
              {stats.netMovement.toLocaleString()}
            </p>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">
                  Debit - Credit
                </span>
                <Activity className="w-4 h-4 text-blue-600" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Wallets in other currencies (e.g. an M-Pesa KES wallet in a Ugandan bureau).
          The cards above are the home currency only: KES and UGX can't be added. */}
      {(stats.byCurrency || []).some((r) => r.currency !== base) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <span className="text-slate-500">Cards above: {baseCode} wallets. Also held:</span>
          {(stats.byCurrency || []).filter((r) => r.currency !== base).map((r) => (
            <span key={r.currency} className="tabular-nums text-slate-900">
              {r.currencyCode} {r.balance.toLocaleString()}
              <span className="text-slate-500"> (in {r.totalDebit.toLocaleString()}, out {r.totalCredit.toLocaleString()})</span>
            </span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setActiveTab("all")}
          className={`rounded-lg flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-300 ${
            activeTab === "all"
              ? " bg-[#0F172A]  text-white  "
              : "bg-white text-slate-600 hover:bg-[#E9EEF6] border border-slate-200 hover:border-slate-200 rounded-lg"
          }`}
        >
          <Smartphone className="w-5 h-5" />
          All Agents
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              activeTab === "all" ? "bg-white/20" : "bg-[#E9EEF6] text-[#0F172A]"
            }`}
          >
            {allAgents.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("outstanding")}
          className={`rounded-lg flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-300 ${
            activeTab === "outstanding"
              ? " bg-red-600  text-white  "
              : "bg-white text-slate-600 hover:bg-red-50 border border-slate-200 hover:border-red-300 rounded-lg"
          }`}
        >
          <AlertCircle className="w-5 h-5" />
          With Balance
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              activeTab === "outstanding"
                ? "bg-white/20"
                : "bg-red-100 text-red-700"
            }`}
          >
            {agentsWithOutstanding.length}
          </span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 ">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by agent name, phone, store number, or agent number..."
              value={searchTerm}
              onChange={(e: any) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 text-slate-500 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition-all duration-300 placeholder:text-slate-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => toast.info("Opening filter options...")}
              className="flex items-center gap-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all font-medium text-slate-700"
            >
              <Filter className="w-5 h-5" />
              <span className="hidden sm:inline">Filters</span>
            </button>
            <button
              onClick={() => toast.success("Exporting mobile money agents list...")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
            >
              <Download className="w-5 h-5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* M-Pesa Agents Table */}
      <div className="bg-white rounded-2xl border border-slate-200  overflow-hidden">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full">
            <thead className="bg-[#E9EEF6]">
              <tr>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Agent Code
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Agent Details
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Store Info
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Balance
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Net Movement
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Status
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {currentAgents.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No mobile money agents found.
                  </td>
                </tr>
              ) : (
                currentAgents.map((agent, index) => (
                  <motion.tr
                    key={agent.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="hover:bg-[#E9EEF6] transition-all duration-200 cursor-pointer group"
                  >
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-blue-600 group-hover:text-[#0F172A]">
                        {agent.code}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <div className="font-semibold text-slate-900 text-sm whitespace-nowrap">
                          {agent.agentName}
                        </div>
                        <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                          {providerLabel(agent.provider)}
                        </span>
                        <div className="flex flex-col gap-0.5 mt-1">
                          <span className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Phone className="w-3 h-3" />
                            {agent.phoneNumber}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                            <User className="w-3 h-3" />
                            {agent.agentNumber}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {agent.storeNumber ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#E9EEF6] text-[#0F172A]">
                          <Zap className="w-3 h-3" />
                          {agent.storeNumber}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`text-sm font-semibold ${
                          agent.balance >= 0
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {currencyCode(agent.currency)} {agent.balance.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`text-sm font-semibold ${
                          agent.netMovement >= 0
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {agent.netMovement >= 0 ? "+" : ""}{currencyCode(agent.currency)}{" "}
                        {agent.netMovement.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold ${
                          agent.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {agent.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedAgent(agent)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-all text-xs font-medium rounded-lg"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Statement
                        </button>
                        <button
                          onClick={() => handleEditAgent(agent)}
                          className="flex items-center gap-1.5 px-3 py-2 transition-all text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button aria-label="Delete"
                          onClick={() => {
                            setSelectedAgent(agent);
                            setShowDeleteAgent(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 transition-all text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-red-50 text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalAgentPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <p className="text-sm text-slate-600">
              Showing {indexOfFirstAgent + 1} to{" "}
              {Math.min(indexOfLastAgent, filteredAgents.length)} of{" "}
              {filteredAgents.length} agents
            </p>

            <div className="flex gap-2">
              <button
                onClick={() =>
                  setAgentsCurrentPage((prev) => Math.max(prev - 1, 1))
                }
                disabled={agentsCurrentPage === 1}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100
                   !text-slate-400 hover:!text-slate-600
                   disabled:opacity-50 disabled:cursor-not-allowed
                   disabled:text-slate-300 text-sm font-medium"
              >
                Previous
              </button>

              <button
                onClick={() =>
                  setAgentsCurrentPage((prev) =>
                    Math.min(prev + 1, totalAgentPages),
                  )
                }
                disabled={agentsCurrentPage === totalAgentPages}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100
                   !text-slate-400 hover:!text-slate-600
                   disabled:opacity-50 disabled:cursor-not-allowed
                   disabled:text-slate-300 text-sm font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Agent Statement Modal */}
      <AnimatePresence>
        {selectedAgent && !showEditAgent && !showDeleteAgent && (
          <StatementModal
            kind="mpesa"
            accountId={selectedAgent.id}
            title={`${selectedAgent.agentName} – ${selectedAgent.agentNumber}`}
            subtitle={[selectedAgent.code, providerLabel((selectedAgent as any).provider)].filter(Boolean).join(" · ")}
            currency={Number((selectedAgent as any).currency ?? base)}
            onView={(raw) => handleViewTransaction(mapTransactionToDisplay(raw))}
            onEdit={(raw) => handleEditTransaction(mapTransactionToDisplay(raw))}
            onDelete={(raw) => handleDeleteTransaction(mapTransactionToDisplay(raw))}
            onRelated={(raw) => {
              setSelectedTransaction(mapTransactionToDisplay(raw));
              setShowRelatedAccount(true);
            }}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </AnimatePresence>

      {/* Add M-Pesa Agent Modal */}
      <AnimatePresence>
        {showAddAgent && (
          <div className="fixed inset-0 bg-black/80  flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 20 }}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              className="rounded-xl bg-white shadow-2xl max-w-2xl w-full overflow-hidden border border-blue-500"
            >
              <div className="relative bg-blue-600 p-4">
                <div className="absolute inset-0 opacity-10 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.15)_25%,rgba(255,255,255,.15)_50%,transparent_50%,transparent_75%,rgba(255,255,255,.15)_75%,rgba(255,255,255,.15))] bg-[length:20px_20px]"></div>
                <button
                  onClick={() => setShowAddAgent(false)}
                  className="rounded-lg absolute top-3 right-3 p-1.5 bg-white/10 hover:bg-white/20 transition-all duration-200 border border-white/20 hover:border-white/40 group"
                  title="Close"
                >
                  <X className="w-4 h-4 text-white  transition-transform duration-300" />
                </button>
                <div className="relative flex items-center gap-3">
                  <div className="w-11 h-11 bg-white/15 flex items-center justify-center border border-white/30 rounded-lg ">
                    <Smartphone className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-white tracking-tight">
                      Add mobile money agent
                    </h2>
                    <p className="text-blue-50 text-xs font-medium">
                      Register new mobile money agent
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleCreateAgent}>
                <div className="p-4 max-h-[calc(100vh-180px)] overflow-y-auto  bg-slate-50 ">
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-blue-500">
                        <div className="w-6 h-6 bg-blue-600 flex items-center justify-center shadow-sm">
                          <User className="w-3.5 h-3.5 text-white" />
                        </div>
                        <h3 className="text-xs font-semibold text-slate-900  ">
                          Agent Details
                        </h3>
                      </div>
                      <div className="rounded-xl grid grid-cols-2 gap-3 bg-white p-3.5 border border-slate-200 shadow-sm">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                            <User className="w-3 h-3 text-blue-600" />
                            Agent Name *
                          </label>
                          <input
                            type="text"
                            value={formData.agentName}
                            onChange={(e: any) =>
                              setFormData({
                                ...formData,
                                agentName: e.target.value,
                              })
                            }
                            className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                            placeholder="Sarif Exchange Agent - CBD"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                            <Phone className="w-3 h-3 text-blue-600" />
                            Phone Number *
                          </label>
                          <input
                            type="tel"
                            value={formData.phoneNumber}
                            onChange={(e: any) =>
                              setFormData({
                                ...formData,
                                phoneNumber: e.target.value,
                              })
                            }
                            className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                            placeholder={samples.phone}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                            <Hash className="w-3 h-3 text-blue-600" />
                            Agent Number *
                          </label>
                          <input
                            type="text"
                            value={formData.agentNumber}
                            onChange={(e: any) =>
                              setFormData({
                                ...formData,
                                agentNumber: e.target.value,
                              })
                            }
                            className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                            placeholder="AGT-001"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                            <Zap className="w-3 h-3 text-blue-600" />
                            Store Number
                          </label>
                          <input
                            type="text"
                            value={formData.storeNumber}
                            onChange={(e: any) =>
                              setFormData({
                                ...formData,
                                storeNumber: e.target.value,
                              })
                            }
                            className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                            placeholder="567890"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-900 mb-2">Network</label>
                      <select
                          value={formData.provider}
                          onChange={(e: any) => setFormData({ ...formData, provider: parseInt(e.target.value) })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          {networks.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label} ({currencyCode(walletCurrency(p.value, base))})
                            </option>
                          ))}
                        </select>
                        <p className="mt-1.5 text-xs text-slate-500">
                          This wallet holds {currencyCode(walletCurrency(formData.provider, base))}.
                          {formData.provider === 0 && base !== Currency.KES && " M-Pesa is a Kenyan shilling wallet."}
                        </p>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-amber-500">
                        <div className="w-6 h-6  bg-amber-600  flex items-center justify-center shadow-sm">
                          <Wallet className="w-3.5 h-3.5 text-white" />
                        </div>
                        <h3 className="text-xs font-semibold text-slate-900  ">
                          Agent Type
                        </h3>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="group cursor-pointer">
                          <input
                            type="radio"
                            name="agentType"
                            value="0"
                            checked={formData.agentType === 0}
                            onChange={(e: any) =>
                              setFormData({
                                ...formData,
                                agentType: parseInt(e.target.value),
                              })
                            }
                            className="peer sr-only"
                          />
                          <div className="p-3 bg-[#E9EEF6] border border-slate-200 peer-checked:border-blue-500 peer-checked:shadow-md transition-all hover:border-blue-500 relative overflow-hidden duration-200 rounded-lg">
                            <div className="absolute inset-0 bg-blue-600/5 opacity-0 peer-checked:opacity-100 transition-opacity"></div>
                            <div className="relative flex items-center gap-2 mb-1.5">
                              <div className="w-7 h-7 bg-blue-600 flex items-center justify-center shadow-sm">
                                <Smartphone className="w-3.5 h-3.5 text-white" />
                              </div>
                              <div>
                                <span className="font-semibold text-xs text-slate-900 block leading-tight">
                                  STANDARD AGENT
                                </span>
                                <span className="text-xs text-blue-600 font-semibold">
                                  Regular
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-slate-600 font-medium leading-snug relative">
                              Standard transactions
                            </p>
                          </div>
                        </label>

                        <label className="group cursor-pointer">
                          <input
                            type="radio"
                            name="agentType"
                            value="1"
                            checked={formData.agentType === 1}
                            onChange={(e: any) =>
                              setFormData({
                                ...formData,
                                agentType: parseInt(e.target.value),
                              })
                            }
                            className="peer sr-only"
                          />
                          <div className="p-3 bg-[#E9EEF6] border border-blue-200 peer-checked:border-blue-600 peer-checked:shadow-md transition-all hover:border-blue-400 relative overflow-hidden duration-200 rounded-lg">
                            <div className="absolute inset-0 bg-blue-600/5 opacity-0 peer-checked:opacity-100 transition-opacity"></div>
                            <div className="relative flex items-center gap-2 mb-1.5">
                              <div className="w-7 h-7 bg-blue-600 flex items-center justify-center shadow-sm">
                                <Zap className="w-3.5 h-3.5 text-white" />
                              </div>
                              <div>
                                <span className="font-semibold text-xs text-slate-900 block leading-tight">
                                  SUPER AGENT
                                </span>
                                <span className="text-xs text-blue-600 font-semibold">
                                  Premium
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-slate-600 font-medium leading-snug relative">
                              High volume transactions
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-emerald-500">
                        <div className="w-6 h-6  bg-emerald-600  flex items-center justify-center shadow-sm">
                          <Wallet className="w-3.5 h-3.5 text-white" />
                        </div>
                        <h3 className="text-xs font-semibold text-slate-900  ">
                          Opening Balance ({currencyCode(walletCurrency(formData.provider, base))})
                        </h3>
                      </div>
                      <div className="rounded-xl bg-white p-3.5 border border-slate-200 shadow-sm">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                            <Wallet className="w-3 h-3 text-emerald-600" />
                            {currencyCode(walletCurrency(formData.provider, base))} Amount
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-700 font-semibold text-xs">
                              {currencyCode(walletCurrency(formData.provider, base))}
                            </span>
                            <input
                              type="number"
                              value={formData.openingBalance}
                              onChange={(e: any) =>
                                setFormData({
                                  ...formData,
                                  openingBalance:
                                    parseFloat(e.target.value) || 0,
                                })
                              }
                              className="rounded-lg w-full pl-12 pr-3 py-2 bg-emerald-50 border border-emerald-300 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 focus:bg-white transition-all font-semibold text-slate-900 text-sm placeholder:text-slate-500/60"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 p-4  bg-slate-50 ">
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowAddAgent(false)}
                      className="rounded-lg flex-1 px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 text-sm  shadow-sm "
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="rounded-lg flex-1 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all flex items-center justify-center gap-2 text-sm border border-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      {isSubmitting ? "Adding..." : "Add Agent"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Agent Modal */}
      <AnimatePresence>
        {showEditAgent && selectedAgent && (
          <div className="fixed inset-0 bg-black/60  flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white shadow-2xl max-w-xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            >
              {/* Premium Header with Gradient Background */}
              <div className="relative bg-blue-600 px-6 py-4">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>

                <div className="relative flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-white/20  rounded-xl flex items-center justify-center border border-white/30 ">
                      <Edit3 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-0.5">
                        Edit mobile money agent
                      </h2>
                      <p className="text-blue-50 text-xs font-medium">
                        Update agent information and settings
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-800 border border-white/30 rounded-lg text-xs font-semibold text-white">
                          <Hash className="w-3 h-3" />
                          {selectedAgent.code}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 border rounded-lg text-xs font-semibold ${
                            selectedAgent.isActive
                              ? "bg-emerald-700 border-emerald-400/40 text-white"
                              : "bg-red-700 border-red-400/40 text-white"
                          }`}
                        >
                          <Zap className="w-3 h-3" />
                          {selectedAgent.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => {
                      setShowEditAgent(false);
                      setSelectedAgent(null);
                    }}
                    className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all "
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              {/* Account Balance Preview */}
              <div className="px-6 py-3  bg-slate-50  border-b border-slate-200">
                <div className="grid grid-cols-1 gap-3">
                  {/* KES Balance */}
                  <div className="rounded-xl bg-white p-3 border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Wallet className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-xs font-semibold text-slate-600  ">
                        {currencyCode(selectedAgent.currency)} mobile money account
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 text-xs">
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">
                          Opening Balance
                        </p>
                        <p className="text-xs font-semibold text-emerald-700">
                          {selectedAgent.openingBalance.toLocaleString()}
                        </p>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-xs text-slate-500 mb-0.5">
                          Current Balance
                        </p>
                        <p className="text-sm font-semibold text-blue-600">
                          {currencyCode(selectedAgent.currency)} {selectedAgent.balance.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrollable Form Content */}
              <form
                onSubmit={handleUpdateAgent}
                className="flex flex-col flex-1 overflow-hidden"
              >
                <div className="px-6 py-5 overflow-y-auto flex-1">
                  <div className="space-y-6">
                    {/* Agent Information Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-6 bg-blue-600 rounded-full"></div>
                        <h3 className="text-lg font-semibold text-slate-900">
                          Agent Information
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Agent Name */}
                        <div className="md:col-span-2">
                          <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <Smartphone className="w-4 h-4 text-slate-500" />
                            Agent Name
                            <span className="text-red-600">*</span>
                          </label>
                          <input
                            type="text"
                            value={editFormData.agentName}
                            onChange={(e: any) =>
                              setEditFormData({
                                ...editFormData,
                                agentName: e.target.value,
                              })
                            }
                            placeholder="Enter agent name"
                            className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                          />
                        </div>

                        {/* Phone Number - Read Only */}
                        <div className="group">
                          <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <Phone className="w-4 h-4 text-slate-500" />
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            value={selectedAgent.phoneNumber}
                            disabled
                            className="rounded-lg w-full px-4 py-3.5 bg-slate-50 border border-slate-200 text-slate-500 font-medium cursor-not-allowed"
                          />
                        </div>

                        {/* Agent Number - Read Only */}
                        <div className="group">
                          <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <Hash className="w-4 h-4 text-slate-500" />
                            Agent Number
                          </label>
                          <input
                            type="text"
                            value={selectedAgent.agentNumber}
                            disabled
                            className="rounded-lg w-full px-4 py-3.5 bg-slate-50 border border-slate-200 text-slate-500 font-medium cursor-not-allowed"
                          />
                        </div>
                      </div>

                      {/* Store Number and Status */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="group">
                          <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <Hash className="w-4 h-4 text-slate-500" />
                            Store Number
                          </label>
                          <input
                            type="text"
                            value={editFormData.storeNumber}
                            onChange={(e: any) =>
                              setEditFormData({
                                ...editFormData,
                                storeNumber: e.target.value,
                              })
                            }
                            placeholder="567890"
                            className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                          />
                        </div>

                        <div className="group">
                          <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-slate-500" />
                            Account Status
                          </label>
                          <select
                            value={
                              editFormData.isActive ? "active" : "inactive"
                            }
                            onChange={(e: any) =>
                              setEditFormData({
                                ...editFormData,
                                isActive: e.target.value === "active",
                              })
                            }
                            className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none cursor-pointer"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                      </div>

                      {/* Network */}
                      <div className="group">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Network</label>
                        <select
                          value={editFormData.provider}
                          onChange={(e: any) => setEditFormData({ ...editFormData, provider: parseInt(e.target.value) })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          {MOBILE_MONEY_PROVIDERS.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Agent Type */}
                      <div className="group">
                        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                          <Zap className="w-4 h-4 text-slate-500" />
                          Agent Type
                        </label>
                        <select
                          value={editFormData.agentType}
                          onChange={(e: any) =>
                            setEditFormData({
                              ...editFormData,
                              agentType: parseInt(e.target.value),
                            })
                          }
                          className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none cursor-pointer"
                        >
                          <option value="0">Standard Agent</option>
                          <option value="1">Super Agent</option>
                        </select>
                      </div>

                      {/* Registered Date */}
                      <div className="group">
                        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-500" />
                          Registered Since
                        </label>
                        <input
                          type="text"
                          value={new Date(
                            selectedAgent.createdAt,
                          ).toLocaleDateString()}
                          disabled
                          className="rounded-lg w-full px-4 py-3.5 bg-slate-50 border border-slate-200 text-slate-500 font-medium cursor-not-allowed"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fixed Footer with Action Buttons */}
                <div className="px-6 py-4  bg-slate-50  border-t border-slate-200 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditAgent(false);
                      setSelectedAgent(null);
                    }}
                    className="rounded-lg flex-1 px-6 py-3.5 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 shadow-sm "
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-lg flex-1 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    {isSubmitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Agent Confirmation Modal */}
      <AnimatePresence>
        {showDeleteAgent && selectedAgent && (
          <div className="fixed inset-0 bg-black/60  flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white shadow-2xl max-w-md w-full overflow-hidden flex flex-col"
            >
              {/* Premium Header with Gradient Background */}
              <div className="relative  bg-red-600   px-6 py-4">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>

                <div className="relative flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-white/20 flex items-center justify-center border border-white/30 rounded-lg ">
                      <Trash2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-0.5">
                        Delete mobile money agent
                      </h2>
                      <p className="text-white text-xs font-medium">
                        This action cannot be undone
                      </p>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => {
                      setShowDeleteAgent(false);
                      setSelectedAgent(null);
                    }}
                    className="rounded-lg p-1.5 bg-white/10 hover:bg-white/20 transition-all "
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-5">
                {/* Warning Icon */}
                <div className="flex items-center justify-center mb-4">
                  <div className="w-16 h-16 bg-red-100 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-600" />
                  </div>
                </div>

                <h4 className="text-lg font-semibold text-slate-900 text-center mb-2">
                  Are you sure you want to delete this agent?
                </h4>
                <p className="text-sm text-slate-600 text-center mb-4">
                  This will permanently remove the agent and all associated data
                  from the system.
                </p>

                {/* Agent Details */}
                <div className="bg-red-50 border border-red-200 p-4 space-y-2 rounded-xl">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-600 ">
                      Agent Code:
                    </span>
                    <span className="text-xs font-mono font-semibold text-slate-900">
                      {selectedAgent.code}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-600 ">
                      Agent Name:
                    </span>
                    <span className="text-xs font-semibold text-slate-900">
                      {selectedAgent.agentName}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-600 ">
                      Phone:
                    </span>
                    <span className="text-xs font-semibold text-slate-900">
                      {selectedAgent.phoneNumber}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-red-300">
                    <span className="text-xs font-semibold text-slate-600 ">
                      Balance:
                    </span>
                    <span className="text-sm font-semibold text-red-700">
                      {currencyCode(selectedAgent.currency)} {selectedAgent.balance.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Fixed Footer with Action Buttons */}
              <div className="px-6 py-4  bg-slate-50  border-t border-slate-200 flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteAgent(false);
                    setSelectedAgent(null);
                  }}
                  className="rounded-lg flex-1 px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 shadow-sm "
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAgent}
                  disabled={isSubmitting}
                  className="rounded-lg flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  {isSubmitting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction pop-ups — shared with the other ledger screens (TransactionDialogs.tsx) */}
      {showViewTransaction && selectedTransaction && (
        <TransactionDetailsDialog
          txn={selectedTransaction}
          kind="mpesa"
          accountName={selectedAgent ? `${selectedAgent.agentName} – ${selectedAgent.agentNumber}` : undefined}
          onClose={() => {
            setShowViewTransaction(false);
            setSelectedTransaction(null);
          }}
          onRelated={() => {
            setShowViewTransaction(false);
            setShowRelatedAccount(true);
          }}
        />
      )}

      {/* Edit Transaction Modal */}
      <AnimatePresence>
        {showEditTransaction && selectedTransaction && (
          <EditTransactionDialog
            txn={selectedTransaction}
            onClose={() => {
              setShowEditTransaction(false);
              setSelectedTransaction(null);
            }}
            onSaved={async () => {
              // reloads the open statement
              refreshOpenStatement();
            }}
          />
        )}
      </AnimatePresence>

      {showDeleteTransaction && selectedTransaction && (
        <ReverseTransactionDialog
          txn={selectedTransaction}
          kind="mpesa"
          busy={isSubmitting}
          onClose={() => setShowDeleteTransaction(false)}
          onConfirm={(reason) => confirmDeleteTransaction(reason)}
        />
      )}

      {showRelatedAccount && selectedTransaction?.relatedAccount && (
        <RelatedAccountDialog
          txn={selectedTransaction}
          kind="mpesa"
          onClose={() => setShowRelatedAccount(false)}
          onBack={() => {
            setShowRelatedAccount(false);
            setShowViewTransaction(true);
          }}
        />
      )}
    </div>
  );
}
