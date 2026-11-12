"use client";

import { Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, PieChart } from "lucide-react";
import { type ReportsVM } from "../useReports";

export function ProfitCharts({ vm }: { vm: ReportsVM }) {
  const { baseCode, loading, profitLossData, reportType } = vm;
  if (loading) return null;
  if (!(reportType === "profit")) return null;
  if (!profitLossData) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Profit Trend Chart */}
      <div className="bg-white border border-slate-200 p-6 rounded-xl">
        <h4 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          Daily Profit Trend
        </h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={profitLossData.dailyProfits}>
              <defs>
                <linearGradient
                  id="profitGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="#10B981"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="#10B981"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#E2E8F0"
              />
              <XAxis
                dataKey="date"
                stroke="#64748B"
                fontSize={12}
              />
              <YAxis
                stroke="#64748B"
                fontSize={12}
                tickFormatter={(v: any) =>
                  `${(v / 1000).toFixed(0)}k`
                }
              />
              <Tooltip
                formatter={(value: number) => [
                  `${baseCode} ${value.toLocaleString()}`,
                  "Profit",
                ]}
                contentStyle={{
                  backgroundColor: "#1E293B",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Area
                type="monotone"
                dataKey="profit"
                stroke="#10B981"
                strokeWidth={2}
                fill="url(#profitGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Profit by Category */}
      <div className="bg-white border border-slate-200 p-6 rounded-xl">
        <h4 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <PieChart className="w-5 h-5 text-blue-600" />
          Profit by Category
        </h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPieChart>
              <Pie
                data={profitLossData.profitByCategory.filter(
                  (c) => c.amount > 0,
                )}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="amount"
                nameKey="category"
              >
                {profitLossData.profitByCategory
                  .filter((c) => c.amount > 0)
                  .map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                    />
                  ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [
                  `${baseCode} ${value.toLocaleString()}`,
                  "",
                ]}
                contentStyle={{
                  backgroundColor: "#1E293B",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                }}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                formatter={(value: any) => (
                  <span className="text-sm text-slate-700">
                    {value}
                  </span>
                )}
              />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
