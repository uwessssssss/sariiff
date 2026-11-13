"use client";

import { ModalWrapper, formatRate } from "../helpers";
import { currencyCode } from "@/lib/api";
import { X } from "lucide-react";
import { type ExchangeSectionVM } from "../useExchangeSection";

export function RateHistoryModal({ vm }: { vm: ExchangeSectionVM }) {
  const { rateHistory, setShowRateHistoryModal, showRateHistoryModal } = vm;
  return (
    <>
      {showRateHistoryModal && (
        <ModalWrapper onClose={() => setShowRateHistoryModal(false)}>
          <div className="bg-white w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Exchange Rate History
              </h3>
              <button aria-label="Close"
                onClick={() => setShowRateHistoryModal(false)}
                className="rounded-lg p-1 hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              {rateHistory.length === 0 ? (
                <p className="text-center text-gray-600 py-8">
                  No rate history available
                </p>
              ) : (
                <div className="overflow-x-auto max-w-full">
                  <table className="w-full text-sm">
                    <thead className="bg-[#E9EEF6]">
                      <tr className="">
                        <th className="text-left py-2 px-2 font-semibold uppercase tracking-wide text-[#334155] text-xs">
                          Date
                        </th>
                        {/* The history holds every currency's rates (USD, EUR, ...);
                            without this column a EUR rate read as a USD one. */}
                        <th className="text-left py-2 px-2 font-semibold uppercase tracking-wide text-[#334155] text-xs">
                          Currency
                        </th>
                        <th className="text-right py-2 px-2 font-semibold text-emerald-700 uppercase tracking-wide text-[#334155] text-xs">
                          Buy Rate
                        </th>
                        <th className="text-right py-2 px-2 font-semibold text-blue-600 uppercase tracking-wide text-[#334155] text-xs">
                          Sell Rate
                        </th>
                        <th className="text-right py-2 px-2 font-semibold text-blue-600 uppercase tracking-wide text-[#334155] text-xs">
                          Spread
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rateHistory.slice(0, 30).map((r: any, i: number) => (
                        <tr
                          key={i}
                          className={`border-b border-gray-100 ${i === 0 ? "bg-blue-50 font-semibold" : ""}`}
                        >
                          <td className="py-2 px-2 text-gray-700">
                            {new Date(
                              r.effectiveFrom || r.createdAt,
                            ).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                            <span className="text-xs text-gray-600 ml-1">
                              {new Date(
                                r.effectiveFrom || r.createdAt,
                              ).toLocaleTimeString("en-GB", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-slate-700">
                            {r.foreignCurrencyCode || currencyCode(r.foreignCurrency ?? 1)}
                          </td>
                          <td className="py-2 px-2 text-right text-emerald-700">
                            {formatRate(r.buyRate || 0)}
                          </td>
                          <td className="py-2 px-2 text-right text-blue-700">
                            {formatRate(r.sellRate || 0)}
                          </td>
                          <td className="py-2 px-2 text-right text-blue-700">
                            {formatRate((r.sellRate || 0) - (r.buyRate || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </ModalWrapper>
      )}
    </>
  );
}
