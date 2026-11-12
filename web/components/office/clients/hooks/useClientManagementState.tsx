"use client";

import { ClientDto, ClientType, CreateClientDto, UpdateClientDto, apiRequest, createClient, deleteClient, getClientStats, getClients, reverseClientTransaction, updateClient } from "@/lib/api";
import { ClientStatsDto, ConvertClientDto, DisplayTransaction } from "../helpers";
import { buildCredentialMessage } from "@/lib/whatsapp";
import { refreshOpenStatement } from "../../StatementModal";
import { toast } from "sonner";
import { useAllowedCurrencies, useCountrySamples } from "@/lib/useBaseCurrency";
import { useCallback, useState } from "react";

/** ClientManagement: state (part 1 of 2 of useClientManagement). */
export function useClientManagementState() {
  // Kenyan bureaus don't use UGX; Ugandan ones use KES too (lib/useBaseCurrency).
  const { has: currencyOk, base: homeCurrency } = useAllowedCurrencies();
  const samples = useCountrySamples();
 // placeholders in the bureau's own country
  // ==============================================
  // State Management
  // ==============================================
  const [activeTab, setActiveTab] = useState<"all" | "debit" | "credit">("all");
  // Currencies this company actually uses — drives which balance columns show,
  // so a Ugandan (UGX/USD) bureau never sees empty KES columns, etc.
  const [activeCurrencies, setActiveCurrencies] = useState<number[]>([0, 1]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddClient, setShowAddClient] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientDto | null>(null);
  const [showStatement, setShowStatement] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [shareModal, setShareModal] = useState<{
    show: boolean;
    title: string;
    details: { label: string; value: string }[];
    phone: string;
    message: string;
  }>({ show: false, title: "", details: [], phone: "", message: "" });
  // Transaction-related states
  const [selectedTransaction, setSelectedTransaction] =
    useState<DisplayTransaction | null>(null);
  const [showTransactionDetail, setShowTransactionDetail] = useState(false);
  const [showEditTransaction, setShowEditTransaction] = useState(false);
  const [showDeleteTransaction, setShowDeleteTransaction] = useState(false);
  const [showRelatedAccount, setShowRelatedAccount] = useState(false);
  // Data states
  const [clients, setClients] = useState<ClientDto[]>([]);
  const [clientStats, setClientStats] = useState<ClientStatsDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(8);
  const calculatedTotalPages = Math.max(
    1,
    totalPages || 1,
    Math.ceil((totalCount || 0) / (pageSize || 1)) || 1,
  );
  // Form states
  const [formData, setFormData] = useState<Partial<CreateClientDto>>({
    fullName: "",
    whatsAppNumber: "",
    email: "",
    idPassport: "",
    clientType: ClientType.Permanent,
    password: "",
    openingBalanceKES: 0,
    openingBalanceUSD: 0,
    openingBalanceHome: 0,
  });
  const [editFormData, setEditFormData] = useState<Partial<UpdateClientDto>>({
    fullName: "",
    email: "",
    whatsAppNumber: "",
    idPassport: "",
    isActive: true,
  });
  const [convertPassword, setConvertPassword] = useState("");
  // ==============================================
  // API Functions
  // ==============================================
  const fetchClients = useCallback(async () => {
    setIsLoading(true);
    try {
      const filter = activeTab === "all" ? undefined : activeTab;

      // ✅ normalize search term (case-insensitive + remove extra spaces)
      const normalizedSearch = searchTerm?.trim().toLowerCase() || undefined;

      const result = await getClients(
        currentPage,
        pageSize,
        normalizedSearch,
        filter,
      );

      if (result.success && result.data) {
        setClients(result.data.items);
        setTotalPages(result.data.totalPages);
        setTotalCount(result.data.totalCount);
      } else {
        toast.error(result.message || "Failed to fetch clients");
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("Failed to fetch clients");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, searchTerm, activeTab]);
  const fetchClientStats = useCallback(async () => {
    try {
      const result = await getClientStats();
      if (result.success && result.data) {
        setClientStats(result.data);
      }
    } catch (error) {
      console.error("Error fetching client stats:", error);
      toast.error("Failed to load data. Please refresh.");
    }
  }, []);
  // Map API transaction to display format with related account info
  const mapTransactionToDisplay = (txn: any): DisplayTransaction => {
    return {
      id: txn.transactionId || txn.id || "",
      code: txn.transactionCode || txn.code || "",
      reference: txn.reference || txn.transactionCode || txn.code || "",
      transactionDate: txn.date || txn.transactionDate || txn.createdAt || "",
      transactionType: txn.transactionType ?? 0,
      thisAccountAction: txn.thisAccountAction || "",
      debit: txn.debit ?? null,
      credit: txn.credit ?? null,
      amount: txn.amount ?? 0,
      currency: txn.currency ?? 0,
      balanceBefore: txn.balanceBefore ?? 0,
      balanceAfter: txn.balanceAfter ?? 0,
      description: txn.description || "",
      notes: txn.notes,
      exchangeRate: txn.exchangeRate,
      counterAmount: txn.counterAmount,
      counterCurrency: txn.counterCurrency,
      reconciliationStatus: txn.reconciliationStatus ?? 0,
      createdAt: txn.date || txn.createdAt || "",
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
  // ==============================================
  // Event Handlers - Clients
  // ==============================================

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.fullName || !formData.whatsAppNumber) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const dto: CreateClientDto = {
        fullName: formData.fullName!,
        whatsAppNumber: formData.whatsAppNumber!,
        email: formData.email || undefined,
        idPassport: formData.idPassport || undefined,
        clientType: formData.clientType ?? ClientType.Permanent,
        password: formData.password || undefined,
        openingBalanceKES: formData.openingBalanceKES || 0,
        openingBalanceUSD: formData.openingBalanceUSD || 0,
        openingBalanceHome: formData.openingBalanceHome || 0,
      };

      const result = await createClient(dto);

      if (result.success) {
        const clientCode = result.data?.code || "";
        if (/could not be sent/i.test(result.message ?? "")) toast.warning(result.message, { duration: 10000 });
        else toast.success("Client created successfully!");
        setShowAddClient(false);
        fetchClients();
        fetchClientStats();
        // Show WhatsApp share for permanent clients
        if (
          formData.whatsAppNumber &&
          formData.password &&
          formData.clientType === 0
        ) {
          setShareModal({
            show: true,
            title: "Client Created",
            details: [
              { label: "Name", value: formData.fullName },
              { label: "Code", value: clientCode },
              { label: "Phone", value: formData.whatsAppNumber },
            ],
            phone: formData.whatsAppNumber,
            message: buildCredentialMessage({
              role: "client",
              fullName: formData.fullName,
              code: clientCode,
              password: formData.password,
            }),
          });
        }
        resetForm();
      } else {
        toast.error(result.message || "Failed to create client");
      }
    } catch (error) {
      console.error("Error creating client:", error);
      toast.error("Failed to create client");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedClient) return;

    setIsSubmitting(true);
    try {
      const dto: UpdateClientDto = {
        fullName: editFormData.fullName || undefined,
        email: editFormData.email || undefined,
        whatsAppNumber: editFormData.whatsAppNumber || undefined,
        idPassport: editFormData.idPassport || undefined,
        isActive: editFormData.isActive,
      };

      const result = await updateClient(selectedClient.id, dto);

      if (result.success) {
        toast.success("Client updated successfully!");
        setShowEditModal(false);
        fetchClients();
        fetchClientStats();
      } else {
        toast.error(result.message || "Failed to update client");
      }
    } catch (error) {
      console.error("Error updating client:", error);
      toast.error("Failed to update client");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDeleteClient = async () => {
    if (!selectedClient) return;

    setIsSubmitting(true);
    try {
      const result = await deleteClient(selectedClient.id);

      if (result.success) {
        toast.success("Client deleted successfully!");
        setShowDeleteConfirm(false);
        setShowStatement(false);
        setSelectedClient(null);
        fetchClients();
        fetchClientStats();
      } else {
        toast.error(result.message || "Failed to delete client");
      }
    } catch (error) {
      console.error("Error deleting client:", error);
      toast.error("Failed to delete client");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleConvertToPermanent = async () => {
    if (!selectedClient || !convertPassword) {
      toast.error("Please enter a password");
      return;
    }

    setIsSubmitting(true);
    try {
      const dto: ConvertClientDto = { password: convertPassword };
      const result = await apiRequest<ClientDto>(
        `/api/client/${selectedClient.id}/convert`,
        {
          method: "POST",
          body: JSON.stringify(dto),
        },
      );

      if (result.success) {
        toast.success("Client converted to permanent successfully!");
        setShowConvertModal(false);
        setConvertPassword("");
        fetchClients();
        fetchClientStats();
      } else {
        toast.error(result.message || "Failed to convert client");
      }
    } catch (error) {
      console.error("Error converting client:", error);
      toast.error("Failed to convert client");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleViewClient = async (client: ClientDto) => {
    setSelectedClient(client);
    setShowStatement(true);
    // StatementModal loads its own data (per currency, per period).
  };
  const handleEditClient = (client: ClientDto) => {
    setSelectedClient(client);
    setEditFormData({
      fullName: client.fullName,
      email: client.email || "",
      whatsAppNumber: client.whatsAppNumber || "",
      idPassport: client.idPassport || "",
      isActive: client.isActive,
    });
    setShowEditModal(true);
  };
  const resetForm = () => {
    setFormData({
      fullName: "",
      whatsAppNumber: "",
      email: "",
      idPassport: "",
      clientType: ClientType.Permanent,
      password: "",
      openingBalanceKES: 0,
      openingBalanceUSD: 0,
      openingBalanceHome: 0,
    });
  };
  // ==============================================
  // Event Handlers - Transactions
  // ==============================================

  const handleViewTransaction = (transaction: DisplayTransaction) => {
    setSelectedTransaction(transaction);
    setShowTransactionDetail(true);
  };
  const handleEditTransaction = (transaction: DisplayTransaction) => {
    setSelectedTransaction(transaction);
    setShowEditTransaction(true);
  };
  const handleDeleteTransaction = (transaction: DisplayTransaction) => {
    setSelectedTransaction(transaction);
    setShowDeleteTransaction(true);
  };
  const confirmDeleteTransaction = async (reason = "") => {
    if (!selectedTransaction || !selectedClient) return;

    setIsSubmitting(true);
    try {
      // Call client-specific endpoint to delete transaction from client statement
      // This bypasses the restriction on general transaction deletion for client accounts
      const result = await reverseClientTransaction(
        selectedClient.id,
        selectedTransaction.id,
        reason || "User requested deletion from client statement",
      );

      if (result.success) {
        toast.success(
          `Transaction ${
            selectedTransaction.reference || selectedTransaction.code
          } reversed`,
        );
        setShowDeleteTransaction(false);
        setSelectedTransaction(null);
        // Refresh transactions
        refreshOpenStatement();
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
    currencyOk,
    homeCurrency,
    samples,
    activeTab,
    setActiveTab,
    activeCurrencies,
    setActiveCurrencies,
    searchTerm,
    setSearchTerm,
    showAddClient,
    setShowAddClient,
    selectedClient,
    setSelectedClient,
    showStatement,
    setShowStatement,
    showEditModal,
    setShowEditModal,
    showDeleteConfirm,
    setShowDeleteConfirm,
    showConvertModal,
    setShowConvertModal,
    shareModal,
    setShareModal,
    selectedTransaction,
    setSelectedTransaction,
    showTransactionDetail,
    setShowTransactionDetail,
    showEditTransaction,
    setShowEditTransaction,
    showDeleteTransaction,
    setShowDeleteTransaction,
    showRelatedAccount,
    setShowRelatedAccount,
    clients,
    setClients,
    clientStats,
    setClientStats,
    isLoading,
    setIsLoading,
    isSubmitting,
    setIsSubmitting,
    currentPage,
    setCurrentPage,
    totalPages,
    setTotalPages,
    totalCount,
    setTotalCount,
    pageSize,
    calculatedTotalPages,
    formData,
    setFormData,
    editFormData,
    setEditFormData,
    convertPassword,
    setConvertPassword,
    fetchClients,
    fetchClientStats,
    mapTransactionToDisplay,
    handleCreateClient,
    handleUpdateClient,
    handleDeleteClient,
    handleConvertToPermanent,
    handleViewClient,
    handleEditClient,
    resetForm,
    handleViewTransaction,
    handleEditTransaction,
    handleDeleteTransaction,
    confirmDeleteTransaction,
  };
}
