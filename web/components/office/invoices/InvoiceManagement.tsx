"use client";

import { AlertOctagon, ArrowRight, Building, Calendar, CheckCircle, Clock, FileText, Plus, Search, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ui } from "../theme";
import { useInvoiceManagement } from "./useInvoiceManagement";
import { NoInvoicesFoundSection } from "./sections/NoInvoicesFoundSection";
import { ClientInformationSection } from "./sections/ClientInformationSection";
import { LineItemsSection } from "./sections/LineItemsSection";
import { LeftTaxDiscountSection } from "./sections/LeftTaxDiscountSection";
import { TemplateSelectorPanel } from "./sections/TemplateSelectorPanel";
import { CompanySettingsPanel } from "./sections/CompanySettingsPanel";

export default function InvoiceManagement() {
  const vm = useInvoiceManagement();
  const { collected, currencyFilter, currencyOk, draftInvoices, formData, handleCreateInvoice, outstanding, overdueInvoices, paidInvoices, pendingInvoices, searchTerm, setCurrencyFilter, setFormData, setSearchTerm, setShowCompanySettings, setShowCreateModal, setStatusFilter, showCreateModal, statusFilter, totalInvoices } = vm;

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className={ui.pageTitle}>Invoices</h1>
            <p className={ui.pageSub}>Create, send and track invoices for your clients</p>
          </div>
          <button onClick={() => setShowCompanySettings(true)} className={ui.btnSecondary}>
            <Building className="h-4 w-4" />
            Invoice details
          </button>
        </div>

        {/* Summary: navy lead tile (30) + white tiles (60), semantic colour on the figures only */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <div className={`${ui.hero} col-span-2 p-5 xl:col-span-1`}>
            <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-blue-600/30 blur-3xl" />
            <div className="relative flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invoices</span>
              <FileText className="h-4 w-4 text-blue-300" />
            </div>
            <p className="relative mt-2 text-3xl font-semibold tabular-nums">{totalInvoices}</p>
            <div className="relative mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
              <span>{paidInvoices} paid</span>
              <span>{pendingInvoices} sent</span>
              <span>{draftInvoices} draft</span>
            </div>
          </div>
          {[
            { label: "Collected", icon: CheckCircle, tone: "text-emerald-700", tile: "bg-emerald-50 text-emerald-700", lines: collected, empty: "Nothing paid yet" },
            { label: "Outstanding", icon: Clock, tone: "text-amber-700", tile: "bg-amber-50 text-amber-700", lines: outstanding, empty: "Nothing owed" },
          ].map((c) => (
            <div key={c.label} className={`${ui.card} p-5`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.tile}`}>
                  <c.icon className="h-4 w-4" />
                </span>
              </div>
              {c.lines.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">{c.empty}</p>
              ) : (
                <div className="mt-2 space-y-0.5">
                  {c.lines.map((l, i) => (
                    <p key={l.code} className={`font-semibold tabular-nums ${c.tone} ${i === 0 ? "text-xl" : "text-sm"}`}>
                      {l.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className={`${ui.card} p-5`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overdue</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-700">
                <AlertOctagon className="h-4 w-4" />
              </span>
            </div>
            <p className={`mt-2 text-xl font-semibold tabular-nums ${overdueInvoices ? "text-red-700" : "text-slate-900"}`}>
              {overdueInvoices}
            </p>
            <p className="mt-1 text-xs text-slate-500">{overdueInvoices ? "Follow these up first" : "All on time"}</p>
          </div>
        </div>

        {/* Premium Actions Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white shadow-sm border border-slate-200 p-6 rounded-xl"
        >
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                placeholder="Search by invoice #, client name, or email..."
                value={searchTerm}
                onChange={(e: any) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 placeholder:text-slate-500 font-medium rounded-lg"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-3">
              <select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all font-semibold text-slate-700 min-w-[140px] rounded-lg"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                value={currencyFilter}
                onChange={(e: any) => setCurrencyFilter(e.target.value)}
                className="px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all font-semibold text-slate-700 min-w-[120px] rounded-lg"
              >
                <option value="all">All currencies</option>
                <option value="KES">KES</option>
                <option value="USD">USD</option>
                {currencyOk("UGX") && <option value="UGX">UGX</option>}
                <option value="EUR">EUR</option>
              </select>
            </div>

            {/* Create Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowCreateModal(true)}
              className="px-8 py-4 bg-blue-600 text-white transition-all font-semibold text-sm flex items-center gap-3 justify-center shadow-sm hover:shadow-md bg-[length:200%_100%] bg-left hover:bg-right hover:bg-blue-700"
              style={{
                backgroundPosition: "left",
                transition: "all 0.3s ease",
              }}
            >
              <Plus className="w-5 h-5" />
              <span>Create Invoice</span>
              <Sparkles className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>

        {/* Premium Invoices Grid/Table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white shadow-sm overflow-hidden border border-slate-200 rounded-lg"
        >
          <NoInvoicesFoundSection vm={vm} />
        </motion.div>
      </div>

      {/* Create Invoice Modal - Premium */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-white w-full max-w-6xl max-h-[95vh] overflow-hidden shadow-2xl border-4 border-blue-200"
            >
              {/* Premium Header */}
              <div className="sticky top-0 bg-blue-600 p-8 z-10 border-b-4 border-blue-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-white/20 border border-white/30 rounded-xl">
                      <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-semibold text-white">
                        Create New Invoice
                      </h2>
                      <p className="text-blue-50 text-sm mt-1">
                        Build a professional invoice with our premium templates
                      </p>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowCreateModal(false)}
                    className="text-white hover:bg-white/20 p-3 transition-all border border-white/30 rounded-lg"
                  >
                    <X className="w-7 h-7" />
                  </motion.button>
                </div>
              </div>

              <div className="overflow-y-auto max-h-[calc(95vh-140px)] p-8 space-y-8 bg-slate-50">
                {/* Client Information */}
                <ClientInformationSection vm={vm} />

                {/* Invoice Details */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-blue-600 flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-2xl font-semibold text-slate-800">
                      Invoice Details
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                        Invoice Date *
                      </label>
                      <input
                        type="date"
                        value={formData.date}
                        onChange={(e: any) =>
                          setFormData({ ...formData, date: e.target.value })
                        }
                        className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium text-lg rounded-lg"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                        Due Date *
                      </label>
                      <input
                        type="date"
                        value={formData.dueDate}
                        onChange={(e: any) =>
                          setFormData({ ...formData, dueDate: e.target.value })
                        }
                        className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium text-lg rounded-lg"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                        Currency *
                      </label>
                      <select
                        value={formData.currency}
                        onChange={(e: any) =>
                          setFormData({
                            ...formData,
                            currency: e.target.value as "KES" | "USD" | "UGX" | "EUR",
                          })
                        }
                        className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-semibold text-lg rounded-lg"
                      >
                        <option value="KES">KES - Kenyan Shilling</option>
                        <option value="USD">USD - US Dollar</option>
                        {currencyOk("UGX") && <option value="UGX">UGX - Ugandan Shilling</option>}
                        <option value="EUR">EUR - Euro</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Invoice Items */}
                <LineItemsSection vm={vm} />

                {/* Calculations */}
                <LeftTaxDiscountSection vm={vm} />

                {/* Notes */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-slate-100 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-slate-600" />
                    </div>
                    <h3 className="text-2xl font-semibold text-slate-800">
                      Notes & Terms
                    </h3>
                  </div>
                  <textarea
                    value={formData.notes}
                    onChange={(e: any) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium rounded-lg"
                    rows={4}
                    placeholder="Thank you for your business! Payment is due within 30 days."
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 pt-6 border-t-4 border-slate-200">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-8 py-5 border border-slate-300 text-slate-700 hover:bg-slate-50 transition-all font-semibold text-lg rounded-lg"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCreateInvoice}
                    className="flex-1 px-8 py-5 bg-blue-600 text-white transition-all font-semibold text-lg flex items-center justify-center gap-3 shadow-sm hover:bg-blue-700"
                  >
                    <Sparkles className="w-6 h-6" />
                    Create Invoice
                    <ArrowRight className="w-6 h-6" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Template Selector Modal - Ultra Premium */}
      <TemplateSelectorPanel vm={vm} />

      {/* Company Settings Modal - Premium */}
      <CompanySettingsPanel vm={vm} />
    </div>
  );
}
