"use client";

import { ArrowLeftRight, CreditCard, Smartphone, Wallet } from "lucide-react";
import { PaymentMethod } from "@/lib/api";
import { type TransactionFormVM } from "../useTransactionForm";

export function CounterAccountPicker({ vm }: { vm: TransactionFormVM }) {
  const { paymentMethod, setPaymentMethod } = vm;
  return (
    <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
              Via (Counter Account) *
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod(PaymentMethod.Cash)}
                className={`group p-2.5 border transition-all rounded-lg ${
                  paymentMethod === PaymentMethod.Cash
                    ? "border-blue-500 bg-blue-50 shadow-sm "
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                }`}
              >
                <Wallet
                  className={`w-5 h-5 mx-auto mb-1 ${
                    paymentMethod === PaymentMethod.Cash
                      ? "text-blue-600"
                      : "text-slate-500 group-hover:text-blue-500"
                  }`}
                />
                <div
                  className={`text-xs font-semibold ${
                    paymentMethod === PaymentMethod.Cash
                      ? "text-blue-700"
                      : "text-slate-600"
                  }`}
                >
                  Cash
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod(PaymentMethod.Bank)}
                className={`group p-2.5 border transition-all rounded-lg ${
                  paymentMethod === PaymentMethod.Bank
                    ? "border-blue-500 bg-blue-50 shadow-sm "
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                }`}
              >
                <CreditCard
                  className={`w-5 h-5 mx-auto mb-1 ${
                    paymentMethod === PaymentMethod.Bank
                      ? "text-blue-600"
                      : "text-slate-500 group-hover:text-blue-500"
                  }`}
                />
                <div
                  className={`text-xs font-semibold ${
                    paymentMethod === PaymentMethod.Bank
                      ? "text-blue-700"
                      : "text-slate-600"
                  }`}
                >
                  Bank
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod(PaymentMethod.Mpesa)}
                className={`group p-2.5 border transition-all rounded-lg ${
                  paymentMethod === PaymentMethod.Mpesa
                    ? "border-blue-500 bg-blue-50 shadow-sm "
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                }`}
              >
                <Smartphone
                  className={`w-5 h-5 mx-auto mb-1 ${
                    paymentMethod === PaymentMethod.Mpesa
                      ? "text-blue-600"
                      : "text-slate-500 group-hover:text-blue-500"
                  }`}
                />
                <div
                  className={`text-xs font-semibold ${
                    paymentMethod === PaymentMethod.Mpesa
                      ? "text-blue-700"
                      : "text-slate-600"
                  }`}
                >
                  Mobile money
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod(PaymentMethod.AccountTransfer)}
                className={`group p-2.5 border transition-all rounded-lg ${
                  paymentMethod === PaymentMethod.AccountTransfer
                    ? "border-blue-500 bg-blue-50 shadow-sm "
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                }`}
              >
                <ArrowLeftRight
                  className={`w-5 h-5 mx-auto mb-1 ${
                    paymentMethod === PaymentMethod.AccountTransfer
                      ? "text-blue-600"
                      : "text-slate-500 group-hover:text-blue-500"
                  }`}
                />
                <div
                  className={`text-xs font-semibold ${
                    paymentMethod === PaymentMethod.AccountTransfer
                      ? "text-blue-700"
                      : "text-slate-600"
                  }`}
                >
                  Transfer
                </div>
              </button>
            </div>
          </div>
  );
}
