"use client";

import { CheckCircle2, ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { formatDateTime, showIp, timeAgo } from "../helpers";
import { type SuperAdminDashboardVM } from "../useSuperAdminDashboard";

export function AuditView({ vm }: { vm: SuperAdminDashboardVM }) {
  const { activeTab, auditAction, auditLogs, auditPage, handleExportAuditLogs, loading, loginHistory, setAuditAction, setAuditPage } = vm;
  if (loading) return null;
  return (
    <>
{activeTab === "audit" && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Audit log</h1>
                        <p className="mt-1 text-sm text-slate-500">Who changed what, and every sign-in</p>
                      </div>
                      <button
                        onClick={handleExportAuditLogs}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Download className="w-4 h-4" /> Export CSV
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={auditAction}
                        onChange={(e: any) => {
                          setAuditAction(e.target.value);
                          setAuditPage(1);
                        }}
                        className="rounded-lg px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-900"
                      >
                        <option value="all">All actions</option>
                        <option value="Create">Create</option>
                        <option value="Update">Update</option>
                        <option value="Delete">Delete</option>
                        <option value="Login">Login</option>
                      </select>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
                      <div className="overflow-x-auto max-w-full">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-slate-200 bg-white">
                              <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                Timestamp
                              </th>
                              <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                User
                              </th>
                              <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                Company
                              </th>
                              <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                Action
                              </th>
                              <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                Entity
                              </th>
                              <th className="text-left px-4 py-3 text-slate-500 text-xs  ">
                                Details
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {auditLogs?.items?.map((log) => (
                              <tr
                                key={log.id}
                                className="border-b border-slate-200 hover:bg-slate-50"
                              >
                                <td className="px-4 py-3 text-slate-900 text-sm">
                                  {formatDateTime(log.createdAt)}
                                </td>
                                <td className="px-4 py-3 text-slate-900 text-sm">
                                  {log.userName || "System"}
                                </td>
                                <td className="px-4 py-3 text-slate-500 text-sm">
                                  {log.companyName || "-"}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`px-2 py-1 text-xs font-medium ${
                                      log.action === "Create"
                                        ? "bg-emerald-50 text-emerald-700"
                                        : log.action === "Update"
                                          ? "bg-blue-50 text-blue-700"
                                          : log.action === "Delete"
                                            ? "bg-red-50 text-red-700"
                                            : "bg-slate-500/20 text-slate-600"
                                    }`}
                                  >
                                    {log.action}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-500 text-sm">
                                  {log.entityType}
                                </td>
                                <td className="px-4 py-3 text-slate-500 text-sm max-w-xs truncate">
                                  {log.newValues || "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {auditLogs && auditLogs.totalCount > 15 && (
                        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                          <p className="text-slate-500 text-sm">
                            Page {auditPage} of{" "}
                            {Math.ceil(auditLogs.totalCount / 15)}
                          </p>
                          <div className="flex items-center gap-2">
                            <button aria-label="Previous"
                              onClick={() =>
                                setAuditPage((p) => Math.max(1, p - 1))
                              }
                              disabled={auditPage === 1}
                              className="rounded-lg p-2 hover:bg-slate-50 disabled:opacity-30"
                            >
                              <ChevronLeft className="w-5 h-5 text-slate-900" />
                            </button>
                            <button aria-label="Next"
                              onClick={() => setAuditPage((p) => p + 1)}
                              disabled={auditPage * 15 >= auditLogs.totalCount}
                              className="p-2 hover:bg-slate-50 disabled:opacity-30"
                            >
                              <ChevronRight className="w-5 h-5 text-slate-900" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-6">
                      <h3 className="mb-4 text-base font-semibold text-slate-900">
                        Sign-in history
                      </h3>
                      <div className="space-y-2">
                        {loginHistory?.items?.slice(0, 10).map((login) => (
                          <div
                            key={login.id}
                            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
                          >
                            <div className="flex items-center gap-3">
                              {login.isSuccessful ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                              ) : (
                                <X className="w-5 h-5 text-red-700" />
                              )}
                              <div>
                                <p className="text-slate-900 text-sm">
                                  {login.userName ||
                                    login.companyName ||
                                    "Unknown"}
                                </p>
                                <p className="text-slate-500 text-xs">
                                  {login.userRole === "OfficeUser" ? "Office" : login.userRole === "SuperAdmin" ? "Super admin" : login.userRole}
                                  {login.companyName ? ` · ${login.companyName}` : ""} · {showIp(login.ipAddress)}
                                  {!login.isSuccessful && login.failureReason ? (
                                    <span className="text-red-600"> · {login.failureReason}</span>
                                  ) : null}
                                </p>
                              </div>
                            </div>
                            <span className="text-slate-500 text-sm">
                              {timeAgo(login.loginAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
    </>
  );
}
