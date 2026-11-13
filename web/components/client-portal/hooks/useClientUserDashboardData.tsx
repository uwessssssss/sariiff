"use client";

import { ClientUserDashboardProps, SUPPORT_WHATSAPP } from "../helpers";
import { Currency, changeClientPassword, getStoredAuth } from "@/lib/api";
import { escapeHtml, printHtml } from "@/lib/print";
import { toast } from "sonner";
import { useEffect } from "react";
import { type useClientUserDashboardState } from "./useClientUserDashboardState";

/** ClientUserDashboard: data (part 2 of 2 of useClientUserDashboard). */
export function useClientUserDashboardData(prev: { userName: ClientUserDashboardProps["userName"]; onLogout: ClientUserDashboardProps["onLogout"] } & ReturnType<typeof useClientUserDashboardState>) {
  const { activeView, analytics, analyticsCurrency, currencyFilter, fetchAlerts, fetchAnalytics, fetchDashboard, fetchTransactions, filterPeriod, mobileMenuOpen, passwordForm, profile, quickStats, searchQuery, setCurrentPage, setMobileMenuOpen, setPasswordForm, setPasswordLoading, setShowPasswordModal, transactions, typeFilter, userName } = prev;
  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    try {
      setPasswordLoading(true);
      const result = await changeClientPassword(passwordForm);
      if (result.success) {
        toast.success("Password changed. Sign in again with your new password.");
        setShowPasswordModal(false);
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        // Every session was ended by the server, this one too: sign out now rather than at
        // the next click with "Session expired".
        prev.onLogout();
      } else {
        toast.error(result.message || "Failed to change password");
      }
    } catch (err) {
      toast.error("Failed to change password");
    } finally {
      setPasswordLoading(false);
    }
  };
  const handlePrintStatement = async () => {
    if (!profile) {
      toast.error("Profile data not loaded");
      return;
    }

    const auth = getStoredAuth();
    // The bureau's name from the profile: a client's stored sign-in holds the CLIENT's name there.
    const companyName = profile.companyName || "Account statement";
    const clientName = profile.fullName || userName || "Client";
    const clientCode = profile.code || "N/A";
    const clientPhone = profile.whatsAppNumber || "N/A";
    const clientEmail = profile.email || "N/A";
    const kesBalance = profile.balanceKES ?? 0;
    const usdBalance = profile.balanceUSD ?? 0;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Account Statement - ${escapeHtml(clientName)}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #111827; font-size: 12px; }
          .header { border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 20px; }
          .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
          .company-name { font-size: 24px; font-weight: bold; color: #111827; }
          .doc-title { color: #6b7280; font-size: 14px; margin-top: 4px; }
          .doc-info { text-align: right; }
          .doc-info label { color: #6b7280; font-size: 10px; display: block; }
          .doc-info span { font-weight: bold; color: #111827; }
          .client-box { background: #f9fafb; padding: 16px; margin-bottom: 20px; }
          .client-name { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
          .client-details { color: #6b7280; }
          .summary-row { display: flex; gap: 16px; margin-bottom: 20px; }
          .summary-card { flex: 1; border: 1px solid #e5e7eb; padding: 12px; }
          .summary-card label { color: #6b7280; font-size: 10px; display: block; margin-bottom: 4px; }
          .summary-card .value { font-size: 16px; font-weight: bold; }
          .positive { color: #16a34a; }
          .negative { color: #dc2626; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #f9fafb; color: #4b5563; font-weight: 600; text-align: left; padding: 10px 8px; border-bottom: 1px solid #e5e7eb; }
          td { padding: 10px 8px; border-bottom: 1px solid #f3f4f6; }
          tr:nth-child(even) { background: #f9fafb; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .cr { color: #16a34a; font-weight: 600; }
          .dr { color: #dc2626; font-weight: 600; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 10px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-top">
            <div>
              <div class="company-name">${escapeHtml(companyName)}</div>
              <div class="doc-title">Client Account Statement</div>
            </div>
            <div class="doc-info">
              <label>Statement Date</label>
              <span>${escapeHtml(new Date().toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              }))}</span>
              <br/><br/>
              <label>Account Reference</label>
              <span>${escapeHtml(clientCode)}</span>
            </div>
          </div>
        </div>

        <div class="client-box">
          <div class="client-name">${escapeHtml(clientName)}</div>
          <div class="client-details">
            Phone: ${escapeHtml(clientPhone)} | Email: ${escapeHtml(clientEmail)}
          </div>
        </div>

        <div class="summary-row">
          <div class="summary-card">
            <label>KES Balance</label>
            <div class="value ${escapeHtml(kesBalance >= 0 ? "positive" : "negative")}">${escapeHtml(
              kesBalance >= 0 ? "" : "-"
            )}KES ${escapeHtml(Math.abs(kesBalance).toLocaleString())}</div>
          </div>
          <div class="summary-card">
            <label>USD Balance</label>
            <div class="value ${escapeHtml(usdBalance >= 0 ? "positive" : "negative")}">${escapeHtml(
              usdBalance >= 0 ? "" : "-"
            )}USD ${escapeHtml(Math.abs(usdBalance).toLocaleString())}</div>
          </div>
          ${(profile.otherBalances || [])
            .filter((b: any) => (b.balance ?? 0) !== 0)
            .map(
              (b: any) => `<div class="summary-card">
            <label>${escapeHtml(b.currencyCode)} Balance</label>
            <div class="value ${escapeHtml(b.balance >= 0 ? "positive" : "negative")}">${escapeHtml(b.balance >= 0 ? "" : "-")}${escapeHtml(b.currencyCode)} ${escapeHtml(Math.abs(b.balance).toLocaleString())}</div>
          </div>`,
            )
            .join("")}
        </div>

        <h3 style="margin-bottom: 10px;">Transaction History</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Description</th>
              <th class="text-center">Type</th>
              <th class="text-center">Currency</th>
              <th class="text-right">Amount</th>
              <th class="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${(await prev.allMatchingTransactions())
              .map((txn) => {
                const isCredit = txn.type === "Credit";
                const currency = txn.currency === Currency.KES ? "KES" : txn.currency === Currency.UGX ? "UGX" : txn.currency === Currency.EUR ? "EUR" : "USD";
                const bal = txn.balanceAfter ?? 0;
                return `
              <tr>
                <td>${escapeHtml(new Date(txn.date || new Date()).toLocaleDateString(
                  "en-GB",
                  { day: "2-digit", month: "short", year: "2-digit" },
                ))}</td>
                <td>${escapeHtml(txn.reference || txn.code || "-")}</td>
                <td>${escapeHtml((txn.description || "").substring(0, 35))}${escapeHtml(
                  (txn.description || "").length > 35 ? "..." : ""
                )}</td>
                <td class="text-center ${escapeHtml(isCredit ? "cr" : "dr")}">${escapeHtml(
                  isCredit ? "CR" : "DR"
                )}</td>
                <td class="text-center">${escapeHtml(currency)}</td>
                <td class="text-right">${escapeHtml((
                  txn.amount ?? 0
                ).toLocaleString())}</td>
                <td class="text-right ${escapeHtml(bal >= 0 ? "positive" : "negative")}">${escapeHtml(
                  bal >= 0 ? "" : "-"
                )}${escapeHtml(Math.abs(bal).toLocaleString())}</td>
              </tr>
            `;
              })
              .join("")}
          </tbody>
        </table>

        <div class="footer">
          <p>This is a computer-generated statement and does not require a signature.</p>
          <p>${escapeHtml(companyName)} • Generated on ${escapeHtml(new Date().toLocaleString())}</p>
        </div>
      </body>
      </html>
    `;

    // Sandboxed, script-free print (lib/print.ts); values above are escaped.
    if (!printHtml(printContent)) {
      toast.error("Couldn't open the print view");
      return;
    }
    toast.success("Print preview opened!");
  };
  // Opens WhatsApp to the bureau's support number. Hidden everywhere when
  // NEXT_PUBLIC_SUPPORT_WHATSAPP isn't set, so clients never reach a dead number.
  const handleContactSupport = () => {
    if (!SUPPORT_WHATSAPP) return;
    window.open(`https://wa.me/${SUPPORT_WHATSAPP}`, "_blank", "noopener");
  };
  // ============ COMPUTED VALUES ============

  // One row per currency the client actually uses (no empty KES/USD rows).
  // Currency filter shows only the currencies this client actually holds.
  const CURRENCY_VALUES: Record<string, Currency> = { KES: Currency.KES, USD: Currency.USD, UGX: Currency.UGX, EUR: Currency.EUR };
  const balanceRows: { code: string; balance: number; totalIn: number; totalOut: number }[] = profile
    ? [
        ...((profile.balanceKES ?? 0) !== 0 || (profile.totalInKES ?? 0) !== 0 || (profile.totalOutKES ?? 0) !== 0
          ? [{ code: "KES", balance: profile.balanceKES ?? 0, totalIn: profile.totalInKES ?? 0, totalOut: profile.totalOutKES ?? 0 }]
          : []),
        ...((profile.balanceUSD ?? 0) !== 0 || (profile.totalInUSD ?? 0) !== 0 || (profile.totalOutUSD ?? 0) !== 0
          ? [{ code: "USD", balance: profile.balanceUSD ?? 0, totalIn: profile.totalInUSD ?? 0, totalOut: profile.totalOutUSD ?? 0 }]
          : []),
        ...(profile.otherBalances || []).map((b) => ({
          code: b.currencyCode,
          balance: b.balance ?? 0,
          totalIn: b.totalIn ?? 0,
          totalOut: b.totalOut ?? 0,
        })),
      ]
    : [];
  const statementCurrencies = (
    balanceRows.length > 0 ? balanceRows.map((b) => b.code) : ["KES", "USD"]
  )
    .filter((code, i, all) => code in CURRENCY_VALUES && all.indexOf(code) === i)
    .map((code) => ({ code, value: CURRENCY_VALUES[code] }));
  // This month's in/out per currency (KES, USD, UGX, EUR) — only those with activity
  const monthRows: { code: string; in: number; out: number }[] = quickStats
    ? [
        { code: "KES", in: quickStats.thisMonthInKES || 0, out: quickStats.thisMonthOutKES || 0 },
        { code: "USD", in: quickStats.thisMonthInUSD || 0, out: quickStats.thisMonthOutUSD || 0 },
        ...((quickStats as any).thisMonthOtherCurrencies || []).map((c: any) => ({
          code: c.currencyCode,
          in: c.income || 0,
          out: c.expenses || 0,
        })),
      ].filter((r) => r.in || r.out)
    : [];
  // Analytics are shown one currency at a time (amounts can't be mixed)
  // Opens on the client's main currency: UGX when they hold it (only Ugandan bureaus use
  // UGX), else KES, USD, EUR. It used to open on whichever came first — USD 0.00 for a
  // Ugandan client whose money is all in UGX.
  const mainCode = ["UGX", "KES", "USD", "EUR"].find((code) => statementCurrencies.some((c) => c.code === code));
  const analyticsCode =
    statementCurrencies.find((c) => c.value === analyticsCurrency)?.code ??
    mainCode ??
    statementCurrencies[0]?.code ??
    "KES";
  const analyticsCur = CURRENCY_VALUES[analyticsCode] ?? Currency.KES;
  const otherFlow = (list: any[] | undefined) =>
    (list || []).find((x: any) => x.currencyCode === analyticsCode || x.currency === analyticsCur);
  const netIncomeIn = (t: any): number =>
    analyticsCode === "KES"
      ? t.netIncomeKES
      : analyticsCode === "USD"
        ? t.netIncomeUSD
        : ((otherFlow(t.otherCurrencies)?.income ?? 0) - (otherFlow(t.otherCurrencies)?.expenses ?? 0));
  const avgIn = (t: any): number | null =>
    analyticsCode === "KES" ? t.avgTransactionKES : analyticsCode === "USD" ? t.avgTransactionUSD : null;
  const currentBalanceIn = balanceRows.find((b) => b.code === analyticsCode)?.balance ?? 0;
  // Prepare chart data from analytics
  const monthlyChartData =
    analytics?.monthlyData.map((m) => ({
      month: m.month,
      income:
        analyticsCode === "KES" ? m.incomeKES : analyticsCode === "USD" ? m.incomeUSD : otherFlow(m.otherCurrencies)?.income ?? 0,
      expenses:
        analyticsCode === "KES" ? m.expensesKES : analyticsCode === "USD" ? m.expensesUSD : otherFlow(m.otherCurrencies)?.expenses ?? 0,
      balance:
        analyticsCode === "KES" ? m.balanceKES : analyticsCode === "USD" ? m.balanceUSD : currentBalanceIn,
    })) || [];
  const categoryChartData =
    analytics?.categoryBreakdown.map((c, i) => ({
      name: c.category,
      value: c.count,
      color: ["#3b82f6", "#ef4444", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899"][
        i % 6
      ],
    })) || [];
  const weeklyChartData = analytics?.weeklyActivity || [];
  // Escape closes the phone-width menu.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);
  // Initial load
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);
  // Fetch transactions when filters change
  useEffect(() => {
    if (activeView === "statements") {
      fetchTransactions();
    }
  }, [activeView, fetchTransactions]);
  // Fetch alerts when viewing alerts
  useEffect(() => {
    if (activeView === "alerts") {
      fetchAlerts();
    }
  }, [activeView, fetchAlerts]);
  // Fetch analytics when viewing analytics
  useEffect(() => {
    if (activeView === "analytics") {
      fetchAnalytics();
    }
  }, [activeView, fetchAnalytics]);
  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [currencyFilter, typeFilter, searchQuery, filterPeriod]);

  return {
    handleChangePassword,
    handlePrintStatement,
    handleContactSupport,
    CURRENCY_VALUES,
    balanceRows,
    statementCurrencies,
    monthRows,
    mainCode,
    analyticsCode,
    analyticsCur,
    otherFlow,
    netIncomeIn,
    avgIn,
    currentBalanceIn,
    monthlyChartData,
    categoryChartData,
    weeklyChartData,
  };
}
