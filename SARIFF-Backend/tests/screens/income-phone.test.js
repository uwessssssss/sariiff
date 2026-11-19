// Phone test for mobile money commission (19 Nov). A new feature: runs on the current app only.
//   TZ=Africa/Nairobi node income-phone.test.js <sariff-mobile/src> <web>
const { suite, app, mount, text, find, tick, proof, server, toasts, world, phone, tappable, field, signedIn } = require("./phone-kit");

const KES = 0;
const noop = () => {};
const draw = async (m, times = 4) => { for (let i = 0; i < times; i++) { await tick(15); try { m.render(); } catch (e) { m.failed = e; } } return m.tree; };
const office = { user: { id: "u1", code: "KB-OFF-1", fullName: "Amina Hassan", role: 1, companyName: "Nairobi Bureau" }, logout: noop, isAuthenticated: true };
const kinds = [{ id: "k-com", name: "Commission" }, { id: "k-fee", name: "Fee income" }, { id: "k-rent", name: "Rent received" }, { id: "k-oth", name: "Other income" }];
const wallet = { id: "w1", code: "MP-1", agentName: "M-Pesa Moi Ave", agentNumber: "123456", phoneNumber: "+254700000009", provider: 0, currency: KES,
  balance: 0, openingBalance: 0, totalDebit: 0, totalCredit: 0, netMovement: 0, isActive: true, createdAt: "" };

suite(async () => {
  signedIn();
  app("hooks/useBaseCurrency").resetBaseCurrency();

  await proof("I4", "Phone: record income from a wallet (commission chosen) — 10,000, tax 1,000, 9,000 arrives", async (expect) => {
    world.context = office;
    server.reply((url, body, method) => (url.includes("/currencies") ? { baseCurrency: KES, currencies: [] }
      : url.includes("/api/income/accounts") ? kinds
      : /\/api\/income$/.test(url.split("?")[0]) && method === "POST" ? { net: body.amount - body.withholdingTax }
      : url.includes("/api/transaction-pin/status") ? { isEnabled: false, hasPin: false }
      : /\/api\/mpesa$/.test(url) ? [wallet] : /\/api\/(bank|cash)$/.test(url) ? [] : undefined));
    try {
      const m = mount(app("screens/office/AccountsScreen").default, {});
      await draw(m, 4);
      tappable(m.tree, /^\s*Mobile money\s*$/).props.onPress();
      await draw(m, 1);
      phone.reset();
      const card = find(m.tree, (e) => typeof e.props.onLongPress === "function" && /M-Pesa Moi Ave/.test(text(e)))[0];
      expect(!!card, "the wallet card is not shown");
      card.props.onLongPress();
      const choice = (phone.alerts[0]?.buttons || []).find((b) => b.text === "Record income");
      expect(!!choice, `long-press offers: ${JSON.stringify((phone.alerts[0]?.buttons || []).map((b) => b.text))}`);
      choice.onPress();
      await draw(m, 3);
      expect(/Commission/.test(text(m.tree)) && /Rent received/.test(text(m.tree)), "the kinds of income are not offered");
      field(m.tree, /Amount earned/).props.onChangeText("10,000");
      await draw(m, 1);
      field(m.tree, /Tax withheld/).props.onChangeText("1000");
      await draw(m, 1);
      expect(/9,000(\.00)? arrives in M-Pesa Moi Ave/.test(text(m.tree)) && /1,000(\.00)? tax to claim back/.test(text(m.tree)), `sheet: ${(text(m.tree).match(/Paid into.{0,300}/) || ["?"])[0]}`);
      const press = find(m.tree, (e) => typeof e.props.onPress === "function" && /^\s*Record income\s*$/.test(text(e))).pop();
      await press.props.onPress();
      await draw(m, 4);
      const post = server.requests.find((r) => /\/api\/income$/.test(r.url.split("?")[0]) && r.method === "POST");
      expect(!!post && post.body.incomeAccountId === "k-com" && post.body.amount === 10000 && post.body.withholdingTax === 1000 && post.body.destAccountType === 2
        && post.body.destAccountId === "w1" && post.body.currency === KES, `sent: ${JSON.stringify(post && post.body)}${m.failed ? " (" + m.failed.message + ")" : ""}`);
    } finally { world.context = undefined; }
  });

  await proof("I5", "Phone: tax equal to the commission is refused before sending", async (expect) => {
    world.context = office;
    server.reply((url) => (url.includes("/currencies") ? { baseCurrency: KES, currencies: [] } : url.includes("/api/income/accounts") ? kinds : /\/api\/mpesa$/.test(url) ? [wallet] : /\/api\/(bank|cash)$/.test(url) ? [] : undefined));
    try {
      const m = mount(app("screens/office/AccountsScreen").default, {});
      await draw(m, 4);
      tappable(m.tree, /^\s*Mobile money\s*$/).props.onPress();
      await draw(m, 1);
      phone.reset();
      find(m.tree, (e) => typeof e.props.onLongPress === "function" && /M-Pesa Moi Ave/.test(text(e)))[0].props.onLongPress();
      phone.alerts[0].buttons.find((b) => b.text === "Record income").onPress();
      await draw(m, 3);
      field(m.tree, /Amount earned/).props.onChangeText("1000");
      await draw(m, 1);
      field(m.tree, /Tax withheld/).props.onChangeText("1000");
      await draw(m, 1);
      expect(/Tax withheld must be less than the income/.test(text(m.tree)), "no explanation shown");
      const press = find(m.tree, (e) => typeof e.props.onPress === "function" && /^\s*Record income\s*$/.test(text(e))).pop();
      if (press) await press.props.onPress();
      await draw(m, 2);
      expect(!server.requests.some((r) => /\/api\/income$/.test(r.url.split("?")[0]) && r.method === "POST"), "it was sent anyway");
    } finally { world.context = undefined; }
  });

  await proof("I9", "Phone: rent received into a bank account — choose the kind, 40,000 with 4,000 tax", async (expect) => {
    world.context = office;
    const bank = { id: "b1", bankName: "KCB", accountName: "Main", accountNumber: "001", currency: KES, balance: 0, openingBalance: 0, isActive: true };
    server.reply((url, body, method) => (url.includes("/currencies") ? { baseCurrency: KES, currencies: [] }
      : url.includes("/api/income/accounts") ? kinds
      : url.includes("/api/transaction-pin/status") ? { isEnabled: false, hasPin: false }
      : /\/api\/income$/.test(url.split("?")[0]) && method === "POST" ? { ok: true }
      : /\/api\/bank$/.test(url) ? [bank] : /\/api\/(mpesa|cash)$/.test(url) ? [] : undefined));
    try {
      const m = mount(app("screens/office/AccountsScreen").default, {});
      await draw(m, 4);
      tappable(m.tree, /^\s*Banks?\s*$/).props.onPress();
      await draw(m, 1);
      phone.reset();
      find(m.tree, (e) => typeof e.props.onLongPress === "function" && /KCB/.test(text(e)))[0].props.onLongPress();
      phone.alerts[0].buttons.find((b) => b.text === "Record income").onPress();
      await draw(m, 3);
      expect(/Other income/.test(text(m.tree)), "kinds not offered");
      tappable(m.tree, /^\s*Rent received\s*$/).props.onPress();
      await draw(m, 1);
      field(m.tree, /Amount earned/).props.onChangeText("40,000");
      field(m.tree, /Tax withheld/).props.onChangeText("4000");
      await draw(m, 1);
      const press = find(m.tree, (e) => typeof e.props.onPress === "function" && /^\s*Record income\s*$/.test(text(e))).pop();
      await press.props.onPress();
      await draw(m, 4);
      const post = server.requests.find((r) => /\/api\/income$/.test(r.url.split("?")[0]) && r.method === "POST");
      expect(!!post && post.body.incomeAccountId === "k-rent" && post.body.destAccountType === 1 && post.body.destAccountId === "b1"
        && post.body.amount === 40000 && post.body.withholdingTax === 4000, `sent: ${JSON.stringify(post && post.body)}`);
    } finally { world.context = undefined; }
  });
});
