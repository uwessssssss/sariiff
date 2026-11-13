"use client";

import { AlertCircle, Calendar, CheckCircle, Clock, Copy, Download, Edit3, Eye, FileText, Hash, Loader2, Mail, Plus, Send, Trash2, XCircle } from "lucide-react";
import { CreateInvoiceDto, Currency, InvoiceStatus, createInvoice as apiCreateInvoice, deleteInvoice as apiDeleteInvoice, updateInvoiceStatus } from "@/lib/api";
import { localDate } from "@/lib/dates";
import { money } from "../helpers";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { type InvoiceManagementVM } from "../useInvoiceManagement";

export function NoInvoicesFoundSection({ vm }: { vm: InvoiceManagementVM }) {
  const { fetchInvoices, filteredInvoices, loading, setSelectedInvoice, setShowCreateModal, setShowTemplateSelector, setShowViewModal } = vm;
  return (
    <>
{loading ? (
            <div className="p-20 text-center">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-slate-600">Loading invoices...</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-20 text-center">
              <div className="inline-block p-6 bg-slate-100 mb-4">
                <FileText className="w-16 h-16 text-slate-400 mx-auto" />
              </div>
              <h3 className="text-2xl font-semibold text-slate-800 mb-2">
                No Invoices Found
              </h3>
              <p className="text-slate-600 mb-6">
                Create your first invoice to get started
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 bg-blue-600 text-white font-semibold inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Create Invoice
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto max-w-full">
              <table className="w-full">
                <thead className="bg-[#E9EEF6]">
                  <tr className="">
                    <th className="px-6 py-5 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Invoice
                    </th>
                    <th className="px-6 py-5 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Client
                    </th>
                    <th className="px-6 py-5 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Issue Date
                    </th>
                    <th className="px-6 py-5 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Due Date
                    </th>
                    <th className="px-6 py-5 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Amount
                    </th>
                    <th className="px-6 py-5 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Status
                    </th>
                    <th className="px-6 py-5 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map((invoice, index) => (
                    <motion.tr
                      key={invoice.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      whileHover={{
                        backgroundColor: "rgba(241, 245, 249, 0.5)",
                      }}
                      className="group cursor-pointer transition-all"
                    >
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Hash className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">
                              {invoice.invoiceNumber}
                            </div>
                            <div className="text-xs text-slate-500">
                              {new Date(invoice.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="font-semibold text-slate-900">
                          {invoice.clientName}
                        </div>
                        <div className="text-sm text-slate-600 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {invoice.clientEmail}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-slate-700">
                          <Calendar className="w-4 h-4 text-slate-500" />
                          {new Date(invoice.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-slate-700">
                          <Clock className="w-4 h-4 text-slate-500" />
                          {new Date(invoice.dueDate).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric" },
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="font-semibold text-lg text-slate-900">
                          {invoice.currency} {money(invoice.total)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {invoice.items.length} item
                          {invoice.items.length !== 1 ? "s" : ""}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <motion.span
                          whileHover={{ scale: 1.05 }}
                          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider shadow-sm ${
                            invoice.status === "paid"
                              ? "bg-emerald-700 text-white"
                              : invoice.status === "sent"
                                ? "bg-blue-600 text-white"
                                : invoice.status === "overdue"
                                  ? "bg-red-600 text-white"
                                  : invoice.status === "cancelled"
                                    ? "bg-slate-200 text-slate-700"
                                    : "bg-amber-700 text-white"
                          }`}
                        >
                          {invoice.status === "paid" && (
                            <CheckCircle className="w-3 h-3" />
                          )}
                          {invoice.status === "sent" && (
                            <Send className="w-3 h-3" />
                          )}
                          {invoice.status === "overdue" && (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {invoice.status === "draft" && (
                            <Edit3 className="w-3 h-3" />
                          )}
                          {invoice.status === "cancelled" && (
                            <XCircle className="w-3 h-3" />
                          )}
                          {invoice.status}
                        </motion.span>
                        {/* Status change actions */}
                        <div className="flex gap-1 mt-2">
                          {invoice.status === "draft" && (
                            <button
                              onClick={async () => {
                                const result = await updateInvoiceStatus(
                                  invoice.id,
                                  InvoiceStatus.Sent,
                                );
                                if (result.success) {
                                  toast.success("Invoice sent");
                                  fetchInvoices();
                                } else toast.error(result.message || "Failed");
                              }}
                              className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold transition-all"
                            >
                              Mark Sent
                            </button>
                          )}
                          {(invoice.status === "sent" ||
                            invoice.status === "overdue") && (
                            <button
                              onClick={async () => {
                                const result = await updateInvoiceStatus(
                                  invoice.id,
                                  InvoiceStatus.Paid,
                                );
                                if (result.success) {
                                  toast.success("Invoice marked as paid");
                                  fetchInvoices();
                                } else toast.error(result.message || "Failed");
                              }}
                              className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-semibold transition-all"
                            >
                              Mark Paid
                            </button>
                          )}
                          {invoice.status !== "paid" &&
                            invoice.status !== "cancelled" && (
                              <button
                                onClick={async () => {
                                  const result = await updateInvoiceStatus(
                                    invoice.id,
                                    InvoiceStatus.Cancelled,
                                  );
                                  if (result.success) {
                                    toast.success("Invoice cancelled");
                                    fetchInvoices();
                                  } else
                                    toast.error(result.message || "Failed");
                                }}
                                className="text-xs px-2 py-0.5 bg-red-100 text-red-700 hover:bg-red-200 font-semibold transition-all"
                              >
                                Cancel
                              </button>
                            )}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setShowViewModal(true);
                            }}
                            className="p-3 text-blue-600 hover:bg-blue-50 transition-all border border-transparent hover:border-blue-200 rounded-lg"
                            title="View Details"
                          >
                            <Eye className="w-5 h-5" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setShowTemplateSelector(true);
                            }}
                            className="p-3 text-emerald-700 hover:bg-emerald-50 transition-all border border-transparent hover:border-emerald-200 rounded-lg"
                            title="Download PDF"
                          >
                            <Download className="w-5 h-5" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={async () => {
                              try {
                                const dto: CreateInvoiceDto = {
                                  clientName: invoice.clientName,
                                  clientEmail: invoice.clientEmail,
                                  clientPhone: invoice.clientPhone,
                                  clientAddress: invoice.clientAddress,
                                  dueDate: localDate(new Date(
                                    Date.now() + 30 * 24 * 60 * 60 * 1000,
                                  )),
                                  // Same currency as the original: a UGX or EUR invoice
                                  // used to come back as a USD one.
                                  currency: { KES: Currency.KES, USD: Currency.USD, UGX: Currency.UGX, EUR: Currency.EUR }[invoice.currency],
                                  items: invoice.items.map((item) => ({
                                    description: item.description,
                                    quantity: item.quantity,
                                    unitPrice: item.unitPrice,
                                  })),
                                  taxRate: invoice.taxRate, // the copy used to drop the tax
                                  discountAmount: invoice.discount,
                                  notes: invoice.notes,
                                };
                                const result = await apiCreateInvoice(dto);
                                if (result.success) {
                                  toast.success("Invoice duplicated!");
                                  fetchInvoices();
                                } else {
                                  toast.error(
                                    result.message || "Failed to duplicate",
                                  );
                                }
                              } catch {
                                toast.error("Failed to duplicate invoice");
                              }
                            }}
                            className="p-3 text-blue-600 hover:bg-[#E9EEF6] transition-all border border-transparent hover:border-slate-200 rounded-lg"
                            title="Duplicate"
                          >
                            <Copy className="w-5 h-5" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={async () => {
                              if (
                                confirm(
                                  `Are you sure you want to delete ${invoice.invoiceNumber}?`,
                                )
                              ) {
                                const result = await apiDeleteInvoice(
                                  invoice.id,
                                );
                                if (result.success) {
                                  toast.success("Invoice deleted");
                                  fetchInvoices();
                                } else {
                                  toast.error(
                                    result.message ||
                                      "Failed to delete invoice",
                                  );
                                }
                              }
                            }}
                            className="p-3 text-red-600 hover:bg-red-50 transition-all border border-transparent hover:border-red-200 rounded-lg"
                            title="Delete"
                          >
                            <Trash2 className="w-5 h-5" />
                          </motion.button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </>
  );
}
