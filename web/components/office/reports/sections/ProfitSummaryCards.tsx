"use client";

import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, CheckCircle, Coins, Target, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { type ReportsVM } from "../useReports";

export function ProfitSummaryCards({ vm }: { vm: ReportsVM }) {
  const { baseCode, loading, profitLossData, reportType } = vm;
  if (loading) return null;
  if (!(reportType === "profit")) return null;
  if (!profitLossData) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Total Income */}
                      <div className="relative overflow-hidden bg-emerald-700 p-6 text-white">
                        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full" />
                        <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-white/5 rounded-full" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-2">
                            <ArrowUpRight className="w-5 h-5 text-emerald-100" />
                            <span className="text-sm font-medium text-emerald-100">
                              Total Income
                            </span>
                          </div>
                          <p className="text-3xl font-semibold">
                            {baseCode} {profitLossData.totalIncome.toLocaleString()}
                          </p>
                          <div className="mt-2 flex items-center gap-1 text-emerald-100 text-sm">
                            <TrendingUp className="w-4 h-4" />
                            <span>All revenue sources</span>
                          </div>
                        </div>
                      </div>

                      {/* Total Expenses */}
                      <div className="relative overflow-hidden bg-red-600 p-6 text-white">
                        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full" />
                        <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-white/5 rounded-full" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-2">
                            <ArrowDownRight className="w-5 h-5 text-red-200" />
                            <span className="text-sm font-medium text-white">
                              Total Expenses
                            </span>
                          </div>
                          <p className="text-3xl font-semibold">
                            {baseCode} {profitLossData.totalExpenses.toLocaleString()}
                          </p>
                          <div className="mt-2 flex items-center gap-1 text-white text-sm">
                            <TrendingDown className="w-4 h-4" />
                            <span>All outflows</span>
                          </div>
                        </div>
                      </div>

                      {/* Exchange Profit */}
                      <div className="relative overflow-hidden bg-amber-700 p-6 text-white">
                        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full" />
                        <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-white/5 rounded-full" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-2">
                            <ArrowLeftRight className="w-5 h-5 text-amber-50" />
                            <span className="text-sm font-medium text-amber-100">
                              Exchange Profit
                            </span>
                          </div>
                          <p className="text-3xl font-semibold">
                            {baseCode} {profitLossData.exchangeProfit.toLocaleString()}
                          </p>
                          <div className="mt-2 flex items-center gap-1 text-amber-100 text-sm">
                            <Coins className="w-4 h-4" />
                            <span>Currency exchange</span>
                          </div>
                        </div>
                      </div>

                      {/* Net Profit */}
                      <div
                        className={`relative overflow-hidden p-6 text-white ${
                          profitLossData.netProfit >= 0
                            ? "bg-blue-600"
                            : "bg-red-700"
                        }`}
                      >
                        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full" />
                        <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-white/5 rounded-full" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="w-5 h-5 text-white" />
                            <span className="text-sm font-medium text-white">
                              Net Profit
                            </span>
                          </div>
                          <p className="text-3xl font-semibold">
                            {profitLossData.netProfit >= 0 ? "+" : "−"}{baseCode}{" "}
                            {Math.abs(profitLossData.netProfit).toLocaleString()}
                          </p>
                          <div className="mt-2 flex items-center gap-1 text-white text-sm">
                            {profitLossData.netProfit >= 0 ? (
                              <>
                                <CheckCircle className="w-4 h-4" />
                                <span>Profitable</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-4 h-4" />
                                <span>Loss</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
  );
}
