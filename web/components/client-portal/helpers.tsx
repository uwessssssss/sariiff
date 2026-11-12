"use client";

import { AlertCircle, CheckCircle, Info } from "lucide-react";
import { ClientType, Currency } from "@/lib/api";

export interface ClientUserDashboardProps {
  userName: string;
  onLogout: () => void;
}
export type ClientView =
  | "dashboard"
  | "statements"
  | "alerts"
  | "analytics"
  | "profile";
// WhatsApp number clients can reach their bureau on (digits only, with
// country code, e.g. 254712345678). Set NEXT_PUBLIC_SUPPORT_WHATSAPP in Vercel.
export const SUPPORT_WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "").replace(/\D/g, "");
// ============ HELPER FUNCTIONS ============

export const formatCurrency = (
  amount: number,
  currency: Currency | string,
): string => {
  // Accept either the numeric enum or an ISO code ("UGX", "EUR", ...).
  const codeMap: Record<number, string> = {
    0: "KES",
    1: "USD",
    2: "UGX",
    3: "EUR",
  };
  const symbol =
    typeof currency === "number" ? codeMap[currency] || "KES" : currency;
  return `${symbol} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};
export const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};
// Local time of a transaction (the API sends UTC; the old "time" text field was UTC too).
export const formatTime = (dateStr: string): string =>
  new Date(dateStr).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
export const getAlertIcon = (type: string) => {
  switch (type) {
    case "success":
      return CheckCircle;
    case "warning":
      return AlertCircle;
    case "error":
      return AlertCircle;
    default:
      return Info;
  }
};
export const getAlertGradient = (type: string): string => {
  switch (type) {
    case "success":
      return "bg-emerald-700 ";
    case "warning":
      return "bg-amber-700 ";
    case "error":
      return "bg-red-600 ";
    default:
      return "bg-blue-600 ";
  }
};
export const getAlertBorderClass = (type: string): string => {
  switch (type) {
    case "success":
      return "border-emerald-300 hover:border-emerald-400";
    case "warning":
      return "border-amber-300 hover:border-amber-400";
    case "error":
      return "border-red-300 hover:border-red-400";
    default:
      return "border-blue-300 hover:border-blue-400";
  }
};
export const getClientTypeLabel = (type: ClientType): string => {
  return type === ClientType.Permanent ? "Premium Client" : "Standard Client";
};
