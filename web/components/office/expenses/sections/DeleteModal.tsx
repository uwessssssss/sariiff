"use client";

import { AlertTriangle, CheckCircle, Loader2, Receipt, Trash2 } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { ModalWrapper, formatNumber } from "../helpers";
import { type ExpensesAccountVM } from "../useExpensesAccount";

export function DeleteModal({ vm }: { vm: ExpensesAccountVM }) {
  const { expenseToDelete, handleDeleteExpense, isDeleting, setShowDeleteModal, showDeleteModal } = vm;
  return (
    <AnimatePresence>
        {showDeleteModal && expenseToDelete && (
          <ModalWrapper onClose={() => setShowDeleteModal(false)}>
            <div className="bg-white w-full max-w-md">
              {/* Header */}
              <div className="p-6 text-center bg-red-600 text-white">
                <div className="w-16 h-16 bg-white/20 flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-semibold">Delete Expense?</h3>
                <p className="text-white text-sm mt-1">
                  This action cannot be undone
                </p>
              </div>

              {/* Content */}
              <div className="p-4 space-y-4">
                <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-red-100 flex items-center justify-center flex-shrink-0">
                      <Receipt className="w-6 h-6 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {expenseToDelete.description}
                      </p>
                      <p className="text-sm text-gray-500">
                        Reference: {expenseToDelete.reference}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-dashed border-gray-200 mt-4 pt-4 flex justify-between items-center">
                    <span className="text-gray-600">Amount to Restore</span>
                    <span className="text-xl font-semibold text-gray-900">
                      {expenseToDelete.currency}{" "}
                      {formatNumber(expenseToDelete.amount)}
                    </span>
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                  <h4 className="font-semibold text-emerald-800 mb-3">
                    What will happen:
                  </h4>
                  <ul className="space-y-2">
                    {[
                      "Expense record will be permanently deleted",
                      "Associated transaction will be reversed",
                      `${expenseToDelete.currency} ${formatNumber(
                        expenseToDelete.amount,
                      )} will be restored to the payment account`,
                    ].map((text, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-sm text-emerald-700"
                      >
                        <CheckCircle className="w-4 h-4 flex-shrink-0" />
                        {text}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 p-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteExpense}
                  disabled={isDeleting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {isDeleting ? "Deleting..." : "Delete Expense"}
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}
      </AnimatePresence>
  );
}
