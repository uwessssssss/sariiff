"use client";

import { Activity, Banknote, BarChart3, CircleDollarSign, Loader2, Target, TrendingUp, Zap } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart as RechartPieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "../helpers";
import { motion } from "framer-motion";
import { type ClientUserDashboardVM } from "../useClientUserDashboard";

export function AnalyticsView({ vm }: { vm: ClientUserDashboardVM }) {
  const { activeView, analytics, analyticsCode, analyticsCur, avgIn, categoryChartData, loadingAnalytics, monthlyChartData, netIncomeIn, setAnalyticsCurrency, statementCurrencies, weeklyChartData } = vm;
  return (
    <>
{activeView === "analytics" && (
              <motion.div
                key="analytics"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div>
                  <h1 className="text-2xl font-semibold      text-slate-900 tracking-tight">
                    Account Analytics
                  </h1>
                  <p className="text-slate-600 mt-2">
                    Deep insights into your financial performance
                  </p>
                  {statementCurrencies.length > 1 && (
                    <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Currency">
                      {statementCurrencies.map((c) => (
                        <button
                          key={c.code}
                          onClick={() => setAnalyticsCurrency(c.value)}
                          aria-pressed={analyticsCode === c.code}
                          className={`rounded-md px-3 py-1 text-sm font-semibold ${
                            analyticsCode === c.code ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800"
                          }`}
                        >
                          {c.code}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {loadingAnalytics ? (
                  <div className="p-12 text-center">
                    <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mx-auto mb-4" />
                    <p className="text-slate-600">Loading analytics...</p>
                  </div>
                ) : !analytics ? (
                  <div className="rounded-xl bg-white  border border-slate-200 p-12 text-center ">
                    <BarChart3 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-slate-700 mb-2">
                      No Analytics Data
                    </h3>
                    <p className="text-slate-600">
                      Start making transactions to see analytics
                    </p>
                  </div>
                ) : (
                  <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="rounded-xl bg-white  border border-blue-200 hover:border-blue-400 p-6 transition-all ">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-12 h-12  bg-blue-500  flex items-center justify-center ">
                            <TrendingUp className="w-6 h-6 text-white" />
                          </div>
                          <span className="text-sm font-bold text-emerald-700 flex items-center gap-1">
                            {analytics.totals.growthPercentage > 0 ? "+" : ""}
                            {analytics.totals.growthPercentage.toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-600   mb-2">
                          Growth
                        </p>
                        <p className="text-sm text-slate-600">
                          Transactions this month vs last month
                        </p>
                      </div>

                      <div className="rounded-xl bg-white  border border-blue-200 hover:border-blue-400 p-6 transition-all ">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-12 h-12  bg-violet-500  flex items-center justify-center ">
                            <Activity className="w-6 h-6 text-white" />
                          </div>
                          <span className="text-xs font-bold text-blue-600">
                            Active
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-600   mb-2">
                          Total Transactions
                        </p>
                        <p className="text-2xl font-semibold     text-slate-900">
                          {analytics.totals.totalTransactions}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white  border border-emerald-200 hover:border-emerald-400 p-6 transition-all ">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-12 h-12  bg-emerald-600  flex items-center justify-center ">
                            <CircleDollarSign className="w-6 h-6 text-white" />
                          </div>
                        </div>
                        <p className="text-xs font-bold text-slate-600   mb-2">
                          Net Income ({analyticsCode})
                        </p>
                        <p className="text-2xl font-semibold     text-slate-900">
                          {formatCurrency(netIncomeIn(analytics.totals), analyticsCur)}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white  border border-pink-200 hover:border-pink-400 p-6 transition-all ">
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-12 h-12  bg-pink-500  flex items-center justify-center ">
                            <Banknote className="w-6 h-6 text-white" />
                          </div>
                        </div>
                        <p className="text-xs font-bold text-slate-600   mb-2">
                          Avg Transaction ({analyticsCode})
                        </p>
                        <p className="text-2xl font-semibold     text-slate-900">
                          {avgIn(analytics.totals) === null
                            ? "—"
                            : formatCurrency(avgIn(analytics.totals)!, analyticsCur)}
                        </p>
                      </div>
                    </div>

                    {/* Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Monthly Performance */}
                      <div className="rounded-xl bg-white  border border-blue-200 hover:border-blue-300 transition-all ">
                        <div className="p-6 border-b border-slate-200">
                          <h3 className="text-lg font-semibold     text-blue-700">
                            Monthly Performance
                          </h3>
                          <p className="text-sm text-slate-600 mt-1">
                            Income vs Expenses trend
                          </p>
                        </div>
                        <div className="p-6">
                          <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={monthlyChartData}>
                              <defs>
                                <linearGradient
                                  id="incomeGradient"
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor="#10b981"
                                    stopOpacity={0.8}
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor="#10b981"
                                    stopOpacity={0}
                                  />
                                </linearGradient>
                                <linearGradient
                                  id="expenseGradient"
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop
                                    offset="0%"
                                    stopColor="#ef4444"
                                    stopOpacity={0.8}
                                  />
                                  <stop
                                    offset="100%"
                                    stopColor="#ef4444"
                                    stopOpacity={0}
                                  />
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="month" stroke="#94a3b8" />
                              <YAxis stroke="#94a3b8" />
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#e2e8f0"
                              />
                              <Tooltip
                                contentStyle={{
                                  background: "white",
                                  border: "2px solid #cbd5e1",
                                  borderRadius: "0px",
                                  boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
                                }}
                                formatter={(value: number) =>
                                  formatCurrency(value, analyticsCur)
                                }
                              />
                              <Area
                                type="monotone"
                                dataKey="income"
                                stroke="#10b981"
                                fillOpacity={1}
                                fill="url(#incomeGradient)"
                                strokeWidth={3}
                              />
                              <Area
                                type="monotone"
                                dataKey="expenses"
                                stroke="#ef4444"
                                fillOpacity={1}
                                fill="url(#expenseGradient)"
                                strokeWidth={3}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Category Breakdown */}
                      <div className="rounded-xl bg-white  border border-blue-200 hover:border-blue-300 transition-all ">
                        <div className="p-6 border-b border-slate-200">
                          <h3 className="text-lg font-semibold     text-violet-700">
                            Transaction Breakdown
                          </h3>
                          <p className="text-sm text-slate-600 mt-1">
                            By category distribution
                          </p>
                        </div>
                        <div className="p-6">
                          <ResponsiveContainer width="100%" height={300}>
                            <RechartPieChart>
                              <Pie
                                data={categoryChartData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) =>
                                  `${name} ${(percent * 100).toFixed(0)}%`
                                }
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                                isAnimationActive={false}
                              >
                                {categoryChartData.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                    aria-label={`${entry.name}: ${entry.value}`}
                                  />
                                ))}
                              </Pie>
                              <Tooltip />
                            </RechartPieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Balance Growth */}
                      <div className="rounded-xl bg-white  border border-emerald-200 hover:border-emerald-300 transition-all ">
                        <div className="p-6 border-b border-slate-200">
                          <h3 className="text-lg font-semibold     text-emerald-700">
                            Balance Growth
                          </h3>
                          <p className="text-sm text-slate-600 mt-1">
                            6-month trend analysis
                          </p>
                        </div>
                        <div className="p-6">
                          <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={monthlyChartData}>
                              <XAxis dataKey="month" stroke="#94a3b8" />
                              <YAxis stroke="#94a3b8" />
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#e2e8f0"
                              />
                              <Tooltip
                                formatter={(value: number) =>
                                  formatCurrency(value, analyticsCur)
                                }
                              />
                              <Line
                                type="monotone"
                                dataKey="balance"
                                stroke="#10b981"
                                strokeWidth={4}
                                dot={{ fill: "#10b981", r: 6 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Weekly Activity */}
                      <div className="rounded-xl bg-white  border border-pink-200 hover:border-pink-300 transition-all ">
                        <div className="p-6 border-b border-slate-200">
                          <h3 className="text-lg font-semibold     text-pink-700">
                            Weekly Activity
                          </h3>
                          <p className="text-sm text-slate-600 mt-1">
                            Transaction volume by day
                          </p>
                        </div>
                        <div className="p-6">
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={weeklyChartData}>
                              <XAxis dataKey="day" stroke="#94a3b8" />
                              <YAxis stroke="#94a3b8" />
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#e2e8f0"
                              />
                              <Tooltip />
                              <Bar
                                dataKey="transactions"
                                fill="url(#pinkGradient)"
                              />
                              <defs>
                                <linearGradient
                                  id="pinkGradient"
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="1"
                                >
                                  <stop offset="0%" stopColor="#ec4899" />
                                  <stop offset="100%" stopColor="#f43f5e" />
                                </linearGradient>
                              </defs>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>

                    {/* Insights */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className=" bg-blue-600   p-6 border border-blue-400  relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl hidden" />
                        <div className="relative z-10">
                          <div className="w-12 h-12 bg-white flex items-center justify-center mb-4">
                            <Zap className="w-6 h-6 text-blue-600" />
                          </div>
                          <h3 className="text-xl font-semibold text-white mb-2">
                            Smart Insight
                          </h3>
                          <p className="text-white leading-relaxed">
                            {analytics.totals.growthPercentage > 0
                              ? `Your account is growing! ${analytics.totals.growthPercentage.toFixed(
                                  1,
                                )}% increase this month.`
                              : "Your account activity is steady. Keep tracking your transactions!"}
                          </p>
                        </div>
                      </div>

                      <div className=" bg-emerald-700   p-6 border border-emerald-400  relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl hidden" />
                        <div className="relative z-10">
                          <div className="w-12 h-12 bg-white flex items-center justify-center mb-4">
                            <Target className="w-6 h-6 text-emerald-600" />
                          </div>
                          <h3 className="text-xl font-semibold text-white mb-2">
                            Summary
                          </h3>
                          <p className="text-white leading-relaxed">
                            {analytics.totals.totalTransactions} total
                            transactions
                            {avgIn(analytics.totals) !== null && (
                              <>
                                {" "}with an average of{" "}
                                {formatCurrency(avgIn(analytics.totals)!, analyticsCur)} per{" "}
                                {analyticsCode} transaction
                              </>
                            )}
                            .
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}
    </>
  );
}
