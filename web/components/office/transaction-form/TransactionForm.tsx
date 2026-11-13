"use client";

import { AccountType, TransactionType, getCurrencyLabel } from "@/lib/api";
import { localDate } from "@/lib/dates";
import { ArrowDownCircle, ArrowUpCircle, Calendar, DollarSign, FileText, Loader2, Minus, Plus, RefreshCw, Search, User, X } from "lucide-react";
import { PinModal } from "@/components/ui/PinModal";
import { SuccessShareModal } from "@/components/ui/SuccessShareModal";
import { TransactionFormProps, rateLabel } from "./helpers";
import { motion } from "framer-motion";
import { useTransactionForm } from "./useTransactionForm";
import { buildTransactionFormView } from "./buildTransactionFormView";
import { TransactionTypePicker } from "./sections/TransactionTypePicker";
import { CounterAccountPicker } from "./sections/CounterAccountPicker";
import { AccountSelects } from "./sections/AccountSelects";

export function TransactionForm({ onClose, onSuccess }: TransactionFormProps) {
  const data = useTransactionForm({ onClose, onSuccess });
  const { isLoading } = data;
  // Loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
        <div className="bg-white p-8 text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading accounts...</p>
        </div>
      </div>
    );
  }

  const vm = { ...data, ...buildTransactionFormView(data) };
  const { actionLabels, amount, base, buttonGradient, convertedAmount, counterAccount, currency, dateValue, description, exchangeRate, filteredPrimaryAccounts, handleSubmit, handleSubmitWithPin, headerGradient, isBalanceIncrease, isSubmitting, needsExchangeRate, notes, primaryAccount, primaryAccountId, primaryAccountType, primarySearchTerm, setAmount, setDateValue, setDescription, setExchangeRate, setNotes, setPrimaryAccountId, setPrimaryAccountType, setPrimarySearchTerm, setShareModal, setShowPin, shareModal, showPin, summaryBorderColor, transactionType } = vm;
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 20 }}
        transition={{ type: "spring", damping: 30, stiffness: 400 }}
        className="bg-white shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-slate-200 rounded-lg"
      >
        {/* Header - Color based on balance effect */}
        <div
          className={`relative p-5 ${headerGradient} text-white transition-all duration-300`}
        >
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.15)_25%,rgba(255,255,255,.15)_50%,transparent_50%,transparent_75%,rgba(255,255,255,.15)_75%,rgba(255,255,255,.15))] bg-[length:20px_20px]"></div>

          <button aria-label="Close"
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 bg-white/10 hover:bg-white/20 transition-all"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 bg-white/15 flex items-center justify-center border border-white/20 rounded-lg">
              {isBalanceIncrease ? (
                <ArrowUpCircle className="w-5 h-5" />
              ) : (
                <ArrowDownCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold">New Transaction</h2>
              <p className="text-xs">
                {isBalanceIncrease ? "Balance Increase" : "Balance Decrease"} •{" "}
                {transactionType === TransactionType.Debit ? "Debit" : "Credit"}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmitWithPin}
          className="p-5 space-y-4 overflow-y-auto max-h-[calc(90vh-180px)]"
        >
          {/* Primary Account Selection FIRST */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
              <User className="w-3 h-3 inline mr-1" />
              Select Account *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={primaryAccountType}
                onChange={(e: any) => {
                  setPrimaryAccountType(Number(e.target.value) as AccountType);
                  setPrimaryAccountId("");
                  setPrimarySearchTerm("");
                }}
                className="px-3 py-2.5 border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-sm rounded-lg"
              >
                <option value={AccountType.Client}>Client</option>
                <option value={AccountType.Cash}>Cash</option>
                <option value={AccountType.Bank}>Bank</option>
                <option value={AccountType.Mpesa}>Mobile money</option>
              </select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={primarySearchTerm}
                  onChange={(e: any) => setPrimarySearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm rounded-lg"
                />
              </div>
            </div>
            <select
              value={primaryAccountId}
              onChange={(e: any) => setPrimaryAccountId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-sm rounded-lg"
              required
            >
              <option value="">Select account...</option>
              {filteredPrimaryAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} - {getCurrencyLabel(account.currency)}{" "}
                  {account.balance.toLocaleString()}
                </option>
              ))}
            </select>
            {primaryAccountType === AccountType.Client &&
              filteredPrimaryAccounts.length === 0 &&
              primarySearchTerm && (
                <p className="text-xs text-amber-700">
                  No clients found matching "{primarySearchTerm}"
                </p>
              )}
            {primaryAccountType === AccountType.Client && (
              <p className="text-xs text-slate-500">
                💡 Each client has a separate balance in every currency
              </p>
            )}
          </div>

          {/* Transaction Type Toggle - DYNAMIC based on account type */}
          <TransactionTypePicker vm={vm} />

          {/* Payment Method */}
          <CounterAccountPicker vm={vm} />

          {/* Counter Account Selection */}
          <AccountSelects vm={vm} />

          {/* Amount & Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                <DollarSign className="w-3 h-3 inline mr-1" />
                Amount (
                {counterAccount
                  ? getCurrencyLabel(counterAccount.currency)
                  : "Select account"}
                ) *
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e: any) => setAmount(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-semibold text-sm rounded-lg"
                placeholder="0.00"
                step="0.01"
                min="0"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                Currency (Auto)
              </label>
              <div className="px-3 py-2.5 border border-slate-200 bg-slate-50 text-slate-700 font-semibold text-sm rounded-lg">
                {getCurrencyLabel(currency)}
              </div>
            </div>
          </div>

          {/* Exchange Rate (if needed) */}
          {needsExchangeRate() && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 p-3 bg-amber-50 border-l-4 border-amber-500">
                <RefreshCw
                  className="w-4 h-4 text-amber-600 animate-spin"
                  style={{ animationDuration: "3s" }}
                />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-amber-900">
                    Currency Exchange Required
                  </p>
                  <p className="text-xs text-amber-700">
                    {counterAccount?.name} (
                    {getCurrencyLabel(counterAccount?.currency!)}) →{" "}
                    {primaryAccount?.name} (
                    {getCurrencyLabel(primaryAccount?.currency!)})
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1.5">
                  <RefreshCw className="w-3 h-3 inline mr-1" />
                  Exchange Rate ({rateLabel(base, counterAccount?.currency, primaryAccount?.currency)}) *
                </label>
                <input
                  type="number"
                  value={exchangeRate}
                  onChange={(e: any) => setExchangeRate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-amber-300 bg-amber-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-semibold text-sm rounded-lg"
                  placeholder="e.g., 130.50"
                  step="any"
                  required
                />
              </div>

              {convertedAmount && amount && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-xs font-semibold text-blue-900 mb-1">
                    Conversion Preview
                  </p>
                  <div className="text-sm text-blue-800">
                    <span className="font-mono">
                      {getCurrencyLabel(counterAccount!.currency)}{" "}
                      {parseFloat(amount).toLocaleString()}
                    </span>
                    <span className="mx-2">
                      {counterAccount!.currency === base ? "÷" : "×"}
                    </span>
                    <span className="font-mono">
                      {parseFloat(exchangeRate).toLocaleString()}
                    </span>
                    <span className="mx-2">=</span>
                    <span className="font-semibold text-emerald-700">
                      {getCurrencyLabel(convertedAmount.currency)}{" "}
                      {convertedAmount.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
              <FileText className="w-3 h-3 inline mr-1" />
              Description *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e: any) => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 border border-blue-300 text-slate-900 bg-blue-50/20 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium rounded-lg"
              placeholder="e.g., Client deposit, Cash receipt, Bank transfer..."
              required
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
              <Calendar className="w-3 h-3 inline mr-1" />
              Transaction Date *
            </label>
            <input
              type="date"
              value={dateValue}
              max={localDate()}
              onChange={(e: any) => setDateValue(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm rounded-lg"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
              Notes (optional, the client sees them)
            </label>
            <textarea
              value={notes}
              onChange={(e: any) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm resize-none rounded-lg"
              rows={2}
              placeholder="Shown on the client's statement and receipt"
            />
          </div>

          {/* Summary */}
          <div className={`p-3 border-l-4 ${summaryBorderColor}`}>
            <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">
              Transaction Summary
            </h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">Action:</span>
                <span
                  className={`font-semibold ${
                    isBalanceIncrease ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {isBalanceIncrease
                    ? actionLabels.increase.label
                    : actionLabels.decrease.label}{" "}
                  ({transactionType === TransactionType.Debit ? "DR" : "CR"})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Account:</span>
                <span className="font-semibold text-slate-900 truncate max-w-[200px]">
                  {primaryAccount?.name || "Not selected"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Via:</span>
                <span className="font-semibold text-slate-900 truncate max-w-[200px]">
                  {counterAccount?.name || "Not selected"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Amount:</span>
                <span className="font-semibold text-slate-900">
                  {getCurrencyLabel(currency)} {amount || "0.00"}
                </span>
              </div>
              {convertedAmount && (
                <div className="flex justify-between pt-1 border-t border-slate-200 mt-1">
                  <span className="text-slate-600">Converted:</span>
                  <span className="font-semibold text-amber-700">
                    {getCurrencyLabel(convertedAmount.currency)}{" "}
                    {convertedAmount.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Balance Effect:</span>
                <span
                  className={`font-semibold ${
                    isBalanceIncrease ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {isBalanceIncrease ? "↑ Increase" : "↓ Decrease"}
                </span>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-200 hover:bg-white hover:border-slate-300 transition-all font-semibold text-sm text-slate-700 rounded-lg"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmitWithPin}
            className={`flex-1 px-4 py-2.5 ${buttonGradient} text-white font-semibold text-sm transition-all shadow-md disabled:opacity-50`}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Processing...
              </>
            ) : (
              <>
                {isBalanceIncrease ? (
                  <Plus className="w-4 h-4 inline mr-1" />
                ) : (
                  <Minus className="w-4 h-4 inline mr-1" />
                )}
                {isBalanceIncrease
                  ? actionLabels.increase.label
                  : actionLabels.decrease.label}
              </>
            )}
          </button>
        </div>
      </motion.div>
      <SuccessShareModal
        isOpen={shareModal.show}
        onClose={() => {
          setShareModal((s) => ({ ...s, show: false }));
          onClose();
        }}
        title={shareModal.title}
        details={shareModal.details}
        whatsappPhone={shareModal.phone}
        whatsappMessage={shareModal.message}
      />
      <PinModal
        isOpen={showPin}
        onClose={() => setShowPin(false)}
        onVerified={() => {
          setShowPin(false);
          handleSubmit();
        }}
        title="Enter Transaction PIN"
      />
    </div>
  );
}
