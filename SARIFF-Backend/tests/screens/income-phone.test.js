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

  // ---------- the phone Income screen: accounts and their statements
  const full = [{ id: "a-com", name: "Commission", description: null, isActive: true, postings: 3, totals: [{ currency: KES, amount: 12000 }] },
    { id: "a-new", name: "Consultancy", description: "Advisory", isActive: true, postings: 0, totals: [] }];
  const statement = { accountId: "a-com", accountName: "Commission", isActive: true, toUtcExclusive: "", byCurrency: [{ currency: KES, opening: 10000, inPeriod: 2000, closing: 12000, lines: [
    { transactionId: "t1", code: "TXN-0101", date: "2026-11-03T08:00:00Z", description: "Commission: October", receivedInto: "M-Pesa Moi Ave - 123456", amount: 5000, runningTotal: 15000, isReversal: false, isReversed: true },
    { transactionId: "t2", code: "TXN-0102", date: "2026-11-04T08:00:00Z", description: "Reversal of TXN-0101", receivedInto: "M-Pesa Moi Ave - 123456", amount: -5000, runningTotal: 10000, isReversal: true, isReversed: false },
    { transactionId: "t3", code: "TXN-0103", date: "2026-11-05T08:00:00Z", description: "Commission: corrected", receivedInto: "KCB - 001", amount: 2000, runningTotal: 12000, isReversal: false, isReversed: false }] }] };

  await proof("I11", "Phone Income: accounts with their totals; New creates one by name", async (expect) => {
    world.context = office;
    server.reply((url, body, method) => (url.endsWith("/api/income/accounts") && method === "POST" ? { id: "x", name: body.name }
      : url.includes("/api/income/accounts") ? full : undefined));
    try {
      const m = mount(app("screens/office/IncomeScreen").default, {});
      await draw(m, 4);
      const t = text(m.tree);
      expect(/Commission/.test(t) && /12,000/.test(t) && /3 postings/.test(t) && /Consultancy/.test(t) && /Nothing recorded yet/.test(t), `list: ${t.slice(0, 400)}`);
      find(m.tree, (e) => e.props.accessibilityLabel === "New income account")[0].props.onPress();
      await draw(m, 1);
      field(m.tree, /Name/).props.onChangeText("  Rent received ");
      await draw(m, 1);
      await pressText(m, /^\s*Create\s*$/).props.onPress();
      await draw(m, 3);
      const post = server.requests.find((r) => r.url.endsWith("/api/income/accounts") && r.method === "POST");
      expect(!!post && post.body.name === "Rent received", `sent: ${JSON.stringify(post && post.body)}`);
      pressText(m, /Commission.*12,000/).props.onPress();
      await draw(m, 1);
      expect(/This month/.test(text(m.tree)) && /All time/.test(text(m.tree)), "tapping an account doesn't open its statement");
    } finally { world.context = undefined; }
  });

  await proof("I12", "Phone Income: an account's statement — earned before, each line with its running total, a reversal in minus, earned to date", async (expect) => {
    world.context = office;
    server.reply((url) => (url.includes("/api/income/accounts/a-com/statement") ? statement : url.includes("/api/income/accounts") ? full : undefined));
    try {
      // Tapping an account opens IncomeStatementView (I11 covers the list); mounted on its own here
      // because the kit runs effects only for the mounted screen.
      const m = mount(app("screens/office/IncomeScreen").IncomeStatementView, { account: full[0], onBack() {} });
      await draw(m, 4);
      const t = text(m.tree);
      expect(/Earned before/.test(t) && /10,000/.test(t), `opening: ${t.slice(0, 400)}`);
      expect(/Commission: October\s*· Reversed/.test(t) && /15,000/.test(t), "the reversed line");
      expect(/−\s*KES\s*5,000|−KES 5,000|−.*5,000/.test(t), "the reversal in minus");
      expect(/Earned to/.test(t) && /12,000/.test(t), "closing");
      const asked = server.requests.find((r) => r.url.includes("/statement"));
      expect(!!asked && /startDate=\d{4}-\d{2}-01/.test(asked.url), `asked: ${asked && asked.url}`);
      tappable(m.tree, /^\s*All time\s*$/).props.onPress();
      await draw(m, 3);
      const again = server.requests.filter((r) => r.url.includes("/statement")).pop();
      expect(!!again && !/startDate/.test(again.url), `all time asked: ${again && again.url}`);
    } finally { world.context = undefined; }
  });

  await proof("I13", "Phone Income: record from a statement — choose where it was received, Dr that account, Cr the income account", async (expect) => {
    world.context = office;
    server.reply((url, body, method) => (url.includes("/api/income/accounts/a-com/statement") ? statement
      : url.includes("/api/income/accounts") ? full
      : url.includes("/api/transaction-pin/status") ? { isEnabled: false, hasPin: false }
      : /\/api\/income$/.test(url.split("?")[0]) && method === "POST" ? { id: "t1" }
      : /\/api\/mpesa$/.test(url) ? [wallet] : /\/api\/bank$/.test(url) ? [bank] : /\/api\/cash$/.test(url) ? [] : undefined));
    try {
      // Tapping an account opens IncomeStatementView (I11 covers the list); mounted on its own here
      // because the kit runs effects only for the mounted screen.
      const m = mount(app("screens/office/IncomeScreen").IncomeStatementView, { account: full[0], onBack() {} });
      await draw(m, 4);
      find(m.tree, (e) => e.props.accessibilityLabel === "Record income")[0].props.onPress();
      await draw(m, 4);
      tappable(m.tree, /^\s*KCB \(KES\)\s*$/).props.onPress();
      await draw(m, 1);
      field(m.tree, /Amount \(/).props.onChangeText("2,500");
      await draw(m, 1);
      expect(/Dr KCB .*2,500.* · Cr Commission .*2,500/.test(text(m.tree)), "the entry is not shown");
      await pressText(m, /^\s*Record income\s*$/).props.onPress();
      await draw(m, 4);
      const post = server.requests.find(isPost);
      expect(!!post && post.body.incomeAccountId === "a-com" && post.body.destAccountType === 1 && post.body.destAccountId === "b1" && post.body.amount === 2500,
        `sent: ${JSON.stringify(post && post.body)}`);
    } finally { world.context = undefined; }
  });

  await proof("I14", "Phone Income: 'Last month' asks for the whole of last month", async (expect) => {
    const { periodDates } = app("screens/office/IncomeScreen");
    const r = periodDates("last", new Date(2026, 0, 15));   // 15 Jan 2026
    expect(r.from === "2025-12-01" && r.to === "2025-12-31", JSON.stringify(r));
    const m = periodDates("month", new Date(2026, 10, 20));
    expect(m.from === "2026-11-01" && m.to === "2026-11-20", JSON.stringify(m));
  });

  await proof("I17", "Phone: record income with the PIN on — the PIN is asked, checked, then the income is sent once", async (expect) => {
    world.context = office;
    server.reply((url, body, method) => (url.includes("/currencies") ? { baseCurrency: KES, currencies: [] }
      : url.includes("/api/income/accounts") ? accounts
      : url.includes("/api/transaction-pin/status") ? { isEnabled: true, hasPin: true }
      : url.includes("/api/transaction-pin/verify") ? (body.pin === "4821")
      : /\/api\/income$/.test(url.split("?")[0]) && method === "POST" ? { id: "t1" }
      : /\/api\/mpesa$/.test(url) ? [wallet] : /\/api\/bank$/.test(url) ? [bank] : /\/api\/cash$/.test(url) ? [] : undefined));
    try {
      const m = await openSheet(/^\s*Mobile money\s*$/, /M-Pesa Moi Ave/);
      field(m.tree, /Amount \(/).props.onChangeText("9,000");
      await draw(m, 1);
      await pressText(m, /^\s*Record income\s*$/).props.onPress();
      await draw(m, 3);
      expect(/Transaction PIN/.test(text(m.tree)) && /Confirm with PIN/.test(text(m.tree)), "the PIN is not asked");
      expect(!server.requests.some(isPost), "sent before the PIN");
      field(m.tree, /Transaction PIN/).props.onChangeText("0000");
      await draw(m, 1);
      await pressText(m, /^\s*Confirm with PIN\s*$/).props.onPress();
      await draw(m, 3);
      expect(!server.requests.some(isPost), "sent after a wrong PIN");
      field(m.tree, /Transaction PIN/).props.onChangeText("4821");
      await draw(m, 1);
      await pressText(m, /^\s*Confirm with PIN\s*$/).props.onPress();
      await draw(m, 4);
      const posts = server.requests.filter(isPost);
      expect(posts.length === 1 && posts[0].body.amount === 9000, `posts: ${posts.length}`);
    } finally { world.context = undefined; }
  });

  await proof("I18", "Phone statement: Reverse a line — a till/bank/wallet line by the general reversal, a client fee through the client's statement", async (expect) => {
    world.context = office;
    const st = { ...statement, byCurrency: [{ ...statement.byCurrency[0], lines: [
      ...statement.byCurrency[0].lines.map((l) => ({ ...l, receivedIntoType: 1, receivedIntoId: "b1" })),
      { transactionId: "t-fee", code: "TXN-0104", date: "2026-11-06T08:00:00Z", description: "Statement fee", receivedInto: "Amina Yusuf (KB-C-001), charged",
        amount: 300, runningTotal: 12300, isReversal: false, isReversed: false, receivedIntoType: 3, receivedIntoId: "c-amina" }] }] };
    server.reply((url, body, method) => (url.includes("/statement") ? st
      : url.includes("/api/transaction-pin/status") ? { isEnabled: false, hasPin: false }
      : method === "DELETE" ? true : undefined));
    try {
      const m = mount(app("screens/office/IncomeScreen").IncomeStatementView, { account: full[0], onBack() {} });
      await draw(m, 4);
      const rev = (code) => find(m.tree, (e) => e.props.accessibilityLabel === `Reverse ${code}`)[0];
      expect(!rev("TXN-0101") && !rev("TXN-0102") && !!rev("TXN-0103") && !!rev("TXN-0104"), "Reverse offered on a reversed line or a reversal");
      rev("TXN-0103").props.onPress();
      await draw(m, 1);
      field(m.tree, /Reason/).props.onChangeText("Wrong amount");
      await draw(m, 1);
      await pressText(m, /^\s*Reverse\s*$/).props.onPress();
      await draw(m, 3);
      rev("TXN-0104").props.onPress();
      await draw(m, 1);
      field(m.tree, /Reason/).props.onChangeText("Fee waived");
      await draw(m, 1);
      await pressText(m, /^\s*Reverse\s*$/).props.onPress();
      await draw(m, 3);
      const dels = server.requests.filter((r) => r.method === "DELETE").map((r) => `${r.url.split("?")[0].replace(/^.*\/api/, "/api")} ${r.body && r.body.reason}`);
      expect(dels.length === 2 && dels[0] === "/api/transaction/t3 Wrong amount" && dels[1] === "/api/client/c-amina/transaction/t-fee Fee waived", `sent: ${JSON.stringify(dels)}`);
    } finally { world.context = undefined; }
  });

  await proof("I19", "Phone: charge a fee to a client from the statement — find her, pick the currency, Dr client (balance down), Cr the income account", async (expect) => {
    world.context = office;
    server.reply((url, body, method) => (url.includes("/statement") ? statement
      : url.includes("/currencies") ? { baseCurrency: KES, currencies: [] }
      : url.includes("/api/client?") ? { items: [{ id: "c-amina", fullName: "Amina Yusuf", code: "KB-C-001" }], totalCount: 1 }
      : url.includes("/api/transaction-pin/status") ? { isEnabled: false, hasPin: false }
      : /\/api\/income$/.test(url.split("?")[0]) && method === "POST" ? { id: "t9" }
      : /\/api\/mpesa$/.test(url) ? [wallet] : /\/api\/bank$/.test(url) ? [bank] : /\/api\/cash$/.test(url) ? [] : undefined));
    try {
      const m = mount(app("screens/office/IncomeScreen").IncomeStatementView, { account: full[0], onBack() {} });
      await draw(m, 4);
      find(m.tree, (e) => e.props.accessibilityLabel === "Record income")[0].props.onPress();
      await draw(m, 4);
      tappable(m.tree, /^\s*Charge a client \(a fee\)\s*$/).props.onPress();
      await draw(m, 1);
      field(m.tree, /Client \(name/).props.onChangeText("Ami");
      for (let i = 0; i < 4; i++) await draw(m, 2), await tick(120);
      const hit = pressText(m, /Amina Yusuf \(KB-C-001\)/);
      expect(!!hit, `no search result: ${text(m.tree).slice(-300)}`);
      await hit.props.onPress();
      await draw(m, 1);
      tappable(m.tree, /^\s*USD\s*$/).props.onPress();
      await draw(m, 1);
      field(m.tree, /Amount \(/).props.onChangeText("5");
      await draw(m, 1);
      expect(/Dr Amina Yusuf \(KB-C-001\) .*5.* \(their balance goes down\) · Cr Commission/.test(text(m.tree)), "the entry is not shown");
      await pressText(m, /^\s*Record income\s*$/).props.onPress();
      await draw(m, 4);
      const post = server.requests.find(isPost);
      expect(!!post && post.body.destAccountType === 3 && post.body.destAccountId === "c-amina" && post.body.currency === 1 && post.body.amount === 5 && post.body.incomeAccountId === "a-com",
        `sent: ${JSON.stringify(post && post.body)}`);
      const search = server.requests.find((r) => r.url.includes("/api/client?"));
      expect(!!search && /Ami/.test(search.url), `searched: ${search && search.url}`);
    } finally { world.context = undefined; }
  });
});
