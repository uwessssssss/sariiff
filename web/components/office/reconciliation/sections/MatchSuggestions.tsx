"use client";

import { Check, Link2, Loader2, Sparkles, X, Zap } from "lucide-react";
import { getCurrencySymbol } from "../helpers";
import { motion } from "framer-motion";
import { type ReconciliationVM } from "../useReconciliation";

export function MatchSuggestions({ vm }: { vm: ReconciliationVM }) {
  const { handleAcceptAllSuggestions, handleAcceptMatch, highConfidenceMatches, isSubmitting, matchSuggestions, setMatchSuggestions } = vm;
  return (
    <>
{matchSuggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-50 border border-slate-200 p-4 lg:p-6 shadow-sm rounded-xl"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    Smart Match Suggestions
                  </h3>
                  <p className="text-sm text-slate-600">
                    {matchSuggestions.length} potential matches •{" "}
                    {highConfidenceMatches.length} high confidence
                  </p>
                </div>
              </div>
              {highConfidenceMatches.length > 0 && (
                <button
                  onClick={handleAcceptAllSuggestions}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  Accept All High Confidence ({highConfidenceMatches.length})
                </button>
              )}
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {matchSuggestions.slice(0, 10).map((suggestion) => (
                <div
                  key={`${suggestion.transactionId}-${suggestion.statementEntryId}`}
                  className="bg-white border border-slate-200 p-4 hover:border-slate-200 transition-all rounded-xl"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex-1 bg-blue-50 p-3 border-l-4 border-blue-500">
                      <p className="text-xs font-semibold text-blue-700 uppercase mb-1">
                        System Record
                      </p>
                      <p className="font-semibold text-slate-900 truncate">
                        {suggestion.transaction.description}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-sm">
                        <span className="font-semibold text-blue-700">
                          {getCurrencySymbol(suggestion.transaction.currency)}
                          {suggestion.transaction.amount.toLocaleString()}
                        </span>
                        <span className="text-slate-600">
                          {new Date(
                            suggestion.transaction.transactionDate,
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-center">
                      <div
                        className={`p-2 rounded-full ${
                          suggestion.confidence >= 90
                            ? "bg-emerald-100"
                            : suggestion.confidence >= 70
                              ? "bg-amber-100"
                              : "bg-amber-100"
                        }`}
                      >
                        <Link2
                          className={`w-5 h-5 ${
                            suggestion.confidence >= 90
                              ? "text-emerald-600"
                              : suggestion.confidence >= 70
                                ? "text-amber-700"
                                : "text-amber-700"
                          }`}
                        />
                      </div>
                    </div>
                    <div className="flex-1 bg-[#E9EEF6] p-3 border-l-4 border-blue-500">
                      <p className="text-xs font-semibold text-[#0F172A] uppercase mb-1">
                        Statement Entry
                      </p>
                      <p className="font-semibold text-slate-900 truncate">
                        {suggestion.statementEntry.description}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-sm">
                        <span className="font-semibold text-[#0F172A]">
                          {getCurrencySymbol(suggestion.transaction.currency)}
                          {suggestion.statementEntry.amount.toLocaleString()}
                        </span>
                        <span className="text-slate-600">
                          {new Date(
                            suggestion.statementEntry.date,
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`text-center px-3 py-2 rounded ${
                          suggestion.confidence >= 90
                            ? "bg-emerald-100"
                            : suggestion.confidence >= 70
                              ? "bg-amber-100"
                              : "bg-amber-100"
                        }`}
                      >
                        <p
                          className={`text-lg font-semibold ${
                            suggestion.confidence >= 90
                              ? "text-emerald-700"
                              : suggestion.confidence >= 70
                                ? "text-amber-800"
                                : "text-amber-800"
                          }`}
                        >
                          {suggestion.confidence}%
                        </p>
                        <p className="text-xs font-medium text-slate-600">
                          confidence
                        </p>
                      </div>
                      <button
                        aria-label="Accept match"
                        onClick={() => handleAcceptMatch(suggestion)}
                        disabled={isSubmitting}
                        className="p-3 bg-emerald-700 text-white hover:bg-emerald-800 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                      <button aria-label="Close"
                        onClick={() =>
                          setMatchSuggestions((prev) =>
                            prev.filter(
                              (s) =>
                                s.transactionId !== suggestion.transactionId ||
                                s.statementEntryId !==
                                  suggestion.statementEntryId,
                            ),
                          )
                        }
                        className="p-3 bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {matchSuggestions.length > 10 && (
              <p className="text-center text-sm text-slate-500 mt-4">
                Showing 10 of {matchSuggestions.length} suggestions
              </p>
            )}
          </motion.div>
        )}
    </>
  );
}
