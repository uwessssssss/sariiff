"use client";

import { AlertTriangle, Ban, Lock, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { StatCard, getSeverityColor, humanize, showIp, timeAgo } from "../helpers";
import { type SuperAdminDashboardVM } from "../useSuperAdminDashboard";

export function SecurityView({ vm }: { vm: SuperAdminDashboardVM }) {
  const { activeTab, alertStatus, alerts, handleRemoveWhitelist, loading, openModal, security, setAlertStatus, setAlertsPage, setSelectedAlertId, whitelist } = vm;
  if (loading) return null;
  return (
    <>
{activeTab === "security" && (
                  <div className="space-y-6">
                    <div>
                      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Security</h1>
                      <p className="mt-1 text-sm text-slate-500">Sign-in failures, alerts and blocked addresses</p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <StatCard
                        title="Failed sign-ins (24h)"
                        value={<span className={(security?.failedLoginsLast24h || 0) > 0 ? "text-red-600" : ""}>{security?.failedLoginsLast24h || 0}</span>}
                        subValue={`${security?.failedLoginsLast7d || 0} in the last 7 days`}
                        icon={ShieldAlert}
                      />
                      <StatCard title="Locked accounts" value={security?.lockedAccounts || 0} icon={Lock} />
                      <StatCard title="Blocked IPs" value={security?.blockedIPs || 0} icon={Ban} />
                      <StatCard
                        title="Open alerts"
                        value={security?.activeAlerts || 0}
                        subValue={`${security?.suspiciousActivities || 0} suspicious activities`}
                        icon={AlertTriangle}
                      />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="rounded-xl bg-white border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-base font-semibold text-slate-900">
                            Alerts
                          </h3>
                          <select
                            value={alertStatus}
                            onChange={(e: any) => {
                              setAlertStatus(e.target.value);
                              setAlertsPage(1);
                            }}
                            className="rounded-lg px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-900 text-sm"
                          >
                            <option value="all">All</option>
                            <option value="active">Active</option>
                            <option value="resolved">Resolved</option>
                          </select>
                        </div>
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {alerts?.items && alerts.items.length > 0 ? (
                            alerts.items.map((alert) => (
                              <div
                                key={alert.id}
                                className={`rounded-lg border border-slate-200 p-4 ${
                                  alert.isResolved ? "bg-slate-50 opacity-75" : "border-l-4 border-l-red-500 bg-white"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span
                                        className={`px-2 py-0.5 text-xs font-medium ${getSeverityColor(
                                          alert.severity,
                                        )}`}
                                      >
                                        {alert.severity}
                                      </span>
                                      <span className="text-slate-500 text-xs">
                                        {humanize(alert.alertType)}
                                      </span>
                                    </div>
                                    <p className="text-slate-900 text-sm">
                                      {alert.message}
                                    </p>
                                    <p className="text-slate-500 text-xs mt-1">
                                      {alert.ipAddress &&
                                        `IP: ${showIp(alert.ipAddress)} • `}
                                      {timeAgo(alert.createdAt)}
                                    </p>
                                  </div>
                                  {!alert.isResolved && (
                                    <button
                                      onClick={() => {
                                        setSelectedAlertId(alert.id);
                                        openModal("resolveAlert");
                                      }}
                                      className="h-8 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                      Resolve
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-slate-500 text-center py-8">
                              No alerts found
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-6">
                        <div className="rounded-xl bg-white border border-slate-200 p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-semibold text-slate-900">
                              Block an address
                            </h3>
                            <button
                              onClick={() => openModal("blockIP")}
                              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50"
                            >
                              <Ban className="w-4 h-4" /> Block an IP
                            </button>
                          </div>
                          <p className="text-slate-500 text-sm">
                            Block malicious IP addresses from accessing the
                            platform.
                          </p>
                        </div>
                        <div className="rounded-xl bg-white border border-slate-200 p-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-semibold text-slate-900">
                              Allowed IPs
                            </h3>
                            <button
                              onClick={() => openModal("addWhitelist")}
                              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Plus className="w-4 h-4" /> Add IP
                            </button>
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {whitelist && whitelist.length > 0 ? (
                              whitelist.map((ip) => (
                                <div
                                  key={ip.id}
                                  className="rounded-xl flex items-center justify-between p-3 bg-white border border-slate-200"
                                >
                                  <div>
                                    <p className="text-slate-900 font-mono text-sm">
                                      {showIp(ip.ipAddress)}
                                    </p>
                                    <p className="text-slate-500 text-xs">
                                      {ip.description || "No description"}
                                    </p>
                                  </div>
                                  <button aria-label="Delete"
                                    onClick={() => handleRemoveWhitelist(ip.id)}
                                    className="rounded-lg p-2 hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-700" />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <p className="text-slate-500 text-center py-4">
                                No whitelisted IPs
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {security?.recentFailedLogins &&
                      security.recentFailedLogins.length > 0 && (
                        <div className="rounded-xl bg-white border border-slate-200 p-6">
                          <h3 className="mb-4 text-base font-semibold text-slate-900">
                            Recent failed sign-ins
                          </h3>
                          <div className="overflow-x-auto max-w-full">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-slate-200">
                                  <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                    Time
                                  </th>
                                  <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                    User
                                  </th>
                                  <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                    IP Address
                                  </th>
                                  <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                    Reason
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {security.recentFailedLogins
                                  .slice(0, 10)
                                  .map((login) => (
                                    <tr
                                      key={login.id}
                                      className="border-b border-slate-200"
                                    >
                                      <td className="px-4 py-3 text-slate-900 text-sm">
                                        {timeAgo(login.loginAt)}
                                      </td>
                                      <td className="px-4 py-3 text-slate-900 text-sm">
                                        {login.userName ||
                                          login.companyName ||
                                          "Unknown"}
                                      </td>
                                      <td className="px-4 py-3 text-slate-500 text-sm font-mono">
                                        {showIp(login.ipAddress)}
                                      </td>
                                      <td className="px-4 py-3 text-red-700 text-sm">
                                        {login.failureReason ||
                                          "Invalid credentials"}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                  </div>
                )}
    </>
  );
}
