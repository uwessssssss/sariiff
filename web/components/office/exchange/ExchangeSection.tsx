"use client";

import { AlertTriangle, ArrowLeftRight, BarChart3, Calculator, Calendar, Clock, Loader2, Minus, PiggyBank, Plus, TrendingUp } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { CalculatorModal } from "./parts/CalculatorModal";
import { DayCloseModal } from "./parts/DayCloseModal";
import { FundFloatModal } from "./parts/FundFloatModal";
import { NewExchangeModal } from "./parts/NewExchangeModal";
import { PinModal, checkPinStatus } from "@/components/ui/PinModal";
import { SetRateModal } from "./parts/SetRateModal";
import { SettleProfitModal } from "./parts/SettleProfitModal";
import { SuccessShareModal } from "@/components/ui/SuccessShareModal";
import { TransactionDetailModal } from "./parts/TransactionDetailModal";
import { UsdPositionModal } from "./parts/UsdPositionModal";
import { WithdrawFloatModal } from "./parts/WithdrawFloatModal";
import { formatNumber, getExchangeDailySummaries } from "@/lib/api";
import { localDate } from "@/lib/dates";
import { useExchangeSection } from "./useExchangeSection";
import { CurrentRateCard } from "./sections/CurrentRateCard";
import { TableHeaderSection } from "./sections/TableHeaderSection";
import { FloatHistoryModal } from "./sections/FloatHistoryModal";
import { RateHistoryModal } from "./sections/RateHistoryModal";

// ==============================================
// Main Component
// ==============================================

export function ExchangeSection() {
  const vm = useExchangeSection();
  const { accounts, actionLoading, alerts, baseCode, clients, currentRate, exchShareModal, exchangeFloat, executeVoid, handleFundFloat, handleNewExchange, handleRecordClosing, handleRecordOpening, handleSetRate, handleSettleProfit, handleVoidTransaction, handleWithdrawFloat, loading, pendingExchange, pendingVoid, ratesByCurrency, selectedTransaction, setExchShareModal, setFloatHistory, setPendingExchange, setPendingVoid, setSelectedTransaction, setShowCalculatorModal, setShowDayCloseModal, setShowFloatHistory, setShowFundFloatModal, setShowNewExchangeModal, setShowPin, setShowRateHistoryModal, setShowSetRateModal, setShowSettleProfitModal, setShowTransactionModal, setShowUsdPositionModal, setShowWithdrawFloatModal, showCalculatorModal, showDayCloseModal, showFundFloatModal, showNewExchangeModal, showPin, showSetRateModal, showSettleProfitModal, showTransactionModal, showUsdPositionModal, showWithdrawFloatModal, todaySummary, usdPosition } = vm;
  // ==============================================
  // Loading State
  // ==============================================

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading Exchange Account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Exchange
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Buy and sell foreign currency, rates and float
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowCalculatorModal(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Calculator className="w-4 h-4" />
              Calculator
            </button>
            <button
              onClick={() => setShowRateHistoryModal(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <TrendingUp className="w-4 h-4" />
              Rate history
            </button>
            <button
              onClick={async () => {
                const now = new Date();
                const from = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
                const to = localDate(now);
                const res = await getExchangeDailySummaries(from, to);
                if (res.success) setFloatHistory(res.data || []);
                setShowFloatHistory(true);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Calendar className="w-4 h-4" />
              Float history
            </button>
            <button
              onClick={() => setShowDayCloseModal(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Clock className="w-4 h-4" />
              Day close
            </button>
            <button
              onClick={() => setShowNewExchangeModal(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeftRight className="w-4 h-4" />
              New exchange
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((alert, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg"
            >
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Current Rate Card */}
      <CurrentRateCard vm={vm} />

      {/* Quick Actions & Profit Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <button
          onClick={() => setShowFundFloatModal(true)}
          className="rounded-lg flex items-center gap-3 p-4 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
        >
          <div className="w-10 h-10 bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
            <Plus className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">Fund Float</p>
            <p className="text-xs text-gray-600">Add {baseCode} or foreign currency</p>
          </div>
        </button>

        <button
          onClick={() => setShowWithdrawFloatModal(true)}
          className="rounded-lg flex items-center gap-3 p-4 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
        >
          <div className="w-10 h-10 bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
            <Minus className="w-5 h-5 text-amber-700" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">Withdraw</p>
            <p className="text-xs text-gray-600">Transfer out</p>
          </div>
        </button>

        <button
          onClick={() => setShowSettleProfitModal(true)}
          className="rounded-lg flex items-center gap-3 p-4 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
        >
          <div className="w-10 h-10 bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
            <PiggyBank className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">Settle Profit</p>
            <p className="text-xs text-gray-600">
              {baseCode} {formatNumber(exchangeFloat?.kesProfit || 0)}
            </p>
          </div>
        </button>

        <button
          onClick={() => setShowUsdPositionModal(true)}
          className="rounded-lg flex items-center gap-3 p-4 bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
        >
          <div className="w-10 h-10 bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
            <BarChart3 className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">USD Position</p>
            <p className="text-xs text-gray-600">View P&L</p>
          </div>
        </button>
      </div>

      {/* Transactions Table */}
      <TableHeaderSection vm={vm} />

      {/* Modals */}
      <AnimatePresence>
        {/* Set Rate Modal */}
        {showSetRateModal && (
          <SetRateModal
            currentRate={currentRate}
            onClose={() => setShowSetRateModal(false)}
            onSubmit={handleSetRate}
            loading={actionLoading}
          />
        )}

        {/* New Exchange Modal */}
        {showNewExchangeModal && (
          <NewExchangeModal
            rates={ratesByCurrency}
            clients={clients}
            onClose={() => setShowNewExchangeModal(false)}
            onSubmit={async (data: any) => {
              const status = await checkPinStatus();
              if (status.isEnabled && status.hasPin) {
                setPendingExchange(data);
                setShowPin(true);
              } else {
                handleNewExchange(data);
              }
            }}
            loading={actionLoading}
          />
        )}

        {/* Fund Float Modal */}
        {showFundFloatModal && (
          <FundFloatModal
            accounts={accounts}
            onClose={() => setShowFundFloatModal(false)}
            onSubmit={handleFundFloat}
            loading={actionLoading}
          />
        )}

        {/* Withdraw Float Modal */}
        {showWithdrawFloatModal && (
          <WithdrawFloatModal
            accounts={accounts}
            exchangeFloat={exchangeFloat}
            onClose={() => setShowWithdrawFloatModal(false)}
            onSubmit={handleWithdrawFloat}
            loading={actionLoading}
          />
        )}

        {/* Settle Profit Modal */}
        {showSettleProfitModal && (
          <SettleProfitModal
            accounts={accounts}
            exchangeFloat={exchangeFloat}
            onClose={() => setShowSettleProfitModal(false)}
            onSubmit={handleSettleProfit}
            loading={actionLoading}
          />
        )}

        {/* USD Position Modal */}
        {showUsdPositionModal && usdPosition && (
          <UsdPositionModal
            position={usdPosition}
            onClose={() => setShowUsdPositionModal(false)}
          />
        )}

        {/* Calculator Modal */}
        {showCalculatorModal && Object.keys(ratesByCurrency).length > 0 && (
          <CalculatorModal
            rates={ratesByCurrency}
            onClose={() => setShowCalculatorModal(false)}
          />
        )}

        {/* Float History Modal */}
        <FloatHistoryModal vm={vm} />

        {/* Rate History Modal */}
        <RateHistoryModal vm={vm} />

        {/* Day Close Modal */}
        {showDayCloseModal && (
          <DayCloseModal
            exchangeFloat={exchangeFloat}
            todaySummary={todaySummary}
            onClose={() => setShowDayCloseModal(false)}
            onOpening={handleRecordOpening}
            onClosing={handleRecordClosing}
            loading={actionLoading}
          />
        )}

        {/* Transaction Detail Modal */}
        {showTransactionModal && selectedTransaction && (
          <TransactionDetailModal
            transaction={selectedTransaction}
            onClose={() => {
              setShowTransactionModal(false);
              setSelectedTransaction(null);
            }}
            onVoid={handleVoidTransaction}
            loading={actionLoading}
          />
        )}
      </AnimatePresence>
      <SuccessShareModal
        isOpen={exchShareModal.show}
        onClose={() => setExchShareModal((s) => ({ ...s, show: false }))}
        title={exchShareModal.title}
        details={exchShareModal.details}
        whatsappPhone={exchShareModal.phone}
        whatsappMessage={exchShareModal.message}
      />
      <PinModal
        isOpen={showPin}
        onClose={() => {
          setShowPin(false);
          setPendingExchange(null);
        }}
        onVerified={() => {
          setShowPin(false);
          if (pendingVoid) {
            executeVoid(pendingVoid.id, pendingVoid.reason);
            setPendingVoid(null);
          } else if (pendingExchange) {
            handleNewExchange(pendingExchange);
            setPendingExchange(null);
          }
        }}
        title="Enter Transaction PIN"
      />
    </div>
  );
}
