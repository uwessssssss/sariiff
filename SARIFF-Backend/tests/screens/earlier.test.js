// Screen tests for the earlier "by reading" fixes of the line audit (W14-W36).
// Same kit and rules as screens.test.js; the proof run uses the screens as they were before W2.
const { withBrowser, store, suite, signedInBureau, app, mount, mountHook, hook, text, find, tag, pressable, tick, vm, proof, finish, server, toasts } = require("./kit");

const KES = 0, USD = 1, UGX = 2;
const noop = () => {};
const zeros = new Proxy({}, { get: () => 0 });
const selectWith = (tree, has) => find(tree, (e) => tag(e) === "select").filter((s) => has.test(text(s)))[0];
const box = (tree, placeholder) => find(tree, (e) => (tag(e) === "input" || tag(e) === "textarea") && placeholder.test(e.props.placeholder || ""))[0];

suite(async () => {
  await signedInBureau(UGX);

  // ------------------------------------------------------------------ the transaction form, end to end
  const client = { id: "c1", fullName: "Amina Hassan", code: "KB-CL-0001", whatsAppNumber: "+256700000010", isActive: true, balanceKES: 0, balanceUSD: 0, otherBalances: [] };
  const bureau = (posted) => (url, body, method) => {
    if (url.includes("/currencies")) return { baseCurrency: UGX, currencies: [] };
    if (url.includes("/api/cash")) return [{ id: "till-ugx", currency: UGX, balance: 9000000, isActive: true }, { id: "till-usd", currency: USD, balance: 5000, isActive: true }];
    if (url.includes("/api/bank") || url.includes("/api/mpesa")) return [];
    if (url.includes("/api/client")) return { items: [client], totalCount: 1, totalPages: 1, page: 1, pageSize: 100 };
    if (method === "POST" && url.includes("/api/transaction")) return posted(body);
    return undefined;
  };
  /** Opens the form, fills it as a cashier would, presses the submit button, and returns what happened. */
  async function fillAndSubmit({ account, till, amount, rate, date, reply }) {
    const { TransactionForm } = app("components/office/transaction-form/TransactionForm");
    server.reply(bureau(reply));
    const m = mount(TransactionForm, { onClose: noop, onSuccess: noop });
    for (let i = 0; i < 40 && /Loading accounts/.test(text(m.render())); i++) await tick(25);
    const settle = async () => { for (let i = 0; i < 3; i++) { m.render(); await tick(5); } return m.render(); };
    let t = await settle();
    const tills = selectWith(t, /Select cash account/);
    const tillNames = tills ? find(tills, (e) => tag(e) === "option").map(text) : [];
    selectWith(t, /Amina Hassan/).props.onChange({ target: { value: account } });
    t = await settle();
    selectWith(t, /Select cash account/).props.onChange({ target: { value: till } });
    t = await settle();
    box(t, /^0\.00$/).props.onChange({ target: { value: amount } });
    if (rate) { t = await settle(); box(t, /130\.50/).props.onChange({ target: { value: rate } }); }
    t = await settle();
    box(t, /Client deposit/).props.onChange({ target: { value: "Deposit" } });
    if (date) find(t, (e) => tag(e) === "input" && e.props.type === "date")[0].props.onChange({ target: { value: date } });
    t = await settle();
    const preview = (text(t).match(/Conversion Preview(.*?)=/) || [])[1];
    await find(t, (e) => tag(e) === "form")[0].props.onSubmit({ preventDefault: noop });
    for (let i = 0; i < 20; i++) { await tick(10); m.render(); }
    const share = find(m.render(), (e) => e.props.whatsappMessage !== undefined)[0];
    const sent = server.requests.find((r) => r.method === "POST" && r.url.includes("/api/transaction"));
    return { preview, tillNames, sent, share: share && share.props.isOpen ? share.props : null };
  }

  let ugxDeposit, forex;
  await proof("W15", "Transaction form: tills are listed by currency (Cash UGX), not 'Cash 2'", async (expect) => {
    ugxDeposit = await fillAndSubmit({ account: "c1_UGX", till: "till-ugx", amount: "250000", date: "2026-11-02",
      reply: (b) => ({ code: "TXN-77", amount: b.amount, currency: b.currency, sourceBalanceAfter: 250000 }) });
    expect(ugxDeposit.tillNames.some((n) => /Cash UGX/.test(n)) && ugxDeposit.tillNames.some((n) => /Cash USD/.test(n)), `tills offered: ${JSON.stringify(ugxDeposit.tillNames)}`);
  });
  await proof("W14", "Transaction form: the Transaction Date typed is sent (a back-dated entry is not recorded today)", (expect) => {
    const sent = ugxDeposit && ugxDeposit.sent;
    expect(!!sent, "nothing was posted");
    if (sent) expect(String(sent.body.transactionDate || "").startsWith("2026-11-02"), `posted with transactionDate = ${sent.body.transactionDate} for the date 2026-11-02`);
  });
  await proof("W16", "Transaction form: a deposit to a client's UGX account offers the WhatsApp confirmation", (expect) => {
    const s = ugxDeposit && ugxDeposit.share;
    expect(!!s, "no confirmation offered after a UGX deposit");
    if (s) expect(s.whatsappPhone === "+256700000010" && /250,000/.test(s.whatsappMessage), `message: ${String(s.whatsappMessage).slice(0, 160)}`);
  });
  await proof("W17", "Transaction form: on a forex entry the confirmation states the client's own amount and currency", async (expect) => {
    // The client's USD account receives USD 100, paid in as UGX 370,000 at 3,700 into the UGX till.
    const r = forex = await fillAndSubmit({ account: "c1_USD", till: "till-ugx", amount: "370000", rate: "3700",
      reply: (b) => ({ code: "TXN-78", amount: 100, currency: USD, counterAmount: 370000, counterCurrency: UGX, sourceBalanceAfter: 100 }) });
    expect(!!r.share, `no confirmation offered (posted: ${JSON.stringify(r.sent && r.sent.body)})`);
    if (r.share) {
      const amountLine = (r.share.details.find((d) => d.label === "Amount") || {}).value;
      expect(/^USD 100(\.00)?$/.test(amountLine), `the client is told the amount is "${amountLine}" (their account received USD 100)`);
    }
  });

  // ------------------------------------------------------------------ reconciliation
  const recon = (fields) => hook(app("components/office/reconciliation/hooks/useReconciliationActions").useReconciliationActions, vm({ transactions: [], matchSuggestions: [], selectedTransactions: [], ...fields }));

  await proof("W18", "Reconciliation: 'adjustment' claims nothing was created (nothing is)", (expect) => {
    recon({}).handleCreateAdjustment(-500, "Bank charges");
    expect(!toasts.some(([k, m]) => k === "success" || /created/i.test(m)), `said: ${JSON.stringify(toasts)}`);
    const { AdjustmentFormPanel } = app("components/office/reconciliation/sections/AdjustmentFormPanel");
    const t = text(AdjustmentFormPanel({ vm: vm({ showAdjustmentForm: true, adjustmentNote: "", currentVariance: -500, selectedAccount: { id: "b", name: "KCB", currency: KES, balance: 10000 } }) }));
    expect(/not posted automatically/i.test(t) && !/Create Adjustment/.test(t), `panel says: ${t.slice(0, 260)}`);
  });

  await proof("W19", "Reconciliation: 'Auto match all' asks first and does nothing when the answer is no", async (expect) => {
    const { ReconciliationStatus } = app("lib/api");
    let asked = "";
    global.window = { confirm: (q) => { asked = q; return false; } };
    try {
      await recon({ transactions: [{ id: "t1", reconciliationStatus: ReconciliationStatus.Pending }, { id: "t2", reconciliationStatus: ReconciliationStatus.Pending }] }).handleAutoReconcile();
    } finally { delete global.window; }
    expect(/without comparing/i.test(asked), `asked: "${asked}"`);
    expect(!server.requests.some((r) => r.url.includes("/api/reconciliation/bulk")), "both pending transactions were marked matched without asking");
  });

  await proof("W20", "Reconciliation: 'Accept all' never matches two transactions to one statement line", async (expect) => {
    const line = { amount: 5000, description: "MPESA DEPOSIT" };
    await recon({ matchSuggestions: [
      { transactionId: "t1", statementEntryId: "s1", confidence: 95, statementEntry: line },
      { transactionId: "t2", statementEntryId: "s1", confidence: 90, statementEntry: line }] }).handleAcceptAllSuggestions();
    const matched = server.requests.filter((r) => r.url.includes("/api/reconciliation/transaction/")).map((r) => r.url.split("/").pop());
    expect(matched.length === 1 && matched[0] === "t1", `one bank line was used for: ${JSON.stringify(matched)}`);
  });

  // ------------------------------------------------------------------ settings
  const settings = () => mountHook(app("components/office/settings/useOfficeSettings").useOfficeSettings, { userName: "Amina", profileImage: null, onProfileImageChange: noop });

  await proof("W22", "Settings: a generated client password does not come from Math.random", (expect) => {
    const real = Math.random; Math.random = () => 0.37;
    try {
      const m = settings();
      m.api.generateRandomPassword();
      const password = m.render().newPassword;
      expect(password && password.length === 12 && new Set(password).size > 3, `with Math.random fixed the password is "${password}"`);
    } finally { Math.random = real; }
  });

  await proof("W62b", "Settings: Save does not send a bureau name (the administrator sets it)", async (expect) => {
    const m = settings();
    m.api.setOfficeName("Renamed By Cashier");
    m.api.setOfficeEmail("office@example.com");
    await m.render().handleSaveSettings();
    const put = server.requests.find((r) => r.method === "PUT" && r.url.includes("/api/dashboard/settings"));
    expect(!!put, `nothing saved: ${JSON.stringify(server.requests.map((r) => r.method + " " + r.url))}`);
    if (put) expect(put.body.name === undefined && put.body.email === "office@example.com", `saved: ${JSON.stringify(put.body)}`);
  });

  await proof("W33", "Settings client table: a Ugandan client's UGX balance is shown", (expect) => {
    const { ClientPasswordManagementSection } = app("components/office/settings/sections/ClientPasswordManagementSection");
    const c = { id: "c1", code: "KB-CL-0001", fullName: "Amina Hassan", whatsAppNumber: "+256700000010", clientType: 0, isActive: true, balanceKES: 0, balanceUSD: 0, otherBalances: [{ currency: UGX, currencyCode: "UGX", balance: 250000 }] };
    const t = text(ClientPasswordManagementSection({ vm: vm({ filteredClients: [c], getClientName: (x) => x.fullName, loading: false, searchTerm: "" }) }));
    expect(/250,000/.test(t), `row: ${t.slice(-220)}`);
  });

  await proof("W36", "Settings password dialog: shows every currency the client holds", (expect) => {
    const { PasswordModal } = app("components/office/settings/sections/PasswordModal");
    const c = { id: "c1", code: "KB-CL-0001", fullName: "Amina Hassan", whatsAppNumber: "+256700000010", balanceKES: 0, balanceUSD: 0, otherBalances: [{ currency: UGX, currencyCode: "UGX", balance: 250000 }] };
    const t = text(PasswordModal({ vm: vm({ showPasswordModal: true, selectedClient: c, getClientName: (x) => x.fullName, newPassword: "", confirmPassword: "", showPassword: false, passwordLoading: false }) }));
    expect(/250,000/.test(t), `dialog: ${t.slice(0, 260)}`);
  });

  // ------------------------------------------------------------------ invoices
  await proof("W23", "Invoices: an invoice without a client email is accepted", async (expect) => {
    const m = mountHook(app("components/office/invoices/useInvoiceManagement").useInvoiceManagement);
    const form = m.api.formData;
    m.api.setFormData({ ...form, clientName: "Walk-in customer", clientEmail: "", items: [{ id: "1", description: "Service", quantity: 1, unitPrice: 50000, amount: 50000 }] });
    await m.render().handleCreateInvoice();
    await tick(20);
    const sent = server.requests.find((r) => r.method === "POST" && r.body && r.body.clientName === "Walk-in customer");
    expect(!!sent, `refused: ${JSON.stringify(toasts)}`);
  });

  // ------------------------------------------------------------------ reports
  const today = new Date().toISOString();
  const rows = [
    { id: "a", code: "TXN-1", description: 'Client said "pay today"', date: today, currency: "UGX", type: "debit", amount: 5000 },
    { id: "b", code: "TXN-2", description: "=SUM(A1:A9)", date: today, currency: "UGX", type: "credit", amount: 700 },
    { id: "c", code: "TXN-0", description: "January rent", date: "2026-01-05T10:00:00Z", currency: "UGX", type: "credit", amount: 900 }];
  const reportState = (extra) => vm({ transactions: rows, dateRange: "today", dateFrom: "", dateTo: "", searchTerm: "", currencyFilter: "all", transactionTypeFilter: "all", currentPage: 1, itemsPerPage: 10,
    statistics: zeros, base: UGX, baseCode: "UGX", reportType: "transactions", accountSummary: null, dailyReport: null, exchangeSummary: null, profitLossData: null, clientBalances: [], clientCurrencies: [], selectedDate: "2026-11-14", ...extra });

  await proof("W24", "Reports: the Date Range picker (Today) filters the transactions", (expect) => {
    const data = hook(app("components/office/reports/hooks/useReportsData").useReportsData, reportState({}));
    expect(data.filteredTransactions.length === 2, `"Today" lists ${data.filteredTransactions.length} of 3 (one is from January): ${data.filteredTransactions.map((t) => t.description).join(" | ")}`);
  });

  let csv = null;
  await proof("W26", "Reports: the transactions CSV holds the transactions on screen", async (expect) => {
    let blob = null;
    global.window = { URL: { createObjectURL: (b) => { blob = b; return "blob:x"; }, revokeObjectURL: noop } };
    global.document = { createElement: () => ({ click: noop }) };
    try {
      hook(app("components/office/reports/hooks/useReportsEffects").useReportsEffects, reportState({ filteredTransactions: rows.slice(0, 2) })).handleExport("csv");
    } finally { delete global.window; delete global.document; }
    csv = blob ? await blob.text() : null;
    expect(!!csv, `no file: ${JSON.stringify(toasts)}`);
    if (csv) expect(/TXN-1/.test(csv) && /TXN-2/.test(csv) && !/TXN-0/.test(csv) && csv.split("\n").length === 3, `file:\n${csv.slice(0, 300)}`);
  });
  await proof("W27", "Reports CSV: quotes are doubled and a formula opens as text", (expect) => {
    expect(!!csv, "no file");
    if (csv) {
      expect(csv.includes('"Client said ""pay today"""'), `quotes not doubled:\n${csv.slice(0, 300)}`);
      expect(csv.includes(`"'=SUM(A1:A9)"`), "=SUM(...) would run as a formula in Excel");
    }
  });

  await proof("W35", "Reports cash flow: the home currency (UGX) is shown under holdings even at zero, not KES", (expect) => {
    const { CashflowView } = app("components/office/reports/sections/CashflowView");
    const t = text(CashflowView({ vm: vm({ reportType: "cashflow", loading: false, base: UGX, dailyReport: null,
      accountSummary: { cashByCurrency: { [KES]: 0, [UGX]: 0 }, bankByCurrency: {}, mpesaByCurrency: { [UGX]: 0 }, totalMpesa: 0 } }) }));
    expect(/Cash UGX/.test(t) && !/Cash KES/.test(t), `holdings: ${t.slice(t.indexOf("Current Holdings"))}`);
  });

  // ------------------------------------------------------------------ super admin
  await proof("W34", "Super admin: a subscription that ends today says 'Expires today'", (expect) => {
    const { OverviewView } = app("components/super-admin/sections/OverviewView");
    const now = new Date();
    // more than 12 hours from now but still today: rounding the hours said "in 1 day" / "1 day ago"
    const expires = now.getHours() < 12 ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 1);
    const dashboard = { totalCompanies: 1, activeCompanies: 1, trialCompanies: 0, expiredCompanies: 0, suspendedCompanies: 0, companiesByBaseCurrency: [], companiesGrowth: 0, usersGrowth: 0, revenueGrowth: 0,
      totalUsers: 1, activeUsersToday: 1, monthlyRecurringRevenue: 0, totalRevenue: 0, monthlyTransactionsCount: 0, totalTransactionsCount: 0, systemStatus: "Healthy", errorsLast24h: 0, securityAlertsActive: 0,
      topCompaniesByTransactions: [], topCompaniesByVolume: [], recentSignups: [], monthlyVolumeByCurrency: [], totalVolumeByCurrency: [],
      expiringSubscriptions: [{ id: "co1", name: "Kampala Bureau", code: "KB-1", subscriptionPlan: "Starter", subscriptionStatus: "Active", subscriptionExpiresAt: expires.toISOString(), monthlyFee: 0 }] };
    const t = text(OverviewView({ vm: vm({ activeTab: "overview", loading: false, refreshing: false, dashboard }) }));
    expect(/Expires today/.test(t), `says: ${(t.match(/Expire[ds][^·]*/) || ["nothing"])[0]}`);
  });


  // ------------------------------------------------------------------ second batch
  await proof("W13", "Transaction form: UGX paid in for a USD account is shown divided by the rate (÷), not multiplied", (expect) => {
    expect(forex && /÷/.test(forex.preview || "") && !/×/.test(forex.preview || ""), `preview: UGX 370,000 ${forex && forex.preview}= USD 100`);
  });

  await proof("W11", "Sign-in: a token refresh keeps the signed-in user's id and phone", async (expect) => {
    const before = store["sariff_auth"];
    store["sariff_auth"] = JSON.stringify({ token: "old", refreshToken: "r1", expiresAt: "", user: { id: "user-7", fullName: "Amina", whatsAppNumber: "+256700000010", companyId: "co1", role: 1, mustChangePassword: false } });
    server.reply((url, _b, _m, headers) => url.includes("/api/auth/refresh")
      ? { accessToken: "new", refreshToken: "r2", companyId: "co1", role: 1, name: "Kampala Bureau", code: "KB-1", expiresAt: "" }
      : headers.Authorization === "Bearer new" ? [] : { __status: 401 });
    try {
      await withBrowser(() => app("lib/api").getCashAccounts());
      const auth = JSON.parse(store["sariff_auth"]);
      expect(auth.token === "new", `token after refresh: ${auth.token}`);
      expect(auth.user.id === "user-7" && auth.user.whatsAppNumber === "+256700000010", `user after refresh: ${JSON.stringify({ id: auth.user.id, whatsAppNumber: auth.user.whatsAppNumber })}`);
    } finally { store["sariff_auth"] = before; }
  });

  await proof("W29", "Expenses: payment method 3 is 'Account transfer', not 'Credit Card'", (expect) => {
    const state = hook(app("components/office/expenses/hooks/useExpensesAccountState").useExpensesAccountState);
    const row = state.mapExpenseDto({ id: "e1", code: "EXP-1", expenseDate: "2026-11-10T09:00:00Z", description: "Rent", categoryId: "c", categoryName: "Rent", currency: UGX, amount: 100, paymentMethod: 3 });
    expect(row.paymentMethod === "Account transfer", `shown as "${row.paymentMethod}"`);
  });

  await proof("W30", "Super admin sign-out: the server is told while the sign-in is still there", async (expect) => {
    const before = store["sariff_auth"];
    try {
      const state = hook(app("components/super-admin/hooks/useSuperAdminDashboardState").useSuperAdminDashboardState, { userName: "Admin", initialTab: "overview", onLogout: () => app("lib/api").logout() });
      await withBrowser(() => state.handleLogout());
      const out = server.requests.find((r) => r.url.includes("/api/auth/logout"));
      expect(!!out, "the server was never told");
      if (out) expect(out.headers.Authorization === "Bearer t" && out.body && out.body.refreshToken === "r", `sign-out was sent with ${JSON.stringify({ Authorization: out.headers.Authorization, refreshToken: out.body && out.body.refreshToken })}`);
      expect(store["sariff_auth"] === undefined, "the sign-in is still stored afterwards");
    } finally { store["sariff_auth"] = before; }
  });

  // ---- client portal
  const profile = { id: "c1", fullName: "Amina Hassan", code: "KB-CL-0001", whatsAppNumber: "+256700000010", email: "", companyName: "Kampala Bureau", clientType: 0, balanceKES: 0, balanceUSD: 0,
    openingBalanceKES: 0, openingBalanceUSD: 0, totalInKES: 0, totalOutKES: 0, totalInUSD: 0, totalOutUSD: 0, createdAt: "2026-01-01T00:00:00Z",
    otherBalances: [{ currency: UGX, currencyCode: "UGX", balance: 250000, openingBalance: 0, totalIn: 250000, totalOut: 0 }] };
  const line = (code) => ({ id: code, code, reference: code, date: "2026-11-10T09:30:00Z", description: "Deposit", type: "Credit", amount: 1000, currency: UGX, balanceAfter: 1000 });
  const portalData = (extra) => hook(app("components/client-portal/hooks/useClientUserDashboardData").useClientUserDashboardData,
    vm({ userName: "Amina", profile, quickStats: null, analytics: null, transactions: [line("ON-SCREEN")], allMatchingTransactions: async () => [line("ON-SCREEN"), line("PAGE-TWO")],
      passwordForm: { currentPassword: "old-pass", newPassword: "NewPass123", confirmPassword: "NewPass123" }, searchQuery: "", activeView: "dashboard", mobileMenuOpen: false, ...extra }));

  let printed = null;
  await proof("W31", "Portal statement print: boxes for the currencies the client holds (UGX), not empty KES/USD", async (expect) => {
    const page = await withBrowser(() => portalData({}).handlePrintStatement());
    printed = page.printed;
    expect(!!printed, `nothing printed: ${JSON.stringify(toasts)}`);
    if (printed) expect(/UGX Balance/.test(printed) && !/KES Balance/.test(printed) && !/USD Balance/.test(printed), `boxes: ${(printed.match(/[A-Z]{3} Balance/g) || []).join(", ")}`);
  });
  await proof("W8", "Portal statement print: every matching transaction, not only the page on screen", (expect) => {
    expect(!!printed && /PAGE-TWO/.test(printed), "the transaction on page two is not in the statement");
  });

  await proof("W12", "Portal: after a password change the client is signed out (the server ended the session)", async (expect) => {
    let signedOut = false;
    server.reply(() => ({}));
    await portalData({ onLogout: () => { signedOut = true; } }).handleChangePassword();
    expect(server.requests.some((r) => /password/i.test(r.url)), `no password request: ${JSON.stringify(server.requests.map((r) => r.url))}`);
    expect(signedOut, "the client was left signed in with a dead session");
  });

  await proof("W32", "Portal profile: the client's UGX balance is a main box, with no empty KES/USD boxes", async (expect) => {
    const { ClientUserDashboard } = app("components/client-portal/ClientUserDashboard");
    server.reply((url) => (/\/dashboard(\?|$)/.test(url) ? { profile, recentTransactions: [], recentAlerts: [], quickStats: { thisMonthInKES: 0, thisMonthOutKES: 0, thisMonthInUSD: 0, thisMonthOutUSD: 0, thisMonthOtherCurrencies: [] } }
      : url.includes("/currencies") ? { baseCurrency: UGX, currencies: [] } : { items: [], totalCount: 0, totalPages: 0 }));
    const m = mount(ClientUserDashboard, { userName: "Amina", onLogout: noop });
    for (let i = 0; i < 10; i++) { await tick(15); m.render(); }
    const nav = pressable(m.tree, /^(My )?Profile$/);
    expect(!!nav, `no Profile button: ${text(m.tree).slice(0, 200)}`);
    if (nav) nav.props.onClick();
    for (let i = 0; i < 4; i++) { await tick(10); m.render(); }
    const t = text(m.tree);
    expect(/UGX Balance/.test(t), `profile: ${(t.match(/[A-Z]{3} Balance/g) || ["no balance boxes"]).join(", ")}`);
    expect(!/KES Balance/.test(t) && !/USD Balance/.test(t), `empty boxes shown: ${(t.match(/[A-Z]{3} Balance/g) || []).join(", ")}`);
  });

  await proof("SM2", "Portal list: a slow answer for an earlier search does not replace the current one", async (expect) => {
    let release;
    server.reply((url) => {
      if (!url.includes("/transactions?")) return undefined;
      if (/search=amin(&|$)/.test(url)) return new Promise((r) => { release = () => r({ items: [line("FOR-AMIN")], totalCount: 1 }); });
      if (/search=amina(&|$)/.test(url)) return { items: [line("FOR-AMINA")], totalCount: 1 };
      return { items: [], totalCount: 0 };
    });
    const m = mountHook(app("components/client-portal/hooks/useClientUserDashboardState").useClientUserDashboardState, { userName: "Amina", onLogout: noop });
    m.api.setSearchQuery("amin");
    const slow = m.render().fetchTransactions();
    await tick(10);
    m.api.setSearchQuery("amina");
    await m.render().fetchTransactions();
    release(); await slow; await tick(10);
    const shown = (m.render().transactions || []).map((x) => x.code);
    expect(shown.length === 1 && shown[0] === "FOR-AMINA", `the box says "amina" but the list shows ${JSON.stringify(shown)}`);
  });

  await proof("W25", "Reports PDF: every transaction on screen is in the file (it stopped at the first 50)", async (expect) => {
    const fs = require("fs"), os = require("os"), path = require("path"), zlib = require("zlib");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "report-")); const cwd = process.cwd();
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, code: `TXN-${String(i + 1).padStart(3, "0")}`, description: `Entry ${i + 1}`, date: today, currency: "UGX", type: "debit", amount: 1000 + i }));
    process.chdir(dir);
    try {
      await withBrowser(() => hook(app("components/office/reports/hooks/useReportsEffects").useReportsEffects, reportState({ transactions: many, filteredTransactions: many })).handleExport("pdf"));
      await tick(50);
    } finally { process.chdir(cwd); }
    const file = fs.readdirSync(dir).find((f) => f.endsWith(".pdf"));
    expect(!!file, `no PDF written: ${JSON.stringify(toasts)}`);
    if (file) {
      const raw = fs.readFileSync(path.join(dir, file));
      let words = raw.toString("latin1");
      for (let at = raw.indexOf("stream"); at >= 0; at = raw.indexOf("stream", at + 6)) {
        const start = raw[at + 6] === 13 ? at + 8 : at + 7; const end = raw.indexOf("endstream", start);
        if (end < 0) break;
        try { words += zlib.inflateSync(raw.subarray(start, end)).toString("latin1"); } catch { /* not compressed */ }
      }
      expect(/Entry 1\b/.test(words), "the PDF text could not be read");
      expect(/Entry 60\b/.test(words), `rows in the PDF: ${(words.match(/Entry \d+/g) || []).length} of 60`);
    }
  });
});
