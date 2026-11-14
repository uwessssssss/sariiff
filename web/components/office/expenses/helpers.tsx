"use client";

import { motion } from "framer-motion";

// ==============================================
// Types
// ==============================================

export interface ExpenseTransaction {
  id: string;
  code: string;
  date: string;
  description: string;
  categoryId: string;
  categoryName: string;
  currency: "KES" | "USD" | "UGX" | "EUR";
  amount: number;
  reference: string;
  paymentMethod: string;
  vendor: string;
  approvedBy: string;
}
export interface ExpenseCategory {
  id: string;
  name: string;
  description?: string;
  kesTotal: number;
  usdTotal: number;
  /** Spend in every currency used (KES, USD, UGX, EUR) */
  totals: { currency: number; amount: number }[];
  transactionCount: number;
  isActive: boolean;
}
export interface ExpenseStats {
  totalKES: number;
  totalUSD: number;
  thisMonthKES: number;
  thisMonthUSD: number;
  activeCategories: number;
  /** Every currency spent in (KES, USD, UGX, EUR) */
  byCurrency?: { currency: number; total: number; thisMonth: number }[] | null;
}
export interface FormData {
  categoryId: string;
  description: string;
  amount: number;
  currency: number;
  vendor: string;
  paymentMethod: number;
  paymentAccountType: number;
  paymentAccountId: string;
  reference: string;
  expenseDate: string;
}
export interface EditFormData {
  description: string;
  vendor: string;
  amount: number;
  reference: string;
}
export interface AccountOption {
  id: string;
  name: string;
  type: number;
  currency: number;
  balance: number;
}
// ==============================================
// Helper Functions
// ==============================================

export const formatNumber = (num: number) => {
  return new Intl.NumberFormat("en-KE").format(num);
};
export const formatCurrency = (amount: number, currency: "KES" | "USD" | "UGX" | "EUR" | number) => {
  const currencyCode =
    typeof currency === "number" ? (currency === 0 ? "KES" : currency === 2 ? "UGX" : currency === 3 ? "EUR" : "USD") : currency;
  return `${currencyCode} ${formatNumber(amount)}`;
};
// ==============================================
// Modal Wrapper Component
// ==============================================

export function ModalWrapper({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e: any) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e: any) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
