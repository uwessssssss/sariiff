"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, RefreshCw, Tag, X } from "lucide-react";
import { type OfficeSettingsVM } from "../useOfficeSettings";

export function CategoryModal({ vm }: { vm: OfficeSettingsVM }) {
  const { categoryDescription, categoryLoading, categoryName, editingCategory, handleCreateCategory, handleUpdateCategory, setCategoryDescription, setCategoryName, setShowCategoryModal, showCategoryModal } = vm;
  return (
    <AnimatePresence>
      {showCategoryModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowCategoryModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e: any) => e.stopPropagation()}
            className="bg-white shadow-2xl max-w-md w-full overflow-hidden"
          >
            <div className="bg-[#0F172A] p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 flex items-center justify-center">
                    <Tag className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">
                      {editingCategory
                        ? "Edit Category"
                        : "New Expense Category"}
                    </h3>
                    <p className="text-sm text-slate-300">
                      {editingCategory
                        ? "Update category details"
                        : "Create a new expense category"}
                    </p>
                  </div>
                </div>
                <button aria-label="Close"
                  onClick={() => setShowCategoryModal(false)}
                  className="p-2 hover:bg-white/20 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
                  Category Name *
                </label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e: any) => setCategoryName(e.target.value)}
                  placeholder="e.g., Office Supplies, Utilities, Transport"
                  className="w-full px-4 py-3 border border-slate-200 focus:border-blue-600 outline-none bg-white rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 uppercase mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={categoryDescription}
                  onChange={(e: any) =>
                    setCategoryDescription(e.target.value)
                  }
                  placeholder="Brief description of this expense category..."
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 focus:border-blue-600 outline-none bg-white resize-none rounded-lg"
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                <p className="text-xs text-amber-800">
                  <strong>💡 Tip:</strong> Use clear, descriptive names for
                  your expense categories to make expense tracking easier.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={
                    editingCategory
                      ? handleUpdateCategory
                      : handleCreateCategory
                  }
                  disabled={categoryLoading || !categoryName.trim()}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {categoryLoading ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-5 h-5" />
                  )}
                  {editingCategory ? "Update Category" : "Create Category"}
                </button>
                <button
                  onClick={() => setShowCategoryModal(false)}
                  className="flex-1 px-6 py-3 bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
