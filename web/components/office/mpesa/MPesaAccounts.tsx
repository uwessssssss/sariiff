"use client";

import { AlertCircle, Download, Filter, Loader2, Plus, RefreshCw, Search, Smartphone } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { EditTransactionDialog } from "../EditTransactionDialog";
import { RelatedAccountDialog, ReverseTransactionDialog, TransactionDetailsDialog } from "../TransactionDialogs";
import { StatementModal, refreshOpenStatement } from "../StatementModal";
import { providerLabel } from "@/lib/api";
import { toast } from "sonner";
import { useMPesaAccounts } from "./useMPesaAccounts";
import { TotalAgentsCardSection } from "./sections/TotalAgentsCardSection";
import { AgentsTable } from "./sections/AgentsTable";
import { AddAgentPanel } from "./sections/AddAgentPanel";
import { EditAgentPanel } from "./sections/EditAgentPanel";
import { DeleteAgentPanel } from "./sections/DeleteAgentPanel";

export function MPesaAccounts() {
  const vm = useMPesaAccounts();
  const { activeTab, agentsWithOutstanding, allAgents, base, baseCode, confirmDeleteTransaction, handleDeleteTransaction, handleEditTransaction, handleRefresh, handleViewTransaction, isLoading, isSubmitting, mapTransactionToDisplay, searchTerm, selectedAgent, selectedTransaction, setActiveTab, setSearchTerm, setSelectedAgent, setSelectedTransaction, setShowAddAgent, setShowDeleteTransaction, setShowEditTransaction, setShowRelatedAccount, setShowViewTransaction, showDeleteAgent, showDeleteTransaction, showEditAgent, showEditTransaction, showRelatedAccount, showViewTransaction, stats } = vm;
  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading mobile money agents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Mobile money agents
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Balances and movements for each mobile money agent
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRefresh}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowAddAgent(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add agent
          </button>
        </div>
      </div>

      {/* Summary Cards - PREMIUM SHARP DESIGN */}
      <TotalAgentsCardSection vm={vm} />

      {/* Wallets in other currencies (e.g. an M-Pesa KES wallet in a Ugandan bureau).
          The cards above are the home currency only: KES and UGX can't be added. */}
      {(stats.byCurrency || []).some((r) => r.currency !== base) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <span className="text-slate-500">Cards above: {baseCode} wallets. Also held:</span>
          {(stats.byCurrency || []).filter((r) => r.currency !== base).map((r) => (
            <span key={r.currency} className="tabular-nums text-slate-900">
              {r.currencyCode} {r.balance.toLocaleString()}
              <span className="text-slate-500"> (in {r.totalDebit.toLocaleString()}, out {r.totalCredit.toLocaleString()})</span>
            </span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setActiveTab("all")}
          className={`rounded-lg flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-300 ${
            activeTab === "all"
              ? " bg-[#0F172A]  text-white  "
              : "bg-white text-slate-600 hover:bg-[#E9EEF6] border border-slate-200 hover:border-slate-200 rounded-lg"
          }`}
        >
          <Smartphone className="w-5 h-5" />
          All Agents
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              activeTab === "all" ? "bg-white/20" : "bg-[#E9EEF6] text-[#0F172A]"
            }`}
          >
            {allAgents.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("outstanding")}
          className={`rounded-lg flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-300 ${
            activeTab === "outstanding"
              ? " bg-red-600  text-white  "
              : "bg-white text-slate-600 hover:bg-red-50 border border-slate-200 hover:border-red-300 rounded-lg"
          }`}
        >
          <AlertCircle className="w-5 h-5" />
          With Balance
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              activeTab === "outstanding"
                ? "bg-white/20"
                : "bg-red-100 text-red-700"
            }`}
          >
            {agentsWithOutstanding.length}
          </span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 ">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by agent name, phone, store number, or agent number..."
              value={searchTerm}
              onChange={(e: any) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 text-slate-500 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition-all duration-300 placeholder:text-slate-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => toast.info("Opening filter options...")}
              className="flex items-center gap-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all font-medium text-slate-700"
            >
              <Filter className="w-5 h-5" />
              <span className="hidden sm:inline">Filters</span>
            </button>
            <button
              onClick={() => toast.success("Exporting mobile money agents list...")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl transition-all font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
            >
              <Download className="w-5 h-5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* M-Pesa Agents Table */}
      <AgentsTable vm={vm} />

      {/* Agent Statement Modal */}
      <AnimatePresence>
        {selectedAgent && !showEditAgent && !showDeleteAgent && (
          <StatementModal
            kind="mpesa"
            accountId={selectedAgent.id}
            title={`${selectedAgent.agentName} – ${selectedAgent.agentNumber}`}
            subtitle={[selectedAgent.code, providerLabel((selectedAgent as any).provider)].filter(Boolean).join(" · ")}
            currency={Number((selectedAgent as any).currency ?? base)}
            onView={(raw) => handleViewTransaction(mapTransactionToDisplay(raw))}
            onEdit={(raw) => handleEditTransaction(mapTransactionToDisplay(raw))}
            onDelete={(raw) => handleDeleteTransaction(mapTransactionToDisplay(raw))}
            onRelated={(raw) => {
              setSelectedTransaction(mapTransactionToDisplay(raw));
              setShowRelatedAccount(true);
            }}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </AnimatePresence>

      {/* Add M-Pesa Agent Modal */}
      <AddAgentPanel vm={vm} />

      {/* Edit Agent Modal */}
      <EditAgentPanel vm={vm} />

      {/* Delete Agent Confirmation Modal */}
      <DeleteAgentPanel vm={vm} />

      {/* Transaction pop-ups — shared with the other ledger screens (TransactionDialogs.tsx) */}
      {showViewTransaction && selectedTransaction && (
        <TransactionDetailsDialog
          txn={selectedTransaction}
          kind="mpesa"
          accountName={selectedAgent ? `${selectedAgent.agentName} – ${selectedAgent.agentNumber}` : undefined}
          onClose={() => {
            setShowViewTransaction(false);
            setSelectedTransaction(null);
          }}
          onRelated={() => {
            setShowViewTransaction(false);
            setShowRelatedAccount(true);
          }}
        />
      )}

      {/* Edit Transaction Modal */}
      <AnimatePresence>
        {showEditTransaction && selectedTransaction && (
          <EditTransactionDialog
            txn={selectedTransaction}
            onClose={() => {
              setShowEditTransaction(false);
              setSelectedTransaction(null);
            }}
            onSaved={async () => {
              // reloads the open statement
              refreshOpenStatement();
            }}
          />
        )}
      </AnimatePresence>

      {showDeleteTransaction && selectedTransaction && (
        <ReverseTransactionDialog
          txn={selectedTransaction}
          kind="mpesa"
          busy={isSubmitting}
          onClose={() => setShowDeleteTransaction(false)}
          onConfirm={(reason) => confirmDeleteTransaction(reason)}
        />
      )}

      {showRelatedAccount && selectedTransaction?.relatedAccount && (
        <RelatedAccountDialog
          txn={selectedTransaction}
          kind="mpesa"
          onClose={() => setShowRelatedAccount(false)}
          onBack={() => {
            setShowRelatedAccount(false);
            setShowViewTransaction(true);
          }}
        />
      )}
    </div>
  );
}
