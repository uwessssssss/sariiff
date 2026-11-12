"use client";

import { ExchangeRateDto } from "@/lib/api";
import { Loader2, X } from "lucide-react";
import { ModalWrapper, foreignTradeCurrencies } from "../helpers";
import { useBaseCurrency } from "@/lib/useBaseCurrency";
import { useState } from "react";

// ==============================================
// Modal Components
// ==============================================

// Set Rate Modal
export function SetRateModal({
  currentRate,
  onClose,
  onSubmit,
  loading,
}: {
  currentRate: ExchangeRateDto | null;
  onClose: () => void;
  onSubmit: (buyRate: number, sellRate: number, foreignCurrency: number) => void;
  loading: boolean;
}) {
  // Which foreign currency this rate quotes against the home currency
  // (rates are "home per 1 foreign"), so the home currency isn't an option.
  const { base, baseCode } = useBaseCurrency();
  const FOREIGN_CURRENCIES = foreignTradeCurrencies(base);
  const [foreignCurrency, setForeignCurrency] = useState(1); // default USD
  const activeCode =
    FOREIGN_CURRENCIES.find((c) => c.value === foreignCurrency)?.code || "USD";

  const [buyRate, setBuyRate] = useState(
    currentRate?.buyRate?.toString() || "130",
  );
  const [sellRate, setSellRate] = useState(
    currentRate?.sellRate?.toString() || "140",
  );

  const spread = parseFloat(sellRate || "0") - parseFloat(buyRate || "0");
  const isValid =
    parseFloat(buyRate) > 0 && parseFloat(sellRate) > parseFloat(buyRate);

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Set Exchange Rate
          </h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency (vs {baseCode})
            </label>
            <div className="grid grid-cols-3 gap-2">
              {FOREIGN_CURRENCIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForeignCurrency(c.value)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold border transition-colors ${
                    foreignCurrency === c.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  {c.code}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Each currency keeps its own independent rate.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Buy Rate ({baseCode} per {activeCode})
            </label>
            <input
              type="number"
              step="0.01"
              value={buyRate}
              onChange={(e: any) => setBuyRate(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="130.00"
            />
            <p className="text-xs text-gray-600 mt-1">
              Rate when client sells {activeCode} to you
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sell Rate ({baseCode} per {activeCode})
            </label>
            <input
              type="number"
              step="0.01"
              value={sellRate}
              onChange={(e: any) => setSellRate(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="140.00"
            />
            <p className="text-xs text-gray-600 mt-1">
              Rate when client buys {activeCode} from you
            </p>
          </div>
          {spread > 0 && (
            <div className="bg-blue-50 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Spread:</span>
                <span className="font-semibold text-blue-700">
                  {spread.toFixed(2)} {baseCode}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Your profit per {activeCode} exchanged
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
            onClick={() =>
              onSubmit(parseFloat(buyRate), parseFloat(sellRate), foreignCurrency)
            }
            disabled={!isValid || loading}
            className="rounded-lg px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Set Rate
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
