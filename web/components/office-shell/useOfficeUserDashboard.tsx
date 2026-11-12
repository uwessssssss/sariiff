"use client";

import { BankAccounts, CashAtHand, ClientManagement, DashboardStats, EMPTY_STATS, ExchangeSection, ExpensesAccount, InvoiceManagement, MPesaAccounts, NAV, OfficeSettings, OfficeUserDashboardProps, Reconciliation, Reports, TodayTxn, fmt, fmtKES, fmtUSD, greeting, initials, signed } from "./helpers";
import { Building2, Loader2, LogOut, Plus, RefreshCw, Repeat, Smartphone, Wallet, X } from "lucide-react";
import { type DashboardHolding, TransactionDto, currencyDecimals, getCompanyCurrencies, getCurrencyLabel, getCurrentExchangeRate, getDashboardStats, getRecentTransactions } from "@/lib/api";
import Link from "next/link";
import { SarifMark } from "@/components/SarifMark";
import { foreignCurrenciesFor, useBaseCurrency } from "@/lib/useBaseCurrency";
import { toast } from "sonner";
import { ui } from "../office/theme";
import { useAuth } from "@/providers/AuthProvider";
import { useCallback, useEffect, useState } from "react";

/** All of OfficeUserDashboard's state, effects and handlers. The screen and its sections read them from here. */
export function useOfficeUserDashboard({
  userName,
  onLogout,
  activeTab: initialTab = "dashboard",
}: OfficeUserDashboardProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Escape closes the phone-width menu.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayTxns, setTodayTxns] = useState<TodayTxn[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Currencies this company actually uses — hides KES/USD columns that
  // would otherwise sit empty for a bureau not using that currency.
  const [activeCurrencies, setActiveCurrencies] = useState<number[]>([0, 1]);
  // Home currency (KES / UGX): rates are "home per 1 foreign"
  const { base, baseCode } = useBaseCurrency();
  const [totalIn, setTotalIn] = useState<string>("USD");
  // 0 = no USD rate set. It used to start at 129 (a KES rate), so a bureau with no
  // rate — or a Ugandan one — saw a made-up "Everything in USD" total.
  const [exchangeRate, setExchangeRate] = useState(0);
  // Home-currency value of 1 unit of each other foreign currency (mid rate), when set
  const [otherRates, setOtherRates] = useState<Record<number, number>>({});
  const [rateEdited, setRateEdited] = useState(false);
  useEffect(() => setActiveTab(initialTab), [initialTab]);
  // Collapse the sidebar to icons on tablet widths, expand on laptops.
  useEffect(() => {
    const apply = () => setSidebarOpen(window.innerWidth >= 1280);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);
  // Instant tab switching — updates state and URL without a page reload.
  // The /office/<tab> routes exist, so refreshing keeps the same tab.
  const switchTab = useCallback((tabId: string, href: string) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
    window.history.replaceState(null, "", href);
  }, []);
  // -------------------------------------------------------------- data
  const fetchDashboardData = useCallback(async () => {
    setRefreshing(true);
    try {
      getCompanyCurrencies()
        .then((res) => {
          if (res.success && res.data?.currencies?.length) {
            setActiveCurrencies(res.data.currencies.map((c) => c.value));
          }
        })
        .catch(() => {});

      const [statsResult, txnResult, rateResult] = await Promise.all([
        getDashboardStats(),
        getRecentTransactions(200),
        getCurrentExchangeRate(),
      ]);

      setStats(statsResult.success && statsResult.data ? statsResult.data : EMPTY_STATS);

      if (txnResult.success && txnResult.data) {
        // Keep only today's (local date; avoids UTC mismatch). Uses the
        // business date (transactionDate), falling back to createdAt.
        const today = new Date().toLocaleDateString("en-CA");
        const items = txnResult.data
          .filter(
            (t: TransactionDto) =>
              new Date(t.transactionDate || t.createdAt).toLocaleDateString("en-CA") === today,
          )
          .sort(
            (a: TransactionDto, b: TransactionDto) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          .map((t: TransactionDto): TodayTxn => {
            const isDebit = t.transactionType === 0;
            // Client accounts: credit = money in for the client.
            // Asset accounts (cash, bank, M-Pesa): debit = money in.
            const isClient = t.sourceAccountType === 3;
            return {
              code: t.code,
              reference: t.reference,
              time: t.createdAt,
              description: t.description,
              account: t.sourceAccountName || "—",
              otherSide: t.destAccountName || "—",
              amount: t.amount,
              currency: getCurrencyLabel(t.currency),
              isDebit,
              isMoneyIn: isClient ? !isDebit : isDebit,
              reversed: !!(t.isReversed || t.isReversal),
            };
          });
        setTodayTxns(items);
      }

      if (!rateEdited) {
        setExchangeRate(
          rateResult.success && rateResult.data ? (rateResult.data.buyRate + rateResult.data.sellRate) / 2 : 0,
        );
      }
      // Other foreign rates (optional) — used to fold them into "Everything in"
      const others = foreignCurrenciesFor(base).filter((c) => c !== 1);
      const extra = await Promise.all(
        others.map((c) => getCurrentExchangeRate(c).catch(() => null)),
      );
      const nextRates: Record<number, number> = {};
      others.forEach((c, i) => {
        const r = extra[i];
        if (r && r.success && r.data) nextRates[c] = (r.data.buyRate + r.data.sellRate) / 2;
      });
      setOtherRates(nextRates);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Couldn't load the dashboard. Check your connection and refresh.");
      setStats((s) => s ?? EMPTY_STATS);
    } finally {
      setRefreshing(false);
    }
  }, [rateEdited, base]);
  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 60000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);
  // -------------------------------------------------------------- tabs
  const renderContent = () => {
    switch (activeTab) {
      case "clients":
        return <ClientManagement />;
      case "cash-at-hand":
        return <CashAtHand />;
      case "banks":
        return <BankAccounts />;
      case "mpesa":
        return <MPesaAccounts />;
      case "expenses":
        return <ExpensesAccount />;
      case "exchange":
        return <ExchangeSection />;
      case "reconciliation":
        return <Reconciliation />;
      case "invoices":
        return <InvoiceManagement />;
      case "reports":
        return <Reports />;
      case "settings":
        return (
          <OfficeSettings
            userName={userName}
            profileImage={profileImage}
            onProfileImageChange={setProfileImage}
          />
        );
      default:
        return renderDashboard();
    }
  };
  // -------------------------------------------------------------- home
  const renderDashboard = () => {
    if (!stats) {
      return (
        <div className="flex h-96 items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading dashboard…
        </div>
      );
    }

    const ownerFirst = (user?.ownerName || "").trim().split(/\s+/)[0];
    // Columns = every currency the bureau uses or holds (KES, USD, UGX, EUR).
    const shown = stats.holdings.filter(
      (h) => activeCurrencies.includes(h.currency) || h.cash || h.bank || h.mpesa || h.fx,
    );
    const rows: { label: string; key: "cash" | "bank" | "mpesa" | "fx" }[] = [
      { label: "Cash", key: "cash" },
      { label: "Bank", key: "bank" },
      { label: "Mobile money", key: "mpesa" },
      { label: "FX float", key: "fx" },
    ];
    const totalOf = (h: DashboardHolding) => h.cash + h.bank + h.mpesa + h.fx;

    // Home-currency value of 1 unit of each currency. USD uses the editable rate.
    const kesPer = (c: number): number | null =>
      c === base ? 1 : c === 1 ? (exchangeRate > 0 ? exchangeRate : null) : otherRates[c] ?? null;
    const unconverted = shown.filter((h) => totalOf(h) !== 0 && kesPer(h.currency) === null).map((h) => h.code);
    const totalKesValue = shown.reduce((sum, h) => {
      const k = kesPer(h.currency);
      return k === null ? sum : sum + totalOf(h) * k;
    }, 0);
    // No USD rate: there is no honest USD total to show.
    const converted: number | null =
      totalIn === "USD" ? (exchangeRate > 0 ? totalKesValue / exchangeRate : null) : totalKesValue;

    const flows = stats.flows
      .filter((f) => activeCurrencies.includes(f.currency) || f.credits || f.debits)
      .map((f) => ({ ...f, f: (n: number) => fmt(n, currencyDecimals(f.currency)) }));

    const th = ui.th;
    const td = ui.td;
    const ROW_ICON = { cash: Wallet, bank: Building2, mpesa: Smartphone, fx: Repeat } as const;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className={ui.pageTitle}>
              {ownerFirst ? `${greeting()}, ${ownerFirst}` : "Dashboard"}
            </h1>
            <p className={ui.pageSub}>
              {new Date().toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {lastUpdated && (
                <>
                  <span className="mx-2 text-slate-500">/</span>
                  Updated{" "}
                  {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={fetchDashboardData} disabled={refreshing} className={ui.btnSecondary}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button onClick={() => setShowTransactionForm(true)} className={`${ui.btnPrimary} hidden lg:inline-flex`}>
              <Plus className="h-4 w-4" />
              New transaction
            </button>
          </div>
        </div>

        {/* Position + converted total */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className={ui.card}>
            <div className={ui.cardHead}>
              <h2 className={ui.cardTitle}>What you hold</h2>
              <span className={ui.cardMeta}>Balances right now</span>
            </div>
            {shown.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={ui.thead}>
                    <tr>
                      <th className={`${th} pl-4 sm:pl-5`}>Account</th>
                      {shown.map((h, i) => (
                        <th key={h.currency} className={`${th} px-2 text-right sm:px-4 ${i === shown.length - 1 ? "pr-4 sm:pr-5" : ""}`}>
                          {h.code}
                          {h.currency === base && (
                            <span className="ml-1.5 hidden rounded bg-blue-600 px-1.5 py-px text-xs font-medium normal-case tracking-normal text-white sm:inline">
                              home
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {rows.map((r) => {
                      const Icon = ROW_ICON[r.key];
                      return (
                        <tr key={r.label} className={`${ui.row} hover:bg-slate-50`}>
                          <td className={`${td} pl-4 sm:pl-5`}>
                            <span className="inline-flex items-center gap-2.5 font-medium text-slate-800">
                              {/* icons only from tablet up: on a phone every column must fit */}
                              <span className="hidden h-7 w-7 items-center justify-center rounded-lg bg-[#E9EEF6] text-[#0F172A] sm:flex">
                                <Icon className="h-3.5 w-3.5" />
                              </span>
                              {r.label}
                            </span>
                          </td>
                          {shown.map((h, i) => (
                            <td
                              key={h.currency}
                              className={`${td} whitespace-nowrap px-2 text-right font-medium text-slate-900 sm:px-4 ${i === shown.length - 1 ? "pr-4 sm:pr-5" : ""}`}
                            >
                              {r.key === "mpesa" && !h.mpesa && h.currency !== base ? (
                                <span className="text-slate-500">—</span>
                              ) : (
                                fmt(h[r.key], currencyDecimals(h.currency))
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    <tr className={ui.totalRow}>
                      <td className="px-3 py-4 pl-5 text-sm font-semibold sm:px-4">Total</td>
                      {shown.map((h, i) => (
                        <td
                          key={h.currency}
                          className={`px-3 py-4 text-right text-base font-semibold sm:px-4 sm:text-lg ${i === shown.length - 1 ? "pr-5" : ""}`}
                        >
                          {fmt(totalOf(h), currencyDecimals(h.currency))}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-6 text-sm text-slate-600">Nothing held yet.</p>
            )}
          </section>

          <section className={`${ui.hero} flex flex-col p-5`}>
            {/* soft accent glow — decorative */}
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-600/30 blur-3xl" />
            <div className="relative flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Everything in</h2>
              <div className="inline-flex rounded-lg bg-white/10 p-0.5" role="group" aria-label="Show total in">
                {["USD", baseCode].map((c) => (
                  <button
                    key={c}
                    onClick={() => setTotalIn(c)}
                    aria-pressed={totalIn === c}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${
                      totalIn === c ? "bg-white text-[#0F172A] shadow-sm" : "text-slate-300 hover:text-white"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative mt-6 text-3xl font-semibold leading-none tracking-tight tabular-nums sm:text-3xl">
              <span className="mr-2 text-lg font-medium text-blue-300">{totalIn}</span>
              {converted === null ? "—" : totalIn === "USD" ? fmtUSD(converted) : fmtKES(converted)}
            </div>
            <p className="relative mt-2 text-sm text-slate-300">
              Cash, bank, mobile money and FX float combined
              {shown.length > 2 ? ", every currency at today's rate" : ""}.
            </p>
            {converted === null && (
              <p className="relative mt-3 rounded-lg bg-amber-400/15 px-3 py-2 text-sm text-amber-200">
                No USD rate yet — set one on the Exchange page, or type one below.
              </p>
            )}
            {unconverted.length > 0 && converted !== null && (
              <p className="relative mt-3 rounded-lg bg-amber-400/15 px-3 py-2 text-sm text-amber-200">
                {unconverted.join(" and ")} {unconverted.length === 1 ? "isn't" : "aren't"} included —
                set {unconverted.length === 1 ? "a rate" : "rates"} on the Exchange page.
              </p>
            )}

            <label className="relative mt-auto block pt-6">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Rate used ({baseCode} per USD)</span>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : ""}
                  placeholder="No rate set"
                  onChange={(e) => {
                    setExchangeRate(parseFloat(e.target.value) || 0);
                    setRateEdited(true);
                  }}
                  className="h-10 w-full rounded-lg border border-white/15 bg-white/10 px-3 text-sm tabular-nums text-white outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30"
                />
                {rateEdited && (
                  <button
                    onClick={() => {
                      setRateEdited(false);
                      fetchDashboardData();
                    }}
                    className="h-10 shrink-0 rounded-lg px-3 text-sm font-medium text-blue-300 hover:bg-white/10"
                  >
                    Use today's rate
                  </button>
                )}
              </div>
              <span className="mt-1.5 block text-xs text-slate-400">
                {rateEdited ? "Your rate, for this view only." : "Average of today's buy and sell rate."}
              </span>
            </label>
          </section>
        </div>

        {/* Today's movement */}
        <section className={ui.card}>
          <div className={ui.cardHead}>
            <h2 className={ui.cardTitle}>Today's movement</h2>
            <span className={ui.cardMeta}>
              {stats.todayTransactions} {stats.todayTransactions === 1 ? "transaction" : "transactions"}
            </span>
          </div>
          {flows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full tabular-nums">
                <thead className={ui.thead}>
                  <tr>
                    <th className={`${th} pl-5`}>Currency</th>
                    <th className={`${th} text-right`}>Money in</th>
                    <th className={`${th} text-right`}>Money out</th>
                    <th className={`${th} hidden w-[28%] md:table-cell`} title="Each currency against itself">In vs out</th>
                    <th className={`${th} pr-5 text-right`}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {flows.map((f) => (
                    <tr key={f.code} className={`${ui.row} hover:bg-slate-50`}>
                      <td className={`${td} pl-5`}>
                        <span className={ui.codeChip}>{f.code}</span>
                      </td>
                      <td className={`${td} text-right font-medium text-emerald-700`}>{f.f(f.debits)}</td>
                      <td className={`${td} text-right font-medium text-red-700`}>{f.f(f.credits)}</td>
                      <td className={`${td} hidden md:table-cell`}>
                        <div className="space-y-1" aria-hidden>
                          <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${(f.debits / Math.max(1, f.debits, f.credits)) * 100}%` }} />
                          <div className="h-1.5 rounded-full bg-red-400" style={{ width: `${(f.credits / Math.max(1, f.debits, f.credits)) * 100}%` }} />
                        </div>
                      </td>
                      <td className={`${td} pr-5 text-right`}>
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-sm font-semibold ${
                            f.net > 0
                              ? "bg-emerald-50 text-emerald-700"
                              : f.net < 0
                                ? "bg-red-50 text-red-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {signed(f.net, f.f)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-slate-600">No activity yet today.</p>
          )}
        </section>

        {/* Today's transactions */}
        <section className={ui.card}>
          <div className={ui.cardHead}>
            <h2 className={ui.cardTitle}>Today's transactions</h2>
            <button
              onClick={() => switchTab("reports", "/office/reports")}
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              Open daily report
            </button>
          </div>
          {todayTxns.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-slate-600">No transactions yet today.</p>
              <button onClick={() => setShowTransactionForm(true)} className={`${ui.btnSecondary} mt-3 h-9`}>
                <Plus className="h-4 w-4" />
                Record the first one
              </button>
            </div>
          ) : (
            <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {todayTxns.map((t) => (
                <li key={t.code} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium text-slate-900">{t.description}</span>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        t.isMoneyIn ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {t.isMoneyIn ? "+" : "−"}
                      {t.currency} {fmt(t.amount, t.currency === "KES" || t.currency === "UGX" ? 0 : 2)}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {new Date(t.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    {"  "}
                    {t.account} to {t.otherSide}
                    {t.reversed && <span className="ml-2 font-medium text-amber-800">Reversed</span>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px]">
                <thead className={ui.thead}>
                  <tr>
                    <th className={`${th} pl-5`}>Time</th>
                    <th className={th}>Reference</th>
                    <th className={th}>Description</th>
                    <th className={th}>Account</th>
                    <th className={th}>Other side</th>
                    <th className={th}>Entry</th>
                    <th className={`${th} pr-5 text-right`}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {todayTxns.map((t) => (
                    <tr key={t.code} className={`${ui.row} hover:bg-slate-50`}>
                      <td className={`${td} pl-5 whitespace-nowrap tabular-nums text-slate-500`}>
                        {new Date(t.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className={`${td} whitespace-nowrap font-mono text-xs text-slate-600`}>{t.code}</td>
                      <td className={`${td} max-w-[240px] truncate font-medium text-slate-900`} title={t.description}>
                        {t.description}
                        {t.reversed && (
                          <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                            Reversed
                          </span>
                        )}
                      </td>
                      <td className={`${td} max-w-[180px] truncate text-slate-700`}>{t.account}</td>
                      <td className={`${td} max-w-[180px] truncate text-slate-700`}>{t.otherSide}</td>
                      <td className={td}>
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                            t.isDebit ? "bg-[#E9EEF6] text-[#0F172A]" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {t.isDebit ? "Debit" : "Credit"}
                        </span>
                      </td>
                      <td
                        className={`${td} pr-5 whitespace-nowrap text-right font-semibold tabular-nums ${
                          t.isMoneyIn ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {t.isMoneyIn ? "+" : "−"}
                        {t.currency} {fmt(t.amount, t.currency === "KES" || t.currency === "UGX" ? 0 : 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>
      </div>
    );
  };
  // -------------------------------------------------------------- shell
  const ownerName = user?.ownerName || userName;
  const SidebarBody = ({ compact, onClose }: { compact: boolean; onClose?: () => void }) => (
    <div className="flex h-full flex-col">
      <div className={`flex h-16 items-center gap-3 border-b border-white/10 ${compact ? "justify-center px-0" : "px-5"}`}>
        <SarifMark size={32} className="shrink-0 rounded-[7px] ring-1 ring-white/15" />
        {!compact && (
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold leading-tight text-white">Sarif</div>
            <div className="truncate text-xs text-slate-400" title={userName}>
              {userName}
            </div>
          </div>
        )}
        {onClose && (
          <button onClick={onClose} aria-label="Close menu" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Main">
        {NAV.map((item, i) => {
          const active = activeTab === item.id;
          return (
            <div key={item.id}>
              {item.id === "settings" && <div className="my-3 border-t border-white/10" />}
              <Link
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  switchTab(item.id, item.href);
                }}
                title={compact ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-3 rounded-lg text-sm font-medium ${
                  compact ? "justify-center" : "px-3"
                } ${active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
              >
                <item.icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-blue-300" : ""}`} />
                {!compact && <span className="truncate">{item.label}</span>}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className={`flex items-center gap-3 ${compact ? "flex-col" : "px-2"}`}>
          {profileImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profileImage} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-white">
              {initials(ownerName) || "?"}
            </div>
          )}
          {!compact && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{ownerName}</div>
              <div className="text-xs text-slate-400">Office</div>
            </div>
          )}
          <button
            onClick={onLogout}
            title="Log out"
            aria-label="Log out"
            className="rounded-md p-2 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );

  return {
    userName,
    onLogout,
    initialTab,
    user,
    activeTab,
    setActiveTab,
    sidebarOpen,
    setSidebarOpen,
    mobileMenuOpen,
    setMobileMenuOpen,
    showTransactionForm,
    setShowTransactionForm,
    profileImage,
    setProfileImage,
    stats,
    setStats,
    todayTxns,
    setTodayTxns,
    refreshing,
    setRefreshing,
    lastUpdated,
    setLastUpdated,
    activeCurrencies,
    setActiveCurrencies,
    base,
    baseCode,
    totalIn,
    setTotalIn,
    exchangeRate,
    setExchangeRate,
    otherRates,
    setOtherRates,
    rateEdited,
    setRateEdited,
    switchTab,
    fetchDashboardData,
    renderContent,
    renderDashboard,
    ownerName,
    SidebarBody,
  };
}

export type OfficeUserDashboardVM = ReturnType<typeof useOfficeUserDashboard>;
