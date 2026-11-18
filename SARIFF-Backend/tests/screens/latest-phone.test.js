// Phone screen tests for the 18 Nov changes.
//   node latest-phone.test.js <sariff-mobile/src> <web>                          every test must pass
//   node latest-phone.test.js <old sariff-mobile/src> <web> --expect-fail        old = 4556a36
const { suite, app, mount, text, find, tick, proof, server, toasts, world, phone, tappable, field, signedIn } = require("./phone-kit");

const UGX = 2;
const noop = () => {};
const draw = async (m, times = 4) => { for (let i = 0; i < times; i++) { await tick(15); try { m.render(); } catch (e) { m.failed = e; } } return m.tree; };
const office = { user: { id: "u1", code: "KB-OFF-1", fullName: "Amina Hassan", role: 1, companyName: "Kampala Bureau" }, logout: noop, isAuthenticated: true };
const txn = (code, when) => ({ id: code, code, transactionDate: when.toISOString(), createdAt: when.toISOString(), description: `ROW ${code}`, amount: 1000, currency: UGX,
  transactionType: 0, sourceAccountType: 0, destAccountType: 3, sourceAccountName: "Cash UGX", destAccountName: "Amina", reference: code });

suite(async () => {
  signedIn();
  app("hooks/useBaseCurrency").resetBaseCurrency();

  await proof("M37", "Phone dashboard: every one of today's 30 postings is reachable (it showed at most 8 of the latest 10)", async (expect) => {
    const now = new Date();
    const today = Array.from({ length: 30 }, (_, i) => txn(`T${String(i + 1).padStart(2, "0")}`, new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, i)));
    const newestFirst = [...today].reverse();
    world.context = office;
    server.reply((url) => (/\/api\/dashboard$/.test(url) ? { recentTransactions: newestFirst.slice(0, 10), todayTransactions: { totalCount: 30 }, holdings: [], cashBalances: [], bankBalances: [] }
      : url.includes("/api/transaction/recent") ? newestFirst
      : url.includes("/currencies") ? { baseCurrency: UGX, currencies: [] } : undefined));
    try {
      const m = mount(app("screens/office/OfficeDashboardScreen").default, {});
      await draw(m, 6);
      for (let i = 0; i < 3; i++) { const more = tappable(m.tree, /^Show \d+ more/); if (!more) break; more.props.onPress(); await draw(m, 1); }
      const shown = new Set(text(m.tree).match(/ROW T\d\d/g) || []);
      expect(shown.size === 30, `of today's 30 postings the dashboard shows ${shown.size}${m.failed ? " (" + m.failed.message + ")" : ""}`);
      expect(/Today's Transactions \(30\)/.test(text(m.tree)), `heading: ${(text(m.tree).match(/(Today's|Recent) Transactions[^A-Z]*/) || ["?"])[0]}`);
    } finally { world.context = undefined; }
  });

  await proof("M38", "Phone transactions: reaching the end twice while page 2 loads does not show page 2 twice", async (expect) => {
    let release;
    world.context = office;
    server.reply((url) => {
      if (url.includes("/currencies")) return { baseCurrency: UGX, currencies: [] };
      if (!url.includes("/api/transaction?")) return undefined;
      if (/page=2&/.test(url)) return new Promise((r) => { const go = () => r({ items: [txn("P2A", new Date()), txn("P2B", new Date())], totalCount: 27, totalPages: 2 }); release = release ? ((f) => () => { f(); go(); })(release) : go; });
      return { items: Array.from({ length: 25 }, (_, i) => txn(`P1-${i}`, new Date())), totalCount: 27, totalPages: 2 };
    });
    try {
      const m = mount(app("screens/office/TransactionsScreen").default, {});
      await draw(m, 4);
      const list = find(m.tree, (e) => typeof e.props.onEndReached === "function")[0];
      list.props.onEndReached(); list.props.onEndReached();
      await draw(m, 1);
      if (release) release();
      await draw(m, 4);
      const t = text(m.tree);
      const twice = (t.match(/ROW P2A\b/g) || []).length;
      expect(twice === 1, `"ROW P2A" appears ${twice} times`);
    } finally { world.context = undefined; }
  });

  await proof("M36", "Phone edit client: an emptied email box removes the email", async (expect) => {
    const c = { id: "c1", code: "KB-CL-0001", fullName: "Amina Hassan", whatsAppNumber: "+256700000010", email: "wrong@example.com", idPassport: "X123", clientType: 1, isActive: true, balanceKES: 0, balanceUSD: 0, otherBalances: [] };
    world.context = office;
    server.reply((url, _b, method) => (url.includes("/currencies") ? { baseCurrency: UGX, currencies: [] }
      : method === "PUT" ? { ...c, email: null }
      : url.includes("/api/client") && !url.includes("statement") ? { items: [c], totalCount: 1, totalPages: 1 } : undefined));
    try {
      const m = mount(app("screens/office/ClientsScreen").default, {});
      await draw(m, 4);
      const row = tappable(m.tree, /Amina Hassan/);
      expect(!!row, `client not listed${m.failed ? " (" + m.failed.message + ")" : ""}`);
      if (!row) return;
      await row.props.onPress(); await draw(m, 2);
      const edit = tappable(m.tree, /^Edit$/);
      expect(!!edit, "no Edit button on the client");
      if (!edit) return;
      edit.props.onPress(); await draw(m, 2);
      field(m.tree, /Email/).props.onChangeText(""); await draw(m, 1);
      await tappable(m.tree, /^Save$/).props.onPress(); await draw(m, 2);
      const put = server.requests.find((r) => r.method === "PUT" && r.url.includes("/api/client/c1"));
      expect(!!put, `nothing saved: ${JSON.stringify(toasts)}`);
      if (put) expect(put.body.email === "", `sent email=${JSON.stringify(put.body.email)} (undefined keeps the old email)`);
    } finally { world.context = undefined; }
  });
});
