"use client";

import { AccountType, Currency, type CurrencyCountDto, recordClosingFloat, recordOpeningFloat, settleExchangeProfit, voidExchange, withdrawExchangeFloat } from "@/lib/api";
import { checkPinStatus } from "@/components/ui/PinModal";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { type useExchangeSectionState } from "./useExchangeSectionState";

/** ExchangeSection: data (part 2 of 2 of useExchangeSection). */
export function useExchangeSectionData(prev: ReturnType<typeof useExchangeSectionState>) {
  const { currentRate, loadData, loadTransactions, pageSize, setActionLoading, setExchangeFloat, setSelectedTransaction, setShowDayCloseModal, setShowPin, setShowSettleProfitModal, setShowTransactionModal, setShowWithdrawFloatModal, setTodaySummary, totalCount } = prev;
  const handleWithdrawFloat = async (data: {
    currency: Currency;
    amount: number;
    destinationType: AccountType;
    destinationAccountId: string;
    notes?: string;
  }) => {
    setActionLoading(true);
    try {
      const res = await withdrawExchangeFloat(data);
      if (res.success && res.data) {
        setExchangeFloat(res.data);
        toast.success("Withdrawal successful");
        setShowWithdrawFloatModal(false);
        loadData();
      } else {
        toast.error(res.message || "Failed to withdraw from float");
      }
    } catch (error) {
      toast.error("Failed to withdraw from float");
    } finally {
      setActionLoading(false);
    }
  };
  const handleSettleProfit = async (data: {
    currency: Currency;
    amount: number;
    destinationType: AccountType;
    destinationAccountId: string;
    notes?: string;
  }) => {
    setActionLoading(true);
    try {
      const res = await settleExchangeProfit(data);
      if (res.success && res.data) {
        setExchangeFloat(res.data);
        toast.success("Profit settled successfully");
        setShowSettleProfitModal(false);
        loadData();
      } else {
        toast.error(res.message || "Failed to settle profit");
      }
    } catch (error) {
      toast.error("Failed to settle profit");
    } finally {
      setActionLoading(false);
    }
  };
  const handleRecordOpening = async (
    kesCount: number,
    usdCount: number,
    notes?: string,
    otherCounts?: CurrencyCountDto[],
  ) => {
    setActionLoading(true);
    try {
      const res = await recordOpeningFloat({ kesCount, usdCount, notes, otherCounts });
      if (res.success) {
        toast.success("Opening float recorded successfully");
        setShowDayCloseModal(false);
        loadData();
      } else {
        toast.error(res.message || "Failed to record opening");
      }
    } catch {
      toast.error("Failed to record opening");
    } finally {
      setActionLoading(false);
    }
  };
  const handleRecordClosing = async (
    kesCount: number,
    usdCount: number,
    notes?: string,
    otherCounts?: CurrencyCountDto[],
  ) => {
    setActionLoading(true);
    try {
      const res = await recordClosingFloat({ kesCount, usdCount, notes, otherCounts });
      if (res.success && res.data) {
        setTodaySummary(res.data);
        toast.success("Day closed successfully");
        setShowDayCloseModal(false);
        loadData();
      } else {
        toast.error(res.message || "Failed to close day");
      }
    } catch (error) {
      toast.error("Failed to close day");
    } finally {
      setActionLoading(false);
    }
  };
  const handleVoidTransaction = async (id: string, reason: string) => {
    // Check PIN first
    const status = await checkPinStatus();
    if (status.isEnabled && status.hasPin) {
      setPendingVoid({ id, reason });
      setShowPin(true);
      return;
    }
    executeVoid(id, reason);
  };
  const [pendingVoid, setPendingVoid] = useState<{
    id: string;
    reason: string;
  } | null>(null);
  const executeVoid = async (id: string, reason: string) => {
    setActionLoading(true);
    try {
      const res = await voidExchange(id, reason);
      if (res.success) {
        toast.success("Transaction voided");
        setShowTransactionModal(false);
        setSelectedTransaction(null);
        loadData();
      } else {
        toast.error(res.message || "Failed to void transaction");
      }
    } catch (error) {
      toast.error("Failed to void transaction");
    } finally {
      setActionLoading(false);
    }
  };
  // ==============================================
  // Computed Values
  // ==============================================

  const spread = currentRate ? currentRate.sellRate - currentRate.buyRate : 0;
  const marginPercent =
    currentRate && currentRate.buyRate > 0
      ? ((spread / currentRate.buyRate) * 100).toFixed(2)
      : "0";
  const totalPages = Math.ceil(totalCount / pageSize);
  useEffect(() => {
    loadData();
  }, [loadData]);
  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  return {
    handleWithdrawFloat,
    handleSettleProfit,
    handleRecordOpening,
    handleRecordClosing,
    handleVoidTransaction,
    pendingVoid,
    setPendingVoid,
    executeVoid,
    spread,
    marginPercent,
    totalPages,
  };
}
