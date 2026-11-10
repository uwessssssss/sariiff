"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Plus,
  Search,
  Filter,
  Eye,
  Download,
  Edit3,
  Trash2,
  X,
  Calendar,
  DollarSign,
  User,
  Building,
  Mail,
  Phone,
  Hash,
  CheckCircle,
  Clock,
  AlertCircle,
  Image as ImageIcon,
  Upload,
  Save,
  Copy,
  Send,
  Printer,
  LayoutTemplate,
  Sparkles,
  XCircle,
  ArrowRight,
  Zap,
  TrendingUp,
  FileCheck,
  AlertOctagon,
  ShoppingCart,
  CreditCard,
  Receipt,
  Star,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  getInvoices,
  createInvoice as apiCreateInvoice,
  deleteInvoice as apiDeleteInvoice,
  updateInvoiceStatus,
  downloadInvoicePdf,
  getClients,
  InvoiceResponseDto,
  InvoiceStatus,
  CreateInvoiceDto,
  Currency,
  ClientDto,
  allPages,
} from "@/lib/api";
import { useBaseCurrency, useAllowedCurrencies, useCountrySamples } from "@/lib/useBaseCurrency";
import { ui } from "./theme";
import { localDate } from "@/lib/dates";
import { EMPTY_BRANDING, loadCompanyBranding, saveCompanyBranding, shrinkImage } from "@/lib/companyBranding";

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  currency: "KES" | "USD" | "UGX" | "EUR";
  notes: string;
  createdAt: string;
}

interface CompanyInfo {
  name: string;
  logo: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
}

// Premium Invoice Templates
const INVOICE_TEMPLATES = [
  {
    id: "modern-blue",
    name: "Modern Blue",
    color: "#2563eb",
    description: "Clean and professional",
    gradient: "bg-blue-600",
    accent: "#3b82f6",
  },
  {
    id: "elegant-purple",
    name: "Elegant Purple",
    color: "#7c3aed",
    description: "Sophisticated design",
    gradient: "bg-purple-600",
    accent: "#8b5cf6",
  },
  {
    id: "classic-black",
    name: "Classic Black",
    color: "#1f2937",
    description: "Timeless minimalist",
    gradient: "bg-gray-800",
    accent: "#374151",
  },
  {
    id: "fresh-green",
    name: "Fresh Green",
    color: "#059669",
    description: "Modern eco-friendly",
    gradient: "bg-emerald-600",
    accent: "#10b981",
  },
  {
    id: "bold-red",
    name: "Bold Red",
    color: "#dc2626",
    description: "Eye-catching statement",
    gradient: "bg-red-600",
    accent: "#ef4444",
  },
  {
    id: "corporate-navy",
    name: "Corporate Navy",
    color: "#1e40af",
    description: "Professional corporate",
    gradient: "bg-blue-800",
    accent: "#3730a3",
  },
  {
    id: "creative-orange",
    name: "Creative Orange",
    color: "#ea580c",
    description: "Energetic creative",
    gradient: "bg-orange-600",
    accent: "#f97316",
  },
  {
    id: "minimal-gray",
    name: "Minimal Gray",
    color: "#6b7280",
    description: "Subtle professional",
    gradient: "bg-slate-600",
    accent: "#64748b",
  },
  {
    id: "premium-gold",
    name: "Premium Gold",
    color: "#d97706",
    description: "Luxury premium",
    gradient: "bg-amber-600",
    accent: "#f59e0b",
  },
  {
    id: "tech-cyan",
    name: "Tech Cyan",
    color: "#0891b2",
    description: "Modern technology",
    gradient: "bg-cyan-600",
    accent: "#06b6d4",
  },
  {
    id: "royal-indigo",
    name: "Royal Indigo",
    color: "#4f46e5",
    description: "Distinguished elegant",
    gradient: "bg-indigo-600",
    accent: "#6366f1",
  },
  {
    id: "vibrant-pink",
    name: "Vibrant Pink",
    color: "#db2777",
    description: "Bold contemporary",
    gradient: "bg-pink-600",
    accent: "#ec4899",
  },
];

export default function InvoiceManagement() {
  // Kenyan bureaus don't use UGX; Ugandan ones use KES too (lib/useBaseCurrency).
  const { has: currencyOk } = useAllowedCurrencies();
  // New accounts / invoices start in the home currency (KES in Kenya, UGX in Uganda)
  const { baseCode } = useBaseCurrency();
  const samples = useCountrySamples();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showCompanySettings, setShowCompanySettings] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState("modern-blue");
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Map backend InvoiceStatus number to frontend string
  const mapStatus = (status: number, dueDate: string): Invoice["status"] => {
    switch (status) {
      case InvoiceStatus.Draft:
        return "draft";
      case InvoiceStatus.Sent: {
        // Check if overdue
        if (new Date(dueDate) < new Date()) return "overdue";
        return "sent";
      }
      case InvoiceStatus.Paid:
        return "paid";
      case InvoiceStatus.Cancelled:
        return "cancelled";
      default:
        return "draft";
    }
  };

  // Map backend response to local Invoice interface
  const mapInvoice = (inv: InvoiceResponseDto): Invoice => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    date: inv.invoiceDate,
    dueDate: inv.dueDate,
    clientName: inv.clientName,
    clientEmail: inv.clientEmail || "",
    clientPhone: inv.clientPhone || "",
    clientAddress: inv.clientAddress || "",
    items: inv.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
    })),
    subtotal: inv.subtotal,
    tax: inv.taxAmount,
    discount: inv.discountAmount,
    total: inv.total,
    status: mapStatus(inv.status, inv.dueDate),
    currency: inv.currency === Currency.KES ? "KES" : inv.currency === Currency.UGX ? "UGX" : inv.currency === Currency.EUR ? "EUR" : "USD",
    notes: inv.notes || "",
    createdAt: inv.invoiceDate,
  });

  // Fetch invoices from backend
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const result = await allPages((p, n) => getInvoices(p, n));
      if (result.success && result.data) {
        const items = result.data.items || [];
        setInvoices(items.map(mapInvoice));
      }
    } catch (error) {
      console.error("Error fetching invoices:", error);
      toast.error("Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  // The bureau's real details (loaded from the server; editable ones saved back).
  // These used to start as a made-up "SARIF FINTECH / KRA-P051234567X" for every bureau.
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_BRANDING);
  const [savingCompany, setSavingCompany] = useState(false);
  useEffect(() => {
    loadCompanyBranding().then(setCompanyInfo).catch(() => {});
  }, []);

  const [formData, setFormData] = useState({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    clientAddress: "",
    date: localDate(),
    dueDate: localDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    currency: "KES" as "KES" | "USD" | "UGX" | "EUR",
    items: [
      { id: "1", description: "", quantity: 1, unitPrice: 0, amount: 0 },
    ] as InvoiceItem[],
    tax: 0,
    discount: 0,
    notes: "Thank you for your business! Payment is due within 30 days.",
  });
  // The home currency arrives after first render — apply it to an untouched form.
  useEffect(() => {
    setFormData((f: any) => (f.clientName || f.items?.some((it: any) => it.description) ? f : { ...f, currency: baseCode as any }));
  }, [baseCode]);

  // Load invoices from backend
  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Calculate totals
  const calculateTotals = () => {
    const subtotal = formData.items.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = (subtotal * formData.tax) / 100;
    const total = subtotal + taxAmount - formData.discount;
    return { subtotal, taxAmount, total };
  };

  // Add invoice item
  const addInvoiceItem = () => {
    const newItem: InvoiceItem = {
      id: Date.now().toString(),
      description: "",
      quantity: 1,
      unitPrice: 0,
      amount: 0,
    };
    setFormData({ ...formData, items: [...formData.items, newItem] });
  };

  // Update invoice item
  const updateInvoiceItem = (
    id: string,
    field: keyof InvoiceItem,
    value: any,
  ) => {
    const updatedItems = formData.items.map((item) => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === "quantity" || field === "unitPrice") {
          updated.amount = updated.quantity * updated.unitPrice;
        }
        return updated;
      }
      return item;
    });
    setFormData({ ...formData, items: updatedItems });
  };

  // Remove invoice item
  const removeInvoiceItem = (id: string) => {
    if (formData.items.length > 1) {
      setFormData({
        ...formData,
        items: formData.items.filter((item) => item.id !== id),
      });
    }
  };

  // Create invoice via backend
  const handleCreateInvoice = async () => {
    if (!formData.clientName || !formData.clientEmail) {
      toast.error("Please fill in client name and email");
      return;
    }

    if (
      formData.items.some((item) => !item.description || item.quantity <= 0)
    ) {
      toast.error("Please complete all invoice items");
      return;
    }

    setSubmitting(true);
    try {
      const dto: CreateInvoiceDto = {
        clientName: formData.clientName,
        clientEmail: formData.clientEmail,
        clientPhone: formData.clientPhone,
        clientAddress: formData.clientAddress,
        dueDate: formData.dueDate,
        currency:
          formData.currency === "KES"
            ? Currency.KES
            : formData.currency === "UGX"
              ? Currency.UGX
              : formData.currency === "EUR"
                ? Currency.EUR
                : Currency.USD,
        items: formData.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        taxRate: formData.tax,
        discountAmount: formData.discount,
        notes: formData.notes,
      };

      const result = await apiCreateInvoice(dto);
      if (result.success) {
        toast.success("Invoice created successfully!", {
          description: `Invoice for ${formData.clientName}`,
        });
        setShowCreateModal(false);
        resetForm();
        await fetchInvoices();
      } else {
        toast.error(result.message || "Failed to create invoice");
      }
    } catch (error) {
      console.error("Error creating invoice:", error);
      toast.error("Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      clientName: "",
      clientEmail: "",
      clientPhone: "",
      clientAddress: "",
      date: localDate(),
      dueDate: localDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
      currency: baseCode as any,
      items: [
        { id: "1", description: "", quantity: 1, unitPrice: 0, amount: 0 },
      ],
      tax: 0,
      discount: 0,
      notes: "Thank you for your business! Payment is due within 30 days.",
    });
  };

  // Handle logo upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const logo = await shrinkImage(file); // saved with the other details on Save
      setCompanyInfo((c) => ({ ...c, logo }));
    } catch (err: any) {
      toast.error(err?.message || "That logo couldn't be used.");
    }
  };

  // Export to PDF
  // templateId: the template just clicked. Reading `selectedTemplate` here gave the
  // PREVIOUS choice — React applies setSelectedTemplate on the next render.
  const exportToPDF = (invoice: Invoice, templateId: string = selectedTemplate) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const template = INVOICE_TEMPLATES.find((t) => t.id === templateId);
      const primaryColor = template?.color || "#2563eb";

      // Convert hex to RGB
      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
          ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
            }
          : { r: 37, g: 99, b: 235 };
      };

      const rgb = hexToRgb(primaryColor);

      // Premium Header Background with gradient effect
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.rect(0, 0, pageWidth, 55, "F");

      // Subtle accent bar
      doc.setFillColor(
        Math.min(rgb.r + 30, 255),
        Math.min(rgb.g + 30, 255),
        Math.min(rgb.b + 30, 255),
      );
      doc.rect(0, 52, pageWidth, 3, "F");

      // Company Logo
      if (companyInfo.logo) {
        try {
          doc.addImage(companyInfo.logo, "PNG", 14, 10, 35, 35);
        } catch (e) {
          // Logo failed to load — skip silently
        }
      }

      // Company Info - Premium Typography
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(26);
      doc.setFont("helvetica", "bold");
      doc.text(companyInfo.name, companyInfo.logo ? 55 : 14, 18);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      // Only details the bureau actually has — never an empty "Tax ID:" or a stray "|".
      const join = (...parts: string[]) => parts.filter((p) => p && p.trim()).join(" | ");
      const headerLines = [
        companyInfo.address,
        join(companyInfo.phone, companyInfo.email),
        join(companyInfo.website, companyInfo.taxId ? `Tax ID: ${companyInfo.taxId}` : ""),
      ].filter((l) => l && l.trim());
      headerLines.forEach((line, i) => doc.text(line, companyInfo.logo ? 55 : 14, 27 + i * 6));

      // INVOICE Title - Right Side
      doc.setFontSize(32);
      doc.setFont("helvetica", "bold");
      doc.text("INVOICE", pageWidth - 14, 22, { align: "right" });

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(invoice.invoiceNumber, pageWidth - 14, 30, { align: "right" });

      // Premium Status Badge
      doc.setFontSize(9);
      const statusColors: any = {
        draft: [156, 163, 175],
        sent: [59, 130, 246],
        paid: [16, 185, 129],
        overdue: [239, 68, 68],
        cancelled: [107, 114, 128],
      };
      const statusColor = statusColors[invoice.status];
      doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.rect(pageWidth - 45, 34, 31, 7, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.text(invoice.status.toUpperCase(), pageWidth - 29.5, 39, {
        align: "center",
      });

      // Bill To & Invoice Details Section
      let yPos = 68;

      // Left Side - Bill To
      doc.setFillColor(248, 250, 252);
      doc.rect(14, yPos, (pageWidth - 28) / 2 - 3, 42, "F");
      doc.setDrawColor(rgb.r, rgb.g, rgb.b);
      doc.setLineWidth(0.5);
      doc.rect(14, yPos, (pageWidth - 28) / 2 - 3, 42, "S");

      doc.setTextColor(rgb.r, rgb.g, rgb.b);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("BILL TO", 18, yPos + 6);

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(invoice.clientName, 18, yPos + 14);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(invoice.clientAddress, 18, yPos + 21);
      doc.text(invoice.clientPhone, 18, yPos + 27);
      doc.text(invoice.clientEmail, 18, yPos + 33);

      // Right Side - Invoice Details
      const rightX = pageWidth / 2 + 3;
      doc.setFillColor(248, 250, 252);
      doc.rect(rightX, yPos, (pageWidth - 28) / 2 - 3, 42, "F");
      doc.setDrawColor(rgb.r, rgb.g, rgb.b);
      doc.rect(rightX, yPos, (pageWidth - 28) / 2 - 3, 42, "S");

      doc.setTextColor(rgb.r, rgb.g, rgb.b);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("INVOICE DETAILS", rightX + 4, yPos + 6);

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");

      doc.text("Invoice Date:", rightX + 4, yPos + 16);
      doc.setFont("helvetica", "normal");
      doc.text(
        new Date(invoice.date).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        pageWidth - 18,
        yPos + 16,
        { align: "right" },
      );

      doc.setFont("helvetica", "bold");
      doc.text("Due Date:", rightX + 4, yPos + 23);
      doc.setFont("helvetica", "normal");
      doc.text(
        new Date(invoice.dueDate).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        pageWidth - 18,
        yPos + 23,
        { align: "right" },
      );

      doc.setFont("helvetica", "bold");
      doc.text("Currency:", rightX + 4, yPos + 30);
      doc.setFont("helvetica", "normal");
      doc.text(invoice.currency, pageWidth - 18, yPos + 30, { align: "right" });

      doc.setFont("helvetica", "bold");
      doc.text("Amount Due:", rightX + 4, yPos + 37);
      doc.setTextColor(rgb.r, rgb.g, rgb.b);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(
        `${invoice.currency} ${invoice.total.toLocaleString()}`,
        pageWidth - 18,
        yPos + 37,
        { align: "right" },
      );

      // Items Table with Premium Styling
      yPos += 50;
      const tableData = invoice.items.map((item) => [
        item.description,
        item.quantity.toString(),
        `${invoice.currency} ${item.unitPrice.toLocaleString()}`,
        `${invoice.currency} ${item.amount.toLocaleString()}`,
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [["DESCRIPTION", "QTY", "UNIT PRICE", "AMOUNT"]],
        body: tableData,
        theme: "grid",
        headStyles: {
          fillColor: [rgb.r, rgb.g, rgb.b],
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: "bold",
          halign: "left",
          cellPadding: 4,
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [0, 0, 0],
          cellPadding: 3,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: 95 },
          1: { cellWidth: 20, halign: "center" },
          2: { cellWidth: 32, halign: "right" },
          3: { cellWidth: 32, halign: "right" },
        },
        margin: { left: 14, right: 14 },
      });

      // Premium Totals Section
      const finalY = (doc as any).lastAutoTable.finalY + 8;
      const totalsX = pageWidth - 75;

      doc.setDrawColor(rgb.r, rgb.g, rgb.b);
      doc.setLineWidth(0.3);

      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");

      doc.text("Subtotal:", totalsX, finalY);
      doc.text(
        `${invoice.currency} ${invoice.subtotal.toLocaleString()}`,
        pageWidth - 14,
        finalY,
        { align: "right" },
      );

      if (invoice.tax > 0) {
        doc.text("Tax:", totalsX, finalY + 6);
        doc.text(
          `${invoice.currency} ${invoice.tax.toLocaleString()}`,
          pageWidth - 14,
          finalY + 6,
          { align: "right" },
        );
      }

      if (invoice.discount > 0) {
        doc.setTextColor(220, 38, 38);
        doc.text("Discount:", totalsX, finalY + 12);
        doc.text(
          `-${invoice.currency} ${invoice.discount.toLocaleString()}`,
          pageWidth - 14,
          finalY + 12,
          { align: "right" },
        );
      }

      // Grand Total - Premium Style
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.rect(
        totalsX - 5,
        finalY + (invoice.discount > 0 ? 16 : 10),
        pageWidth - totalsX - 9,
        10,
        "F",
      );

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(
        "TOTAL DUE:",
        totalsX,
        finalY + (invoice.discount > 0 ? 23 : 17),
      );
      doc.setFontSize(13);
      doc.text(
        `${invoice.currency} ${invoice.total.toLocaleString()}`,
        pageWidth - 14,
        finalY + (invoice.discount > 0 ? 23 : 17),
        { align: "right" },
      );

      // Notes Section
      if (invoice.notes) {
        const notesY = finalY + (invoice.discount > 0 ? 32 : 26);
        doc.setTextColor(rgb.r, rgb.g, rgb.b);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("NOTES & TERMS", 14, notesY);

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        const splitNotes = doc.splitTextToSize(invoice.notes, pageWidth - 28);
        doc.text(splitNotes, 14, notesY + 6);
      }

      // Premium Footer
      doc.setDrawColor(rgb.r, rgb.g, rgb.b);
      doc.setLineWidth(0.5);
      doc.line(14, pageHeight - 20, pageWidth - 14, pageHeight - 20);

      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Generated by Sarif Fintech on ${new Date().toLocaleDateString(
          "en-US",
          { month: "long", day: "numeric", year: "numeric" },
        )}`,
        pageWidth / 2,
        pageHeight - 12,
        { align: "center" },
      );
      doc.text(
        "This is a computer-generated invoice and is valid without signature.",
        pageWidth / 2,
        pageHeight - 8,
        { align: "center" },
      );

      doc.save(
        `${invoice.invoiceNumber}_${invoice.clientName.replace(
          /\s+/g,
          "_",
        )}.pdf`,
      );
      toast.success("✨ Invoice PDF downloaded!", {
        description: `${invoice.invoiceNumber} using ${template?.name} template`,
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };

  // Filter invoices
  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.clientEmail.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || invoice.status === statusFilter;
    const matchesCurrency =
      currencyFilter === "all" || invoice.currency === currencyFilter;

    return matchesSearch && matchesStatus && matchesCurrency;
  });

  // Stats
  const totalInvoices = invoices.length;
  const paidInvoices = invoices.filter((i) => i.status === "paid").length;
  const pendingInvoices = invoices.filter((i) => i.status === "sent").length;
  const overdueInvoices = invoices.filter((i) => i.status === "overdue").length;
  const draftInvoices = invoices.filter((i) => i.status === "draft").length;
  // Invoices can be in different currencies — never add KES to USD.
  const byCurrency = (list: Invoice[]) => {
    const m = new Map<string, number>();
    for (const i of list) m.set(i.currency || baseCode, (m.get(i.currency || baseCode) || 0) + (i.total || 0));
    return [...m.entries()]
      .sort(([a], [b]) => (a === baseCode ? -1 : b === baseCode ? 1 : a.localeCompare(b)))
      .map(([code, amt]) => ({
        code,
        text: `${code} ${amt.toLocaleString("en-US", {
          minimumFractionDigits: code === "KES" || code === "UGX" ? 0 : 2,
          maximumFractionDigits: code === "KES" || code === "UGX" ? 0 : 2,
        })}`,
      }));
  };
  const collected = byCurrency(invoices.filter((i) => i.status === "paid"));
  const outstanding = byCurrency(invoices.filter((i) => i.status === "sent" || i.status === "overdue"));

  const { subtotal, taxAmount, total } = calculateTotals();

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className={ui.pageTitle}>Invoices</h1>
            <p className={ui.pageSub}>Create, send and track invoices for your clients</p>
          </div>
          <button onClick={() => setShowCompanySettings(true)} className={ui.btnSecondary}>
            <Building className="h-4 w-4" />
            Invoice details
          </button>
        </div>

        {/* Summary: navy lead tile (30) + white tiles (60), semantic colour on the figures only */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <div className={`${ui.hero} col-span-2 p-5 xl:col-span-1`}>
            <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-blue-600/30 blur-3xl" />
            <div className="relative flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invoices</span>
              <FileText className="h-4 w-4 text-blue-300" />
            </div>
            <p className="relative mt-2 text-3xl font-semibold tabular-nums">{totalInvoices}</p>
            <div className="relative mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
              <span>{paidInvoices} paid</span>
              <span>{pendingInvoices} sent</span>
              <span>{draftInvoices} draft</span>
            </div>
          </div>
          {[
            { label: "Collected", icon: CheckCircle, tone: "text-emerald-700", tile: "bg-emerald-50 text-emerald-700", lines: collected, empty: "Nothing paid yet" },
            { label: "Outstanding", icon: Clock, tone: "text-amber-700", tile: "bg-amber-50 text-amber-700", lines: outstanding, empty: "Nothing owed" },
          ].map((c) => (
            <div key={c.label} className={`${ui.card} p-5`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.tile}`}>
                  <c.icon className="h-4 w-4" />
                </span>
              </div>
              {c.lines.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">{c.empty}</p>
              ) : (
                <div className="mt-2 space-y-0.5">
                  {c.lines.map((l, i) => (
                    <p key={l.code} className={`font-semibold tabular-nums ${c.tone} ${i === 0 ? "text-xl" : "text-sm"}`}>
                      {l.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className={`${ui.card} p-5`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overdue</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-700">
                <AlertOctagon className="h-4 w-4" />
              </span>
            </div>
            <p className={`mt-2 text-xl font-semibold tabular-nums ${overdueInvoices ? "text-red-700" : "text-slate-900"}`}>
              {overdueInvoices}
            </p>
            <p className="mt-1 text-xs text-slate-500">{overdueInvoices ? "Follow these up first" : "All on time"}</p>
          </div>
        </div>

        {/* Premium Actions Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white shadow-sm border border-slate-200 p-6 rounded-xl"
        >
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                placeholder="Search by invoice #, client name, or email..."
                value={searchTerm}
                onChange={(e: any) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 placeholder:text-slate-500 font-medium rounded-lg"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-3">
              <select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all font-semibold text-slate-700 min-w-[140px] rounded-lg"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                value={currencyFilter}
                onChange={(e: any) => setCurrencyFilter(e.target.value)}
                className="px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all font-semibold text-slate-700 min-w-[120px] rounded-lg"
              >
                <option value="all">All currencies</option>
                <option value="KES">KES</option>
                <option value="USD">USD</option>
                {currencyOk("UGX") && <option value="UGX">UGX</option>}
                <option value="EUR">EUR</option>
              </select>
            </div>

            {/* Create Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowCreateModal(true)}
              className="px-8 py-4 bg-blue-600 text-white transition-all font-semibold text-sm flex items-center gap-3 justify-center shadow-sm hover:shadow-md bg-[length:200%_100%] bg-left hover:bg-right hover:bg-blue-700"
              style={{
                backgroundPosition: "left",
                transition: "all 0.3s ease",
              }}
            >
              <Plus className="w-5 h-5" />
              <span>Create Invoice</span>
              <Sparkles className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>

        {/* Premium Invoices Grid/Table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white shadow-sm overflow-hidden border border-slate-200 rounded-lg"
        >
          {loading ? (
            <div className="p-20 text-center">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-slate-600">Loading invoices...</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-20 text-center">
              <div className="inline-block p-6 bg-slate-100 mb-4">
                <FileText className="w-16 h-16 text-slate-400 mx-auto" />
              </div>
              <h3 className="text-2xl font-semibold text-slate-800 mb-2">
                No Invoices Found
              </h3>
              <p className="text-slate-600 mb-6">
                Create your first invoice to get started
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 bg-blue-600 text-white font-semibold inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Create Invoice
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto max-w-full">
              <table className="w-full">
                <thead className="bg-[#E9EEF6]">
                  <tr className="">
                    <th className="px-6 py-5 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Invoice
                    </th>
                    <th className="px-6 py-5 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Client
                    </th>
                    <th className="px-6 py-5 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Issue Date
                    </th>
                    <th className="px-6 py-5 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Due Date
                    </th>
                    <th className="px-6 py-5 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Amount
                    </th>
                    <th className="px-6 py-5 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Status
                    </th>
                    <th className="px-6 py-5 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map((invoice, index) => (
                    <motion.tr
                      key={invoice.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      whileHover={{
                        backgroundColor: "rgba(241, 245, 249, 0.5)",
                      }}
                      className="group cursor-pointer transition-all"
                    >
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Hash className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">
                              {invoice.invoiceNumber}
                            </div>
                            <div className="text-xs text-slate-500">
                              {new Date(invoice.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="font-semibold text-slate-900">
                          {invoice.clientName}
                        </div>
                        <div className="text-sm text-slate-600 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {invoice.clientEmail}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-slate-700">
                          <Calendar className="w-4 h-4 text-slate-500" />
                          {new Date(invoice.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-slate-700">
                          <Clock className="w-4 h-4 text-slate-500" />
                          {new Date(invoice.dueDate).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric" },
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="font-semibold text-lg text-slate-900">
                          {invoice.currency} {invoice.total.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500">
                          {invoice.items.length} item
                          {invoice.items.length !== 1 ? "s" : ""}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <motion.span
                          whileHover={{ scale: 1.05 }}
                          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider shadow-sm ${
                            invoice.status === "paid"
                              ? "bg-emerald-700 text-white"
                              : invoice.status === "sent"
                                ? "bg-blue-600 text-white"
                                : invoice.status === "overdue"
                                  ? "bg-red-600 text-white"
                                  : invoice.status === "cancelled"
                                    ? "bg-slate-200 text-slate-700"
                                    : "bg-amber-700 text-white"
                          }`}
                        >
                          {invoice.status === "paid" && (
                            <CheckCircle className="w-3 h-3" />
                          )}
                          {invoice.status === "sent" && (
                            <Send className="w-3 h-3" />
                          )}
                          {invoice.status === "overdue" && (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {invoice.status === "draft" && (
                            <Edit3 className="w-3 h-3" />
                          )}
                          {invoice.status === "cancelled" && (
                            <XCircle className="w-3 h-3" />
                          )}
                          {invoice.status}
                        </motion.span>
                        {/* Status change actions */}
                        <div className="flex gap-1 mt-2">
                          {invoice.status === "draft" && (
                            <button
                              onClick={async () => {
                                const result = await updateInvoiceStatus(
                                  invoice.id,
                                  InvoiceStatus.Sent,
                                );
                                if (result.success) {
                                  toast.success("Invoice sent");
                                  fetchInvoices();
                                } else toast.error(result.message || "Failed");
                              }}
                              className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold transition-all"
                            >
                              Mark Sent
                            </button>
                          )}
                          {(invoice.status === "sent" ||
                            invoice.status === "overdue") && (
                            <button
                              onClick={async () => {
                                const result = await updateInvoiceStatus(
                                  invoice.id,
                                  InvoiceStatus.Paid,
                                );
                                if (result.success) {
                                  toast.success("Invoice marked as paid");
                                  fetchInvoices();
                                } else toast.error(result.message || "Failed");
                              }}
                              className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-semibold transition-all"
                            >
                              Mark Paid
                            </button>
                          )}
                          {invoice.status !== "paid" &&
                            invoice.status !== "cancelled" && (
                              <button
                                onClick={async () => {
                                  const result = await updateInvoiceStatus(
                                    invoice.id,
                                    InvoiceStatus.Cancelled,
                                  );
                                  if (result.success) {
                                    toast.success("Invoice cancelled");
                                    fetchInvoices();
                                  } else
                                    toast.error(result.message || "Failed");
                                }}
                                className="text-xs px-2 py-0.5 bg-red-100 text-red-700 hover:bg-red-200 font-semibold transition-all"
                              >
                                Cancel
                              </button>
                            )}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setShowViewModal(true);
                            }}
                            className="p-3 text-blue-600 hover:bg-blue-50 transition-all border border-transparent hover:border-blue-200 rounded-lg"
                            title="View Details"
                          >
                            <Eye className="w-5 h-5" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setShowTemplateSelector(true);
                            }}
                            className="p-3 text-emerald-700 hover:bg-emerald-50 transition-all border border-transparent hover:border-emerald-200 rounded-lg"
                            title="Download PDF"
                          >
                            <Download className="w-5 h-5" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={async () => {
                              try {
                                const dto: CreateInvoiceDto = {
                                  clientName: invoice.clientName,
                                  clientEmail: invoice.clientEmail,
                                  clientPhone: invoice.clientPhone,
                                  clientAddress: invoice.clientAddress,
                                  dueDate: localDate(new Date(
                                    Date.now() + 30 * 24 * 60 * 60 * 1000,
                                  )),
                                  currency:
                                    invoice.currency === "KES"
                                      ? Currency.KES
                                      : Currency.USD,
                                  items: invoice.items.map((item) => ({
                                    description: item.description,
                                    quantity: item.quantity,
                                    unitPrice: item.unitPrice,
                                  })),
                                  taxRate: 0,
                                  discountAmount: invoice.discount,
                                  notes: invoice.notes,
                                };
                                const result = await apiCreateInvoice(dto);
                                if (result.success) {
                                  toast.success("Invoice duplicated!");
                                  fetchInvoices();
                                } else {
                                  toast.error(
                                    result.message || "Failed to duplicate",
                                  );
                                }
                              } catch {
                                toast.error("Failed to duplicate invoice");
                              }
                            }}
                            className="p-3 text-blue-600 hover:bg-[#E9EEF6] transition-all border border-transparent hover:border-slate-200 rounded-lg"
                            title="Duplicate"
                          >
                            <Copy className="w-5 h-5" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={async () => {
                              if (
                                confirm(
                                  `Are you sure you want to delete ${invoice.invoiceNumber}?`,
                                )
                              ) {
                                const result = await apiDeleteInvoice(
                                  invoice.id,
                                );
                                if (result.success) {
                                  toast.success("Invoice deleted");
                                  fetchInvoices();
                                } else {
                                  toast.error(
                                    result.message ||
                                      "Failed to delete invoice",
                                  );
                                }
                              }
                            }}
                            className="p-3 text-red-600 hover:bg-red-50 transition-all border border-transparent hover:border-red-200 rounded-lg"
                            title="Delete"
                          >
                            <Trash2 className="w-5 h-5" />
                          </motion.button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>

      {/* Create Invoice Modal - Premium */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white w-full max-w-6xl max-h-[95vh] overflow-hidden shadow-2xl border-4 border-blue-200"
            >
              {/* Premium Header */}
              <div className="sticky top-0 bg-blue-600 p-8 z-10 border-b-4 border-blue-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-white/20 border border-white/30 rounded-xl">
                      <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-semibold text-white">
                        Create New Invoice
                      </h2>
                      <p className="text-blue-50 text-sm mt-1">
                        Build a professional invoice with our premium templates
                      </p>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowCreateModal(false)}
                    className="text-white hover:bg-white/20 p-3 transition-all border border-white/30 rounded-lg"
                  >
                    <X className="w-7 h-7" />
                  </motion.button>
                </div>
              </div>

              <div className="overflow-y-auto max-h-[calc(95vh-140px)] p-8 space-y-8 bg-slate-50">
                {/* Client Information */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-blue-600 flex items-center justify-center">
                      <User className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-2xl font-semibold text-slate-800">
                      Client Information
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                        Client Name *
                      </label>
                      <input
                        type="text"
                        value={formData.clientName}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            clientName: e.target.value,
                          })
                        }
                        className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium text-lg rounded-lg"
                        placeholder="John Doe Enterprises"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        value={formData.clientEmail}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            clientEmail: e.target.value,
                          })
                        }
                        className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium text-lg rounded-lg"
                        placeholder="client@company.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={formData.clientPhone}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            clientPhone: e.target.value,
                          })
                        }
                        className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium text-lg rounded-lg"
                        placeholder={samples.phone}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                        Address
                      </label>
                      <input
                        type="text"
                        value={formData.clientAddress}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            clientAddress: e.target.value,
                          })
                        }
                        className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium text-lg rounded-lg"
                        placeholder={samples.place}
                      />
                    </div>
                  </div>
                </div>

                {/* Invoice Details */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-blue-600 flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-2xl font-semibold text-slate-800">
                      Invoice Details
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                        Invoice Date *
                      </label>
                      <input
                        type="date"
                        value={formData.date}
                        onChange={(e: any) =>
                          setFormData({ ...formData, date: e.target.value })
                        }
                        className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium text-lg rounded-lg"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                        Due Date *
                      </label>
                      <input
                        type="date"
                        value={formData.dueDate}
                        onChange={(e: any) =>
                          setFormData({ ...formData, dueDate: e.target.value })
                        }
                        className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium text-lg rounded-lg"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                        Currency *
                      </label>
                      <select
                        value={formData.currency}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            currency: e.target.value as "KES" | "USD" | "UGX" | "EUR",
                          })
                        }
                        className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-semibold text-lg rounded-lg"
                      >
                        <option value="KES">KES - Kenyan Shilling</option>
                        <option value="USD">USD - US Dollar</option>
                        {currencyOk("UGX") && <option value="UGX">UGX - Ugandan Shilling</option>}
                        <option value="EUR">EUR - Euro</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Invoice Items */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-emerald-600 flex items-center justify-center">
                        <ShoppingCart className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-2xl font-semibold text-slate-800">
                        Line Items
                      </h3>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={addInvoiceItem}
                      className="px-6 py-3 bg-emerald-700 text-white transition-all font-semibold flex items-center gap-2 shadow-sm hover:bg-emerald-700"
                    >
                      <Plus className="w-5 h-5" />
                      Add Line Item
                    </motion.button>
                  </div>

                  <div className="space-y-4">
                    {formData.items.map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="grid grid-cols-12 gap-4 p-6 bg-white border border-slate-200 hover:border-blue-300 transition-all shadow-md rounded-xl"
                      >
                        <div className="col-span-12 md:col-span-5">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e: any) =>
                              updateInvoiceItem(
                                item.id,
                                "description",
                                e.target.value,
                              )
                            }
                            className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium rounded-lg"
                            placeholder="Item description..."
                          />
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e: any) =>
                              updateInvoiceItem(
                                item.id,
                                "quantity",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-semibold text-center rounded-lg"
                            placeholder="Qty"
                            min="1"
                          />
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e: any) =>
                              updateInvoiceItem(
                                item.id,
                                "unitPrice",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-semibold text-right rounded-lg"
                            placeholder="Price"
                            min="0"
                            step="0.01"
                          />
                        </div>
                        <div className="col-span-3 md:col-span-2">
                          <div className="px-4 py-3 bg-slate-50 border border-blue-300 text-blue-700 font-semibold text-lg text-right rounded-lg">
                            {item.amount.toLocaleString()}
                          </div>
                        </div>
                        <div className="col-span-1">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => removeInvoiceItem(item.id)}
                            className="w-full h-full text-red-600 hover:bg-red-50 transition-all border border-transparent hover:border-red-200 flex items-center justify-center rounded-lg"
                            disabled={formData.items.length === 1}
                          >
                            <Trash2 className="w-5 h-5" />
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Calculations */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left - Tax & Discount */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-amber-600 flex items-center justify-center">
                        <CreditCard className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-2xl font-semibold text-slate-800">
                        Adjustments
                      </h3>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                          Tax Rate (%)
                        </label>
                        <input
                          type="number"
                          value={formData.tax}
                          onChange={(e: any) =>
                            setFormData({
                              ...formData,
                              tax: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-semibold text-lg rounded-lg"
                          placeholder="0"
                          min="0"
                          max="100"
                          step="0.01"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                          Discount Amount
                        </label>
                        <input
                          type="number"
                          value={formData.discount}
                          onChange={(e: any) =>
                            setFormData({
                              ...formData,
                              discount: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-semibold text-lg rounded-lg"
                          placeholder="0"
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right - Totals */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-blue-600 flex items-center justify-center">
                        <Receipt className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-2xl font-semibold text-slate-800">
                        Summary
                      </h3>
                    </div>
                    <div className="bg-slate-50 p-8 border border-blue-300 shadow-sm rounded-xl">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b-2 border-blue-200">
                          <span className="text-lg font-semibold text-slate-700">
                            Subtotal:
                          </span>
                          <span className="text-xl font-semibold text-slate-900">
                            {formData.currency} {subtotal.toLocaleString()}
                          </span>
                        </div>
                        {formData.tax > 0 && (
                          <div className="flex justify-between items-center pb-2 border-b-2 border-blue-200">
                            <span className="text-lg font-semibold text-slate-700">
                              Tax ({formData.tax}%):
                            </span>
                            <span className="text-xl font-semibold text-blue-700">
                              {formData.currency} {taxAmount.toLocaleString()}
                            </span>
                          </div>
                        )}
                        {formData.discount > 0 && (
                          <div className="flex justify-between items-center pb-2 border-b-2 border-blue-200">
                            <span className="text-lg font-semibold text-slate-700">
                              Discount:
                            </span>
                            <span className="text-xl font-semibold text-red-600">
                              -{formData.currency}{" "}
                              {formData.discount.toLocaleString()}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-4 border-t-4 border-blue-400">
                          <span className="text-2xl font-semibold text-slate-900">
                            TOTAL:
                          </span>
                          <span className="text-3xl font-semibold text-slate-900">
                            {formData.currency} {total.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-slate-100 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-slate-600" />
                    </div>
                    <h3 className="text-2xl font-semibold text-slate-800">
                      Notes & Terms
                    </h3>
                  </div>
                  <textarea
                    value={formData.notes}
                    onChange={(e: any) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium rounded-lg"
                    rows={4}
                    placeholder="Thank you for your business! Payment is due within 30 days."
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 pt-6 border-t-4 border-slate-200">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-8 py-5 border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all font-semibold text-lg rounded-lg"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCreateInvoice}
                    className="flex-1 px-8 py-5 bg-blue-600 text-white transition-all font-semibold text-lg flex items-center justify-center gap-3 shadow-sm hover:bg-blue-700"
                  >
                    <Sparkles className="w-6 h-6" />
                    Create Invoice
                    <ArrowRight className="w-6 h-6" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Template Selector Modal - Ultra Premium */}
      <AnimatePresence>
        {showTemplateSelector && selectedInvoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={() => setShowTemplateSelector(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white w-full max-w-7xl max-h-[95vh] overflow-hidden shadow-2xl border-4 border-slate-200"
            >
              <div className="bg-blue-600 p-8 border-b-4 border-blue-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <motion.div
                      animate={{ rotate: [0, 360] }}
                      transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="p-4 bg-white/20 border border-white/30 rounded-xl"
                    >
                      <LayoutTemplate className="w-10 h-10 text-white" />
                    </motion.div>
                    <div>
                      <h2 className="text-3xl font-semibold text-white mb-2">
                        Choose Your Template
                      </h2>
                      <p className="text-blue-50 text-lg">
                        Select a premium design for{" "}
                        {selectedInvoice.invoiceNumber}
                      </p>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowTemplateSelector(false)}
                    className="text-white hover:bg-white/20 p-3 transition-all border border-white/30 rounded-lg"
                  >
                    <X className="w-7 h-7" />
                  </motion.button>
                </div>
              </div>

              <div className="p-8 overflow-y-auto max-h-[calc(95vh-160px)] bg-slate-50">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {INVOICE_TEMPLATES.map((template, index) => (
                    <motion.div
                      key={template.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ scale: 1.05, y: -10 }}
                      onClick={() => {
                        setSelectedTemplate(template.id);
                        exportToPDF(selectedInvoice, template.id);
                        setShowTemplateSelector(false);
                      }}
                      className="cursor-pointer border-4 border-slate-200 hover:border-blue-500 transition-all overflow-hidden group shadow-sm hover:shadow-md"
                    >
                      <div
                        className={`h-48 flex flex-col items-center justify-center relative overflow-hidden ${template.gradient}`}
                      >
                        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-all" />
                        <motion.div
                          animate={{ rotate: [0, 360] }}
                          transition={{
                            duration: 10,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                          className="absolute top-4 right-4"
                        >
                          <Star className="w-8 h-8 text-white/30" />
                        </motion.div>
                        <Sparkles className="w-16 h-16 text-white mb-4 opacity-80 group-hover:opacity-100 transition-opacity" />
                        <div className="w-full px-4 space-y-2">
                          <div className="h-3 bg-white/30 w-3/4" />
                          <div className="h-2 bg-white/20 w-1/2" />
                          <div className="h-2 bg-white/20 w-2/3" />
                        </div>
                      </div>
                      <div className="p-5 bg-white group-hover: group-hover: group-hover: transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-lg text-slate-900">
                            {template.name}
                          </h3>
                          <Download className="w-5 h-5 text-slate-500 group-hover:text-blue-600 transition-colors" />
                        </div>
                        <p className="text-sm text-slate-600 mb-3">
                          {template.description}
                        </p>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6"
                            style={{ backgroundColor: template.color }}
                          />
                          <span className="text-xs font-mono text-slate-500">
                            {template.color}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Company Settings Modal - Premium */}
      <AnimatePresence>
        {showCompanySettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCompanySettings(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white w-full max-w-3xl shadow-2xl border-4 border-blue-200"
            >
              <div className="bg-blue-600 p-8 border-b-4 border-blue-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-white/20 border border-white/30 rounded-xl">
                      <Building className="w-10 h-10 text-white" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-semibold text-white">
                        Company Information
                      </h2>
                      <p className="text-blue-50 mt-1">
                        Configure your business details for invoices
                      </p>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowCompanySettings(false)}
                    className="text-white hover:bg-white/20 p-3 transition-all border border-white/30 rounded-lg"
                  >
                    <X className="w-7 h-7" />
                  </motion.button>
                </div>
              </div>

              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto bg-slate-50">
                {/* Logo Upload */}
                <div className="space-y-4">
                  <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                    Company Logo
                  </label>
                  <div className="flex items-center gap-6">
                    {companyInfo.logo ? (
                      <div className="w-40 h-40 border-4 border-blue-200 flex items-center justify-center overflow-hidden bg-white shadow-sm">
                        <img
                          src={companyInfo.logo}
                          alt="Logo"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-40 h-40 border-4 border-dashed border-slate-300 flex items-center justify-center bg-slate-50">
                        <ImageIcon className="w-16 h-16 text-slate-300" />
                      </div>
                    )}
                    <div className="flex-1 space-y-3">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="px-8 py-4 bg-blue-600 text-white transition-all font-semibold inline-flex items-center gap-3 shadow-sm hover:bg-blue-700"
                        >
                          <Upload className="w-5 h-5" />
                          Upload Logo
                        </motion.div>
                      </label>
                      <p className="text-sm text-slate-600">
                        <strong>Recommended:</strong> PNG or JPG, max 5MB
                        <br />
                        <strong>Size:</strong> 500x500px for best results
                      </p>
                    </div>
                  </div>
                </div>

                {/* Company Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    {
                      label: "Company Name",
                      field: "name",
                      type: "text",
                      icon: Building,
                      readOnly: true, // set by the super admin
                    },
                    {
                      label: "Tax ID (KRA PIN / URA TIN)",
                      field: "taxId",
                      type: "text",
                      icon: Hash,
                    },
                    {
                      label: "Email Address",
                      field: "email",
                      type: "email",
                      icon: Mail,
                    },
                    {
                      label: "Phone Number",
                      field: "phone",
                      type: "tel",
                      icon: Phone,
                      readOnly: true, // the bureau's registered number
                    },
                    {
                      label: "Website",
                      field: "website",
                      type: "text",
                      icon: Building,
                    },
                    {
                      label: "Address",
                      field: "address",
                      type: "text",
                      icon: Building,
                    },
                  ].map((field: { label: string; field: string; type: string; icon: any; readOnly?: boolean }) => (
                    <div key={field.field} className="space-y-2">
                      <label htmlFor={`co-${field.field}`} className="block text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                        <field.icon className="w-4 h-4" />
                        {field.label}
                        {field.readOnly && <span className="normal-case font-normal tracking-normal text-xs text-slate-500">from your account</span>}
                      </label>
                      <input
                        id={`co-${field.field}`}
                        type={field.type}
                        readOnly={field.readOnly}
                        aria-readonly={field.readOnly}
                        value={companyInfo[field.field as keyof CompanyInfo]}
                        onChange={(e: any) =>
                          setCompanyInfo({
                            ...companyInfo,
                            [field.field]: e.target.value,
                          })
                        }
                        className={`w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all font-medium text-lg rounded-lg ${field.readOnly ? "bg-slate-50 text-slate-500 cursor-not-allowed" : "text-slate-900"}`}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex gap-4 pt-6 border-t-4 border-slate-200">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowCompanySettings(false)}
                    className="flex-1 px-8 py-5 border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all font-semibold text-lg rounded-lg"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={savingCompany}
                    onClick={async () => {
                      setSavingCompany(true);
                      const err = await saveCompanyBranding(companyInfo);
                      setSavingCompany(false);
                      if (err) { toast.error(err); return; }
                      setShowCompanySettings(false);
                      toast.success("Company details saved", { description: "They will appear on every invoice." });
                    }}
                    className="flex-1 px-8 py-5 bg-blue-600 text-white transition-all font-semibold text-lg flex items-center justify-center gap-3 shadow-sm hover:bg-blue-700"
                  >
                    <Save className="w-6 h-6" />
                    Save Changes
                    <CheckCircle className="w-6 h-6" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
