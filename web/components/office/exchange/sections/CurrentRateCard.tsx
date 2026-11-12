"use client";

import { AlertTriangle, DollarSign, Settings, Wallet } from "lucide-react";
import { Currency, formatCurrency, formatNumber } from "@/lib/api";
import { type ExchangeSectionVM } from "../useExchangeSection";

export function CurrentRateCard({ vm }: { vm: ExchangeSectionVM }) {
  const { base, baseCode, currentRate, exchangeFloat, marginPercent, setShowSetRateModal, setShowUsdPositionModal, spread, todaySummary, usdPosition } = vm;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <div className="lg:col-span-1  rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <span className="text-blue-50 text-sm font-medium">
              Current Rate
            </span>
            <button aria-label="Settings"
              onClick={() => setShowSetRateModal(true)}
              className="rounded-lg p-1.5 hover:bg-white/10 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
          {currentRate ? (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-blue-50 text-xs mb-1">Buy Rate</p>
                  <p className="text-2xl font-semibold">
                    {currentRate.buyRate.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-blue-50 text-xs mb-1">Sell Rate</p>
                  <p className="text-2xl font-semibold">
                    {currentRate.sellRate.toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-blue-50">
                  Spread: {spread.toFixed(2)}
                </span>
                <span className="bg-blue-800 px-2 py-0.5 text-xs font-medium">
                  {marginPercent}% margin
                </span>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-blue-50 text-sm mb-2">No rate set</p>
              <button
                onClick={() => setShowSetRateModal(true)}
                className="rounded-lg text-white underline text-sm"
              >
                Set Rate
              </button>
            </div>
          )}
        </div>

        {/* Float Balances */}
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-600 text-sm font-medium">{baseCode} Float</span>
            <Wallet className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-2xl font-semibold text-gray-900 mb-1">
            {formatCurrency(exchangeFloat?.kesBalance || 0, base)}
          </p>
          {exchangeFloat && exchangeFloat.kesBalance < (base === Currency.UGX ? 1400000 : 50000) && (
            <p className="text-xs text-amber-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Low balance
            </p>
          )}
        </div>

        <div
          role="button"
          tabIndex={0}
          className="rounded-xl bg-white border border-gray-200 p-5 cursor-pointer hover:border-blue-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          onClick={() => setShowUsdPositionModal(true)}
          onKeyDown={(e: any) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setShowUsdPositionModal(true);
            }
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-600 text-sm font-medium">
              {(exchangeFloat?.otherBalances || []).length > 0 ? "Foreign float" : "USD Float"}
            </span>
            <DollarSign className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-2xl font-semibold text-gray-900 mb-1">
            ${formatNumber(exchangeFloat?.usdBalance || 0)}
          </p>
          {usdPosition && (
            <p className="text-xs text-gray-600">
              Avg Cost: {usdPosition.averageCostPerUsd.toFixed(2)} {baseCode}
            </p>
          )}
          {/* Other currencies the float holds (UGX, EUR) — shown only when held */}
          {(exchangeFloat?.otherBalances || []).length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
              {(exchangeFloat?.otherBalances || []).map((b) => (
                <div
                  key={b.currency}
                  className="flex items-baseline justify-between text-sm"
                >
                  <span className="text-gray-600">{b.currencyCode}</span>
                  <span className="font-semibold text-gray-900 tabular-nums">
                    {formatNumber(b.balance)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Today's Stats */}
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-600 text-sm font-medium">Today</span>
            <span
              className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                todaySummary?.isClosed
                  ? "bg-emerald-100 text-emerald-700"
                  : todaySummary?.openingKes
                    ? "bg-amber-100 text-amber-700"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              {todaySummary?.isClosed
                ? "✅ Closed"
                : todaySummary?.openingKes
                  ? "☀️ Open"
                  : "⏳ Not Started"}
            </span>
          </div>
          <p className="text-2xl font-semibold text-emerald-600 mb-1">
            {formatCurrency(todaySummary?.kesProfit || 0, base)}
          </p>
          <p className="text-xs text-gray-600 mb-1">
            {todaySummary?.exchangeCount || 0} exchanges | $
            {formatNumber(todaySummary?.usdProfit || 0)} USD profit
          </p>
          {todaySummary?.kesVariance != null &&
            todaySummary.kesVariance !== 0 && (
              <p className="text-xs text-amber-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Variance: {baseCode} {formatNumber(todaySummary.kesVariance)}
              </p>
            )}
        </div>
      </div>
  );
}
