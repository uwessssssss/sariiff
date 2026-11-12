"use client";

import { Bell, ChevronRight, Clock, Loader2 } from "lucide-react";
import { formatDate, getAlertBorderClass, getAlertGradient, getAlertIcon } from "../helpers";
import { motion } from "framer-motion";
import { type ClientUserDashboardVM } from "../useClientUserDashboard";

export function AlertsView({ vm }: { vm: ClientUserDashboardVM }) {
  const { activeView, alertPage, alertTotalPages, alerts, handleMarkAllAlertsRead, loadingAlerts, setAlertPage, setSelectedAlert, setUnreadOnly, unreadOnly } = vm;
  return (
    <>
{activeView === "alerts" && (
              <motion.div
                key="alerts"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-8"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-semibold      text-slate-900 tracking-tight">
                      Notifications & Alerts
                    </h1>
                    <p className="text-slate-600 mt-2">
                      Stay updated with your account activity
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setUnreadOnly(!unreadOnly)}
                      className={`rounded-lg px-5 py-3 text-sm font-bold transition-all ${
                        unreadOnly
                          ? " bg-amber-700  text-white "
                          : "bg-white text-slate-700 border border-slate-300"
                      }`}
                    >
                      {unreadOnly ? "Showing Unread" : "Show Unread Only"}
                    </button>
                    <button
                      onClick={handleMarkAllAlertsRead}
                      className="rounded-lg px-5 py-3 text-sm font-bold text-slate-700 bg-white border border-slate-300 hover:border-emerald-300 hover:bg-emerald-50 transition-all"
                    >
                      Mark All Read
                    </button>
                  </div>
                </div>

                {loadingAlerts ? (
                  <div className="p-12 text-center">
                    <Loader2 className="w-10 h-10 text-amber-600 animate-spin mx-auto mb-4" />
                    <p className="text-slate-600">Loading alerts...</p>
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="rounded-xl bg-white  border border-slate-200 p-12 text-center ">
                    <Bell className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-slate-700 mb-2">
                      No Alerts
                    </h3>
                    <p className="text-slate-600">You're all caught up!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {alerts.map((alert) => {
                      const AlertIcon = getAlertIcon(alert.type);
                      const gradient = getAlertGradient(alert.type);
                      const borderClass = getAlertBorderClass(alert.type);

                      return (
                        <button
                          key={alert.id}
                          onClick={() => setSelectedAlert(alert)}
                          className={`rounded-lg w-full bg-white  border  p-6 transition-all text-left group relative overflow-hidden ${borderClass} ${
                            alert.isRead ? "bg-slate-50" : ""
                          }`}
                        >
                          <div
                            className={`absolute inset-0  ${gradient} opacity-0 group-hover:opacity-5 transition-opacity`}
                          />
                          <div className="flex items-start gap-4 relative z-10">
                            <div
                              className={`w-12 h-12 shrink-0 flex items-center justify-center   ${gradient}`}
                            >
                              <AlertIcon className="w-6 h-6 text-white" />
                            </div>
                            {/* min-w-0 + break-words: a long unbroken word (a link, a reference) wraps instead of running off the card */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="font-semibold text-slate-900 text-lg group-hover:text-blue-600 transition-colors">
                                  {alert.title}
                                </h4>
                                {!alert.isRead && (
                                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                )}
                              </div>
                              <p className="text-slate-600 mb-3 leading-relaxed break-words [overflow-wrap:anywhere]">
                                {alert.message}
                              </p>
                              <p className="text-sm text-slate-600 flex items-center gap-1.5">
                                <Clock className="w-4 h-4" />
                                {formatDate(alert.createdAt)}
                              </p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-blue-600  transition-all flex-shrink-0" />
                          </div>
                        </button>
                      );
                    })}

                    {/* Alert Pagination */}
                    {alertTotalPages > 1 && (
                      <div className="flex items-center justify-center gap-2 pt-4">
                        <button
                          onClick={() =>
                            setAlertPage((p) => Math.max(1, p - 1))
                          }
                          disabled={alertPage === 1}
                          className="rounded-lg px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <span className="text-sm text-slate-600">
                          Page {alertPage} of {alertTotalPages}
                        </span>
                        <button
                          onClick={() =>
                            setAlertPage((p) =>
                              Math.min(alertTotalPages, p + 1),
                            )
                          }
                          disabled={alertPage === alertTotalPages}
                          className="rounded-lg px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
    </>
  );
}
