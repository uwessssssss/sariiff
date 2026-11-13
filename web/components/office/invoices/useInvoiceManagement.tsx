"use client";

import { CompanyInfo, INVOICE_TEMPLATES, Invoice, InvoiceItem, money } from "./helpers";
import { CreateInvoiceDto, Currency, InvoiceResponseDto, InvoiceStatus, allPages, createInvoice as apiCreateInvoice, getInvoices } from "@/lib/api";
import { EMPTY_BRANDING, loadCompanyBranding, shrinkImage } from "@/lib/companyBranding";
import autoTable from "jspdf-autotable";
import jsPDF from "jspdf";
import { localDate } from "@/lib/dates";
import { toast } from "sonner";
import { useAllowedCurrencies, useBaseCurrency, useCountrySamples } from "@/lib/useBaseCurrency";
import { useCallback, useEffect, useState } from "react";

/** All of InvoiceManagement's state, effects and handlers. The screen and its sections read them from here. */
export function useInvoiceManagement() {
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
    // Email is optional (the API and the phone app take an invoice without one: a walk-in
    // customer often has only a phone number).
    if (!formData.clientName.trim()) {
      toast.error("Please fill in the client name");
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
        clientEmail: formData.clientEmail.trim() || undefined,
        clientPhone: formData.clientPhone,
        clientAddress: formData.clientAddress,
        dueDate: formData.dueDate,
        // "Invoice Date *" was asked for and dropped: every invoice was dated now.
        invoiceDate: formData.date && formData.date !== localDate() ? formData.date : undefined,
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
        `${invoice.currency} ${money(invoice.total)}`,
        pageWidth - 18,
        yPos + 37,
        { align: "right" },
      );

      // Items Table with Premium Styling
      yPos += 50;
      const tableData = invoice.items.map((item) => [
        item.description,
        item.quantity.toString(),
        `${invoice.currency} ${money(item.unitPrice)}`,
        `${invoice.currency} ${money(item.amount)}`,
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
        `${invoice.currency} ${money(invoice.subtotal)}`,
        pageWidth - 14,
        finalY,
        { align: "right" },
      );

      if (invoice.tax > 0) {
        doc.text("Tax:", totalsX, finalY + 6);
        doc.text(
          `${invoice.currency} ${money(invoice.tax)}`,
          pageWidth - 14,
          finalY + 6,
          { align: "right" },
        );
      }

      if (invoice.discount > 0) {
        doc.setTextColor(220, 38, 38);
        doc.text("Discount:", totalsX, finalY + 12);
        doc.text(
          `-${invoice.currency} ${money(invoice.discount)}`,
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
        `${invoice.currency} ${money(invoice.total)}`,
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

  return {
    currencyOk,
    baseCode,
    samples,
    invoices,
    setInvoices,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    currencyFilter,
    setCurrencyFilter,
    showCreateModal,
    setShowCreateModal,
    showViewModal,
    setShowViewModal,
    showCompanySettings,
    setShowCompanySettings,
    selectedInvoice,
    setSelectedInvoice,
    selectedTemplate,
    setSelectedTemplate,
    showTemplateSelector,
    setShowTemplateSelector,
    previewMode,
    setPreviewMode,
    loading,
    setLoading,
    submitting,
    setSubmitting,
    mapStatus,
    mapInvoice,
    fetchInvoices,
    companyInfo,
    setCompanyInfo,
    savingCompany,
    setSavingCompany,
    formData,
    setFormData,
    calculateTotals,
    addInvoiceItem,
    updateInvoiceItem,
    removeInvoiceItem,
    handleCreateInvoice,
    resetForm,
    handleLogoUpload,
    exportToPDF,
    filteredInvoices,
    totalInvoices,
    paidInvoices,
    pendingInvoices,
    overdueInvoices,
    draftInvoices,
    byCurrency,
    collected,
    outstanding,
    subtotal,
    taxAmount,
    total,
  };
}

export type InvoiceManagementVM = ReturnType<typeof useInvoiceManagement>;
