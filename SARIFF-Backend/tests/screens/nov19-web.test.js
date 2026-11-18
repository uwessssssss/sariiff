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
      expect(!!shown && shown.todayTransactions && shown.todayTransactions.totalCount === 3, "the dashboard figures wait for the list of postings (still loading)");
    } finally { world.context = undefined; }
  });

  await proof("W73", "Sign-in: the dashboard's code is fetched while the SMS code is being typed", async (expect) => {
    const router = fromWeb("next/dist/shared/lib/app-router-context.shared-runtime").AppRouterContext._currentValue;
    const prefetched = []; const before = router.prefetch;
    router.prefetch = (p) => prefetched.push(p);
    world.context = { login: async () => ({ success: true, requiresOtp: true, message: "Code sent" }), verifyOtp: async () => ({ success: false }), isLoading: false, user: null };
    try {
      const box = (tree, ph) => find(tree, (e) => tag(e) === "input" && ph.test(e.props.placeholder || ""))[0];
      const m = mount(app("app/login/page").default, {});
      box(m.tree, /^AFB-2026-0001$/).props.onChange({ target: { value: "KB-2026-0001" } });
      box(m.render(), /^\+254712345678$/).props.onChange({ target: { value: "+256772123456" } });
      find(m.render(), (e) => tag(e) === "input" && (e.props.type === "password" || e.props.autoComplete === "current-password"))[0].props.onChange({ target: { value: "Passw0rd!" } });
      await find(m.render(), (e) => tag(e) === "form")[0].props.onSubmit({ preventDefault() {} });
      for (let i = 0; i < 4; i++) { await tick(10); m.render(); }
      expect(/code/i.test(text(m.tree)), "the SMS-code step was not reached");
      expect(prefetched.includes("/office/dashboard"), `prefetched while typing the code: ${JSON.stringify(prefetched)}`);
    } finally { router.prefetch = before; world.context = undefined; }
  });
});
