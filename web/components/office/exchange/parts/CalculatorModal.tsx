"use client";

import { Currency, ExchangeDirection, ExchangeRateDto, formatNumber } from "@/lib/api";
import { ModalWrapper, foreignTradeCurrencies, formatRate } from "../helpers";
import { X } from "lucide-react";
import { useBaseCurrency } from "@/lib/useBaseCurrency";
import { useState } from "react";
import { useProfitPreview } from "./useProfitPreview";

// Calculator Modal
export function CalculatorModal({
  rates,
  onClose,
}: {
  rates: Record<number, ExchangeRateDto>;
  onClose: () => void;
}) {
  const { base, baseCode } = useBaseCurrency();
  const rateCurrencies = foreignTradeCurrencies(base).filter((c) => rates[c.value]);
  const [foreignCurrency, setForeignCurrency] = useState<number>(
    rateCurrencies[0]?.value ?? Currency.USD,
  );
  const fx = foreignTradeCurrencies(base).find((c) => c.value === foreignCurrency)?.code ?? "USD";
  const currentRate: ExchangeRateDto = rates[foreignCurrency] ?? { buyRate: 0, sellRate: 0 } as ExchangeRateDto;
  const [direction, setDirection] = useState<ExchangeDirection>(
    ExchangeDirection.UsdToKes,
  );
  const [amount, setAmount] = useState("");

  const rate =
    direction === ExchangeDirection.UsdToKes
      ? currentRate.buyRate
      : currentRate.sellRate;
  const amountNum = parseFloat(amount) || 0;

  const receivedAmount =
    Math.round(
      (direction === ExchangeDirection.UsdToKes
        ? amountNum * rate
        : amountNum / (rate || 1)) * 100,
    ) / 100;

  // What the server will book: nothing on a purchase, average-cost profit on a sale.
  const profit = useProfitPreview(amountNum, direction, foreignCurrency);

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Quick Calculator
          </h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {foreignTradeCurrencies(base).map((c) => (
              <button
                key={c.value}
                disabled={!rates[c.value]}
                title={rates[c.value] ? undefined : `No ${c.code} rate set`}
                onClick={() => setForeignCurrency(c.value)}
                className={`rounded-lg px-3 py-2 border text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                  foreignCurrency === c.value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-gray-200 text-gray-700"
                }`}
              >
                {c.code}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDirection(ExchangeDirection.UsdToKes)}
              className={`rounded-lg px-4 py-3 border text-sm font-medium ${
                direction === ExchangeDirection.UsdToKes
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-700"
              }`}
            >
              {fx} → {baseCode}
            </button>
            <button
              onClick={() => setDirection(ExchangeDirection.KesToUsd)}
              className={`rounded-lg px-4 py-3 border text-sm font-medium ${
                direction === ExchangeDirection.KesToUsd
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-700"
              }`}
            >
              {baseCode} → {fx}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {direction === ExchangeDirection.UsdToKes
                ? `${fx} amount`
                : `${baseCode} amount`}
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e: any) => setAmount(e.target.value)}
              className="rounded-lg w-full px-3 py-3 border border-gray-200 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>

          <div className="bg-gray-50 p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Rate</span>
              <span className="font-semibold">{formatRate(rate)}</span>
            </div>
            <div className="flex justify-between text-lg">
              <span className="text-gray-600">Client Receives</span>
              <span className="font-semibold text-blue-600">
                {direction === ExchangeDirection.UsdToKes
                  ? `${baseCode} ${formatNumber(receivedAmount)}`
                  : `${fx} ${formatNumber(receivedAmount)}`}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-200">
              <span className="text-gray-600">Your Profit</span>
              <span className={`font-semibold ${profit != null && profit < 0 ? "text-red-600" : "text-emerald-700"}`}>
                {direction === ExchangeDirection.UsdToKes
                  ? "None on a purchase (booked when sold)"
                  : profit == null
                    ? "…"
                    : `${baseCode} ${formatNumber(profit)}`}
              </span>
            </div>
          </div>
        </div>
        <div className="flex justify-end p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
