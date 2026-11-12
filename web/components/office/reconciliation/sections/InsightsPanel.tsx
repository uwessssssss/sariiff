"use client";

import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, ChevronUp, Clock, FileSpreadsheet, Percent, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { type ReconciliationVM } from "../useReconciliation";

export function InsightsPanel({ vm }: { vm: ReconciliationVM }) {
  const { balanceSummary, matchRate, matchSuggestions, selectedAccount, setShowInsights, showInsights, statementEntries } = vm;
  return (
    <>
{selectedAccount && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <button
              onClick={() => setShowInsights(!showInsights)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors mb-3"
            >
              {showInsights ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              <BarChart3 className="w-4 h-4" />
              Reconciliation Insights
            </button>

            <AnimatePresence>
              {showInsights && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3"
                >
                  <div className="bg-white border border-slate-200 p-4 hover:border-blue-300 hover:shadow-md transition-all rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <Percent className="w-5 h-5 text-blue-600" />
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          matchRate >= 90
                            ? "bg-emerald-100 text-emerald-700"
                            : matchRate >= 70
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {matchRate >= 90
                          ? "Excellent"
                          : matchRate >= 70
                            ? "Good"
                            : "Needs Work"}
                      </span>
                    </div>
                    <p className="text-2xl font-semibold text-slate-900">
                      {matchRate}%
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                      Match Rate
                    </p>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 p-4 hover:shadow-md transition-all rounded-xl">
                    <Clock className="w-5 h-5 text-amber-600 mb-2" />
                    <p className="text-2xl font-semibold text-amber-700">
                      {balanceSummary.pendingCount}
                    </p>
                    <p className="text-xs text-amber-700 font-medium">
                      Pending
                    </p>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 p-4 hover:shadow-md transition-all rounded-xl">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 mb-2" />
                    <p className="text-2xl font-semibold text-emerald-700">
                      {balanceSummary.matchedCount}
                    </p>
                    <p className="text-xs text-emerald-700 font-medium">
                      Matched
                    </p>
                  </div>

                  <div className="bg-red-50 border border-red-200 p-4 hover:shadow-md transition-all rounded-xl">
                    <AlertTriangle className="w-5 h-5 text-red-600 mb-2" />
                    <p className="text-2xl font-semibold text-red-700">
                      {balanceSummary.unmatchedCount}
                    </p>
                    <p className="text-xs text-red-700 font-medium">
                      Unmatched
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-4 hover:shadow-md transition-all rounded-xl">
                    <FileSpreadsheet className="w-5 h-5 text-blue-600 mb-2" />
                    <p className="text-2xl font-semibold text-[#0F172A]">
                      {statementEntries.length}
                    </p>
                    <p className="text-xs text-blue-600 font-medium">
                      Statement Entries
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-blue-200 p-4 hover:shadow-md transition-all rounded-xl">
                    <Sparkles className="w-5 h-5 text-blue-600 mb-2" />
                    <p className="text-2xl font-semibold text-blue-700">
                      {matchSuggestions.length}
                    </p>
                    <p className="text-xs text-blue-600 font-medium">
                      Match Suggestions
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
    </>
  );
}
