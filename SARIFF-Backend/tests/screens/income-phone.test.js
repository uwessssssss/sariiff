// Phone tests for recording income into the bureau's own income accounts (20 Nov). Tax left out.
//   TZ=Africa/Nairobi node income-phone.test.js <sariff-mobile/src> <web>
const { suite, app, mount, text, find, tick, proof, server, world, phone, tappable, field, signedIn } = require("./phone-kit");

const KES = 0;
const noop = () => {};
const draw = async (m, times = 4) => { for (let i = 0; i < times; i++) { await tick(15); try { m.render(); } catch (e) { m.failed = e; } } return m.tree; };
const office = { user: { id: "u1", code: "KB-OFF-1", fullName: "Amina Hassan", role: 1, companyName: "Nairobi Bureau" }, logout: noop, isAuthenticated: true };
const accounts = [{ id: "a-com", name: "Commission", isActive: true }, { id: "a-rent", name: "Rent received", isActive: true }, { id: "a-old", name: "Old income", isActive: false }];
const wallet = { id: "w1", code: "MP-1", agentName: "M-Pesa Moi Ave", agentNumber: "123456", phoneNumber: "+254700000009", provider: 0, currency: KES,
  balance: 0, openingBalance: 0, totalDebit: 0, totalCredit: 0, netMovement: 0, isActive: true, createdAt: "" };
const bank = { id: "b1", bankName: "KCB", accountName: "Main", accountNumber: "001", currency: KES, balance: 0, openingBalance: 0, isActive: true };
const isPost = (r) => /\/api\/income$/.test(r.url.split("?")[0]) && r.method === "POST";
const pressText = (m, re) => find(m.tree, (e) => typeof e.props.onPress === "function" && re.test(text(e))).pop();

function serve(extra = {}) {
  server.reply((url, body, method) => (url.includes("/currencies") ? { baseCurrency: KES, currencies: [] }
    : url.includes("/api/income/accounts") ? (extra.accounts ?? accounts)
    : url.includes("/api/transaction-pin/status") ? { isEnabled: false, hasPin: false }
    : /\/api\/income$/.test(url.split("?")[0]) && method === "POST" ? { id: "t1" }
    : /\/api\/mpesa$/.test(url) ? [wallet] : /\/api\/bank$/.test(url) ? [bank] : /\/api\/cash$/.test(url) ? [] : undefined));
}

async function openSheet(tabRe, cardRe) {
  const m = mount(app("screens/office/AccountsScreen").default, {});
  await draw(m, 4);
  tappable(m.tree, tabRe).props.onPress();
  await draw(m, 1);
  phone.reset();
  find(m.tree, (e) => typeof e.props.onLongPress === "function" && cardRe.test(text(e)))[0].props.onLongPress();
  const choice = (phone.alerts[0]?.buttons || []).find((b) => b.text === "Record income");
  if (!choice) throw new Error(`long-press offers: ${JSON.stringify((phone.alerts[0]?.buttons || []).map((b) => b.text))}`);
  choice.onPress();
  await draw(m, 3);
  return m;
}

suite(async () => {
  signedIn();
  app("hooks/useBaseCurrency").resetBaseCurrency();

  await proof("I7", "Phone: record income from a wallet — only switched-on accounts offered (Commission first), no tax field", async (expect) => {
    world.context = office;
    serve();
    try {
      const m = await openSheet(/^\s*Mobile money\s*$/, /M-Pesa Moi Ave/);
      const t = text(m.tree);
      expect(/Commission/.test(t) && /Rent received/.test(t) && !/Old income/.test(t), `accounts offered: ${(t.match(/Choose the income account.{0,120}/) || ["?"])[0]}`);
      expect(!/Tax withheld/.test(t), "there is still a tax field");
      field(m.tree, /Amount \(/).props.onChangeText("9,000");
      await draw(m, 1);
      expect(/Dr M-Pesa Moi Ave .*9,000.* · Cr Commission .*9,000/.test(text(m.tree)), "the entry is not shown");
      await pressText(m, /^\s*Record income\s*$/).props.onPress();
      await draw(m, 4);
      const post = server.requests.find(isPost);
      expect(!!post && post.body.incomeAccountId === "a-com" && post.body.amount === 9000 && post.body.destAccountType === 2
        && post.body.destAccountId === "w1" && post.body.currency === KES && !("withholdingTax" in post.body), `sent: ${JSON.stringify(post && post.body)}`);
    } finally { world.context = undefined; }
  });

  await proof("I8", "Phone: rent received into a bank account — choose the account, 40,000", async (expect) => {
    world.context = office;
    serve();
    try {
      const m = await openSheet(/^\s*Banks?\s*$/, /KCB/);
      tappable(m.tree, /^\s*Rent received\s*$/).props.onPress();
      await draw(m, 1);
      field(m.tree, /Amount \(/).props.onChangeText("40,000");
      await draw(m, 1);
      await pressText(m, /^\s*Record income\s*$/).props.onPress();
      await draw(m, 4);
      const post = server.requests.find(isPost);
      expect(!!post && post.body.incomeAccountId === "a-rent" && post.body.destAccountType === 1 && post.body.destAccountId === "b1" && post.body.amount === 40000,
        `sent: ${JSON.stringify(post && post.body)}`);
    } finally { world.context = undefined; }
  });

  await proof("I9", "Phone: no income accounts yet → says to create one on the web, and nothing can be sent", async (expect) => {
    world.context = office;
    serve({ accounts: [] });
    try {
      const m = await openSheet(/^\s*Mobile money\s*$/, /M-Pesa Moi Ave/);
      expect(/No income accounts yet/.test(text(m.tree)), "no explanation");
      field(m.tree, /Amount \(/).props.onChangeText("100");
      await draw(m, 1);
      const press = pressText(m, /^\s*Record income\s*$/);
      if (press) await press.props.onPress();
      await draw(m, 2);
      expect(!server.requests.some(isPost), "it was sent anyway");
    } finally { world.context = undefined; }
  });
});
