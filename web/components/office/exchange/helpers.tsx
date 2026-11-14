"use client";

import { AccountType, Currency, ExchangeFloatDto, currencyCode } from "@/lib/api";
import React from "react";
import { floatCurrenciesFor, foreignCurrenciesFor } from "@/lib/useBaseCurrency";
import { motion } from "framer-motion";

// ==============================================
// Types
// ==============================================

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: Currency;
}
// ==============================================
// Helper Functions
// ==============================================

export const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};
export const formatTime = (dateString: string) => {
  return new Date(dateString).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
  });
};
export const formatDateTime = (dateString: string) => {
  return `${formatDate(dateString)} ${formatTime(dateString)}`;
};
// UPDATED: New Exchange Modal - supports walk-in clients for Cash type
// Every currency the float can hold, home currency first.
export const allFloatCurrencies = (base: number) =>
  floatCurrenciesFor(base).map((v) => ({ value: v, code: currencyCode(v) }));
// Float balance in any currency. kesBalance holds the company's BASE currency
// (KES in Kenya, UGX in Uganda — the field name is historical), USD has its own
// field, everything else comes from otherBalances.
export const floatBalanceOf = (f: ExchangeFloatDto | null, c: number, base: number): number =>
  !f
    ? 0
    : c === base
      ? f.kesBalance
      : c === Currency.USD
        ? f.usdBalance
        : (f.otherBalances || []).find((b) => b.currency === c)?.balance || 0;
// Currencies that trade against the home currency. Each needs its own active rate.
export const foreignTradeCurrencies = (base: number) =>
  foreignCurrenciesFor(base).map((v) => ({ value: v, code: currencyCode(v) }));
// UGX trades at ~0.03 KES (and KES at ~28 UGX), so small rates need more decimals.
export const formatRate = (r: number) => (r < 1 ? r.toFixed(4) : r.toFixed(2));
// Modal Wrapper
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
        className="w-full max-w-lg"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
