"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { type ReconciliationVM } from "../useReconciliation";

export function StatementUploadPanel({ vm }: { vm: ReconciliationVM }) {
  const { fileInputRef, handleFileUpload, setShowStatementUpload, showStatementUpload, statementEntries, unmatchedStatementEntries } = vm;
  return (
    <AnimatePresence>
      {showStatementUpload && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setShowStatementUpload(false)}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={(e: any) => e.stopPropagation()}
            className="bg-white shadow-2xl max-w-lg w-full overflow-hidden"
          >
            <div className="bg-blue-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">
                      Upload Bank Statement
                    </h3>
                    <p className="text-blue-50 text-sm">
                      CSV format supported
                    </p>
                  </div>
                </div>
                <button aria-label="Close"
                  onClick={() => setShowStatementUpload(false)}
                  className="p-2 hover:bg-white/20 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div
                role="button"
                tabIndex={0}
                aria-label="Choose a bank statement file to upload"
                className="border border-dashed border-slate-200 p-8 text-center bg-[#E9EEF6] hover:bg-[#E9EEF6] transition-colors cursor-pointer rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e: any) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <FileSpreadsheet className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                <p className="text-slate-900 font-semibold mb-1">
                  Drop your CSV file here
                </p>
                <p className="text-sm text-slate-600">or click to browse</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                <p className="text-sm font-semibold text-blue-800 mb-2">
                  Supported CSV Format:
                </p>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>
                    • Columns: Date, Description, Debit, Credit (or Amount)
                  </li>
                  <li>• Optional: Reference, Balance</li>
                  <li>• First row should be headers</li>
                </ul>
              </div>
              {statementEntries.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                  <p className="text-sm font-semibold text-emerald-800">
                    ✓ {statementEntries.length} entries loaded •{" "}
                    {unmatchedStatementEntries.length} unmatched
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
