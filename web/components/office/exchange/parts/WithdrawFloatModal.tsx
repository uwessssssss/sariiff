"use client";

import { Account, ModalWrapper, allFloatCurrencies, floatBalanceOf } from "../helpers";
import { Currency, ExchangeFloatDto, currencyCode, formatNumber } from "@/lib/api";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useBaseCurrency } from "@/lib/useBaseCurrency";
import { useEffect, useState } from "react";

// Withdraw Float Modal
export function WithdrawFloatModal({
  accounts,
  exchangeFloat,
  onClose,
  onSubmit,
  loading,
}: {
  accounts: Account[];
  exchangeFloat: ExchangeFloatDto | null;
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const { base } = useBaseCurrency();
  const [currency, setCurrency] = useState<Currency>(base);
  const [amount, setAmount] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [notes, setNotes] = useState("");

  const availableBalance = floatBalanceOf(exchangeFloat, currency, base);

  // FIXED: Only allow accounts that match the withdrawal currency
  // This prevents currency mismatch issues
  const filteredAccounts = accounts.filter((a) => a.currency === currency);

  const selectedAccount = accounts.find((a) => a.id === destinationAccountId);

  // Reset destination when currency changes (to avoid mismatched selection)
  useEffect(() => {
    setDestinationAccountId("");
  }, [currency]);

  const amountNum = parseFloat(amount) || 0;

  // FIXED: Enhanced validation
  const isValid =
    amountNum > 0 &&
    amountNum <= availableBalance &&
    destinationAccountId &&
    selectedAccount &&
    selectedAccount.currency === currency; // Ensure currency match

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Withdraw from Float
          </h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            <div className="grid grid-cols-4 gap-2">
              {allFloatCurrencies(base).map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCurrency(c.value as Currency)}
                  className={`rounded-lg px-3 py-2 border text-sm font-medium ${
                    currency === c.value
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {c.code} ({formatNumber(floatBalanceOf(exchangeFloat, c.value, base))})
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount (Available: {currencyCode(currency)}{" "}
              {formatNumber(availableBalance)})
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e: any) => setAmount(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
            {amountNum > availableBalance && (
              <p className="text-xs text-red-600 mt-1">
                Amount exceeds available balance
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Destination Account ({currencyCode(currency)}{" "}
              accounts only)
            </label>
            <select
              value={destinationAccountId}
              onChange={(e: any) => setDestinationAccountId(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select destination...</option>
              {filteredAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (Balance: {currencyCode(currency)}{" "}
                  {formatNumber(a.balance)})
                </option>
              ))}
            </select>
            {filteredAccounts.length === 0 && (
              <p className="text-xs text-amber-700 mt-1">
                No {currencyCode(currency)} accounts
                available
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e: any) => setNotes(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional notes"
            />
          </div>

          {/* Summary */}
          {selectedAccount && amountNum > 0 && (
            <div className="bg-amber-50 border border-amber-200 p-3 space-y-1 rounded-lg">
              <p className="text-sm font-medium text-amber-800">
                Transfer Summary
              </p>
              <p className="text-xs text-amber-700">
                From: Exchange Float (
                {currencyCode(currency)})
              </p>
              <p className="text-xs text-amber-700">
                To: {selectedAccount.name}
              </p>
              <p className="text-xs text-amber-700 font-medium">
                Amount: {currencyCode(currency)}{" "}
                {formatNumber(amountNum)}
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!selectedAccount) {
                toast.error("Please select a valid destination account");
                return;
              }
              onSubmit({
                currency,
                amount: amountNum,
                destinationType: selectedAccount.type,
                destinationAccountId,
                notes: notes || undefined,
              });
            }}
            disabled={!isValid || loading}
            className="rounded-lg px-4 py-2 bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Withdraw
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
