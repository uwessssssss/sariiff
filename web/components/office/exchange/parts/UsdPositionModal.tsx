"use client";

import { ModalWrapper } from "../helpers";
import { UsdPositionDto, formatNumber } from "@/lib/api";
import { X } from "lucide-react";
import { useBaseCurrency } from "@/lib/useBaseCurrency";

// USD Position Modal
export function UsdPositionModal({
  position,
  onClose,
}: {
  position: UsdPositionDto;
  onClose: () => void;
}) {
  const { baseCode } = useBaseCurrency();
  const isProfitable = position.unrealizedPnL >= 0;

  return (
    <ModalWrapper onClose={onClose}>
      <div className="bg-white w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">USD Position</h3>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-3">
              <p className="text-xs text-gray-600 mb-1">USD Balance</p>
              <p className="text-xl font-semibold text-gray-900">
                ${formatNumber(position.usdBalance)}
              </p>
            </div>
            <div className="bg-gray-50 p-3">
              <p className="text-xs text-gray-600 mb-1">Average Cost</p>
              <p className="text-xl font-semibold text-gray-900">
                {position.averageCostPerUsd.toFixed(2)} {baseCode}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Cost Basis</span>
              <span className="font-medium">
                {baseCode} {formatNumber(position.totalCostBasis)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Current Market Rate</span>
              <span className="font-medium">
                {position.currentMarketRate.toFixed(2)} {baseCode}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Current Market Value</span>
              <span className="font-medium">
                {baseCode} {formatNumber(position.currentMarketValue)}
              </span>
            </div>
          </div>

          <div
            className={`p-4 ${isProfitable ? "bg-emerald-50" : "bg-red-50"}`}
          >
            <div className="flex justify-between items-center">
              <span
                className={`text-sm ${
                  isProfitable ? "text-emerald-700" : "text-red-700"
                }`}
              >
                Unrealized P&L
              </span>
              <div className="text-right">
                <p
                  className={`text-xl font-semibold ${
                    isProfitable ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {isProfitable ? "+" : ""}{baseCode}{" "}
                  {formatNumber(position.unrealizedPnL)}
                </p>
                <p
                  className={`text-sm ${
                    isProfitable ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  ({isProfitable ? "+" : ""}
                  {position.unrealizedPnLPercent.toFixed(2)}%)
                </p>
              </div>
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
