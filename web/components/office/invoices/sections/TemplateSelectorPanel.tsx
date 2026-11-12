"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Download, LayoutTemplate, Sparkles, Star, X } from "lucide-react";
import { INVOICE_TEMPLATES } from "../helpers";
import { type InvoiceManagementVM } from "../useInvoiceManagement";

export function TemplateSelectorPanel({ vm }: { vm: InvoiceManagementVM }) {
  const { exportToPDF, selectedInvoice, setSelectedTemplate, setShowTemplateSelector, showTemplateSelector } = vm;
  return (
    <AnimatePresence>
      {showTemplateSelector && selectedInvoice && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowTemplateSelector(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 30 }}
            onClick={(e: any) => e.stopPropagation()}
            className="bg-white w-full max-w-7xl max-h-[95vh] overflow-hidden shadow-2xl border-4 border-slate-200"
          >
            <div className="bg-blue-600 p-8 border-b-4 border-blue-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{
                      duration: 20,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="p-4 bg-white/20 border border-white/30 rounded-xl"
                  >
                    <LayoutTemplate className="w-10 h-10 text-white" />
                  </motion.div>
                  <div>
                    <h2 className="text-3xl font-semibold text-white mb-2">
                      Choose Your Template
                    </h2>
                    <p className="text-blue-50 text-lg">
                      Select a premium design for{" "}
                      {selectedInvoice.invoiceNumber}
                    </p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowTemplateSelector(false)}
                  className="text-white hover:bg-white/20 p-3 transition-all border border-white/30 rounded-lg"
                >
                  <X className="w-7 h-7" />
                </motion.button>
              </div>
            </div>

            <div className="p-8 overflow-y-auto max-h-[calc(95vh-160px)] bg-slate-50">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {INVOICE_TEMPLATES.map((template, index) => (
                  <motion.div
                    key={template.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.05, y: -10 }}
                    onClick={() => {
                      setSelectedTemplate(template.id);
                      exportToPDF(selectedInvoice, template.id);
                      setShowTemplateSelector(false);
                    }}
                    className="cursor-pointer border-4 border-slate-200 hover:border-blue-500 transition-all overflow-hidden group shadow-sm hover:shadow-md"
                  >
                    <div
                      className={`h-48 flex flex-col items-center justify-center relative overflow-hidden ${template.gradient}`}
                    >
                      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-all" />
                      <motion.div
                        animate={{ rotate: [0, 360] }}
                        transition={{
                          duration: 10,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        className="absolute top-4 right-4"
                      >
                        <Star className="w-8 h-8 text-white/30" />
                      </motion.div>
                      <Sparkles className="w-16 h-16 text-white mb-4 opacity-80 group-hover:opacity-100 transition-opacity" />
                      <div className="w-full px-4 space-y-2">
                        <div className="h-3 bg-white/30 w-3/4" />
                        <div className="h-2 bg-white/20 w-1/2" />
                        <div className="h-2 bg-white/20 w-2/3" />
                      </div>
                    </div>
                    <div className="p-5 bg-white group-hover: group-hover: group-hover: transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-lg text-slate-900">
                          {template.name}
                        </h3>
                        <Download className="w-5 h-5 text-slate-500 group-hover:text-blue-600 transition-colors" />
                      </div>
                      <p className="text-sm text-slate-600 mb-3">
                        {template.description}
                      </p>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6"
                          style={{ backgroundColor: template.color }}
                        />
                        <span className="text-xs font-mono text-slate-500">
                          {template.color}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
