"use client";

import { Search } from "lucide-react";
import { type ReportsVM } from "../useReports";

export function ReportFilters({ vm }: { vm: ReportsVM }) {
  const { currencyFilter, currencyOk, dateFrom, dateRange, dateTo, reportType, searchTerm, selectedDate, setCurrencyFilter, setDateFrom, setDateRange, setDateTo, setSearchTerm, setSelectedDate, setTransactionTypeFilter, transactionTypeFilter } = vm;
  return (
    <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Report Date (for daily report) */}
        {reportType === "daily" && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
              Report Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e: any) => setSelectedDate(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
            />
          </div>
        )}

        {/* Date Range */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
            Date Range
          </label>
          <select
            value={dateRange}
            onChange={(e: any) => setDateRange(e.target.value)}
            className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {/* Search */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e: any) => setSearchTerm(e.target.value)}
              placeholder="Search transactions..."
              className="w-full pl-10 pr-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
            />
          </div>
        </div>

        {/* Currency Filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
            Currency
          </label>
          <select
            value={currencyFilter}
            onChange={(e: any) => setCurrencyFilter(e.target.value as any)}
            className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
          >
            <option value="all">All Currencies</option>
            {/* only the currencies this bureau trades */}
            {currencyOk("KES") && <option value="KES">KES only</option>}
            {currencyOk("USD") && <option value="USD">USD only</option>}
            {currencyOk("UGX") && <option value="UGX">UGX only</option>}
            {currencyOk("EUR") && <option value="EUR">EUR only</option>}
          </select>
        </div>

        {/* Transaction Type Filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
            Type
          </label>
          <select
            value={transactionTypeFilter}
            onChange={(e: any) =>
              setTransactionTypeFilter(e.target.value as any)
            }
            className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
          >
            <option value="all">All Types</option>
            <option value="debit">Debits Only</option>
            <option value="credit">Credits Only</option>
          </select>
        </div>
      </div>

      {/* Custom Date Range */}
      {dateRange === "custom" && (
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
              From Date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e: any) => setDateFrom(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
              To Date
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e: any) => setDateTo(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 outline-none bg-white rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
