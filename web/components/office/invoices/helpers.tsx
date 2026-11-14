"use client";



export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}
export interface Invoice {
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
  /** Tax rate in percent, as entered (tax above is the amount). */
  taxRate: number;
  discount: number;
  total: number;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  currency: "KES" | "USD" | "UGX" | "EUR";
  notes: string;
  createdAt: string;
}
export interface CompanyInfo {
  name: string;
  logo: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
}
// Premium Invoice Templates
export const INVOICE_TEMPLATES = [
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
// Money on invoices and their PDFs: whole amounts as they are, anything else with 2 decimals
// (was "337,501.5" beside "388,251.77" on the same invoice).
export const money = (n: number) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(Number(n || 0)) ? 0 : 2, maximumFractionDigits: 2 });
