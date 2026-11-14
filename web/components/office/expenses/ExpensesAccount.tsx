"use client";

import { AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useExpensesAccount } from "./useExpensesAccount";
import { HeaderSection1 } from "./sections/HeaderSection1";
import { HeaderSection2 } from "./sections/HeaderSection2";
import { AddExpenseModal } from "./sections/AddExpenseModal";
import { EditExpenseModal } from "./sections/EditExpenseModal";
import { DeleteModal } from "./sections/DeleteModal";

// ==============================================
// Main Component
// ==============================================

export function ExpensesAccount() {
  const vm = useExpensesAccount();
  const { isLoading } = vm;
  // ==============================================
  // Loading State
  // ==============================================

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading expenses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <HeaderSection1 vm={vm} />

      {/* ==================== CATEGORY DETAIL MODAL ==================== */}
      <HeaderSection2 vm={vm} />

      {/* ==================== ADD EXPENSE MODAL ==================== */}
      <AnimatePresence>
        <AddExpenseModal vm={vm} />
      </AnimatePresence>

      {/* ==================== EDIT EXPENSE MODAL ==================== */}
      <EditExpenseModal vm={vm} />

      {/* ==================== DELETE CONFIRMATION MODAL ==================== */}
      <DeleteModal vm={vm} />
    </div>
  );
}

export default ExpensesAccount;
