// Web tests for the 19 Nov dashboard-after-sign-in fixes. Old app for the proof run = 108c9b0.
const { fromWeb, world, withBrowser, suite, app, mount, mountHook, text, find, tag, tick, proof, server } = require("./kit");
const UGX = 2;

suite(async () => {
  // ------------------------------------------------------------------ dashboard after sign-in (19 Nov)
  const statsBody = { cashBalances: [], bankBalances: [], mpesaBalances: [], todayTransactions: { totalCount: 3, byCurrency: [] }, recentTransactions: [], holdings: [] };

  await proof("W71", "Office dashboard after sign-in (Ugandan bureau): loaded once, not twice", async (expect) => {
    app("lib/useBaseCurrency").resetBaseCurrency();   // as right after a sign-in
    server.reply((url) => (url.includes("/currencies") ? new Promise((r) => setTimeout(() => r({ baseCurrency: UGX, currencies: [] }), 30))
      : /\/api\/dashboard(\?|$)/.test(url) ? statsBody : url.includes("/api/transaction/recent") ? [] : url.includes("/rate") ? null : undefined));
    world.context = { user: { id: "u1", name: "Amina", role: "office-user", companyId: "co1" }, logout() {}, isLoading: false };
    try {
      await withBrowser(async () => {
        global.window.innerWidth = 1400; global.window.history = { replaceState() {} };
        const m = mountHook(app("components/office-shell/useOfficeUserDashboard").useOfficeUserDashboard, { userName: "Amina", onLogout() {}, activeTab: "dashboard" });
        for (let i = 0; i < 12; i++) { await tick(15); m.render(); }
      });
      const loads = server.requests.filter((r) => /\/api\/dashboard(\?|$)/.test(r.url)).length;
      expect(loads === 1, `the dashboard was requested ${loads} times on one sign-in`);
    } finally { world.context = undefined; }
  });

  await proof("W72", "Office dashboard: the figures show while the latest postings are still loading", async (expect) => {
    server.reply((url) => (url.includes("/currencies") ? { baseCurrency: UGX, currencies: [] }
      : /\/api\/dashboard(\?|$)/.test(url) ? statsBody
      : url.includes("/api/transaction/recent") ? new Promise(() => {}) : null));
    world.context = { user: { id: "u1", name: "Amina", role: "office-user", companyId: "co1" }, logout() {}, isLoading: false };
    try {
      let shown = null;
      await withBrowser(async () => {
        global.window.innerWidth = 1400; global.window.history = { replaceState() {} };
        const m = mountHook(app("components/office-shell/useOfficeUserDashboard").useOfficeUserDashboard, { userName: "Amina", onLogout() {}, activeTab: "dashboard" });
        for (let i = 0; i < 8; i++) { await tick(15); m.render(); }
        shown = m.api.stats;
      });
      expect(!!shown && shown.todayTransactions === 3, `the dashboard figures wait for the list of postings (still loading): stats = ${JSON.stringify(shown && { todayTransactions: shown.todayTransactions })}`);
    } finally { world.context = undefined; }
  });
  // W73 (prefetching the dashboards on the login page) was withdrawn: before sign-in the
  // middleware answers those prefetches with a redirect to /login, Next caches that, and the
  // push to the dashboard after the code then stayed on the login page. The browser
  // sign-in tests in Full tests caught it.
});
});
