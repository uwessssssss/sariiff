// Screen tests for the phone app's "by reading" fixes (M13-M35). See phone-kit.js.
//   node phone.test.js <sariff-mobile/src> <web>                       every test must pass
//   node phone.test.js <old sariff-mobile/src> <web> --expect-fail     every test must fail on the defect
const { vm, suite, app, mount, hook, text, find, tick, proof, server, toasts, world, phone, tappable, field, signedIn } = require("./phone-kit");

const KES = 0, USD = 1, UGX = 2;
const noop = () => {};

suite(async () => {
  signedIn();
  const api = app("services/api");

  await proof("M13", "SMS code: a pasted or autofilled 6-digit code fills all six boxes", (expect) => {
    world.context = { verifyOtp: async () => ({ success: true }), resendOtp: async () => ({ success: true }), pendingLogin: { phone: "+256700000010", whatsAppNumber: "+256700000010" }, isLoading: false };
    try {
      const OtpScreen = app("screens/auth/OtpScreen").default;
      const m = mount(OtpScreen, {});
      const boxes = () => find(m.tree, (e) => typeof e.props.onChangeText === "function");
      boxes()[0].props.onChangeText("483920");
      m.render();
      const shown = boxes().map((b) => b.props.value).join("");
      expect(shown === "483920", `the code 483920 from the SMS became "${shown}"`);
      expect(boxes()[0].props.textContentType === "oneTimeCode" || boxes()[0].props.autoComplete === "sms-otp", "the first box is not marked as the one-time-code field");
    } finally { world.context = undefined; }
  });

  await proof("M14", "Phone sign-in: the super admin is refused and told the dashboard is on the web", async (expect) => {
    server.reply((url) => (url.includes("/api/auth/login") ? { accessToken: "sa-token", refreshToken: "sa-refresh", role: 0, name: "Platform", code: "SA-1" } : undefined));
    const { AuthProvider } = app("hooks/useAuth");
    const m = mount(AuthProvider, { children: null });
    await tick(20); m.render();
    const result = await m.tree.props.value.login({ code: "SA-1", whatsAppNumber: "+254700000001", password: "x" });
    await tick(20); m.render();
    expect(result && result.success === false && /web/i.test(result.message || ""), `sign-in answered: ${JSON.stringify(result)}`);
    expect(m.tree.props.value.isAuthenticated !== true, "the super admin was let into the bureau tabs");
    signedIn();
  });

  await proof("M17", "A server outage page (HTML) is reported in plain words, not as a JSON parse error", async (expect) => {
    server.reply(() => ({ __status: 503, __text: "<html><body>Service Unavailable</body></html>" }));
    let r, thrown = "";
    try { r = await api.getCompanyCurrencies(); } catch (e) { thrown = String(e && e.message); }
    const message = thrown || (r && r.message) || "";
    expect(r && r.success === false && /starting up or unavailable/i.test(message), `the screen would show: "${message}"`);
  });

  await proof("M18", "Exchange daily summaries ask the server with from/to (the names it reads)", async (expect) => {
    await api.getExchangeDailySummaries("2026-11-01", "2026-11-14");
    const url = (server.requests.find((r) => r.url.includes("/daily/summaries")) || {}).url || "";
    expect(/from=2026-11-01/.test(url) && /to=2026-11-14/.test(url), `asked: ${url}`);
  });

  await proof("M16", "A receipt asked for after the one-hour sign-in refreshes the token instead of failing with 401", async (expect) => {
    signedIn();
    server.reply((url, _b, _m, headers) => url.includes("/api/auth/refresh")
      ? { accessToken: "fresh", refreshToken: "r2", role: 1, name: "Amina", code: "KB-OFF-1" }
      : headers.Authorization === "Bearer fresh" ? { receipt: "TXN-1" } : { __status: 401 });
    const r = await api.downloadFile("/api/transaction/t1/receipt");
    expect(r && r.success === true, `download answered: ${JSON.stringify(r)}`);
    signedIn();
  });

  await proof("M21", "Password and email boxes do not capitalise or auto-correct what is typed", (expect) => {
    const { Input } = app("components/ui/controls");
    const box = (props) => find(hook(Input, { label: "x", value: "", onChangeText: noop, ...props }), (e) => typeof e.props.onChangeText === "function")[0];
    const password = box({ secureTextEntry: true }), email = box({ keyboardType: "email-address" }), name = box({});
    expect(password && password.props.autoCapitalize === "none" && password.props.autoCorrect === false, `password box: autoCapitalize=${password && password.props.autoCapitalize}, autoCorrect=${password && password.props.autoCorrect}`);
    expect(email && email.props.autoCapitalize === "none", `email box: autoCapitalize=${email && email.props.autoCapitalize}`);
    expect(name && name.props.autoCapitalize !== "none", "an ordinary box must keep the keyboard's default");
  });

  // ------------------------------------------------------------------ screens
  const draw = async (m, times = 4) => { for (let i = 0; i < times; i++) { await tick(15); try { m.render(); } catch (e) { m.failed = e; } } return m.tree; };
  const labelled = (tree, label) => find(tree, (e) => e.props.accessibilityLabel === label && typeof e.props.onPress === "function")[0];
  const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  await proof("M22", "Phone profile: after a password change the client is signed out", async (expect) => {
    let signedOut = false;
    world.context = { user: { id: "c1", code: "KB-CL-0001", fullName: "Amina Hassan", role: 2 }, logout: async () => { signedOut = true; }, isAuthenticated: true };
    server.reply(() => ({}));
    try {
      const m = mount(app("screens/shared/ProfileScreen").default, {});
      await draw(m);
      const open = tappable(m.tree, /^Change Password$/);
      expect(!!open, `no Change Password row${m.failed ? " (" + m.failed.message + ")" : ""}: ${text(m.tree).slice(0, 400)}`);
      if (!open) return;
      open.props.onPress();
      await draw(m, 1);
      field(m.tree, /Current Password/).props.onChangeText("old-pass-1");
      field(m.render(), /New Password/).props.onChangeText("NewPass123");
      field(m.render(), /Confirm Password/).props.onChangeText("NewPass123");
      await tappable(m.render(), /^Update Password$/).props.onPress();
      await draw(m, 2);
      expect(server.requests.some((r) => /password/i.test(r.url)), `no password request: ${JSON.stringify(toasts)}`);
      expect(signedOut, "the client was left signed in with a session the server has ended");
    } finally { world.context = undefined; }
  });

  await proof("M23", "Phone reports: ‹ loads the previous day's report (the heading changed, the figures did not)", async (expect) => {
    server.reply((url) => (url.includes("/api/report/daily") ? { date: url.split("date=")[1], openingBalances: {}, closingBalances: {}, transactions: [], totalTransactions: 0 } : url.includes("/currencies") ? { baseCurrency: UGX, currencies: [] } : undefined));
    const m = mount(app("screens/office/ReportsScreen").default, {});
    await draw(m, 2);
    const generate = tappable(m.tree, /^Generate .*Report$/);
    expect(!!generate, `no Generate button: ${text(m.tree).slice(0, 160)}`);
    if (generate) await generate.props.onPress();
    await draw(m);
    const previous = labelled(m.tree, "Previous");
    expect(!!previous, `the daily report was not drawn${m.failed ? ": " + m.failed.message : ""}`);
    if (previous) previous.props.onPress();
    await draw(m);
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const asked = server.requests.filter((r) => r.url.includes("/api/report/daily")).map((r) => r.url.split("date=")[1]);
    expect(asked.includes(day(yesterday)), `days loaded: ${JSON.stringify(asked)} (the heading now says ${day(yesterday)})`);
  });

  await proof("M25", "Phone dashboard: an entry made at 01:30 at night counts as today", async (expect) => {
    const now = new Date();
    const night = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 1, 30);          // 22:30 UTC the day before
    const before = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 15, 0);
    const txn = (id, when, description) => ({ id, code: id, transactionDate: when.toISOString(), createdAt: when.toISOString(), description, amount: 1000, currency: UGX, transactionType: 0,
      sourceAccountType: 0, destAccountType: 3, sourceAccountName: "Cash UGX", destAccountName: "Amina", reference: id });
    world.context = { user: { id: "u1", code: "KB-OFF-1", fullName: "Amina Hassan", role: 1, companyName: "Kampala Bureau" }, logout: noop, isAuthenticated: true };
    server.reply((url) => (/\/api\/dashboard$/.test(url) ? { recentTransactions: [txn("T-NIGHT", night, "NIGHT DEPOSIT"), txn("T-BEFORE", before, "YESTERDAY RENT")], todayTransactions: { totalCount: 1 }, holdings: [], cashBalances: [], bankBalances: [] }
      : url.includes("/currencies") ? { baseCurrency: UGX, currencies: [] } : undefined));
    try {
      const m = mount(app("screens/office/OfficeDashboardScreen").default, {});
      await draw(m, 6);
      const t = text(m.tree);
      expect(/NIGHT DEPOSIT/.test(t), `the 01:30 entry is not on the dashboard${m.failed ? " (" + m.failed.message + ")" : ""}: ${t.slice(0, 200)}`);
      expect(!/YESTERDAY RENT/.test(t), "with nothing counted as today, yesterday's entries were listed instead");
    } finally { world.context = undefined; }
  });

  await proof("M27", "Phone invoice PDF: headed with the bureau's name, and an & or < in a name does not break it", async (expect) => {
    const invoice = { id: "i1", invoiceNumber: "INV-9", clientName: "Brown & Sons <Ltd>", clientEmail: "", clientPhone: "", clientAddress: "", status: 0, currency: UGX, invoiceDate: "2026-11-10T00:00:00Z", dueDate: "2026-11-20T00:00:00Z",
      items: [{ description: "Service", quantity: 1, unitPrice: 100000, amount: 100000 }], subtotal: 100000, taxAmount: 0, taxRate: 0, discount: 0, total: 100000, notes: "" };
    server.reply((url) => (/\/api\/invoice\/i1$/.test(url) ? invoice : url.includes("/api/invoice?") ? { items: [invoice], totalCount: 1, totalPages: 1 }
      : url.includes("/api/dashboard/company") ? { name: "Kampala Bureau", address: "Kampala Rd", whatsAppNumber: "+256700000001", taxId: "TIN-1" }
      : url.includes("/currencies") ? { baseCurrency: UGX, currencies: [] } : url.includes("/api/client") ? { items: [], totalCount: 0 } : undefined));
    phone.reset();
    const m = mount(app("screens/office/InvoicesScreen").default, {});
    await draw(m, 5);
    const download = labelled(m.tree, "Download");
    expect(!!download, `no invoice row${m.failed ? " (" + m.failed.message + ")" : ""}: ${text(m.tree).slice(0, 160)}`);
    if (download) await download.props.onPress();
    await tick(40);
    const printed = phone.calls.find((c) => c[0] === "expo-print" && c[1] === "printToFileAsync");
    const html = printed ? printed[2][0].html : "";
    expect(!!printed, `nothing was sent to the printer: ${JSON.stringify(toasts)}`);
    if (printed) {
      expect(/Kampala Bureau/.test(html) && !/Forex Bureau Services/.test(html), `the invoice is headed: ${(html.match(/font-weight:800[^>]*>([^<]*)</) || [])[1]}`);
      expect(html.includes("Brown &amp; Sons &lt;Ltd&gt;"), "the client's name is not escaped");
    }
  });

  await proof("M28", "Phone expenses: the total is of every expense and older ones load on scroll", async (expect) => {
    const expense = (n) => ({ id: `e${n}`, code: `EXP-${n}`, description: `Expense ${n}`, amount: 1000, currency: UGX, categoryName: "Rent", expenseDate: "2026-11-10T09:00:00Z", createdAt: "2026-11-10T09:00:00Z", paymentMethod: 0 });
    server.reply((url) => (url.includes("/api/expense/category") ? [] : url.includes("/api/expense/stats") ? { byCurrency: [{ currency: UGX, total: 60000 }], totalExpenses: 60 }
      : /\/api\/expense\?page=1&/.test(url) ? { items: Array.from({ length: 50 }, (_, i) => expense(i + 1)), totalCount: 60, totalPages: 2 }
      : /\/api\/expense\?page=2&/.test(url) ? { items: Array.from({ length: 10 }, (_, i) => expense(i + 51)), totalCount: 60, totalPages: 2 }
      : url.includes("/currencies") ? { baseCurrency: UGX, currencies: [] } : []));
    const m = mount(app("screens/office/ExpensesScreen").default, {});
    await draw(m, 5);
    let t = text(m.tree);
    expect(/60,000/.test(t), `total shown for 60 expenses of 1,000: ${(t.match(/USh[\s\d,.]+|UGX[\s\d,.]+/) || ["?"])[0]}${m.failed ? " (" + m.failed.message + ")" : ""}`);
    const list = find(m.tree, (e) => typeof e.props.onEndReached === "function")[0];
    expect(!!list, "the list does not load more when scrolled to its end");
    if (list) { await list.props.onEndReached(); await draw(m, 3); expect(/Expense 60\b/.test(text(m.tree)), "expense 60 is still not reachable"); }
  });

  await proof("M31", "Phone More menu: Logout asks first (one stray tap signed out mid-shift)", async (expect) => {
    let signedOut = false;
    world.context = { user: { id: "u1", code: "KB-OFF-1", fullName: "Amina Hassan", role: 1 }, logout: () => { signedOut = true; }, isAuthenticated: true };
    phone.reset();
    try {
      const m = mount(app("screens/office/MoreScreen").default, {});
      const out = tappable(m.tree, /^Logout$/);
      expect(!!out, `no Logout row: ${text(m.tree).slice(-200)}`);
      if (!out) return;
      out.props.onPress();
      expect(!signedOut && phone.alerts.length === 1, signedOut ? "one tap signed out, with no question" : "no question was asked");
      const yes = phone.alerts[0] && phone.alerts[0].buttons.find((b) => b.style === "destructive");
      if (yes) yes.onPress();
      expect(!phone.alerts[0] || signedOut, "answering Sign Out did not sign out");
    } finally { world.context = undefined; }
  });

  await proof("M32", "Phone alerts: 'Read all' stays while older pages are not loaded yet", async (expect) => {
    const alert = (n) => ({ id: `a${n}`, title: `Alert ${n}`, message: "Deposit received", isRead: true, createdAt: "2026-11-10T09:00:00Z", severity: 0, type: 0 });
    server.reply((url) => (url.includes("/api/portal/alerts") ? { items: Array.from({ length: 20 }, (_, i) => alert(i + 1)), totalCount: 40, totalPages: 2 } : undefined));
    world.context = { user: { id: "c1", code: "KB-CL-0001", fullName: "Amina Hassan", role: 2 }, logout: noop, isAuthenticated: true };
    try {
      const m = mount(app("screens/client/AlertsScreen").default, {});
      await draw(m, 4);
      const t = text(m.tree);
      expect(server.requests.some((r) => r.url.includes("/api/portal/alerts")), `alerts were not loaded${m.failed ? " (" + m.failed.message + ")" : ""}`);
      expect(/Read all/.test(t), "page 1 is read, page 2 (maybe unread) is not loaded, and 'Read all' is gone");
    } finally { world.context = undefined; }
  });

  await proof("M35", "Phone client profile: lists the currencies the client used (UGX), not an empty KES line", async (expect) => {
    world.context = { user: { id: "c1", code: "KB-CL-0001", fullName: "Amina Hassan", role: 2 }, logout: noop, isAuthenticated: true };
    server.reply((url) => (url.includes("/api/portal/profile") ? { id: "c1", code: "KB-CL-0001", fullName: "Amina Hassan", whatsAppNumber: "+256700000010", isActive: true, clientType: 0,
      balanceKES: 0, balanceUSD: 0, totalInKES: 0, totalOutKES: 0, totalInUSD: 0, totalOutUSD: 0, openingBalanceKES: 0, openingBalanceUSD: 0,
      otherBalances: [{ currency: UGX, currencyCode: "UGX", balance: 250000, openingBalance: 0, totalIn: 250000, totalOut: 0 }] } : undefined));
    try {
      const m = mount(app("screens/shared/ProfileScreen").default, {});
      await draw(m, 4);
      const t = text(m.tree);
      expect(/Total Credited \(UGX\)/.test(t), `profile${m.failed ? " (" + m.failed.message + ")" : ""}: ${(t.match(/Total (Credited|Debited) \([A-Z]{3}\)/g) || ["no totals"]).join(", ")}`);
      expect(!/Total Credited \(KES\)/.test(t), "a KES line is shown for a client who never used KES");
    } finally { world.context = undefined; }
  });

  const chips = (tree, has) => (find(tree, (e) => Array.isArray(e.props.options) && e.props.options.some((o) => has.test(String(o.label))))[0] || { props: { options: [] } }).props.options;

  await proof("M30", "Phone settle profit (Ugandan bureau): the home-currency chip is UGX, not KES", (expect) => {
    const { SettleProfitSheet } = app("screens/office/exchange/sections/SettleProfitSheet");
    const options = chips(SettleProfitSheet({ vm: vm({ base: UGX, baseCode: "UGX", modal: "settleProfit", float: { kesProfit: 50000, usdProfit: 0 }, floatSrcType: 0, formLoading: false, settleAccId: "", settleCurrency: UGX, getFloatAccountList: () => [] }) }), /^USD \(/);
    const home = options.find((o) => /^UGX \(/.test(String(o.label)));
    expect(home && home.value === UGX, `the "UGX" chip sends currency ${home ? home.value : "?"} (UGX is ${UGX}; ${KES} is KES, which the server refuses)`);
  });

  await proof("M33", "Phone withdraw float in UGX: Mobile money is offered as the destination", (expect) => {
    const { FloatFundingSheet } = app("screens/office/exchange/sections/FloatFundingSheet");
    const options = chips(FloatFundingSheet({ vm: vm({ base: UGX, baseCode: "UGX", modal: "withdrawFloat", floatCurrency: UGX, floatAmount: "", floatPurchaseRate: "", floatSrcType: 0, floatSrcId: "", formLoading: false, getFloatAccountList: () => [] }) }), /^Cash$/);
    expect(options.some((o) => o.label === "Mobile money"), `account types offered: ${JSON.stringify(options.map((o) => o.label))}`);
  });

  await proof("M24", "Phone reports: a slow answer for the report chosen before does not fill the one chosen now", async (expect) => {
    let release;
    server.reply((url) => {
      if (url.includes("/api/report/account-summary")) return new Promise((r) => { release = () => r({ cashAccounts: [], bankAccounts: [], mpesaAgents: [], totalCashKES: 111 }); });
      if (url.includes("/api/report/client-balances")) return [{ id: "c1", fullName: "CLIENT ROW", code: "KB-CL-0001", balanceKES: 0, balanceUSD: 0, otherBalances: [] }];
      return url.includes("/currencies") ? { baseCurrency: UGX, currencies: [] } : undefined;
    });
    const m = mount(app("screens/office/ReportsScreen").default, {});
    await draw(m, 2);
    tappable(m.tree, /^Accounts$/).props.onPress();
    await draw(m, 1);
    const slow = tappable(m.tree, /^Generate .*Report$/).props.onPress();
    await draw(m, 1);
    tappable(m.tree, /^Clients$/).props.onPress();
    await draw(m, 1);
    await tappable(m.tree, /^Generate .*Report$/).props.onPress();
    await draw(m, 2);
    if (release) release(); await slow; await draw(m, 3);
    const t = text(m.tree);
    expect(!!release, "the Accounts report was never asked for");
    expect(/Client Balances/.test(t) && /CLIENT ROW/.test(t), `the Clients view shows${m.failed ? " an error (" + m.failed.message + ")" : ""}: ${t.slice(-160)}`);
  });

  await proof("M15", "Phone sign-in: when the encrypted store cannot be read, the phone-number step is shown (not an endless spinner)", async (expect) => {
    world.context = { signInWithTokens: async () => ({ success: true }), isLoading: false };
    phone.storeBroken = true;
    try {
      const m = mount(app("screens/auth/PhoneLogin").default, {});
      await draw(m, 5);
      const boxes = find(m.tree, (e) => typeof e.props.onChangeText === "function");
      expect(boxes.length > 0, `after the store failed the screen shows: "${text(m.tree).slice(0, 120)}" and no box to type a phone number`);
    } finally { phone.storeBroken = false; world.context = undefined; }
  });

  await proof("M26", "Phone sign-in by phone number: the previous bureau's home currency is not kept", async (expect) => {
    const { useBaseCurrency } = app("hooks/useBaseCurrency");
    const baseNow = async () => { const h = require("./phone-kit").mountHook(useBaseCurrency); await tick(30); return h.render().base; };
    server.reply((url) => (url.includes("/currencies") ? { baseCurrency: KES, currencies: [] } : undefined));
    const first = await baseNow();
    server.reply((url) => (url.includes("/currencies") ? { baseCurrency: UGX, currencies: [] } : undefined));
    const { AuthProvider } = app("hooks/useAuth");
    const m = mount(AuthProvider, { children: null });
    await tick(20); m.render();
    await m.tree.props.value.signInWithTokens({ accessToken: "t2", refreshToken: "r2", role: 1, code: "KB-OFF-1", name: "Kampala Bureau", companyId: "co2" });
    await tick(20);
    const second = await baseNow();
    expect(first === KES, `the first bureau's home currency was read as ${first}`);
    expect(second === UGX, `after signing in to the Ugandan bureau the home currency is still ${second === KES ? "KES" : second}`);
    signedIn();
  });
});
