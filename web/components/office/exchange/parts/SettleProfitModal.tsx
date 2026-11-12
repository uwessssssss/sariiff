"use client";

import { Account, ModalWrapper } from "../helpers";
import { Currency, ExchangeFloatDto, currencyCode, formatNumber } from "@/lib/api";
import { Loader2, X } from "lucide-react";
import { useBaseCurrency } from "@/lib/useBaseCurrency";
import { useState } from "react";

// Settle Profit Modal
export function SettleProfitModal({
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
  const { base, baseCode } = useBaseCurrency();
  const [currency, setCurrency] = useState<Currency>(base);
  const [amount, setAmount] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [notes, setNotes] = useState("");

  const availableProfit =
    currency === base
      ? exchangeFloat?.kesProfit || 0
      : exchangeFloat?.usdProfit || 0;

  const filteredAccounts = accounts.filter((a) => a.currency === currency);
  const selectedAccount = accounts.find((a) => a.id === destinationAccountId);

  const amountNum = parseFloat(amount) || 0;
  const isValid =
    amountNum > 0 && amountNum <= availableProfit && destinationAccountId;

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Settle Profit</h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-emerald-50 p-4">
            <p className="text-sm text-emerald-700 mb-2">Available Profit</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-emerald-700">{baseCode}</p>
                <p className="text-xl font-semibold text-emerald-700">
                  {formatNumber(exchangeFloat?.kesProfit || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-emerald-700">USD</p>
                <p className="text-xl font-semibold text-emerald-700">
                  ${formatNumber(exchangeFloat?.usdProfit || 0)}
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCurrency(base)}
                className={`rounded-lg px-4 py-2 border text-sm font-medium ${
                  currency === base
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {baseCode}
              </button>
              <button
                type="button"
                onClick={() => setCurrency(Currency.USD)}
                className={`rounded-lg px-4 py-2 border text-sm font-medium ${
                  currency === Currency.USD
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                USD
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount (Available: {currencyCode(currency)}{" "}
              {formatNumber(availableProfit)})
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e: any) => setAmount(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
            <button
              type="button"
              onClick={() => setAmount(availableProfit.toString())}
              className="rounded-lg text-xs text-blue-600 mt-1 hover:underline"
            >
              Settle all
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Destination Account
            </label>
            <select
              value={destinationAccountId}
              onChange={(e: any) => setDestinationAccountId(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select destination...</option>
              {filteredAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
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
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                currency,
                amount: amountNum,
                destinationType: selectedAccount?.type,
                destinationAccountId,
                notes: notes || undefined,
              })
            }
            disabled={!isValid || loading}
            className="rounded-lg px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Settle Profit
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
