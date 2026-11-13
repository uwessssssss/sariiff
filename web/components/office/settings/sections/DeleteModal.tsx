"use client";

import { AlertTriangle, RefreshCw, Tag, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { type OfficeSettingsVM } from "../useOfficeSettings";

export function DeleteModal({ vm }: { vm: OfficeSettingsVM }) {
  const { categoryToDelete, deletingCategoryId, handleDeleteCategory, setCategoryToDelete, setShowDeleteModal, showDeleteModal } = vm;
  return (
    <AnimatePresence>
      {showDeleteModal && categoryToDelete && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowDeleteModal(false);
            setCategoryToDelete(null);
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e: any) => e.stopPropagation()}
            className="bg-white shadow-2xl max-w-md w-full overflow-hidden"
          >
            {/* Header */}
            <div className="bg-red-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">Delete Category</h3>
                    <p className="text-sm text-white">
                      This action cannot be undone
                    </p>
                  </div>
                </div>
                <button aria-label="Close"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setCategoryToDelete(null);
                  }}
                  className="p-2 hover:bg-white/20 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-red-100 flex items-center justify-center flex-shrink-0">
                    <Tag className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-lg">
                      {categoryToDelete.name}
                    </p>
                    {categoryToDelete.description && (
                      <p className="text-sm text-slate-600 mt-1">
                        {categoryToDelete.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      Warning
                    </p>
                    <p className="text-sm text-amber-700 mt-1">
                      Only a category with no expenses can be deleted; the system
                      refuses a category that already has expenses recorded.
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-center text-slate-600">
                Are you sure you want to delete this expense category?
              </p>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleDeleteCategory}
                  disabled={deletingCategoryId === categoryToDelete.id}
                  className="flex-1 px-6 py-3 bg-red-600 text-white font-semibold hover:shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {deletingCategoryId === categoryToDelete.id ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Trash2 className="w-5 h-5" />
                  )}
                  Yes, Delete Category
                </button>
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setCategoryToDelete(null);
                  }}
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
