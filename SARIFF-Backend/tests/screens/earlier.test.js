// Screen tests for the earlier "by reading" fixes of the line audit (W14-W36).
// Same kit and rules as screens.test.js; the proof run uses the screens as they were before W2.
const { suite, signedInBureau, app, mount, mountHook, hook, text, find, tag, pressable, tick, vm, proof, finish, server, toasts } = require("./kit");

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
    await find(t, (e) => tag(e) === "form")[0].props.onSubmit({ preventDefault: noop });
    for (let i = 0; i < 20; i++) { await tick(10); m.render(); }
    const share = find(m.render(), (e) => e.props.whatsappMessage !== undefined)[0];
    const sent = server.requests.find((r) => r.method === "POST" && r.url.includes("/api/transaction"));
    return { tillNames, sent, share: share && share.props.isOpen ? share.props : null };
  }

  let ugxDeposit;
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
    const r = await fillAndSubmit({ account: "c1_USD", till: "till-ugx", amount: "370000", rate: "3700",
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

});
