"use client";

import { Account, ModalWrapper, allFloatCurrencies } from "../helpers";
import { Currency, currencyCode, formatCurrency, formatNumber } from "@/lib/api";
import { Loader2, X } from "lucide-react";
import { useBaseCurrency } from "@/lib/useBaseCurrency";
import { useState } from "react";

// Fund Float Modal
export function FundFloatModal({
  accounts,
  onClose,
  onSubmit,
  loading,
}: {
  accounts: Account[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  loading: boolean;
}) {
  const { base, baseCode } = useBaseCurrency();
  const [currency, setCurrency] = useState<Currency>(base);
  const [amount, setAmount] = useState("");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [purchaseRate, setPurchaseRate] = useState("");
  const [notes, setNotes] = useState("");

  // Two ways to stock a foreign float: move money already held in that currency (a USD
  // till / bank — no rate needed), or buy it with home-currency money at a purchase rate.
  const filteredAccounts = accounts.filter((a) => a.currency === base || a.currency === currency);
  const selectedAccount = filteredAccounts.find((a) => a.id === sourceAccountId);
  const sameCurrency = !!selectedAccount && selectedAccount.currency === currency;

  const amountNum = parseFloat(amount) || 0;
  const deductAmount =
    currency !== base && !sameCurrency && purchaseRate
      ? amountNum * parseFloat(purchaseRate)
      : amountNum;

  const isValid =
    amountNum > 0 &&
    sourceAccountId &&
    (currency === base || sameCurrency || purchaseRate);

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Fund Float</h3>
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
                  {c.code}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e: any) => setAmount(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>

          {currency !== base && !sameCurrency && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Purchase Rate
              </label>
              <input
                type="number"
                step="any"
                value={purchaseRate}
                onChange={(e: any) => setPurchaseRate(e.target.value)}
                className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`${baseCode} paid per 1 ${currencyCode(currency)}`}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source Account
            </label>
            <select
              value={sourceAccountId}
              onChange={(e: any) => setSourceAccountId(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select source...</option>
              {filteredAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} - {formatCurrency(a.balance, a.currency)}
                </option>
              ))}
            </select>
          </div>

          {amountNum > 0 && selectedAccount && (
            <div className="bg-gray-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Will deduct:</span>
                <span className="font-medium">
                  {sameCurrency ? currencyCode(currency) : baseCode} {formatNumber(deductAmount)}
                </span>
              </div>
            </div>
          )}

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
                sourceType: selectedAccount?.type,
                sourceAccountId,
                purchaseRate:
                  currency !== base && !sameCurrency
                    ? parseFloat(purchaseRate)
                    : undefined,
                notes: notes || undefined,
              })
            }
            disabled={!isValid || loading}
            className="rounded-lg px-4 py-2 bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Fund Float
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
