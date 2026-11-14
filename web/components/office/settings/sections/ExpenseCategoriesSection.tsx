"use client";

import { CheckCircle, Edit, FolderOpen, Plus, RefreshCw, Search, Tag, Trash2, XCircle } from "lucide-react";
import { type OfficeSettingsVM } from "../useOfficeSettings";

export function ExpenseCategoriesSection({ vm }: { vm: OfficeSettingsVM }) {
  const { categoryLoading, categorySearchTerm, deletingCategoryId, expenseCategories, filteredCategories, openDeleteCategoryModal, openEditCategoryModal, openNewCategoryModal, setCategorySearchTerm } = vm;
  return (
    <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#E9EEF6] flex items-center justify-center">
            <Tag className="w-5 h-5 text-[#0F172A]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Expense Categories
            </h3>
            <p className="text-sm text-slate-600">
              Manage categories for expense tracking
            </p>
          </div>
        </div>
        <button
          onClick={openNewCategoryModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 rounded-lg transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            value={categorySearchTerm}
            onChange={(e: any) => setCategorySearchTerm(e.target.value)}
            placeholder="Search categories..."
            className="w-full pl-10 pr-4 py-3 border border-slate-300 focus:border-blue-600 outline-none bg-white rounded-lg"
          />
        </div>
      </div>

      {categoryLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-lg">
          <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 mb-2">No expense categories found</p>
          <p className="text-sm text-slate-500">
            Create categories to organize your expenses
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 overflow-hidden rounded-lg">
          <div className="overflow-x-auto max-w-full max-h-96">
            <table className="w-full">
              <thead className="bg-[#E9EEF6]">
                <tr className="border-slate-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                    Category Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#334155]">
                    Description
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[#334155]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCategories.map((category) => (
                  <tr
                    key={category.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#E9EEF6] flex items-center justify-center">
                          <Tag className="w-4 h-4 text-[#0F172A]" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900">
                          {category.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600 line-clamp-2">
                        {category.description || "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {category.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700">
                          <CheckCircle className="w-3 h-3" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700">
                          <XCircle className="w-3 h-3" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditCategoryModal(category)}
                          className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 transition-all"
                          title="Edit Category"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openDeleteCategoryModal(category)}
                          disabled={deletingCategoryId === category.id}
                          className="p-2 bg-red-100 hover:bg-red-200 text-red-700 transition-all disabled:opacity-50"
                          title="Delete Category"
                        >
                          {deletingCategoryId === category.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {expenseCategories.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="bg-white p-4 border border-slate-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-600 uppercase mb-1">
              Total Categories
            </p>
            <p className="text-2xl font-semibold text-slate-900">
              {expenseCategories.length}
            </p>
          </div>
          <div className="bg-white p-4 border border-slate-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-600 uppercase mb-1">
              Active Categories
            </p>
            <p className="text-2xl font-semibold text-emerald-600">
              {expenseCategories.filter((c) => c.isActive).length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
