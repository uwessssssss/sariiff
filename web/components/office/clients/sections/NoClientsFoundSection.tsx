"use client";

import { ClientCurrencyLine, clientCurrencyLines, fmtAmount } from "../helpers";
import { ClientType } from "@/lib/api";
import { Clock, Edit3, FileText, Loader2, Mail, Phone, UserCheck, Users } from "lucide-react";
import { motion } from "framer-motion";
import { type ClientManagementVM } from "../useClientManagement";

export function NoClientsFoundSection({ vm }: { vm: ClientManagementVM }) {
  const { calculatedTotalPages, clients, currentPage, handleEditClient, handleViewClient, isLoading, pageSize, setCurrentPage, totalCount, totalPages } = vm;
  return (
    <div className="rounded-xl bg-white border border-slate-200  overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <span className="ml-3 text-slate-600 font-medium">
              Loading clients...
            </span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto max-w-full">
              <table className="w-full">
                <thead className="bg-[#E9EEF6]">
                  <tr>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                      Client ID
                    </th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                      Client Details
                    </th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                      Client Type
                    </th>
                    <th className="px-3 py-3.5 text-right text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                      Money in
                    </th>
                    <th className="px-3 py-3.5 text-right text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                      Money out
                    </th>
                    <th className="px-3 py-3.5 text-right text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                      Balance
                    </th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {clients.map((client, index) => (
                    <motion.tr
                      key={client.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="hover:bg-blue-50/50 transition-all duration-200 cursor-pointer group"
                    >
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <span className="text-sm font-semibold text-blue-600 group-hover:text-blue-700">
                          {client.code}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <div className="font-semibold text-slate-900 text-sm whitespace-nowrap">
                            {client.fullName}
                          </div>
                          <div className="flex flex-col gap-0.5 mt-1">
                            <span className="flex items-center gap-1.5 text-xs text-slate-600">
                              <Phone className="w-3 h-3" />
                              {client.whatsAppNumber}
                            </span>
                            {client.email && (
                              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                                <Mail className="w-3 h-3" />
                                {client.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        {client.clientType === ClientType.Permanent ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border bg-blue-100 text-blue-700 border-blue-200">
                            <UserCheck className="w-4 h-4" />
                            Permanent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border bg-amber-100 text-amber-700 border-amber-200">
                            <Clock className="w-4 h-4" />
                            Temporary
                          </span>
                        )}
                      </td>

                      {(() => {
                        const lines = clientCurrencyLines(client);
                        const cell = (
                          pick: (l: ClientCurrencyLine) => number,
                          color: (v: number) => string,
                          sign = false,
                        ) => (
                          <td className="px-3 py-3.5 whitespace-nowrap text-right tabular-nums">
                            {lines.length === 0 ? (
                              <span className="text-sm text-slate-500">-</span>
                            ) : (
                              <div className="space-y-0.5">
                                {lines.map((l) => {
                                  const v = pick(l);
                                  return (
                                    <div key={l.currency} className={`text-sm font-semibold ${color(v)}`}>
                                      <span className="mr-1 text-xs font-medium text-slate-500">{l.code}</span>
                                      {sign && v < 0 ? "−" : ""}
                                      {fmtAmount(Math.abs(v), l.currency)}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                        return (
                          <>
                            {cell((l) => l.moneyIn, (v) => (v ? "text-emerald-700" : "text-slate-400"))}
                            {cell((l) => l.moneyOut, (v) => (v ? "text-red-700" : "text-slate-400"))}
                            {cell(
                              (l) => l.balance,
                              (v) => (v > 0 ? "text-emerald-700" : v < 0 ? "text-red-700" : "text-slate-500"),
                              true,
                            )}
                          </>
                        );
                      })()}
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleViewClient(client)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-all text-xs font-medium rounded-lg"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Statement
                          </button>
                          <button
                            onClick={() => handleEditClient(client)}
                            className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all text-xs font-medium rounded-lg"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {clients.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  No clients found
                </h3>
                <p className="text-slate-600">
                  Try adjusting your search or filter criteria
                </p>
              </div>
            )}

            {/* Pagination */}
            {(totalCount > pageSize || totalPages > 1) && (
              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-sm text-slate-600">
                    Showing{" "}
                    <span className="font-semibold text-slate-900">
                      {(currentPage - 1) * pageSize + 1}
                    </span>{" "}
                    to{" "}
                    <span className="font-semibold text-slate-900">
                      {Math.min(currentPage * pageSize, totalCount)}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-slate-900">
                      {totalCount}
                    </span>{" "}
                    clients
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="rounded-lg px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50
                       disabled:cursor-not-allowed transition-all text-sm font-medium text-slate-700"
                    >
                      Previous
                    </button>

                    <div className="flex items-center gap-1">
                      {[...Array(calculatedTotalPages)].map((_, i) => {
                        const pageNumber = i + 1;
                        if (
                          pageNumber === 1 ||
                          pageNumber === totalPages ||
                          (pageNumber >= currentPage - 1 &&
                            pageNumber <= currentPage + 1)
                        ) {
                          return (
                            <button
                              key={pageNumber}
                              onClick={() => setCurrentPage(pageNumber)}
                              className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                                currentPage === pageNumber
                                  ? "bg-blue-600 text-white"
                                  : "bg-white border border-slate-300 hover:bg-slate-50 text-slate-500 rounded-lg"
                              }`}
                            >
                              {pageNumber}
                            </button>
                          );
                        } else if (
                          pageNumber === currentPage - 2 ||
                          pageNumber === currentPage + 2
                        ) {
                          return (
                            <span
                              key={pageNumber}
                              className="px-2 text-slate-500"
                            >
                              ...
                            </span>
                          );
                        }
                        return null;
                      })}
                    </div>

                    <button
                      onClick={() =>
                        setCurrentPage((p) =>
                          Math.min(calculatedTotalPages, p + 1),
                        )
                      }
                      disabled={currentPage >= calculatedTotalPages}
                      className="px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50
 disabled:cursor-not-allowed transition-all text-sm font-medium text-slate-700 rounded-lg"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
  );
}
