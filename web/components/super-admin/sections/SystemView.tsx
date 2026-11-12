"use client";

import { AlertTriangle, Database, Server, ShieldCheck, Zap } from "lucide-react";
import { getHealthColor, getLogLevelColor, timeAgo } from "../helpers";
import { type SuperAdminDashboardVM } from "../useSuperAdminDashboard";

export function SystemView({ vm }: { vm: SuperAdminDashboardVM }) {
  const { activeTab, loading, logLevel, resolveLog, resolvingId, setLogLevel, setShowResolved, setSystemLogsPage, showResolved, systemHealth, systemLogs } = vm;
  if (loading) return null;
  return (
    <>
{activeTab === "system" && (
                  <div className="space-y-6">
                    <div>
                      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">System</h1>
                      <p className="mt-1 text-sm text-slate-500">API, database and server health, plus recent logs</p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-6">
                      <div className="flex items-center gap-4 mb-6">
                        <div
                          className={`w-16 h-16 flex items-center justify-center ${
                            systemHealth?.overallStatus === "Healthy"
                              ? "bg-emerald-50"
                              : systemHealth?.overallStatus === "Degraded"
                                ? "bg-amber-50"
                                : "bg-red-50"
                          }`}
                        >
                          {systemHealth?.overallStatus === "Healthy" ? (
                            <ShieldCheck
                              className={`w-8 h-8 ${getHealthColor(
                                systemHealth?.overallStatus || "",
                              )}`}
                            />
                          ) : (
                            <AlertTriangle
                              className={`w-8 h-8 ${getHealthColor(
                                systemHealth?.overallStatus || "",
                              )}`}
                            />
                          )}
                        </div>
                        <div>
                          <h3
                            className={`text-2xl font-bold ${getHealthColor(
                              systemHealth?.overallStatus || "",
                            )}`}
                          >
                            {systemHealth?.overallStatus || "Unknown"}
                          </h3>
                          <p className="text-slate-500">
                            Last checked:{" "}
                            {systemHealth?.lastCheckedAt
                              ? timeAgo(systemHealth.lastCheckedAt)
                              : "N/A"}
                          </p>
                          {!!systemHealth?.reasons?.length && (
                            <ul className="mt-1.5 space-y-0.5 text-sm text-amber-800">
                              {systemHealth.reasons.map((r) => (
                                <li key={r}>• {r}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="rounded-xl p-4 bg-white border border-slate-200">
                          <div className="flex items-center gap-2 mb-3">
                            <Zap className="w-5 h-5 text-blue-700" />
                            <span className="text-slate-900 font-medium">API</span>
                            <span
                              className={`ml-auto px-2 py-0.5 text-xs ${getHealthColor(
                                systemHealth?.apiStatus || "",
                              )}`}
                            >
                              {systemHealth?.apiStatus}
                            </span>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-500">
                                Response Time
                              </span>
                              <span className="text-slate-900">
                                {systemHealth?.apiResponseTimeMs}ms
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">
                                Requests/min
                              </span>
                              <span className="text-slate-900">
                                {systemHealth?.apiRequestsPerMinute}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Error Rate</span>
                              <span
                                className={
                                  systemHealth?.apiErrorRate &&
                                  systemHealth.apiErrorRate > 1
                                    ? "text-red-700"
                                    : "text-slate-900"
                                }
                              >
                                {systemHealth?.apiErrorRate?.toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-xl p-4 bg-white border border-slate-200">
                          <div className="flex items-center gap-2 mb-3">
                            <Database className="w-5 h-5 text-blue-700" />
                            <span className="text-slate-900 font-medium">
                              Database
                            </span>
                            <span
                              className={`ml-auto px-2 py-0.5 text-xs ${getHealthColor(
                                systemHealth?.databaseStatus || "",
                              )}`}
                            >
                              {systemHealth?.databaseStatus}
                            </span>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Latency</span>
                              <span className="text-slate-900">
                                {systemHealth?.databaseLatencyMs}ms
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">
                                Connections
                              </span>
                              <span className="text-slate-900">
                                {systemHealth?.databaseConnections}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-xl p-4 bg-white border border-slate-200">
                          <div className="flex items-center gap-2 mb-3">
                            <Server className="w-5 h-5 text-emerald-700" />
                            <span className="text-slate-900 font-medium">
                              Server
                            </span>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-500">CPU</span>
                              <span
                                className={
                                  systemHealth?.serverCpuUsage &&
                                  systemHealth.serverCpuUsage > 80
                                    ? "text-red-700"
                                    : "text-slate-900"
                                }
                              >
                                {systemHealth?.serverCpuUsage}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Memory</span>
                              <span
                                className={
                                  systemHealth?.serverMemoryUsage &&
                                  systemHealth.serverMemoryUsage > 80
                                    ? "text-red-700"
                                    : "text-slate-900"
                                }
                              >
                                {systemHealth?.serverMemoryUsage}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Disk</span>
                              <span
                                className={
                                  systemHealth?.serverDiskUsage &&
                                  systemHealth.serverDiskUsage > 80
                                    ? "text-amber-700"
                                    : "text-slate-900"
                                }
                              >
                                {systemHealth?.serverDiskUsage}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-semibold text-slate-900">
                          Recent logs
                        </h3>
                        <div className="flex items-center gap-3">
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={showResolved}
                            onChange={(e: any) => {
                              setShowResolved(e.target.checked);
                              setSystemLogsPage(1);
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600/20"
                          />
                          Show resolved
                        </label>
                        <select
                          value={logLevel}
                          onChange={(e: any) => {
                            setLogLevel(e.target.value);
                            setSystemLogsPage(1);
                          }}
                          className="rounded-lg px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-900 text-sm"
                        >
                          <option value="all">All levels</option>
                          <option value="Error">Error</option>
                          <option value="Warning">Warning</option>
                          <option value="Info">Info</option>
                        </select>
                        </div>
                      </div>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {systemLogs?.items && systemLogs.items.length > 0 ? (
                          systemLogs.items.map((log) => (
                            <div key={log.id} className={`rounded-lg border border-slate-200 p-3 ${log.resolvedAt ? "bg-slate-50" : "bg-white"}`}>
                              <div className="flex items-start gap-3">
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${log.resolvedAt ? "bg-emerald-50 text-emerald-700" : getLogLevelColor(log.level)}`}
                                >
                                  {log.resolvedAt ? "Resolved" : log.level}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm break-words ${log.resolvedAt ? "text-slate-500" : "text-slate-900"}`}>
                                    {log.message}
                                  </p>
                                  <p className="text-xs text-slate-500 mt-1">
                                    {log.source} • {timeAgo(log.createdAt)}
                                    {log.resolvedAt && <> • resolved {timeAgo(log.resolvedAt)}</>}
                                  </p>
                                </div>
                                {!log.resolvedAt && ["Error", "Warning", "Critical"].includes(log.level) && (
                                  <button
                                    onClick={() => resolveLog(log.id)}
                                    disabled={resolvingId !== null}
                                    title="Marks this entry and every identical one as resolved. They stay in the log but stop counting against health."
                                    className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                  >
                                    {resolvingId === log.id ? "Resolving…" : "Mark resolved"}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-slate-500 text-center py-8">
                            No system logs found
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
    </>
  );
}
