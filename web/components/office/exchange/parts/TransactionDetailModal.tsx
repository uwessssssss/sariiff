"use client";

import { AlertTriangle, Copy, Loader2, X } from "lucide-react";
import { ExchangeResponseDto, ExchangeType, currencyCode, formatCurrency } from "@/lib/api";
import { ModalWrapper, formatDateTime } from "../helpers";
import { toast } from "sonner";
import { useState } from "react";

// Transaction Detail Modal
export function TransactionDetailModal({
  transaction,
  onClose,
  onVoid,
  loading,
}: {
  transaction: ExchangeResponseDto;
  onClose: () => void;
  onVoid: (id: string, reason: string) => void;
  loading: boolean;
}) {
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  const handleCopy = () => {
    const text = `Exchange: ${transaction.code}\nDate: ${formatDateTime(
      transaction.date,
    )}\nClient: ${transaction.clientName}\nGiven: ${formatCurrency(
      transaction.amountGiven,
      transaction.currencyGiven,
    )}\nReceived: ${formatCurrency(
      transaction.amountReceived,
      transaction.currencyReceived,
    )}\nRate: ${transaction.exchangeRate}\nProfit: ${formatCurrency(
      transaction.profit,
      transaction.profitCurrency,
    )}`;
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {transaction.code}
          </h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {transaction.isLargeTransaction && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4" />
              Large Transaction (Compliance Required)
            </div>
          )}

          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Date</span>
              <span className="font-medium">
                {formatDateTime(transaction.date)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Client</span>
              <span className="font-medium">{transaction.clientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Type</span>
              <span
                className={`px-2 py-0.5 text-xs font-medium ${
                  transaction.exchangeType === ExchangeType.Cash
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {transaction.exchangeType === ExchangeType.Cash
                  ? "Cash"
                  : "From Account"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Direction</span>
              <span className="font-medium">
                {currencyCode(transaction.currencyGiven)} →{" "}
                {currencyCode(transaction.currencyReceived)}
              </span>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Given</span>
              <span className="font-medium text-emerald-700">
                +
                {formatCurrency(
                  transaction.amountGiven,
                  transaction.currencyGiven,
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Received</span>
              <span className="font-medium text-red-600">
                -
                {formatCurrency(
                  transaction.amountReceived,
                  transaction.currencyReceived,
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Rate</span>
              <span className="font-medium">
                {transaction.exchangeRate.toFixed(2)}
              </span>
            </div>
            <div className={`flex justify-between p-2 -mx-2 ${transaction.profit < 0 ? "bg-red-50" : transaction.profit > 0 ? "bg-emerald-50" : "bg-slate-50"}`}>
              <span className={`font-medium ${transaction.profit < 0 ? "text-red-700" : transaction.profit > 0 ? "text-emerald-700" : "text-slate-600"}`}>
                {transaction.profit < 0 ? "Loss" : "Profit"}
              </span>
              <span className={`font-semibold ${transaction.profit < 0 ? "text-red-700" : transaction.profit > 0 ? "text-emerald-700" : "text-slate-600"}`}>
                {transaction.profit
                  ? `${transaction.profit > 0 ? "+" : "−"}${formatCurrency(Math.abs(transaction.profit), transaction.profitCurrency)}`
                  : "None on a purchase — profit is booked when the currency is sold"}
              </span>
            </div>
          </div>

          {transaction.notes && (
            <div className="border-t border-gray-200 pt-3">
              <p className="text-sm text-gray-600">Notes</p>
              <p className="text-sm">{transaction.notes}</p>
            </div>
          )}

          {transaction.status === "Voided" && (
            <div className="bg-red-50 p-3 text-red-800 text-sm">
              <p className="font-medium">This transaction has been voided</p>
            </div>
          )}

          {showVoidForm && transaction.status !== "Voided" && (
            <div className="border-t border-gray-200 pt-3 space-y-3">
              <p className="text-sm font-medium text-red-600">
                Void this transaction?
              </p>
              <input
                type="text"
                value={voidReason}
                onChange={(e: any) => setVoidReason(e.target.value)}
                className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Reason for voiding..."
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowVoidForm(false)}
                  className="rounded-lg flex-1 px-3 py-2 text-gray-700 hover:bg-gray-100 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => onVoid(transaction.id, voidReason)}
                  disabled={!voidReason || loading}
                  className="rounded-lg flex-1 px-3 py-2 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm Void
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-between p-4 border-t border-gray-200">
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="rounded-lg p-2 hover:bg-gray-100 transition-colors"
              title="Copy"
            >
              <Copy className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <div className="flex gap-2">
            {transaction.status !== "Voided" && !showVoidForm && (
              <button
                onClick={() => setShowVoidForm(true)}
                className="rounded-lg px-3 py-2 text-red-600 hover:bg-red-50 text-sm font-medium"
              >
                Void
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}
