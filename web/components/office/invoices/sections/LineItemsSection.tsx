"use client";

import { Plus, ShoppingCart, Trash2 } from "lucide-react";
import { money } from "../helpers";
import { motion } from "framer-motion";
import { type InvoiceManagementVM } from "../useInvoiceManagement";

export function LineItemsSection({ vm }: { vm: InvoiceManagementVM }) {
  const { addInvoiceItem, formData, removeInvoiceItem, showCreateModal, updateInvoiceItem } = vm;
  if (!(showCreateModal)) return null;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-emerald-600 flex items-center justify-center">
            <ShoppingCart className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-2xl font-semibold text-slate-800">
            Line Items
          </h3>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={addInvoiceItem}
          className="px-6 py-3 bg-emerald-700 text-white transition-all font-semibold flex items-center gap-2 shadow-sm hover:bg-emerald-700"
        >
          <Plus className="w-5 h-5" />
          Add Line Item
        </motion.button>
      </div>

      <div className="space-y-4">
        {formData.items.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="grid grid-cols-12 gap-4 p-6 bg-white border border-slate-200 hover:border-blue-300 transition-all shadow-md rounded-xl"
          >
            <div className="col-span-12 md:col-span-5">
              <input
                type="text"
                value={item.description}
                onChange={(e: any) =>
                  updateInvoiceItem(
                    item.id,
                    "description",
                    e.target.value,
                  )
                }
                className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-medium rounded-lg"
                placeholder="Item description..."
              />
            </div>
            <div className="col-span-4 md:col-span-2">
              <input
                type="number"
                value={item.quantity}
                onChange={(e: any) =>
                  updateInvoiceItem(
                    item.id,
                    "quantity",
                    parseFloat(e.target.value) || 0,
                  )
                }
                className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-semibold text-center rounded-lg"
                placeholder="Qty"
                min="1"
              />
            </div>
            <div className="col-span-4 md:col-span-2">
              <input
                type="number"
                value={item.unitPrice}
                onChange={(e: any) =>
                  updateInvoiceItem(
                    item.id,
                    "unitPrice",
                    parseFloat(e.target.value) || 0,
                  )
                }
                className="w-full px-4 py-3 border border-slate-200 focus:border-blue-500 focus:outline-none transition-all text-slate-900 font-semibold text-right rounded-lg"
                placeholder="Price"
                min="0"
                step="0.01"
              />
            </div>
            <div className="col-span-3 md:col-span-2">
              <div className="px-4 py-3 bg-slate-50 border border-blue-300 text-blue-700 font-semibold text-lg text-right rounded-lg">
                {money(item.amount)}
              </div>
            </div>
            <div className="col-span-1">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => removeInvoiceItem(item.id)}
                className="w-full h-full text-red-600 hover:bg-red-50 transition-all border border-transparent hover:border-red-200 flex items-center justify-center rounded-lg"
                disabled={formData.items.length === 1}
              >
                <Trash2 className="w-5 h-5" />
              </motion.button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
