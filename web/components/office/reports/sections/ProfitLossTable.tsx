"use client";

import { Receipt } from "lucide-react";
import { type ReportsVM } from "../useReports";

export function ProfitLossTable({ vm }: { vm: ReportsVM }) {
  const { baseCode, loading, profitLossData, reportType } = vm;
  if (loading) return null;
  if (!(reportType === "profit")) return null;
  if (!profitLossData) return null;
  return (
    <div className="bg-white border border-slate-200 overflow-hidden rounded-lg">
                      <div className="px-6 py-4 bg-slate-50 border-b-2 border-slate-200">
                        <h4 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                          <Receipt className="w-5 h-5 text-blue-600" />
                          Profit & Loss Breakdown
                        </h4>
                      </div>
                      <div className="p-6">
                        <div className="overflow-x-auto max-w-full">
                          <table className="w-full">
                            <thead className="bg-[#E9EEF6]">
                              <tr className="">
                                <th className="pb-3 text-left text-sm font-semibold uppercase tracking-wide text-[#334155]">
                                  Category
                                </th>
                                <th className="pb-3 text-right text-sm font-semibold uppercase tracking-wide text-[#334155]">
                                  Amount ({baseCode})
                                </th>
                                <th className="pb-3 text-right text-sm font-semibold uppercase tracking-wide text-[#334155]">
                                  % of Total
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {/* Income Section */}
                              <tr className="bg-emerald-50">
                                <td
                                  colSpan={3}
                                  className="px-3 py-2 font-semibold text-emerald-700 text-sm uppercase"
                                >
                                  Income
                                </td>
                              </tr>
                              <tr>
                                <td className="py-3 pl-6 text-slate-700">
                                  Exchange Profit
                                </td>
                                <td className="py-3 text-right font-medium text-emerald-700">
                                  +
                                  {profitLossData.exchangeProfit.toLocaleString()}
                                </td>
                                <td className="py-3 text-right text-slate-500">
                                  {profitLossData.totalIncome > 0
                                    ? (
                                        (profitLossData.exchangeProfit /
                                          profitLossData.totalIncome) *
                                        100
                                      ).toFixed(1)
                                    : 0}
                                  %
                                </td>
                              </tr>
                              <tr>
                                <td className="py-3 pl-6 text-slate-700">
                                  Other Income
                                </td>
                                <td className="py-3 text-right font-medium text-emerald-700">
                                  +
                                  {(
                                    profitLossData.totalIncome -
                                    profitLossData.exchangeProfit
                                  ).toLocaleString()}
                                </td>
                                <td className="py-3 text-right text-slate-500">
                                  {profitLossData.totalIncome > 0
                                    ? (
                                        ((profitLossData.totalIncome -
                                          profitLossData.exchangeProfit) /
                                          profitLossData.totalIncome) *
                                        100
                                      ).toFixed(1)
                                    : 0}
                                  %
                                </td>
                              </tr>
                              <tr className="bg-emerald-100 font-semibold">
                                <td className="py-3 pl-3 text-emerald-800">
                                  Total Income
                                </td>
                                <td className="py-3 text-right text-emerald-700">
                                  {profitLossData.totalIncome.toLocaleString()}
                                </td>
                                <td className="py-3 text-right text-emerald-700">
                                  100%
                                </td>
                              </tr>

                              {/* Expenses Section */}
                              <tr className="bg-red-50">
                                <td
                                  colSpan={3}
                                  className="px-3 py-2 font-semibold text-red-700 text-sm uppercase"
                                >
                                  Expenses
                                </td>
                              </tr>
                              <tr>
                                <td className="py-3 pl-6 text-slate-700">
                                  Operating Expenses
                                </td>
                                <td className="py-3 text-right font-medium text-red-600">
                                  -
                                  {profitLossData.totalExpenses.toLocaleString()}
                                </td>
                                <td className="py-3 text-right text-slate-500">
                                  100%
                                </td>
                              </tr>
                              <tr className="bg-red-100 font-semibold">
                                <td className="py-3 pl-3 text-red-800">
                                  Total Expenses
                                </td>
                                <td className="py-3 text-right text-red-700">
                                  -
                                  {profitLossData.totalExpenses.toLocaleString()}
                                </td>
                                <td className="py-3 text-right text-red-700">
                                  100%
                                </td>
                              </tr>

                              {/* Net Profit */}
                              <tr
                                className={`font-semibold text-lg ${
                                  profitLossData.netProfit >= 0
                                    ? "bg-[#E9EEF6]"
                                    : "bg-slate-200"
                                }`}
                              >
                                <td
                                  className={`py-4 pl-3 ${
                                    profitLossData.netProfit >= 0
                                      ? "text-[#0F172A]"
                                      : "text-slate-800"
                                  }`}
                                >
                                  NET PROFIT / (LOSS)
                                </td>
                                <td
                                  className={`py-4 text-right ${
                                    profitLossData.netProfit >= 0
                                      ? "text-[#0F172A]"
                                      : "text-red-700"
                                  }`}
                                >
                                  {profitLossData.netProfit >= 0 ? "+" : ""}
                                  {profitLossData.netProfit.toLocaleString()}
                                </td>
                                <td
                                  className={`py-4 text-right ${
                                    profitLossData.netProfit >= 0
                                      ? "text-blue-700"
                                      : "text-red-700"
                                  }`}
                                >
                                  {profitLossData.totalIncome > 0
                                    ? (
                                        (profitLossData.netProfit /
                                          profitLossData.totalIncome) *
                                        100
                                      ).toFixed(1)
                                    : 0}
                                  %
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
  );
}
