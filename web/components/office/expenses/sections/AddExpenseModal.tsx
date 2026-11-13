"use client";

import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Banknote, Building2, CheckCircle, Loader2, Plus, Receipt, Smartphone, X } from "lucide-react";
import { ModalWrapper } from "../helpers";
import { formatMoney } from "@/lib/api";
import { type ExpensesAccountVM } from "../useExpensesAccount";

export function AddExpenseModal({ vm }: { vm: ExpensesAccountVM }) {
  const { allCategories, availableAccounts, base, currencyOk, formData, handleCreateExpense, hasBankAccounts, hasCashAccounts, hasMpesaAccounts, isSubmitting, setFormData, setShowAddExpense, showAddExpense } = vm;
  return (
    <>
{showAddExpense && (
          <ModalWrapper onClose={() => setShowAddExpense(false)}>
            <div className="bg-white w-full max-w-xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-emerald-700 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">
                      Record New Expense
                    </h3>
                    <p className="text-emerald-100 text-sm">
                      Double-entry accounting applied automatically
                    </p>
                  </div>
                </div>
                <button aria-label="Close"
                  onClick={() => setShowAddExpense(false)}
                  className="p-2 hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form
                onSubmit={handleCreateExpense}
                className="flex-1 overflow-auto p-4 space-y-4"
              >
                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expense Category <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={(e: any) =>
                      setFormData({ ...formData, categoryId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                  >
                    <option value="">Select category...</option>
                    {/* switched-off categories take no new expenses (the API refuses them) */}
                    {allCategories.filter((cat) => cat.isActive !== false).map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e: any) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                    placeholder="Enter description"
                  />
                </div>

                {/* Amount & Currency */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.amount || ""}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Currency <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={formData.currency}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          currency: parseInt(e.target.value),
                          paymentAccountId: "",
                          paymentAccountType:
                            // M-Pesa (type 2) is KES-only
                            parseInt(e.target.value) !== 0 &&
                            formData.paymentAccountType === 2
                              ? 0
                              : formData.paymentAccountType,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                    >
                      <option value={0}>KES - Kenyan Shilling</option>
                      <option value={1}>USD - US Dollar</option>
                      {currencyOk("UGX") && <option value={2}>UGX - Ugandan Shilling</option>}
                      <option value={3}>EUR - Euro</option>
                    </select>
                  </div>
                </div>

                {/* Vendor */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendor/Payee
                  </label>
                  <input
                    type="text"
                    value={formData.vendor}
                    onChange={(e: any) =>
                      setFormData({ ...formData, vendor: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                    placeholder="Enter vendor name"
                  />
                </div>

                {/* Payment Account Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Account Type <span className="text-red-600">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        type: 0,
                        icon: Banknote,
                        label: "Cash",
                        disabled: !hasCashAccounts,
                      },
                      {
                        type: 1,
                        icon: Building2,
                        label: "Bank",
                        disabled: !hasBankAccounts,
                      },
                      {
                        type: 2,
                        icon: Smartphone,
                        label: "Mobile money",
                        disabled: !hasMpesaAccounts, // only wallets that hold the expense's currency
                      },
                    ].map(({ type, icon: Icon, label, disabled }) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            paymentAccountType: type,
                            paymentAccountId: "",
                            ...(type === 2 ? { currency: base } : {}),
                          })
                        }
                        disabled={disabled}
                        className={`flex flex-col items-center gap-2 p-3 border transition-colors rounded-lg ${
                          formData.paymentAccountType === type
                            ? "border-blue-500 bg-[#E9EEF6] text-[#0F172A]"
                            : disabled
                              ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                              : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-sm font-medium">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Select Account */}
                {availableAccounts.length > 0 ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select Account <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={formData.paymentAccountId}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          paymentAccountId: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                    >
                      <option value="">Select account...</option>
                      {availableAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} (Balance:{" "}
                          {formatMoney(acc.balance, acc.currency)})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-800">
                        No Accounts Available
                      </p>
                      <p className="text-sm text-amber-700">
                        Please create an account first.
                      </p>
                    </div>
                  </div>
                )}

                {/* Date & Reference */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Expense Date <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.expenseDate}
                      onChange={(e: any) =>
                        setFormData({
                          ...formData,
                          expenseDate: e.target.value,
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
                      value={formData.reference}
                      onChange={(e: any) =>
                        setFormData({ ...formData, reference: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
                      placeholder="Optional reference"
                    />
                  </div>
                </div>

                {/* Double-Entry Preview */}
                <div className="bg-[#E9EEF6] border border-slate-200 p-4 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Receipt className="w-5 h-5 text-blue-600" />
                    <h4 className="font-semibold text-[#0F172A]">
                      Double-Entry Preview
                    </h4>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                      <div className="w-8 h-8 bg-red-100 flex items-center justify-center">
                        <ArrowUpCircle className="w-4 h-4 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">
                          Debit (Expense ↑)
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {allCategories.find(
                            (c) => c.id === formData.categoryId,
                          )?.name || "Select Category"}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-red-600">
                        +{formatMoney(formData.amount, formData.currency)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                      <div className="w-8 h-8 bg-emerald-100 flex items-center justify-center">
                        <ArrowDownCircle className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">
                          Credit (Asset ↓)
                        </p>
                        <p className="text-sm font-medium text-gray-900">
                          {
                            ["Cash", "Bank", "Mobile money"][
                              formData.paymentAccountType
                            ]
                          }{" "}
                          Account
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-700">
                        -{formatMoney(formData.amount, formData.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </form>

              {/* Footer */}
              <div className="flex gap-3 p-4 border-t border-gray-200 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setShowAddExpense(false)}
                  className="flex-1 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  onClick={handleCreateExpense}
                  disabled={isSubmitting || !formData.paymentAccountId}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {isSubmitting ? "Recording..." : "Record Expense"}
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}
    </>
  );
}
