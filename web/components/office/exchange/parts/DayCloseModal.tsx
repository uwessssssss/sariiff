"use client";

import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { type CurrencyCountDto, DailySummaryDto, ExchangeFloatDto, formatNumber } from "@/lib/api";
import { ModalWrapper } from "../helpers";
import { useBaseCurrency } from "@/lib/useBaseCurrency";
import { useState } from "react";

// Day Close Modal
export function DayCloseModal({
  exchangeFloat,
  todaySummary,
  onClose,
  onOpening,
  onClosing,
  loading,
}: {
  exchangeFloat: ExchangeFloatDto | null;
  todaySummary: DailySummaryDto | null;
  onClose: () => void;
  onOpening: (kesCount: number, usdCount: number, notes?: string, otherCounts?: CurrencyCountDto[]) => void;
  onClosing: (kesCount: number, usdCount: number, notes?: string, otherCounts?: CurrencyCountDto[]) => void;
  loading: boolean;
}) {
  const { baseCode } = useBaseCurrency();
  const [mode, setMode] = useState<"opening" | "closing">("opening");
  const [kesCount, setKesCount] = useState("");
  const [usdCount, setUsdCount] = useState("");
  const [notes, setNotes] = useState("");
  // UGX, EUR, ... the float holds — each needs its own physical count
  const others = exchangeFloat?.otherBalances || [];
  const [otherCounts, setOtherCounts] = useState<Record<number, string>>({});
  const otherCountList: CurrencyCountDto[] = others.map((o) => ({
    currency: o.currency,
    count: parseFloat(otherCounts[o.currency] ?? "") || 0,
  }));
  const otherVariances = others.map((o) => ({
    code: o.currencyCode,
    currency: o.currency,
    variance: (parseFloat(otherCounts[o.currency] ?? "") || 0) - o.balance,
    entered: (otherCounts[o.currency] ?? "") !== "",
  }));

  const expectedKes = exchangeFloat?.kesBalance || 0;
  const expectedUsd = exchangeFloat?.usdBalance || 0;

  const kesCountNum = parseFloat(kesCount) || 0;
  const usdCountNum = parseFloat(usdCount) || 0;

  const kesVariance = kesCountNum - expectedKes;
  const usdVariance = usdCountNum - expectedUsd;

  const isValid =
    kesCount !== "" && usdCount !== "" && others.every((o) => (otherCounts[o.currency] ?? "") !== "");

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Daily Float Verification
          </h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* Opening / Closing Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode("opening")}
              className={`rounded-lg flex items-center justify-center gap-2 px-4 py-3 border text-sm font-medium transition-colors ${
                mode === "opening"
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              ☀️ Record Opening
            </button>
            <button
              onClick={() => setMode("closing")}
              className={`rounded-lg flex items-center justify-center gap-2 px-4 py-3 border text-sm font-medium transition-colors ${
                mode === "closing"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              🌙 Record Closing
            </button>
          </div>

          <p className="text-xs text-gray-600">
            {mode === "opening"
              ? "Count physical cash at the start of the day to verify overnight integrity."
              : "Count physical cash at end of day and compare with system balances."}
          </p>

          {/* Today's Summary — only show for closing */}
          {mode === "closing" && todaySummary && (
            <div className="bg-blue-50 p-4 space-y-2">
              <h4 className="text-sm font-medium text-blue-900">
                Today's Activity
              </h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-blue-600">Exchanges</p>
                  <p className="font-semibold text-blue-900">
                    {todaySummary.exchangeCount}
                  </p>
                </div>
                <div>
                  <p className="text-blue-600">{baseCode} Profit</p>
                  <p className="font-semibold text-blue-900">
                    {formatNumber(todaySummary.kesProfit)}
                  </p>
                </div>
                <div>
                  <p className="text-blue-600">USD Profit</p>
                  <p className="font-semibold text-blue-900">
                    ${formatNumber(todaySummary.usdProfit)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Expected vs Actual */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {baseCode} Physical Count *
              </label>
              <input
                type="number"
                value={kesCount}
                onChange={(e: any) => setKesCount(e.target.value)}
                className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`Count physical ${baseCode}`}
              />
              <p className="text-xs text-gray-600 mt-1">
                System: {baseCode} {formatNumber(expectedKes)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                USD Physical Count *
              </label>
              <input
                type="number"
                value={usdCount}
                onChange={(e: any) => setUsdCount(e.target.value)}
                className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Count physical USD"
              />
              <p className="text-xs text-gray-600 mt-1">
                System: ${formatNumber(expectedUsd)}
              </p>
            </div>
            {others.map((o) => (
              <div key={o.currency}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {o.currencyCode} Physical Count *
                </label>
                <input
                  type="number"
                  value={otherCounts[o.currency] ?? ""}
                  onChange={(e: any) =>
                    setOtherCounts((prev) => ({ ...prev, [o.currency]: e.target.value }))
                  }
                  className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`Count physical ${o.currencyCode}`}
                />
                <p className="text-xs text-gray-600 mt-1">
                  System: {o.currencyCode} {formatNumber(o.balance)}
                </p>
              </div>
            ))}
          </div>

          {/* Variance — show for closing mode */}
          {mode === "closing" && kesCount !== "" && usdCount !== "" && (
            <div
              className={`p-4 ${kesVariance === 0 && usdVariance === 0 && otherVariances.every((v) => !v.entered || v.variance === 0) ? "bg-emerald-50" : "bg-amber-50"}`}
            >
              <h4 className="text-sm font-medium mb-2">Variance</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex justify-between">
                  <span className="text-sm">{baseCode}:</span>
                  <span
                    className={`font-medium ${kesVariance === 0 ? "text-emerald-700" : kesVariance > 0 ? "text-blue-600" : "text-red-600"}`}
                  >
                    {kesVariance > 0 ? "+" : ""}
                    {formatNumber(kesVariance)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">USD:</span>
                  <span
                    className={`font-medium ${usdVariance === 0 ? "text-emerald-700" : usdVariance > 0 ? "text-blue-600" : "text-red-600"}`}
                  >
                    {usdVariance > 0 ? "+" : ""}
                    {formatNumber(usdVariance)}
                  </span>
                </div>
                {otherVariances
                  .filter((v) => v.entered)
                  .map((v) => (
                    <div key={v.currency} className="flex justify-between">
                      <span className="text-sm">{v.code}:</span>
                      <span
                        className={`font-medium ${v.variance === 0 ? "text-emerald-700" : v.variance > 0 ? "text-blue-600" : "text-red-600"}`}
                      >
                        {v.variance > 0 ? "+" : ""}
                        {formatNumber(v.variance)}
                      </span>
                    </div>
                  ))}
              </div>
              {(kesVariance !== 0 || usdVariance !== 0 || otherVariances.some((v) => v.entered && v.variance !== 0)) && (
                <p className="text-xs text-amber-700 mt-2">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  Variance detected. Please verify your count.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e: any) => setNotes(e.target.value)}
              className="rounded-lg w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder={
                mode === "opening"
                  ? "Opening notes..."
                  : "Closing notes, discrepancies..."
              }
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
              mode === "opening"
                ? onOpening(kesCountNum, usdCountNum, notes || undefined, otherCountList)
                : onClosing(kesCountNum, usdCountNum, notes || undefined, otherCountList)
            }
            disabled={!isValid || loading}
            className={`rounded-lg px-6 py-2 text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2 ${
              mode === "opening"
                ? "bg-amber-700 hover:bg-amber-800"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            {mode === "opening" ? "☀️ Record Opening" : "🌙 Record Closing"}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
