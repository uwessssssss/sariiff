"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, Clock, X } from "lucide-react";
import { formatDate, getAlertGradient, getAlertIcon } from "../helpers";
import { type ClientUserDashboardVM } from "../useClientUserDashboard";

export function AlertDetailModal({ vm }: { vm: ClientUserDashboardVM }) {
  const { handleMarkAlertRead, selectedAlert, setSelectedAlert } = vm;
  return (
    <AnimatePresence>
        {selectedAlert && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={() => setSelectedAlert(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white shadow-2xl z-50 max-h-[90vh] overflow-y-auto"
            >
              {(() => {
                const AlertIcon = getAlertIcon(selectedAlert.type);
                const gradient = getAlertGradient(selectedAlert.type);
                return (
                  <>
                    {/* Header */}
                    <div
                      className={`sticky top-0  ${gradient} p-6 border-b relative overflow-hidden z-10`}
                    >
                      <div className="absolute inset-0   " />
                      <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-white flex items-center justify-center ">
                            <AlertIcon className="w-7 h-7 text-slate-700" />
                          </div>
                          <div>
                            <h3 className="text-xl font-semibold text-white">
                              {selectedAlert.title}
                            </h3>
                            <p className="text-white text-sm font-semibold flex items-center gap-1.5 mt-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formatDate(selectedAlert.createdAt)}
                            </p>
                          </div>
                        </div>
                        <button aria-label="Close"
                          onClick={() => setSelectedAlert(null)}
                          className="rounded-lg p-2 hover:bg-white/20 transition-all"
                        >
                          <X className="w-6 h-6 text-white" />
                        </button>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-6">
                      <div className="p-5 bg-slate-50 border border-slate-200">
                        <p className="text-base leading-relaxed text-slate-900 font-medium">
                          {selectedAlert.message}
                        </p>
                      </div>

                      <div className="flex items-center justify-between p-4  bg-slate-50  border border-slate-200">
                        <div>
                          <p className="text-xs font-bold text-slate-600   mb-1">
                            Alert Type
                          </p>
                          <span
                            className={`inline-flex px-3 py-2 text-sm font-semibold border ${
                              selectedAlert.type === "success"
                                ? " bg-emerald-50  text-emerald-700 border-emerald-300"
                                : selectedAlert.type === "warning"
                                  ? " bg-amber-50  text-amber-700 border-amber-300"
                                  : selectedAlert.type === "error"
                                    ? " bg-red-50  text-red-700 border-red-300"
                                    : " bg-blue-50  text-blue-700 border-blue-300"
                            }`}
                          >
                            {selectedAlert.type.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-600   mb-1">
                            Status
                          </p>
                          <span
                            className={`inline-flex px-3 py-2 text-sm font-semibold ${
                              selectedAlert.isRead
                                ? "bg-slate-100 text-slate-600 border border-slate-300"
                                : "bg-blue-100 text-blue-700 border border-blue-300"
                            }`}
                          >
                            {selectedAlert.isRead ? "Read" : "Unread"}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3">
                        {!selectedAlert.isRead && (
                          <button
                            onClick={() => {
                              handleMarkAlertRead(selectedAlert.id);
                              setSelectedAlert({
                                ...selectedAlert,
                                isRead: true,
                              });
                            }}
                            className={`rounded-lg flex-1 flex items-center justify-center gap-2 px-4 py-3  ${gradient} text-white font-bold  transition-all`}
                          >
                            <CheckCircle className="w-4 h-4" />
                            Mark as Read
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedAlert(null)}
                          className={`rounded-lg ${
                            selectedAlert.isRead ? "flex-1" : ""
                          } px-4 py-3 bg-white text-slate-700 font-bold border border-slate-300 hover:border-slate-400 transition-all`}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </>
        )}
      </AnimatePresence>
  );
}
