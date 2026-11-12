"use client";

import { Edit3, FileText, Phone, Trash2, User, Zap } from "lucide-react";
import { currencyCode, providerLabel } from "@/lib/api";
import { motion } from "framer-motion";
import { type MPesaAccountsVM } from "../useMPesaAccounts";

export function AgentsTable({ vm }: { vm: MPesaAccountsVM }) {
  const { agentsCurrentPage, currentAgents, filteredAgents, handleEditAgent, indexOfFirstAgent, indexOfLastAgent, setAgentsCurrentPage, setSelectedAgent, setShowDeleteAgent, totalAgentPages } = vm;
  return (
    <div className="bg-white rounded-2xl border border-slate-200  overflow-hidden">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full">
            <thead className="bg-[#E9EEF6]">
              <tr>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Agent Code
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Agent Details
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Store Info
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Balance
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Net Movement
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Status
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap uppercase tracking-wide text-[#334155]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {currentAgents.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No mobile money agents found.
                  </td>
                </tr>
              ) : (
                currentAgents.map((agent, index) => (
                  <motion.tr
                    key={agent.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="hover:bg-[#E9EEF6] transition-all duration-200 cursor-pointer group"
                  >
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-blue-600 group-hover:text-[#0F172A]">
                        {agent.code}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <div className="font-semibold text-slate-900 text-sm whitespace-nowrap">
                          {agent.agentName}
                        </div>
                        <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                          {providerLabel(agent.provider)}
                        </span>
                        <div className="flex flex-col gap-0.5 mt-1">
                          <span className="flex items-center gap-1.5 text-xs text-slate-600">
                            <Phone className="w-3 h-3" />
                            {agent.phoneNumber}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                            <User className="w-3 h-3" />
                            {agent.agentNumber}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {agent.storeNumber ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#E9EEF6] text-[#0F172A]">
                          <Zap className="w-3 h-3" />
                          {agent.storeNumber}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`text-sm font-semibold ${
                          agent.balance >= 0
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {currencyCode(agent.currency)} {agent.balance.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`text-sm font-semibold ${
                          agent.netMovement >= 0
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {agent.netMovement >= 0 ? "+" : ""}{currencyCode(agent.currency)}{" "}
                        {agent.netMovement.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold ${
                          agent.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {agent.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedAgent(agent)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-all text-xs font-medium rounded-lg"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Statement
                        </button>
                        <button
                          onClick={() => handleEditAgent(agent)}
                          className="flex items-center gap-1.5 px-3 py-2 transition-all text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button aria-label="Delete"
                          onClick={() => {
                            setSelectedAgent(agent);
                            setShowDeleteAgent(true);
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 transition-all text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-red-50 text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalAgentPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <p className="text-sm text-slate-600">
              Showing {indexOfFirstAgent + 1} to{" "}
              {Math.min(indexOfLastAgent, filteredAgents.length)} of{" "}
              {filteredAgents.length} agents
            </p>

            <div className="flex gap-2">
              <button
                onClick={() =>
                  setAgentsCurrentPage((prev) => Math.max(prev - 1, 1))
                }
                disabled={agentsCurrentPage === 1}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100
                   !text-slate-400 hover:!text-slate-600
                   disabled:opacity-50 disabled:cursor-not-allowed
                   disabled:text-slate-300 text-sm font-medium"
              >
                Previous
              </button>

              <button
                onClick={() =>
                  setAgentsCurrentPage((prev) =>
                    Math.min(prev + 1, totalAgentPages),
                  )
                }
                disabled={agentsCurrentPage === totalAgentPages}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100
                   !text-slate-400 hover:!text-slate-600
                   disabled:opacity-50 disabled:cursor-not-allowed
                   disabled:text-slate-300 text-sm font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
  );
}
