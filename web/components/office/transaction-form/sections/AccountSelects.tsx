"use client";

import { ArrowLeftRight, Building2, Search, Smartphone, Wallet } from "lucide-react";
import { PaymentMethod, getCurrencyLabel } from "@/lib/api";
import { type TransactionFormVM } from "../useTransactionForm";

export function AccountSelects({ vm }: { vm: TransactionFormVM }) {
  const { counterAccountId, counterSearchTerm, filteredCounterAccounts, paymentMethod, setCounterAccountId, setCounterSearchTerm } = vm;
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
        {paymentMethod === PaymentMethod.Cash && (
          <>
            <Wallet className="w-3 h-3 inline mr-1" />
            Cash Account *
          </>
        )}
        {paymentMethod === PaymentMethod.Bank && (
          <>
            <Building2 className="w-3 h-3 inline mr-1" />
            Bank Account *
          </>
        )}
        {paymentMethod === PaymentMethod.Mpesa && (
          <>
            <Smartphone className="w-3 h-3 inline mr-1" />
            Mobile money agent *
          </>
        )}
        {paymentMethod === PaymentMethod.AccountTransfer && (
          <>
            <ArrowLeftRight className="w-3 h-3 inline mr-1" />
            Counter Account *
          </>
        )}
      </label>

      {paymentMethod === PaymentMethod.AccountTransfer && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={counterSearchTerm}
            onChange={(e: any) => setCounterSearchTerm(e.target.value)}
            placeholder="Search clients..."
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm rounded-lg"
          />
        </div>
      )}

      <select
        value={counterAccountId}
        onChange={(e: any) => setCounterAccountId(e.target.value)}
        className="w-full px-3 py-2.5 border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-sm rounded-lg"
        required
      >
        <option value="">
          Select{" "}
          {paymentMethod === PaymentMethod.Cash
            ? "cash account"
            : paymentMethod === PaymentMethod.Bank
              ? "bank"
              : paymentMethod === PaymentMethod.Mpesa
                ? "mobile money agent"
                : "account"}
          ...
        </option>
        {filteredCounterAccounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name} - {getCurrencyLabel(account.currency)}{" "}
            {account.balance.toLocaleString()}
          </option>
        ))}
      </select>
      {paymentMethod === PaymentMethod.AccountTransfer &&
        filteredCounterAccounts.length === 0 &&
        counterSearchTerm && (
          <p className="text-xs text-amber-700">
            No clients found matching "{counterSearchTerm}"
          </p>
        )}
    </div>
  );
}
