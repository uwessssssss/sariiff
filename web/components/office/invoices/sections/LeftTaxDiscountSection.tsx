"use client";

import { CreditCard, Receipt } from "lucide-react";
import { money } from "../helpers";
import { type InvoiceManagementVM } from "../useInvoiceManagement";

export function LeftTaxDiscountSection({ vm }: { vm: InvoiceManagementVM }) {
  const { formData, setFormData, showCreateModal, subtotal, taxAmount, total } = vm;
  if (!(showCreateModal)) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left - Tax & Discount */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-amber-600 flex items-center justify-center">
            <CreditCard className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-2xl font-semibold text-slate-800">
            Adjustments
          </h3>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Tax Rate (%)
            </label>
            <input
              type="number"
              value={formData.tax}
              onChange={(e: any) =>
                setFormData({
                  ...formData,
                  tax: parseFloat(e.target.value) || 0,
                })
              }
              className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-semibold text-lg rounded-lg"
              placeholder="0"
              min="0"
              max="100"
              step="0.01"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Discount Amount
            </label>
            <input
              type="number"
              value={formData.discount}
              onChange={(e: any) =>
                setFormData({
                  ...formData,
                  discount: parseFloat(e.target.value) || 0,
                })
              }
              className="w-full px-5 py-4 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-semibold text-lg rounded-lg"
              placeholder="0"
              min="0"
              step="0.01"
            />
          </div>
        </div>
      </div>

      {/* Right - Totals */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-blue-600 flex items-center justify-center">
            <Receipt className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-2xl font-semibold text-slate-800">
            Summary
          </h3>
        </div>
        <div className="bg-slate-50 p-8 border border-blue-300 shadow-sm rounded-xl">
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b-2 border-blue-200">
              <span className="text-lg font-semibold text-slate-700">
                Subtotal:
              </span>
              <span className="text-xl font-semibold text-slate-900">
                {formData.currency} {money(subtotal)}
              </span>
            </div>
            {formData.tax > 0 && (
              <div className="flex justify-between items-center pb-2 border-b-2 border-blue-200">
                <span className="text-lg font-semibold text-slate-700">
                  Tax ({formData.tax}%):
                </span>
                <span className="text-xl font-semibold text-blue-700">
                  {formData.currency} {money(taxAmount)}
                </span>
              </div>
            )}
            {formData.discount > 0 && (
              <div className="flex justify-between items-center pb-2 border-b-2 border-blue-200">
                <span className="text-lg font-semibold text-slate-700">
                  Discount:
                </span>
                <span className="text-xl font-semibold text-red-600">
                  -{formData.currency}{" "}
                  {money(formData.discount)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center pt-4 border-t-4 border-blue-400">
              <span className="text-2xl font-semibold text-slate-900">
                TOTAL:
              </span>
              <span className="text-3xl font-semibold text-slate-900">
                {formData.currency} {money(total)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
