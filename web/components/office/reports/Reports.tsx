"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Loader2, PieChart, Printer, RefreshCw, Wallet } from "lucide-react";
import { DailyBalanceList } from "./helpers";
import { motion } from "framer-motion";
import { useReports } from "./useReports";
import { CashFlowSummary } from "./sections/CashFlowSummary";
import { ReportFilters } from "./sections/ReportFilters";
import { TransactionsView } from "./sections/TransactionsView";
import { DailyTransactions } from "./sections/DailyTransactions";
import { ClientsView } from "./sections/ClientsView";
import { AccountsView } from "./sections/AccountsView";
import { CashflowView } from "./sections/CashflowView";
import { ExchangeView } from "./sections/ExchangeView";
import { ProfitSummaryCards } from "./sections/ProfitSummaryCards";
import { ProfitCharts } from "./sections/ProfitCharts";
import { ProfitLossTable } from "./sections/ProfitLossTable";

export function Reports() {
  const vm = useReports();
  const { COLORS, accountSummary, accountTypeData, baseCode, clientBalances, currentPage, dailyReport, fetchReportData, filteredTransactions, handleExport, handlePageChange, handlePrint, loading, profitLossData, reportCards, reportType, setReportType, totalPages, transactionChartData } = vm;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header — stacks on phones (the buttons used to push the page past the screen edge) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Reports & Analytics
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Comprehensive business intelligence and insights
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            onClick={() => fetchReportData()}
            disabled={loading}
            className="px-4 py-2 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center gap-2 text-sm font-semibold text-slate-700 disabled:opacity-50 rounded-lg"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-white border border-slate-200 hover:border-slate-200 hover:bg-[#E9EEF6] transition-all flex items-center gap-2 text-sm font-semibold text-slate-700 print:hidden rounded-lg"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <div className="relative group">
            <button className="px-6 py-2 bg-blue-600 text-white font-semibold hover:shadow-md transition-all flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-white shadow-sm border border-slate-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 rounded-lg">
              <button
                onClick={() => handleExport("pdf")}
                className="w-full px-4 py-3 hover:bg-blue-50 text-left flex items-center gap-2 text-sm font-medium text-slate-700"
              >
                <FileText className="w-4 h-4" />
                Export as PDF
              </button>
              <button
                onClick={() => handleExport("excel")}
                className="w-full px-4 py-3 hover:bg-emerald-50 text-left flex items-center gap-2 text-sm font-medium text-slate-700"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export as Excel
              </button>
              <button
                onClick={() => handleExport("csv")}
                className="w-full px-4 py-3 hover:bg-[#E9EEF6] text-left flex items-center gap-2 text-sm font-medium text-slate-700"
              >
                <FileText className="w-4 h-4" />
                Export as CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Overview — per currency (only currencies with activity) */}
      <CashFlowSummary vm={vm} />

      {/* Report Type Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {reportCards.map((report) => (
          <motion.button
            key={report.id}
            onClick={() => setReportType(report.id)}
            whileHover={{ scale: 1.02, y: -2 }}
            aria-pressed={reportType === report.id}
            className={`rounded-xl border bg-white p-4 text-left shadow-sm transition-all ${
              reportType === report.id
                ? "border-blue-600 ring-2 ring-blue-600/15"
                : "border-slate-200 hover:border-slate-300 hover:shadow-md"
            }`}
          >
            <div
              className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${
                reportType === report.id ? "bg-[#0F172A] text-white" : "bg-[#E9EEF6] text-[#0F172A]"
              }`}
            >
              <report.icon className="h-4 w-4" />
            </div>
            <h4 className="mb-1 text-sm font-semibold text-slate-900">
              {report.title}
            </h4>
            <p className="mb-2 text-xs text-slate-500">{report.description}</p>
            <p className="text-xs font-semibold text-[#0F172A]">{report.count}</p>
          </motion.button>
        ))}
      </div>

      {/* Date Range & Filters */}
      <ReportFilters vm={vm} />

      {/* Daily Report Content */}
      {reportType === "daily" && dailyReport && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Opening Balances */}
          <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-blue-600" />
              Opening Balances
            </h3>
            <DailyBalanceList report={dailyReport} side="opening" />
          </div>

          {/* Closing Balances */}
          <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600" />
              Closing Balances
            </h3>
            <DailyBalanceList report={dailyReport} side="closing" />
          </div>
        </div>
      )}

      {/* Charts Section */}
      {(reportType === "transactions" ||
        reportType === "cashflow" ||
        reportType === "daily") && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart */}
          <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Weekly Transaction Volume
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={transactionChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "2px solid #e2e8f0",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                  }}
                />
                <Legend />
                <Bar dataKey="debits" fill="#10b981" name={`Debits (${baseCode} equivalent)`} />
                <Bar dataKey="credits" fill="#ef4444" name={`Credits (${baseCode} equivalent)`} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie Chart */}
          <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-blue-600" />
              Account Type Distribution
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={accountTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: any) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {accountTypeData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "2px solid #e2e8f0",
                    borderRadius: "8px",
                  }}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Report Content */}
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-lg">
        <div className="p-6 border-b-2 border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {(() => {
                const currentReport = reportCards.find(
                  (r) => r.id === reportType,
                );
                const IconComponent = currentReport?.icon;
                return (
                  <>
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F172A]"
                    >
                      {IconComponent && (
                        <IconComponent className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {currentReport?.title}
                      </h3>
                      <p className="text-sm text-slate-600 mt-1">
                        {reportType === "transactions" &&
                          `Showing ${filteredTransactions.length} results`}
                        {reportType === "clients" &&
                          `Showing ${clientBalances.length} clients`}
                        {reportType === "accounts" &&
                          accountSummary &&
                          `Showing ${
                            accountSummary.cashAccounts.length +
                            accountSummary.bankAccounts.length +
                            accountSummary.mpesaAgents.length
                          } accounts`}
                        {reportType === "daily" &&
                          dailyReport &&
                          `Report for ${new Date(
                            dailyReport.date,
                          ).toLocaleDateString()}`}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600">Generated on</p>
              <p className="text-sm font-semibold text-slate-900">
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-slate-600">Loading report data...</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto max-w-full">
            {/* Transactions Report */}
            <TransactionsView vm={vm} />

            {/* Daily Report Transactions */}
            <DailyTransactions vm={vm} />

            {/* Client Balances Report */}
            <ClientsView vm={vm} />

            {/* Account Summary Report */}
            <AccountsView vm={vm} />

            {/* Cash Flow Report */}
            <CashflowView vm={vm} />

            {/* Other report types placeholder */}
            {/* Exchange Summary Report */}
            <ExchangeView vm={vm} />

            {/* Profit & Loss Report */}
            {reportType === "profit" && (
              <div className="p-6 space-y-6">
                {!profitLossData ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                    <p className="text-slate-600">
                      Loading profit & loss data...
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-slate-600">
                      All figures in {baseCode}. Other currencies are converted at the mid of today&apos;s
                      buy and sell rate.
                    </p>
                    {(profitLossData.excludedCurrencies || []).length > 0 && (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        {profitLossData.excludedCurrencies!.join(" and ")} transactions are left out —
                        set {profitLossData.excludedCurrencies!.length === 1 ? "a rate" : "rates"} on the
                        Exchange page to include them.
                      </p>
                    )}
                    {/* P&L Summary Cards */}
                    <ProfitSummaryCards vm={vm} />

                    {/* Charts Section */}
                    <ProfitCharts vm={vm} />

                    {/* Detailed Breakdown Table */}
                    <ProfitLossTable vm={vm} />
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {reportType === "transactions" && totalPages > 1 && (
        <div className="flex justify-center mt-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center gap-2 text-sm font-semibold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <div className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg">
              <p className="text-sm font-semibold text-slate-700">
                Page {currentPage} of {totalPages}
              </p>
            </div>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center gap-2 text-sm font-semibold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
