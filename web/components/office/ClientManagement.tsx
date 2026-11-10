"use client";

import { useAllowedCurrencies, useCountrySamples } from "@/lib/useBaseCurrency";
import { StatementModal, refreshOpenStatement } from "./StatementModal";
import { TransactionDetailsDialog, RelatedAccountDialog, ReverseTransactionDialog } from "./TransactionDialogs";
import { EditTransactionDialog } from "./EditTransactionDialog";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  buildCredentialMessage,
} from "@/lib/whatsapp";
import { SuccessShareModal } from "@/components/ui/SuccessShareModal";
import {
  Users,
  UserPlus,
  Search,
  Wallet,
  DollarSign,
  Phone,
  Mail,
  AlertCircle,
  CheckCircle,
  Download,
  X,
  FileText,
  Edit3,
  Trash2,
  UserCheck,
  Clock,
  RefreshCw,
  User,
  Hash,
  Loader2,
  Key,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ClientDto,
  CreateClientDto,
  UpdateClientDto,
  ClientType,
  getClients,
  getCompanyCurrencies,
  createClient,
  updateClient,
  deleteClient,
  getClientStats,
  getClientTypeLabel,
  apiRequest,
  getStoredAuth,
  reverseClientTransaction,
  currencyCode,
  Currency,
  currencyDecimals,
  formatMoney,
  unlinkClientPhoneLogin,
} from "@/lib/api";
import { localDate } from "@/lib/dates";

// ==============================================
// Additional DTOs matching backend
// ==============================================

interface ClientStatsDto {
  totalClients: number;
  permanentClients: number;
  temporaryClients: number;
  clientsWithDebit: number;
  clientsWithCredit: number;
  totalBalanceKES: number;
  totalBalanceUSD: number;
  /** Totals for every currency in use (KES, USD, UGX, EUR) */
  byCurrency?: { currency: number; currencyCode: string; totalBalance: number }[] | null;
}

interface ConvertClientDto {
  password: string;
}

// Local transaction type for display (matches backend StatementLineDto)
interface DisplayTransaction {
  id: string;
  code: string;
  reference: string;
  transactionDate: string;
  transactionType: number;
  thisAccountAction: string; // "Credit" or "Debit"
  debit: number | null;
  credit: number | null;
  amount: number;
  currency: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  notes?: string;
  exchangeRate?: number;
  counterAmount?: number;
  counterCurrency?: number;
  reconciliationStatus: number;
  createdAt: string;
  isReversed?: boolean;
  isReversal?: boolean;
  // Related account info from API
  relatedAccount?: {
    accountId: string;
    accountType: number;
    accountName: string;
    accountCode: string;
    currency: number;
    action: string; // "Debit" or "Credit"
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    clientCode?: string;
    clientPhone?: string;
  };
}

// One line per currency a client uses: KES/USD from the fixed fields, UGX/EUR/...
// from otherBalances. "Money in" = credits to the client, "money out" = debits.
interface ClientCurrencyLine {
  currency: number;
  code: string;
  moneyIn: number;
  moneyOut: number;
  balance: number;
}
const fmtAmount = (n: number, c: number) =>
  (n || 0).toLocaleString("en-US", {
    minimumFractionDigits: currencyDecimals(c),
    maximumFractionDigits: currencyDecimals(c),
  });
function clientCurrencyLines(client: any): ClientCurrencyLine[] {
  const lines: ClientCurrencyLine[] = [];
  const kesBal = (client.netMovementKES ?? 0) + (client.openingBalanceKES ?? 0);
  const usdBal = (client.netMovementUSD ?? 0) + (client.openingBalanceUSD ?? 0);
  if (kesBal || client.totalCreditKES || client.totalDebitKES)
    lines.push({ currency: 0, code: "KES", moneyIn: client.totalCreditKES ?? 0, moneyOut: client.totalDebitKES ?? 0, balance: kesBal });
  if (usdBal || client.totalCreditUSD || client.totalDebitUSD)
    lines.push({ currency: 1, code: "USD", moneyIn: client.totalCreditUSD ?? 0, moneyOut: client.totalDebitUSD ?? 0, balance: usdBal });
  for (const b of client.otherBalances || []) {
    if (b.balance || b.totalIn || b.totalOut)
      lines.push({
        currency: b.currency,
        code: b.currencyCode || currencyCode(b.currency),
        moneyIn: b.totalIn ?? 0,
        moneyOut: b.totalOut ?? 0,
        balance: b.balance ?? 0,
      });
  }
  return lines;
}

export function ClientManagement() {
  // Kenyan bureaus don't use UGX; Ugandan ones use KES too (lib/useBaseCurrency).
  const { has: currencyOk, base: homeCurrency } = useAllowedCurrencies();
  const samples = useCountrySamples(); // placeholders in the bureau's own country
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
  // Effects
  // ==============================================

  useEffect(() => {
    fetchClients();
    fetchClientStats();
    // Load the company's actually-used currencies for column visibility.
    getCompanyCurrencies()
      .then((res) => {
        if (res.success && res.data?.currencies?.length) {
          setActiveCurrencies(res.data.currencies.map((c) => c.value));
        }
      })
      .catch(() => {
        /* keep the KES/USD default on failure */
      });
  }, [fetchClients, fetchClientStats]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);

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

  const handleExportClientsPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Get company info from auth
      const auth = getStoredAuth();
      const companyName = auth?.user?.companyName || "Money Exchange";

      // ========== CORPORATE HEADER ==========
      // Top accent line
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, pageWidth, 4, "F");

      // Company branding area
      doc.setFillColor(250, 250, 250);
      doc.rect(0, 4, pageWidth, 36, "F");

      // Logo placeholder
      doc.setFillColor(37, 99, 235);
      doc.rect(14, 10, 24, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(companyName.charAt(0).toUpperCase(), 26, 26, {
        align: "center",
      });

      // Company name and document title
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(companyName, 44, 18);

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Client Portfolio Report", 44, 26);

      // Right side - Document info
      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.text("Report Date", pageWidth - 14, 14, { align: "right" });
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(
        new Date().toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
        pageWidth - 14,
        21,
        { align: "right" },
      );

      doc.setTextColor(107, 114, 128);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("Total Clients", pageWidth - 14, 28, { align: "right" });
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(String(totalCount), pageWidth - 14, 35, { align: "right" });

      // Separator line
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(14, 42, pageWidth - 14, 42);

      // ========== PORTFOLIO SUMMARY ==========
      let yPos = 50;

      if (clientStats) {
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("PORTFOLIO SUMMARY", 14, yPos);

        yPos += 6;
        const cardWidth = (pageWidth - 42) / 4;

        // Total Clients
        doc.setDrawColor(229, 231, 235);
        doc.rect(14, yPos, cardWidth, 20, "S");
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.setFont("helvetica", "normal");
        doc.text("Total Clients", 16, yPos + 6);
        doc.setFontSize(12);
        doc.setTextColor(17, 24, 39);
        doc.setFont("helvetica", "bold");
        doc.text(String(clientStats.totalClients ?? 0), 16, yPos + 14);

        // Permanent
        doc.rect(14 + cardWidth + 4, yPos, cardWidth, 20, "S");
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.setFont("helvetica", "normal");
        doc.text("Permanent", 18 + cardWidth, yPos + 6);
        doc.setFontSize(12);
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.text(
          String(clientStats.permanentClients ?? 0),
          18 + cardWidth,
          yPos + 14,
        );

        // KES Balance
        const kesBal = clientStats.totalBalanceKES ?? 0;
        const kesPositive = kesBal >= 0;
        doc.rect(14 + (cardWidth + 4) * 2, yPos, cardWidth, 20, "S");
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.setFont("helvetica", "normal");
        doc.text("KES Portfolio", 18 + (cardWidth + 4) * 2, yPos + 6);
        doc.setFontSize(10);
        doc.setTextColor(
          kesPositive ? 22 : 185,
          kesPositive ? 163 : 28,
          kesPositive ? 74 : 28,
        );
        doc.setFont("helvetica", "bold");
        doc.text(
          `${kesPositive ? "" : "-"}${Math.abs(kesBal).toLocaleString()}`,
          18 + (cardWidth + 4) * 2,
          yPos + 14,
        );

        // USD Balance
        const usdBal = clientStats.totalBalanceUSD ?? 0;
        const usdPositive = usdBal >= 0;
        doc.rect(14 + (cardWidth + 4) * 3, yPos, cardWidth, 20, "S");
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.setFont("helvetica", "normal");
        doc.text("USD Portfolio", 18 + (cardWidth + 4) * 3, yPos + 6);
        doc.setFontSize(10);
        doc.setTextColor(
          usdPositive ? 22 : 185,
          usdPositive ? 163 : 28,
          usdPositive ? 74 : 28,
        );
        doc.setFont("helvetica", "bold");
        doc.text(
          `${usdPositive ? "" : "-"}${Math.abs(usdBal).toLocaleString()}`,
          18 + (cardWidth + 4) * 3,
          yPos + 14,
        );

        yPos += 28;
      }

      // ========== CLIENT LIST ==========
      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("CLIENT DIRECTORY", 14, yPos);

      const tableData = clients.map((client) => {
        const kesBalance = client.balanceKES ?? 0;
        const usdBalance = client.balanceUSD ?? 0;
        const kesPos = kesBalance >= 0;
        const usdPos = usdBalance >= 0;
        return [
          client.code || "-",
          client.fullName || "Unknown",
          getClientTypeLabel(client.clientType),
          client.whatsAppNumber || "-",
          `${kesPos ? "" : "-"}KES ${Math.abs(kesBalance).toLocaleString()}`,
          `${usdPos ? "" : "-"}USD ${Math.abs(usdBalance).toLocaleString()}`,
          (client.otherBalances || [])
            .filter((b: any) => (b.balance ?? 0) !== 0)
            .map((b: any) => `${b.currencyCode} ${(b.balance ?? 0).toLocaleString()}`)
            .join(", ") || "-",
          client.isActive ? "Active" : "Inactive",
        ];
      });

      autoTable(doc, {
        startY: yPos + 4,
        head: [
          [
            "Code",
            "Client Name",
            "Type",
            "Phone",
            "KES Balance",
            "USD Balance",
            "Other Balances",
            "Status",
          ],
        ],
        body: tableData,
        theme: "plain",
        styles: {
          fontSize: 8,
          cellPadding: 3,
        },
        headStyles: {
          fillColor: [249, 250, 251],
          textColor: [75, 85, 99],
          fontStyle: "bold",
          lineWidth: 0.1,
          lineColor: [229, 231, 235],
        },
        bodyStyles: {
          lineWidth: 0.1,
          lineColor: [243, 244, 246],
        },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 34 },
          2: { cellWidth: 20 },
          3: { cellWidth: 26 },
          4: { cellWidth: 26, halign: "right" },
          5: { cellWidth: 24, halign: "right" },
          6: { cellWidth: 24, halign: "right" },
          7: { cellWidth: 14, halign: "center" },
        },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        margin: { left: 14, right: 14 },
        didParseCell: (data: any) => {
          // KES (4) and USD (5) balance columns: red if negative, green otherwise
          if (
            data.section === "body" &&
            (data.column.index === 4 || data.column.index === 5)
          ) {
            const cellVal = String(data.cell.raw || "");
            const isNegative = cellVal.startsWith("-");
            data.cell.styles.textColor = isNegative
              ? [185, 28, 28]
              : [22, 163, 74];
          }
          // Other balances (6): violet tint
          if (data.section === "body" && data.column.index === 6) {
            data.cell.styles.textColor = [124, 58, 237];
          }
          // Status (7)
          if (data.section === "body" && data.column.index === 7) {
            data.cell.styles.textColor =
              data.cell.raw === "Active" ? [22, 163, 74] : [156, 163, 175];
          }
        },
        didDrawPage: (data: any) => {
          // Footer
          doc.setDrawColor(229, 231, 235);
          doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20);

          doc.setFontSize(7);
          doc.setTextColor(156, 163, 175);
          doc.text(companyName, 14, pageHeight - 12);
          doc.text(`Page ${data.pageNumber}`, pageWidth / 2, pageHeight - 12, {
            align: "center",
          });
          doc.text("Confidential", pageWidth - 14, pageHeight - 12, {
            align: "right",
          });
        },
      });

      const fileName = `${companyName.replace(/\s+/g, "_")}_Clients_Report_${
        localDate()
      }.pdf`;
      doc.save(fileName);
      toast.success("Client report exported successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF report");
    }
  };

  // ==============================================
  // Computed Values
  // ==============================================

  const stats = clientStats || {
    totalClients: 0,
    permanentClients: 0,
    temporaryClients: 0,
    clientsWithDebit: 0,
    clientsWithCredit: 0,
    totalBalanceKES: 0,
    totalBalanceUSD: 0,
    byCurrency: null,
  };

  // ==============================================
  // Render
  // ==============================================

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Clients
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {stats.permanentClients} permanent · {stats.temporaryClients}{" "}
            temporary
          </p>
        </div>
        <button
          onClick={() => setShowAddClient(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UserPlus className="w-4 h-4" />
          Add client
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* All Clients Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.02 }}
          className="relative rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white   overflow-hidden cursor-pointer   transition-all duration-300"
          onClick={() => setActiveTab("all")}
        >
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40"></div>
          <div className="relative p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-white/10 flex items-center justify-center border border-white/20 rounded-lg">
                <Users className="w-6 h-6" />
              </div>
              <div className="bg-white/20 px-3 py-1 border border-white/30 rounded-lg">
                <span className="text-xs font-semibold  ">
                  Total
                </span>
              </div>
            </div>
            <p className="text-xs opacity-90 mb-1   font-semibold">
              Total Clients
            </p>
            <p className="text-2xl font-semibold tracking-tight mb-4">
              {stats.totalClients}
            </p>
            <div className="pt-3 border-t border-white/20 space-y-1">
              {(stats.byCurrency && stats.byCurrency.length > 0
                ? stats.byCurrency.map((b) => ({ currency: b.currency, total: b.totalBalance }))
                : [
                    { currency: 0, total: stats.totalBalanceKES },
                    { currency: 1, total: stats.totalBalanceUSD },
                  ]
              ).map((b) => (
                <div key={b.currency} className="flex items-center justify-between">
                  <span className="text-xs">{currencyCode(b.currency)} balance</span>
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(b.total, b.currency)}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Clients with Credit Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.02 }}
          className="rounded-xl bg-white border border-slate-200   hover:border-emerald-300 transition-all duration-300 cursor-pointer group"
          onClick={() => setActiveTab("debit")}
        >
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-emerald-100 flex items-center justify-center border border-emerald-200 group-hover:bg-emerald-200 transition-colors rounded-lg">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="bg-emerald-100 px-3 py-1 border border-emerald-200 rounded-lg">
                <span className="text-xs font-semibold text-emerald-700  ">
                  Credit
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-1 font-semibold">
              Clients With Credit
            </p>
            <p className="text-2xl font-semibold text-emerald-600 tracking-tight mb-4">
              {stats.clientsWithDebit}
            </p>
            <div className="pt-3 border-t border-slate-100 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold">
                  Positive Balances
                </span>
                <span className="text-sm font-semibold text-emerald-700">
                  {stats.clientsWithDebit} clients
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Clients with Debit Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          whileHover={{ scale: 1.02 }}
          className="rounded-xl bg-white border border-slate-200   hover:border-red-300 transition-all duration-300 cursor-pointer group"
          onClick={() => setActiveTab("credit")}
        >
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-red-100 flex items-center justify-center border border-red-200 group-hover:bg-red-200 transition-colors rounded-lg">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div className="bg-red-100 px-3 py-1 border border-red-200 rounded-lg">
                <span className="text-xs font-semibold text-red-700  ">
                  Debit
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-1 font-semibold">
              Clients With Debit
            </p>
            <p className="text-2xl font-semibold text-red-600 tracking-tight mb-4">
              {stats.clientsWithCredit}
            </p>
            <div className="pt-3 border-t border-slate-100 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold">
                  Negative Balances
                </span>
                <span className="text-sm font-semibold text-red-600">
                  {stats.clientsWithCredit} clients
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setActiveTab("all")}
          className={`rounded-lg flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-300 ${
            activeTab === "all"
              ? " bg-[#0F172A]  text-white  "
              : "bg-white text-slate-600 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg"
          }`}
        >
          <Users className="w-5 h-5" />
          All Clients
          <span
            className={`px-2 py-0.5 text-xs font-semibold ${
              activeTab === "all" ? "bg-white/20" : "bg-blue-100 text-blue-700"
            }`}
          >
            {stats.totalClients}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("debit")}
          className={`rounded-lg flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-300 ${
            activeTab === "debit"
              ? " bg-emerald-700  text-white  "
              : "bg-white text-slate-600 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg"
          }`}
        >
          <CheckCircle className="w-5 h-5" />
          With Credit
          <span
            className={`px-2 py-0.5 text-xs font-semibold ${
              activeTab === "debit"
                ? "bg-white/20"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {stats.clientsWithDebit}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("credit")}
          className={`rounded-lg flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-300 ${
            activeTab === "credit"
              ? " bg-red-600  text-white  "
              : "bg-white text-slate-600 hover:bg-red-50 border border-slate-200 hover:border-red-300 rounded-lg"
          }`}
        >
          <AlertCircle className="w-5 h-5" />
          With Debit
          <span
            className={`px-2 py-0.5 text-xs font-semibold ${
              activeTab === "credit" ? "bg-white/20" : "bg-red-100 text-red-700"
            }`}
          >
            {stats.clientsWithCredit}
          </span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="rounded-xl bg-white border border-slate-200 p-6 ">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by name, phone, code..."
              value={searchTerm}
              onChange={(e: any) => setSearchTerm(e.target.value.toLowerCase())}
              className="rounded-lg w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 text-sm font-medium focus:outline-none text-slate-600
               focus:border-blue-500 focus:bg-white   transition-all duration-300 placeholder:text-slate-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchClients()}
              className="rounded-lg flex items-center gap-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 transition-all font-medium text-slate-700"
            >
              <RefreshCw
                className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={handleExportClientsPDF}
              className="rounded-lg flex items-center gap-2 px-5 py-3 transition-all font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
            >
              <Download className="w-5 h-5" />
              <span className="hidden sm:inline">Export PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Clients Table */}
      <div className="rounded-xl bg-white border border-slate-200  overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <span className="ml-3 text-slate-600 font-medium">
              Loading clients...
            </span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto max-w-full">
              <table className="w-full">
                <thead className="bg-[#E9EEF6]">
                  <tr>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                      Client ID
                    </th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                      Client Details
                    </th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                      Client Type
                    </th>
                    <th className="px-3 py-3.5 text-right text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                      Money in
                    </th>
                    <th className="px-3 py-3.5 text-right text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                      Money out
                    </th>
                    <th className="px-3 py-3.5 text-right text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                      Balance
                    </th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {clients.map((client, index) => (
                    <motion.tr
                      key={client.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="hover:bg-blue-50/50 transition-all duration-200 cursor-pointer group"
                    >
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <span className="text-sm font-semibold text-blue-600 group-hover:text-blue-700">
                          {client.code}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <div className="font-semibold text-slate-900 text-sm whitespace-nowrap">
                            {client.fullName}
                          </div>
                          <div className="flex flex-col gap-0.5 mt-1">
                            <span className="flex items-center gap-1.5 text-xs text-slate-600">
                              <Phone className="w-3 h-3" />
                              {client.whatsAppNumber}
                            </span>
                            {client.email && (
                              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                                <Mail className="w-3 h-3" />
                                {client.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        {client.clientType === ClientType.Permanent ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border bg-blue-100 text-blue-700 border-blue-200">
                            <UserCheck className="w-4 h-4" />
                            Permanent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border bg-amber-100 text-amber-700 border-amber-200">
                            <Clock className="w-4 h-4" />
                            Temporary
                          </span>
                        )}
                      </td>

                      {(() => {
                        const lines = clientCurrencyLines(client);
                        const cell = (
                          pick: (l: ClientCurrencyLine) => number,
                          color: (v: number) => string,
                          sign = false,
                        ) => (
                          <td className="px-3 py-3.5 whitespace-nowrap text-right tabular-nums">
                            {lines.length === 0 ? (
                              <span className="text-sm text-slate-500">-</span>
                            ) : (
                              <div className="space-y-0.5">
                                {lines.map((l) => {
                                  const v = pick(l);
                                  return (
                                    <div key={l.currency} className={`text-sm font-semibold ${color(v)}`}>
                                      <span className="mr-1 text-xs font-medium text-slate-500">{l.code}</span>
                                      {sign && v < 0 ? "−" : ""}
                                      {fmtAmount(Math.abs(v), l.currency)}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                        return (
                          <>
                            {cell((l) => l.moneyIn, (v) => (v ? "text-emerald-700" : "text-slate-400"))}
                            {cell((l) => l.moneyOut, (v) => (v ? "text-red-700" : "text-slate-400"))}
                            {cell(
                              (l) => l.balance,
                              (v) => (v > 0 ? "text-emerald-700" : v < 0 ? "text-red-700" : "text-slate-500"),
                              true,
                            )}
                          </>
                        );
                      })()}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleViewClient(client)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-all text-xs font-medium rounded-lg"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Statement
                          </button>
                          <button
                            onClick={() => handleEditClient(client)}
                            className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all text-xs font-medium rounded-lg"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {clients.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  No clients found
                </h3>
                <p className="text-slate-600">
                  Try adjusting your search or filter criteria
                </p>
              </div>
            )}

            {/* Pagination */}
            {(totalCount > pageSize || totalPages > 1) && (
              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-sm text-slate-600">
                    Showing{" "}
                    <span className="font-semibold text-slate-900">
                      {(currentPage - 1) * pageSize + 1}
                    </span>{" "}
                    to{" "}
                    <span className="font-semibold text-slate-900">
                      {Math.min(currentPage * pageSize, totalCount)}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-slate-900">
                      {totalCount}
                    </span>{" "}
                    clients
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="rounded-lg px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50
                       disabled:cursor-not-allowed transition-all text-sm font-medium text-slate-700"
                    >
                      Previous
                    </button>

                    <div className="flex items-center gap-1">
                      {[...Array(calculatedTotalPages)].map((_, i) => {
                        const pageNumber = i + 1;
                        if (
                          pageNumber === 1 ||
                          pageNumber === totalPages ||
                          (pageNumber >= currentPage - 1 &&
                            pageNumber <= currentPage + 1)
                        ) {
                          return (
                            <button
                              key={pageNumber}
                              onClick={() => setCurrentPage(pageNumber)}
                              className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                                currentPage === pageNumber
                                  ? "bg-blue-600 text-white"
                                  : "bg-white border border-slate-300 hover:bg-slate-50 text-slate-500 rounded-lg"
                              }`}
                            >
                              {pageNumber}
                            </button>
                          );
                        } else if (
                          pageNumber === currentPage - 2 ||
                          pageNumber === currentPage + 2
                        ) {
                          return (
                            <span
                              key={pageNumber}
                              className="px-2 text-slate-500"
                            >
                              ...
                            </span>
                          );
                        }
                        return null;
                      })}
                    </div>

                    <button
                      onClick={() =>
                        setCurrentPage((p) =>
                          Math.min(calculatedTotalPages, p + 1),
                        )
                      }
                      disabled={currentPage >= calculatedTotalPages}
                      className="px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50
 disabled:cursor-not-allowed transition-all text-sm font-medium text-slate-700 rounded-lg"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ============================================== */}
      {/* CLIENT STATEMENT MODAL  */}
      {/* ============================================== */}
      <AnimatePresence>
        {showStatement && selectedClient && (
          <StatementModal
            kind="client"
            accountId={selectedClient.id}
            title={selectedClient.fullName}
            subtitle={[selectedClient.code, selectedClient.whatsAppNumber].filter(Boolean).join(" · ")}
            currency={homeCurrency}
            currencies={Array.from(
              new Set<number>([
                homeCurrency,
                ...activeCurrencies.filter((c) => currencyOk(c)),
                ...((selectedClient.balanceKES ?? 0) !== 0 ? [0] : []),
                ...((selectedClient.balanceUSD ?? 0) !== 0 ? [1] : []),
                ...((selectedClient as any).otherBalances || [])
                  .filter((b: any) => (b.balance ?? 0) !== 0 || currencyOk(b.currency))
                  .map((b: any) => b.currency as number),
              ]),
            )}
            whatsApp={selectedClient.whatsAppNumber || undefined}
                        onView={(raw) => handleViewTransaction(mapTransactionToDisplay(raw))}
            onEdit={(raw) => handleEditTransaction(mapTransactionToDisplay(raw))}
            onDelete={(raw) => handleDeleteTransaction(mapTransactionToDisplay(raw))}
            onRelated={(raw) => {
              setSelectedTransaction(mapTransactionToDisplay(raw));
              setShowRelatedAccount(true);
            }}
            onClose={() => {
              setShowStatement(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* ============================================== */}
      {/* Transaction pop-ups — shared with the other ledger screens (TransactionDialogs.tsx) */}
      {showTransactionDetail && selectedTransaction && (
        <TransactionDetailsDialog
          txn={selectedTransaction}
          kind="client"
          accountName={selectedClient?.fullName}
          onClose={() => {
            setShowTransactionDetail(false);
            setSelectedTransaction(null);
          }}
          onRelated={() => {
            setShowTransactionDetail(false);
            setShowRelatedAccount(true);
          }}
        />
      )}

      {/* ============================================== */}
      {showEditTransaction && selectedTransaction && (
        <EditTransactionDialog
          txn={selectedTransaction}
          onClose={() => {
            setShowEditTransaction(false);
            setSelectedTransaction(null);
          }}
          onSaved={async () => {
            refreshOpenStatement();
          }}
        />
      )}

      {/* ============================================== */}
      {showDeleteTransaction && selectedTransaction && (
        <ReverseTransactionDialog
          txn={selectedTransaction}
          kind="client"
          busy={isSubmitting}
          onClose={() => setShowDeleteTransaction(false)}
          onConfirm={(reason) => confirmDeleteTransaction(reason)}
        />
      )}

      {/* ============================================== */}
      {showRelatedAccount && selectedTransaction?.relatedAccount && (
        <RelatedAccountDialog
          txn={selectedTransaction}
          kind="client"
          onClose={() => setShowRelatedAccount(false)}
          onBack={() => {
            setShowRelatedAccount(false);
            setShowTransactionDetail(true);
          }}
        />
      )}

      {/* ============================================== */}
      {/* ADD CLIENT MODAL */}
      {/* ============================================== */}
      <AnimatePresence>
        {showAddClient && (
          <div className="fixed inset-0 bg-black/80  flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 20 }}
              className="rounded-xl bg-white shadow-2xl max-w-2xl w-full overflow-hidden border border-blue-600"
            >
              {/* Header */}
              <div className="relative  bg-blue-600   p-4">
                <div className="absolute inset-0 opacity-10 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.15)_25%,rgba(255,255,255,.15)_50%,transparent_50%,transparent_75%,rgba(255,255,255,.15)_75%,rgba(255,255,255,.15))] bg-[length:20px_20px]"></div>
                <button aria-label="Close"
                  onClick={() => {
                    setShowAddClient(false);
                    resetForm();
                  }}
                  className="rounded-lg absolute top-3 right-3 p-1.5 bg-white/10 hover:bg-white/20 transition-all duration-200 border border-white/20 hover:border-white/40 group"
                >
                  <X className="w-4 h-4 text-white  transition-transform duration-300" />
                </button>
                <div className="relative flex items-center gap-3">
                  <div className="w-11 h-11 bg-white/15 flex items-center justify-center border border-white/30 rounded-lg ">
                    <UserPlus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-white tracking-tight">
                      Add New Client
                    </h2>
                    <p className="text-blue-50 text-xs font-medium">
                      Complete client registration
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Content */}
              <form
                onSubmit={handleCreateClient}
                className="p-4 max-h-[calc(100vh-180px)] overflow-y-auto  bg-slate-50 "
              >
                <div className="space-y-4">
                  {/* Personal Information */}
                  <div>
                    <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-blue-500">
                      <div className="w-6 h-6  bg-blue-600  flex items-center justify-center shadow-sm">
                        <User className="w-3.5 h-3.5 text-white" />
                      </div>
                      <h3 className="text-xs font-semibold text-slate-900  ">
                        Personal Information
                      </h3>
                    </div>
                    <div className="rounded-xl grid grid-cols-2 gap-3 bg-white p-3.5 border border-slate-200 shadow-sm">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                          <User className="w-3 h-3 text-blue-600" />
                          Full Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.fullName}
                          onChange={(e: any) =>
                            setFormData({
                              ...formData,
                              fullName: e.target.value,
                            })
                          }
                          className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                          placeholder={samples.name}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                          <Phone className="w-3 h-3 text-blue-600" />
                          WhatsApp Number *
                        </label>
                        <input
                          type="tel"
                          required
                          value={formData.whatsAppNumber}
                          onChange={(e: any) =>
                            setFormData({
                              ...formData,
                              whatsAppNumber: e.target.value,
                            })
                          }
                          className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                          placeholder={samples.phoneCompact}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                          <Mail className="w-3 h-3 text-blue-600" />
                          Email
                        </label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e: any) =>
                            setFormData({ ...formData, email: e.target.value })
                          }
                          className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                          placeholder="john@example.com"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                          <Hash className="w-3 h-3 text-blue-600" />
                          ID / Passport
                        </label>
                        <input
                          type="text"
                          value={formData.idPassport}
                          onChange={(e: any) =>
                            setFormData({
                              ...formData,
                              idPassport: e.target.value,
                            })
                          }
                          className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                          placeholder="12345678"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Account Type */}
                  <div>
                    <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-amber-500">
                      <div className="w-6 h-6  bg-amber-600  flex items-center justify-center shadow-sm">
                        <UserCheck className="w-3.5 h-3.5 text-white" />
                      </div>
                      <h3 className="text-xs font-semibold text-slate-900  ">
                        Account Type
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="group cursor-pointer">
                        <input
                          type="radio"
                          name="clientType"
                          checked={formData.clientType === ClientType.Permanent}
                          onChange={() =>
                            setFormData({
                              ...formData,
                              clientType: ClientType.Permanent,
                            })
                          }
                          className="peer sr-only"
                        />
                        <div className="p-3 bg-blue-50 border border-blue-200 peer-checked:border-blue-600 peer-checked:shadow-md transition-all hover:border-blue-400 relative overflow-hidden duration-200 rounded-lg">
                          <div className="relative flex items-center gap-2 mb-1.5">
                            <div className="w-7 h-7 bg-blue-600 flex items-center justify-center shadow-sm">
                              <UserCheck className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <span className="font-semibold text-xs text-slate-900 block leading-tight">
                                PERMANENT
                              </span>
                              <span className="text-xs text-blue-600 font-semibold">
                                Standard
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 font-medium leading-snug">
                            No expiry • Full access
                          </p>
                        </div>
                      </label>

                      <label className="group cursor-pointer">
                        <input
                          type="radio"
                          name="clientType"
                          checked={formData.clientType === ClientType.Temporary}
                          onChange={() =>
                            setFormData({
                              ...formData,
                              clientType: ClientType.Temporary,
                            })
                          }
                          className="peer sr-only"
                        />
                        <div className="p-3 bg-amber-50 border border-amber-200 peer-checked:border-amber-600 peer-checked:shadow-md transition-all hover:border-amber-400 relative overflow-hidden duration-200 rounded-lg">
                          <div className="relative flex items-center gap-2 mb-1.5">
                            <div className="w-7 h-7 bg-amber-600 flex items-center justify-center shadow-sm">
                              <Clock className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <span className="font-semibold text-xs text-slate-900 block leading-tight">
                                TEMPORARY
                              </span>
                              <span className="text-xs text-amber-700 font-semibold">
                                Walk-In
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 font-medium leading-snug">
                            Limited • Restricted
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Password (for Permanent clients) */}
                  {formData.clientType === ClientType.Permanent && (
                    <div>
                      <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-blue-500">
                        <div className="w-6 h-6 bg-blue-600 flex items-center justify-center shadow-sm">
                          <Key className="w-3.5 h-3.5 text-white" />
                        </div>
                        <h3 className="text-xs font-semibold text-slate-900  ">
                          Login Credentials
                        </h3>
                      </div>
                      <div className="rounded-xl bg-white p-3.5 border border-slate-200 shadow-sm">
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5   flex items-center gap-1">
                          <Key className="w-3 h-3 text-blue-600" />
                          Password
                        </label>
                        <input
                          type="password"
                          value={formData.password}
                          onChange={(e: any) =>
                            setFormData({
                              ...formData,
                              password: e.target.value,
                            })
                          }
                          className="rounded-lg w-full px-3 py-2 bg-slate-50 border border-slate-300 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 focus:bg-white transition-all font-medium text-slate-900 text-sm placeholder:text-slate-500"
                          placeholder="Enter password for client login"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Optional: Set a password for client portal access
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Opening Balance */}
                  <div>
                    <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-emerald-500">
                      <div className="w-6 h-6  bg-emerald-600  flex items-center justify-center shadow-sm">
                        <DollarSign className="w-3.5 h-3.5 text-white" />
                      </div>
                      <h3 className="text-xs font-semibold text-slate-900  ">
                        Opening Balance
                      </h3>
                    </div>
                    {(() => {
                      // The bureau's own currency first (UGX for a Ugandan bureau), then
                      // KES if this bureau uses it, then USD.
                      const homeIsOther = homeCurrency !== Currency.KES && homeCurrency !== Currency.USD;
                      const fields: { key: "openingBalanceHome" | "openingBalanceKES" | "openingBalanceUSD"; code: string }[] = [
                        ...(homeIsOther ? [{ key: "openingBalanceHome" as const, code: currencyCode(homeCurrency) }] : []),
                        ...(currencyOk(Currency.KES) ? [{ key: "openingBalanceKES" as const, code: "KES" }] : []),
                        { key: "openingBalanceUSD" as const, code: "USD" },
                      ];
                      return (
                        <div className={`rounded-xl grid gap-3 bg-white p-3.5 border border-slate-200 shadow-sm ${fields.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                          {fields.map((f) => (
                            <div key={f.key}>
                              <label htmlFor={`ob-${f.key}`} className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                                <Wallet className="w-3 h-3 text-emerald-600" />
                                {f.code}
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-700 font-semibold text-xs">
                                  {f.code}
                                </span>
                                <input
                                  id={`ob-${f.key}`}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={formData[f.key] ?? 0}
                                  onChange={(e: any) =>
                                    setFormData({ ...formData, [f.key]: parseFloat(e.target.value) || 0 })
                                  }
                                  className="rounded-lg w-full pl-12 pr-3 py-2 bg-emerald-50 border border-emerald-300 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20 focus:bg-white transition-all font-semibold text-slate-900 text-sm placeholder:text-slate-500/60"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </form>

              {/* Footer */}
              <div className="border-t border-slate-200 p-4  bg-slate-50 ">
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddClient(false);
                      resetForm();
                    }}
                    className="rounded-lg flex-1 px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 text-sm  shadow-sm "
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    onClick={handleCreateClient}
                    disabled={isSubmitting}
                    className="rounded-lg flex-1 px-5 py-2.5  bg-blue-600 hover:bg-blue-700   text-white font-semibold     transition-all flex items-center justify-center gap-2 text-sm  border border-blue-700/50   disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    {isSubmitting ? "Creating..." : "Create Client"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ============================================== */}
      {/* EDIT CLIENT MODAL */}
      {/* ============================================== */}
      <AnimatePresence>
        {showEditModal && selectedClient && (
          <div className="fixed inset-0 bg-black/60  flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white shadow-2xl max-w-xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="relative  bg-blue-600   px-6 py-4">
                <div className="relative flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-white/20  rounded-xl flex items-center justify-center border border-white/30 ">
                      <Edit3 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-0.5">
                        Edit Client
                      </h2>
                      <p className="text-blue-50 text-xs font-medium">
                        Update client information
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-800 border border-white/30 rounded-lg text-xs font-semibold text-white">
                          <Hash className="w-3 h-3" />
                          {selectedClient.code}
                        </span>
                        {selectedClient.clientType === ClientType.Permanent ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-700 border border-emerald-400/40 rounded-lg text-xs font-semibold text-white">
                            <UserCheck className="w-3 h-3" />
                            Permanent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-700 border border-amber-400/40 rounded-lg text-xs font-semibold text-white">
                            <Clock className="w-3 h-3" />
                            Temporary
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowEditModal(false)}
                    className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all "
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              {/* Account Balance Preview — the bureau's home currency first (UGX in Uganda),
                  then every other currency this client holds. It used to show KES and USD only,
                  so a Ugandan client's real balance never appeared here. */}
              <div className="px-6 py-3  bg-slate-50  border-b border-slate-200">
                {(() => {
                  const lines = clientCurrencyLines(selectedClient);
                  if (!lines.some((l) => l.currency === homeCurrency))
                    lines.unshift({ currency: homeCurrency, code: currencyCode(homeCurrency), moneyIn: 0, moneyOut: 0, balance: 0 });
                  lines.sort((a, b) => (a.currency === homeCurrency ? -1 : b.currency === homeCurrency ? 1 : a.currency - b.currency));
                  return (
                    <div className={`grid gap-3 ${lines.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                      {lines.map((l) => (
                        <div key={l.currency} className={`rounded-xl bg-white p-3 border shadow-sm ${l.currency === homeCurrency ? "border-blue-200" : "border-slate-200"}`}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Wallet className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-xs font-semibold text-slate-600">
                              {l.code}{l.currency === homeCurrency ? " · home" : ""}
                            </span>
                          </div>
                          <p className={`text-lg font-semibold tabular-nums ${l.balance >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                            {l.code} {l.balance.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Form Content */}
              <form
                onSubmit={handleUpdateClient}
                className="px-6 py-5 overflow-y-auto flex-1"
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-500" />
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={editFormData.fullName}
                        onChange={(e: any) =>
                          setEditFormData({
                            ...editFormData,
                            fullName: e.target.value,
                          })
                        }
                        className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <Phone className="w-4 h-4 text-slate-500" />
                        WhatsApp Number
                      </label>
                      <input
                        type="tel"
                        value={editFormData.whatsAppNumber}
                        onChange={(e: any) =>
                          setEditFormData({
                            ...editFormData,
                            whatsAppNumber: e.target.value,
                          })
                        }
                        className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                        placeholder={samples.phoneCompact}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-500" />
                        Email
                      </label>
                      <input
                        type="email"
                        value={editFormData.email}
                        onChange={(e: any) =>
                          setEditFormData({
                            ...editFormData,
                            email: e.target.value,
                          })
                        }
                        className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <Hash className="w-4 h-4 text-slate-500" />
                        ID / Passport
                      </label>
                      <input
                        type="text"
                        value={editFormData.idPassport}
                        onChange={(e: any) =>
                          setEditFormData({
                            ...editFormData,
                            idPassport: e.target.value,
                          })
                        }
                        className="rounded-lg w-full px-4 py-3.5 bg-white border border-slate-200 text-slate-900 font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                      />
                    </div>
                  </div>

                  {/* Phone login (one login, several bureaus): the office can cut the link, e.g. a lost phone */}
                  {selectedClient.phoneLoginLinked && (
                    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">Phone login: linked</h4>
                        <p className="mt-0.5 text-xs text-slate-600">
                          This client can open this account with a code sent to {selectedClient.whatsAppNumber}.
                          Unlink if the phone is lost or changed hands. Balances and history stay.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(`Unlink phone login for ${selectedClient.fullName}? They can still sign in with code and password.`)) return;
                          const r = await unlinkClientPhoneLogin(selectedClient.id);
                          if (!r.success) {
                            toast.error(r.message || "Couldn't unlink");
                            return;
                          }
                          toast.success("Phone login unlinked");
                          setSelectedClient({ ...selectedClient, phoneLoginLinked: false });
                          fetchClients();
                        }}
                        className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Unlink
                      </button>
                    </div>
                  )}

                  {/* Convert to Permanent (for Temporary clients) */}
                  {selectedClient.clientType === ClientType.Temporary && (
                    <div className=" bg-blue-50 border border-blue-200 p-4 rounded-xl">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10  bg-blue-500  flex items-center justify-center flex-shrink-0  ">
                          <RefreshCw className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-slate-900 mb-1">
                            Convert to Permanent Client
                          </h4>
                          <p className="text-xs text-slate-600 mb-3">
                            This client is currently{" "}
                            <span className="font-semibold text-amber-700">
                              temporary
                            </span>
                            . Convert to permanent status for full access.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setShowEditModal(false);
                              setShowConvertModal(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-all"
                          >
                            <UserCheck className="w-4 h-4" />
                            Convert to Permanent
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </form>

              {/* Footer */}
              <div className="px-6 py-4  bg-slate-50  border-t border-slate-200 flex gap-3">
                <button aria-label="Delete"
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setShowDeleteConfirm(true);
                  }}
                  className="rounded-lg px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold transition-all flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="rounded-lg flex-1 px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 shadow-sm "
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  onClick={handleUpdateClient}
                  disabled={isSubmitting}
                  className="rounded-lg flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ============================================== */}
      {/* DELETE CLIENT CONFIRMATION MODAL */}
      {/* ============================================== */}
      <AnimatePresence>
        {showDeleteConfirm && selectedClient && (
          <div className="fixed inset-0 bg-black/70  flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="rounded-xl bg-white shadow-2xl max-w-md w-full overflow-hidden border border-red-200"
            >
              {/* Header */}
              <div className="relative  bg-red-600   px-6 py-5 overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 80%, white 1px, transparent 1px)`,
                      backgroundSize: "30px 30px",
                    }}
                  ></div>
                </div>
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl hidden"></div>
                <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/10 rounded-full blur-xl hidden"></div>

                <div className="relative z-10 flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <div className="w-14 h-14 bg-white/20 flex items-center justify-center border border-white/30 rounded-lg ">
                        <Trash2 className="w-7 h-7 text-white" />
                      </div>
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center border border-white">
                        <span className="text-xs font-semibold text-amber-900">
                          !
                        </span>
                      </div>
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-white mb-1 tracking-tight">
                        Delete Client
                      </h2>
                      <p className="text-white text-xs font-medium">
                        This action is permanent and cannot be undone
                      </p>
                      <div className="flex items-center gap-2 mt-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-800 border border-white/30 text-xs font-semibold text-white rounded-lg">
                          <Hash className="w-3 h-3" />
                          {selectedClient.code}
                        </span>
                        {selectedClient.clientType === ClientType.Permanent ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-700 border border-emerald-400/40 text-xs font-semibold text-white rounded-lg">
                            <UserCheck className="w-3 h-3" />
                            Permanent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-700 border border-amber-400/40 text-xs font-semibold text-white rounded-lg">
                            <Clock className="w-3 h-3" />
                            Temporary
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button aria-label="Close"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="rounded-lg p-2 bg-white/10 hover:bg-white/20 transition-all  border border-white/20 hover:border-white/40"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              {/* Client Info Card */}
              <div className="px-6 py-4  bg-slate-50  border-b border-slate-200">
                <div className="rounded-xl flex items-center gap-4 p-4 bg-white border border-slate-200 shadow-sm">
                  <div className="w-12 h-12 bg-red-600 flex items-center justify-center text-white font-semibold text-lg  ">
                    {selectedClient.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 text-base">
                      {selectedClient.fullName}
                    </h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Phone className="w-3 h-3" />
                        {selectedClient.whatsAppNumber}
                      </span>
                      {selectedClient.email && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Mail className="w-3 h-3" />
                          {selectedClient.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Account Balances */}
              <div className="px-6 py-4 bg-white border-b border-slate-200">
                <p className="text-xs font-semibold text-slate-500 mb-3">
                  Account Balances to be Deleted
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { currency: 0, balance: selectedClient.balanceKES ?? 0 },
                    { currency: 1, balance: selectedClient.balanceUSD ?? 0 },
                    ...(selectedClient.otherBalances || []).map((b: any) => ({
                      currency: b.currency,
                      balance: b.balance ?? 0,
                    })),
                  ]
                    .filter((b, i) => i < 2 || b.balance !== 0)
                    .map((b) => (
                      <div key={b.currency} className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                        <p className="text-xs font-semibold text-slate-600 mb-1.5">
                          {currencyCode(b.currency)} balance
                        </p>
                        <p
                          className={`text-lg font-semibold tabular-nums ${
                            b.balance >= 0 ? "text-emerald-700" : "text-red-600"
                          }`}
                        >
                          {formatMoney(b.balance, b.currency)}
                        </p>
                      </div>
                    ))}
                </div>
              </div>

              {/* Warning Section */}
              <div className="px-6 py-4 bg-white">
                <div className="relative overflow-hidden bg-red-50 border border-red-200 p-4 rounded-xl">
                  <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-red-100 rounded-full opacity-50"></div>

                  <div className="relative z-10 flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 bg-red-100 flex items-center justify-center border border-red-200 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-red-800 mb-1">
                        Warning: Permanent Deletion
                      </h4>
                      <p className="text-xs text-red-700 leading-relaxed">
                        You are about to permanently delete{" "}
                        <span className="font-semibold text-red-900">
                          {selectedClient.fullName}
                        </span>
                        . This will remove:
                      </p>
                      <ul className="mt-2 space-y-1">
                        <li className="flex items-center gap-2 text-xs text-red-700">
                          <X className="w-3 h-3 text-red-500" />
                          All account information
                        </li>
                        <li className="flex items-center gap-2 text-xs text-red-700">
                          <X className="w-3 h-3 text-red-500" />
                          Transaction history
                        </li>
                        <li className="flex items-center gap-2 text-xs text-red-700">
                          <X className="w-3 h-3 text-red-500" />
                          Balance records
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4  bg-slate-50  border-t border-slate-200 flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-lg flex-1 px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold text-slate-700 shadow-sm "
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteClient}
                  disabled={isSubmitting}
                  className="rounded-lg flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete Permanently
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ============================================== */}
      {/* CONVERT TO PERMANENT MODAL */}
      {/* ============================================== */}
      <AnimatePresence>
        {showConvertModal && selectedClient && (
          <div className="fixed inset-0 bg-black/60  flex items-center justify-center p-4 z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
                  <UserCheck className="w-7 h-7 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">
                    Convert to Permanent
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Set a password for client login
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={convertPassword}
                  onChange={(e: any) => setConvertPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                  placeholder="Enter password for client"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConvertModal(false);
                    setConvertPassword("");
                  }}
                  className="flex-1 px-6 py-3 border border-slate-300 rounded-xl hover:bg-slate-50 transition-all font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConvertToPermanent}
                  disabled={isSubmitting || !convertPassword}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                  {isSubmitting ? "Converting..." : "Convert"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <SuccessShareModal
        isOpen={shareModal.show}
        onClose={() => setShareModal((s) => ({ ...s, show: false }))}
        title={shareModal.title}
        details={shareModal.details}
        whatsappPhone={shareModal.phone}
        whatsappMessage={shareModal.message}
      />
    </motion.div>
  );
}
