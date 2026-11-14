"use client";

import { AlertTriangle, CheckCircle, Edit, Loader2, X } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { ModalWrapper, formatNumber } from "../helpers";
import { type ExpensesAccountVM } from "../useExpensesAccount";

export function EditExpenseModal({ vm }: { vm: ExpensesAccountVM }) {
  const { editFormData, handleUpdateExpense, isSubmitting, selectedExpense, setEditFormData, setShowEditExpense, showEditExpense } = vm;
  return (
    <AnimatePresence>
        {showEditExpense && selectedExpense && (
          <ModalWrapper onClose={() => setShowEditExpense(false)}>
            <div className="bg-white w-full max-w-md">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-amber-700 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 flex items-center justify-center">
                    <Edit className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Edit Expense</h3>
                    <p className="text-amber-100 text-sm">
                      Reference: {selectedExpense.reference}
                    </p>
                  </div>
                </div>
                <button aria-label="Close"
                  onClick={() => setShowEditExpense(false)}
                  className="p-2 hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleUpdateExpense} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={editFormData.description}
                    onChange={(e: any) =>
                      setEditFormData({
                        ...editFormData,
                        description: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editFormData.amount || ""}
                      onChange={(e: any) =>
                        setEditFormData({
                          ...editFormData,
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Currency
                    </label>
                    <input
                      type="text"
                      value={selectedExpense.currency}
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendor/Payee
                  </label>
                  <input
                    type="text"
                    value={editFormData.vendor}
                    onChange={(e: any) =>
                      setEditFormData({
                        ...editFormData,
                        vendor: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reference
                  </label>
                  <input
                    type="text"
                    value={editFormData.reference}
                    onChange={(e: any) =>
                      setEditFormData({
                        ...editFormData,
                        reference: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                  />
                </div>

                {/* Amount Change Warning */}
                {editFormData.amount !== selectedExpense.amount && (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-amber-800">
                          Amount Change Detected
                        </p>
                        <p className="text-sm text-amber-700 mt-1">
                          This will adjust the payment account balance.
                        </p>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          <div className="bg-white p-2 border border-amber-100 text-center rounded-lg">
                            <p className="text-xs text-gray-500">Original</p>
                            <p className="font-medium text-gray-700">
                              {selectedExpense.currency}{" "}
                              {formatNumber(selectedExpense.amount)}
                            </p>
                          </div>
                          <div className="bg-white p-2 border border-amber-100 text-center rounded-lg">
                            <p className="text-xs text-gray-500">New</p>
                            <p className="font-medium text-blue-600">
                              {selectedExpense.currency}{" "}
                              {formatNumber(editFormData.amount)}
                            </p>
                          </div>
                          <div className="bg-white p-2 border border-amber-100 text-center rounded-lg">
                            <p className="text-xs text-gray-500">Difference</p>
                            <p
                              className={`font-medium ${
                                editFormData.amount > selectedExpense.amount
                                  ? "text-red-600"
                                  : "text-emerald-700"
                              }`}
                            >
                              {editFormData.amount > selectedExpense.amount
                                ? "+"
                                : ""}
                              {selectedExpense.currency}{" "}
                              {formatNumber(
                                editFormData.amount - selectedExpense.amount,
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </form>

              {/* Footer */}
              <div className="flex gap-3 p-4 border-t border-gray-200 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setShowEditExpense(false)}
                  className="flex-1 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  onClick={handleUpdateExpense}
                  disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {isSubmitting ? "Updating..." : "Update Expense"}
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}
      </AnimatePresence>
  );
}
