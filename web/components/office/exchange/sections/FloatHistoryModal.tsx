"use client";

import { ModalWrapper } from "../helpers";
import { X } from "lucide-react";
import { formatNumber } from "@/lib/api";
import { type ExchangeSectionVM } from "../useExchangeSection";

export function FloatHistoryModal({ vm }: { vm: ExchangeSectionVM }) {
  const { baseCode, floatHistory, setShowFloatHistory, showFloatHistory } = vm;
  return (
    <>
{showFloatHistory && (
          <ModalWrapper onClose={() => setShowFloatHistory(false)}>
            <div className="bg-white w-full max-w-2xl">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  📅 Float History — This Month
                </h3>
                <button aria-label="Close"
                  onClick={() => setShowFloatHistory(false)}
                  className="rounded-lg p-1 hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              <div className="p-4 max-h-96 overflow-y-auto">
                {floatHistory.length === 0 ? (
                  <p className="text-center text-gray-600 py-8">
                    No daily records this month. Start by recording an opening
                    float.
                  </p>
                ) : (
                  <div className="overflow-x-auto max-w-full">
                    <table className="w-full text-sm">
                      <thead className="bg-[#E9EEF6]">
                        <tr className="text-left">
                          <th className="py-2 px-2 font-semibold uppercase tracking-wide text-[#334155] text-xs">
                            Date
                          </th>
                          <th className="py-2 px-2 font-semibold text-center uppercase tracking-wide text-[#334155] text-xs">
                            Status
                          </th>
                          <th className="py-2 px-2 font-semibold text-right uppercase tracking-wide text-[#334155] text-xs">
                            Exchanges
                          </th>
                          <th className="py-2 px-2 font-semibold text-emerald-700 text-right uppercase tracking-wide text-[#334155] text-xs">
                            {baseCode} Profit
                          </th>
                          <th className="py-2 px-2 font-semibold text-blue-600 text-right uppercase tracking-wide text-[#334155] text-xs">
                            USD Profit
                          </th>
                          <th className="py-2 px-2 font-semibold text-right uppercase tracking-wide text-[#334155] text-xs">
                            {baseCode} Var
                          </th>
                          <th className="py-2 px-2 font-semibold text-right uppercase tracking-wide text-[#334155] text-xs">
                            USD Var
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {floatHistory.map((day: any, i: number) => (
                          <tr
                            key={i}
                            className={`border-b border-gray-100 ${i === 0 ? "bg-[#E9EEF6]" : ""}`}
                          >
                            <td className="py-2 px-2 text-gray-700 font-medium">
                              {new Date(day.date).toLocaleDateString("en-GB", {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              })}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span
                                className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                  day.isClosed
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {day.isClosed ? "Closed" : "Open"}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right text-gray-700">
                              {day.exchangeCount || 0}
                            </td>
                            <td className="py-2 px-2 text-right text-emerald-700 font-medium">
                              {formatNumber(day.kesProfit || 0)}
                            </td>
                            <td className="py-2 px-2 text-right text-blue-700 font-medium">
                              ${formatNumber(day.usdProfit || 0)}
                            </td>
                            <td
                              className={`py-2 px-2 text-right font-medium ${(day.kesVariance || 0) === 0 ? "text-gray-600" : (day.kesVariance || 0) > 0 ? "text-blue-600" : "text-red-700"}`}
                            >
                              {(day.kesVariance || 0) === 0
                                ? "—"
                                : formatNumber(day.kesVariance)}
                            </td>
                            <td
                              className={`py-2 px-2 text-right font-medium ${(day.usdVariance || 0) === 0 ? "text-gray-600" : (day.usdVariance || 0) > 0 ? "text-blue-600" : "text-red-700"}`}
                            >
                              {(day.usdVariance || 0) === 0
                                ? "—"
                                : formatNumber(day.usdVariance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-300 font-semibold bg-gray-50">
                          <td className="py-2 px-2 text-gray-700">Total</td>
                          <td className="py-2 px-2 text-center text-gray-600 text-xs">
                            {floatHistory.filter((d: any) => d.isClosed).length}
                            /{floatHistory.length} closed
                          </td>
                          <td className="py-2 px-2 text-right text-gray-700">
                            {floatHistory.reduce(
                              (s: number, d: any) => s + (d.exchangeCount || 0),
                              0,
                            )}
                          </td>
                          <td className="py-2 px-2 text-right text-emerald-700">
                            {formatNumber(
                              floatHistory.reduce(
                                (s: number, d: any) => s + (d.kesProfit || 0),
                                0,
                              ),
                            )}
                          </td>
                          <td className="py-2 px-2 text-right text-blue-700">
                            $
                            {formatNumber(
                              floatHistory.reduce(
                                (s: number, d: any) => s + (d.usdProfit || 0),
                                0,
                              ),
                            )}
                          </td>
                          <td className="py-2 px-2"></td>
                          <td className="py-2 px-2"></td>
                        </tr>
                      </tfoot>
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
