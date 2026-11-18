// Phone tests for the 19 Nov dashboard-after-sign-in fixes. Old app for the proof run = 108c9b0.
const { suite, app, mount, tick, proof, server, world, signedIn } = require("./phone-kit");
const UGX = 2;
const noop = () => {};
const draw = async (m, times = 4) => { for (let i = 0; i < times; i++) { await tick(15); try { m.render(); } catch (e) { m.failed = e; } } return m.tree; };
const office = { user: { id: "u1", code: "KB-OFF-1", fullName: "Amina Hassan", role: 1, companyName: "Kampala Bureau" }, logout: noop, isAuthenticated: true };

suite(async () => {
  signedIn();
  app("hooks/useBaseCurrency").resetBaseCurrency();

  await proof("M39", "Phone dashboard after sign-in: the figures appear while the latest postings are still loading", async (expect) => {
    const RN = require("react-native");
    const realSpring = RN.Animated.spring; let faded = 0;
    RN.Animated.spring = (...a) => { faded++; return realSpring(...a); };
    world.context = office;
    server.reply((url) => (/\/api\/dashboard$/.test(url) ? { recentTransactions: [], todayTransactions: { totalCount: 3, byCurrency: [] }, holdings: [], cashBalances: [], bankBalances: [] }
      : url.includes("/api/transaction/recent") ? new Promise(() => {})
      : url.includes("/currencies") ? { baseCurrency: UGX, currencies: [] } : undefined));
    try {
      const m = mount(app("screens/office/OfficeDashboardScreen").default, {});
      await draw(m, 6);
      expect(faded > 0, "the screen stays blank (sections never faded in) until the list of postings arrives");
    } finally { RN.Animated.spring = realSpring; world.context = undefined; }
  });
});
