"use client";

import { CreateMpesaAgentDto, Currency, MOBILE_MONEY_PROVIDERS, apiRequest, createMpesaAgent, deleteMpesaAgent, getMpesaAgents, getMpesaStats, updateMpesaAgent, walletCurrency } from "@/lib/api";
import { EditFormData, FormData, MPesaAgent, MpesaStats, Transaction } from "./helpers";
import { isCurrencyAllowed, useBaseCurrency, useCountrySamples } from "@/lib/useBaseCurrency";
import { refreshOpenStatement } from "../StatementModal";
import { toast } from "sonner";
import { useCallback, useEffect, useState } from "react";

/** All of MPesaAccounts's state, effects and handlers. The screen and its sections read them from here. */
export function useMPesaAccounts() {
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

  return {
    base,
    baseCode,
    samples,
    networks,
    allAgents,
    setAllAgents,
    stats,
    setStats,
    isLoading,
    setIsLoading,
    isSubmitting,
    setIsSubmitting,
    activeTab,
    setActiveTab,
    searchTerm,
    setSearchTerm,
    showAddAgent,
    setShowAddAgent,
    selectedAgent,
    setSelectedAgent,
    selectedTransaction,
    setSelectedTransaction,
    showViewTransaction,
    setShowViewTransaction,
    showEditTransaction,
    setShowEditTransaction,
    showDeleteTransaction,
    setShowDeleteTransaction,
    showRelatedAccount,
    setShowRelatedAccount,
    showEditAgent,
    setShowEditAgent,
    showDeleteAgent,
    setShowDeleteAgent,
    agentsCurrentPage,
    setAgentsCurrentPage,
    agentsPerPage,
    formData,
    setFormData,
    editFormData,
    setEditFormData,
    defaultProvider,
    mapDtoToAgent,
    mapTransactionToDisplay,
    fetchAgents,
    fetchStats,
    handleRefresh,
    handleCreateAgent,
    handleUpdateAgent,
    handleDeleteAgent,
    agentsWithOutstanding,
    displayedAgents,
    filteredAgents,
    indexOfLastAgent,
    indexOfFirstAgent,
    currentAgents,
    totalAgentPages,
    handleEditAgent,
    handleViewTransaction,
    handleEditTransaction,
    handleDeleteTransaction,
    confirmDeleteTransaction,
  };
}

export type MPesaAccountsVM = ReturnType<typeof useMPesaAccounts>;
