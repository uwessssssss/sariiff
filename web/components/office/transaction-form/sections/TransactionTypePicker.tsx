"use client";

import { Minus, Plus } from "lucide-react";
import { TransactionType } from "@/lib/api";
import { isAssetAccount } from "../helpers";
import { type TransactionFormVM } from "../useTransactionForm";

export function TransactionTypePicker({ vm }: { vm: TransactionFormVM }) {
  const { actionLabels, isBalanceIncrease, primaryAccountType, setTransactionType } = vm;
  return (
    <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Transaction Type *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* INCREASE Button (Green) */}
              <button
                type="button"
                onClick={() => setTransactionType(actionLabels.increase.type)}
                className={`group relative p-3 border transition-all duration-200 rounded-lg ${
                  isBalanceIncrease
                    ? "border-emerald-500 bg-emerald-50 shadow-md "
                    : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 flex items-center justify-center transition-all ${
                      isBalanceIncrease
                        ? "bg-emerald-600 shadow-sm "
                        : "bg-slate-100 group-hover:bg-emerald-100"
                    }`}
                  >
                    <Plus
                      className={`w-4 h-4 ${
                        isBalanceIncrease ? "text-white" : "text-slate-500"
                      }`}
                    />
                  </div>
                  <div className="text-left">
                    <div
                      className={`text-sm font-semibold ${
                        isBalanceIncrease
                          ? "text-emerald-700"
                          : "text-slate-700"
                      }`}
                    >
                      {actionLabels.increase.label}
                    </div>
                    <div className="text-xs text-slate-500">
                      {actionLabels.increase.description}
                    </div>
                  </div>
                </div>
                <div className="absolute top-1 right-1 text-xs font-mono text-slate-500">
                  {actionLabels.increase.type === TransactionType.Debit
                    ? "DR"
                    : "CR"}
                </div>
              </button>

              {/* DECREASE Button (Red) */}
              <button
                type="button"
                onClick={() => setTransactionType(actionLabels.decrease.type)}
                className={`group relative p-3 border transition-all duration-200 rounded-lg ${
                  !isBalanceIncrease
                    ? "border-red-500 bg-red-50 shadow-md "
                    : "border-slate-200 bg-white hover:border-red-300 hover:bg-red-50/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 flex items-center justify-center transition-all ${
                      !isBalanceIncrease
                        ? "bg-red-500 shadow-sm "
                        : "bg-slate-100 group-hover:bg-red-100"
                    }`}
                  >
                    <Minus
                      className={`w-4 h-4 ${
                        !isBalanceIncrease ? "text-white" : "text-slate-500"
                      }`}
                    />
                  </div>
                  <div className="text-left">
                    <div
                      className={`text-sm font-semibold ${
                        !isBalanceIncrease ? "text-red-700" : "text-slate-700"
                      }`}
                    >
                      {actionLabels.decrease.label}
                    </div>
                    <div className="text-xs text-slate-600">
                      {actionLabels.decrease.description}
                    </div>
                  </div>
                </div>
                <div className="absolute top-1 right-1 text-xs font-mono text-slate-600">
                  {actionLabels.decrease.type === TransactionType.Debit
                    ? "DR"
                    : "CR"}
                </div>
              </button>
            </div>

            {/* Accounting hint */}
            <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded">
              <p className="text-xs text-slate-600 flex items-center gap-1">
                <span>📚</span>
                <span>
                  {isAssetAccount(primaryAccountType) ? (
                    <>
                      <strong>Asset account:</strong> Debit = Balance ↑
                      (increase), Credit = Balance ↓ (decrease)
                    </>
                  ) : (
                    <>
                      <strong>Client account:</strong> Credit = Balance ↑
                      (deposit), Debit = Balance ↓ (withdraw)
                    </>
                  )}
                </span>
              </p>
            </div>
          </div>
  );
}
