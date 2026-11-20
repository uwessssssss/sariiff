// Web tests for income accounts the bureau names itself, recording income, and each account's
// statement (owner, 20 Nov: "I want to create type of income account. There should be statements
// of particular income." Tax left out). A new feature: runs on the current app only.
const { withBrowser, suite, app, mount, text, find, tag, tick, proof, server, toasts } = require("./kit");
const KES = 0, UGX = 2;

const box = (tree, id) => find(tree, (e) => tag(e) === "input" && e.props.id === id)[0];
const type = (m, id, value) => { box(m.tree, id).props.onChange({ target: { value } }); m.render(); };
const pick = (m, id, value) => { find(m.tree, (e) => tag(e) === "select" && e.props.id === id)[0].props.onChange({ target: { value } }); m.render(); };
const submitButton = (tree) => find(tree, (e) => tag(e) === "button" && e.props.type === "submit")[0];
const submit = async (m) => { await find(m.tree, (e) => tag(e) === "form")[0].props.onSubmit({ preventDefault() {} }); for (let i = 0; i < 6; i++) { await tick(10); m.render(); } };
const path = (r) => r.url.split("?")[0];

const accounts = [
  { id: "a-com", name: "Commission", description: null, isActive: true, postings: 2, totals: [{ currency: KES, currencyCode: "KES", amount: 12000 }] },
  { id: "a-con", name: "Consultancy", description: "Advisory work", isActive: true, postings: 0, totals: [] },
  { id: "a-old", name: "Old rent", description: null, isActive: false, postings: 1, totals: [{ currency: KES, currencyCode: "KES", amount: 500 }] },
];
const receivers = [{ type: 0, id: "till-kes", name: "Cash till (KES)", currency: KES }, { type: 1, id: "bank-1", name: "KCB – Main", currency: KES }];

suite(async () => {
  const { IncomeAccount, IncomeAccountModal, RecordIncomeModal, IncomeStatement } = app("components/office/income/IncomeAccount");

  await proof("I1", "New income account: the bureau names it; the name is sent trimmed", async (expect) => {
    server.reply((url, body, method) => (url.endsWith("/api/income/accounts") && method === "POST" ? { id: "new", name: body.name, isActive: true, postings: 0, totals: [] } : undefined));
    let saved = 0;
    const m = mount(IncomeAccountModal, { account: null, onClose() {}, onSaved: () => { saved++; } });
    expect(submitButton(m.tree).props.disabled === true, "Create is enabled with no name");
    type(m, "income-account-name", "  Consultancy  ");
    type(m, "income-account-description", "Advisory work");
    await submit(m);
    const post = server.requests.find((r) => path(r).endsWith("/api/income/accounts") && r.method === "POST");
    expect(!!post && post.body.name === "Consultancy" && post.body.description === "Advisory work", `sent: ${JSON.stringify(post && post.body)}`);
    expect(saved === 1, `onSaved called ${saved} times`);
  });

  await proof("I2", "Record income: 40,000 into the bank → Dr bank, Cr the income account; no tax field", async (expect) => {
    server.reply((url, body, method) => (/\/api\/income$/.test(url.split("?")[0]) && method === "POST" ? { id: "t1" } : undefined));
    let saved = 0;
    await withBrowser(async () => {
      const m = mount(RecordIncomeModal, { accounts: accounts.filter((a) => a.isActive), receivers, onClose() {}, onSaved: () => { saved++; } });
      expect(!box(m.tree, "income-tax"), "there is still a tax field");
      pick(m, "income-account", "a-con");
      pick(m, "income-into", "1:bank-1");
      type(m, "income-amount", "40,000");
      type(m, "income-description", "Shop 3, November");
      expect(/Dr KCB – Main KES 40,000 · Cr Consultancy KES 40,000/.test(text(m.tree)), `entry: ${text(m.tree).slice(0, 400)}`);
      await submit(m);
    });
    const post = server.requests.find((r) => /\/api\/income$/.test(path(r)) && r.method === "POST");
    expect(!!post && post.body.incomeAccountId === "a-con" && post.body.destAccountType === 1 && post.body.destAccountId === "bank-1"
      && post.body.amount === 40000 && post.body.currency === KES && post.body.description === "Shop 3, November" && !("withholdingTax" in post.body),
      `sent: ${JSON.stringify(post && post.body)}`);
    expect(saved === 1, `onSaved called ${saved} times`);
    expect(toasts.some(([k, msg]) => k === "success" && /Consultancy: KES 40,000 into KCB – Main/.test(msg)), `toasts: ${JSON.stringify(toasts)}`);
  });

  await proof("I3", "Record income: a zero or text amount is refused before sending", async (expect) => {
    await withBrowser(async () => {
      const m = mount(RecordIncomeModal, { accounts: accounts.filter((a) => a.isActive), receivers, onClose() {}, onSaved() {} });
      type(m, "income-amount", "0");
      expect(/Enter the amount as a number above zero/.test(text(m.tree)) && submitButton(m.tree).props.disabled === true, "zero accepted");
      type(m, "income-amount", "ten");
      expect(submitButton(m.tree).props.disabled === true, "text accepted");
      await submit(m);
    });
    expect(!server.requests.some((r) => /\/api\/income$/.test(path(r)) && r.method === "POST"), "it was sent anyway");
  });

  await proof("I4", "Income page: accounts listed with totals; a switched-off one is marked; delete only where nothing is posted; summary per currency", async (expect) => {
    server.reply((url) => {
      if (url.includes("/api/income/accounts")) return accounts;
      if (url.includes("/api/income/summary")) return { fromUtc: "", toUtcExclusive: "", byCurrency: [
        { currency: KES, totalIncome: 12000, eFloat: 0, cashOnHand: 0, byAccount: [{ id: "a-com", name: "Commission", amount: 12000, postings: 2 }] },
        { currency: UGX, totalIncome: 250000, eFloat: 0, cashOnHand: 0, byAccount: [{ id: "a-com", name: "Commission", amount: 250000, postings: 1 }] }] };
      if (url.includes("/api/cash")) return [{ id: "till-kes", currency: KES }];
      return undefined;
    });
    await withBrowser(async () => {
      const m = mount(IncomeAccount, {});
      for (let i = 0; i < 6; i++) { await tick(10); m.render(); }
      const row = (name) => find(m.tree, (e) => e.props && e.props["data-account"] === name)[0];
      expect(!!row("Commission") && !!row("Consultancy") && !!row("Old rent"), "not every account is listed");
      expect(/KES 12,000 · 2 postings/.test(text(row("Commission"))), `Commission row: ${row("Commission") && text(row("Commission"))}`);
      expect(/Nothing recorded yet/.test(text(row("Consultancy"))) && /Advisory work/.test(text(row("Consultancy"))), "Consultancy row");
      expect(/Switched off/.test(text(row("Old rent"))) && /Switch on/.test(text(row("Old rent"))), "the switched-off account is not marked");
      const del = (name) => find(row(name), (e) => tag(e) === "button" && /Delete/.test(text(e))).length;
      expect(del("Consultancy") === 1 && del("Commission") === 0 && del("Old rent") === 0, "Delete offered where postings exist");
      const kes = find(m.tree, (e) => e.props && e.props["data-currency"] === "KES")[0];
      const ugx = find(m.tree, (e) => e.props && e.props["data-currency"] === "UGX")[0];
      expect(kes && /KES 12,000/.test(text(kes)) && ugx && /UGX 250,000/.test(text(ugx)) && !/UGX/.test(text(kes)), "summary per currency");
    });
  });

  await proof("I5", "Statement of one income account: earned before, each posting with a running total, a reversal in minus, earned to date", async (expect) => {
    server.reply((url) => (url.includes("/api/income/accounts/a-com/statement") ? {
      accountId: "a-com", accountName: "Commission", isActive: true, fromUtc: "", toUtcExclusive: "",
      byCurrency: [{ currency: KES, opening: 10000, inPeriod: 2000, closing: 12000, lines: [
        { transactionId: "t1", code: "TXN-0101", date: "2026-11-03T08:00:00Z", description: "Commission: October", receivedInto: "M-Pesa Moi Ave - 123456", amount: 5000, runningTotal: 15000, isReversal: false, isReversed: true },
        { transactionId: "t2", code: "REV-0101", date: "2026-11-04T08:00:00Z", description: "Reversal of TXN-0101", receivedInto: "M-Pesa Moi Ave - 123456", amount: -5000, runningTotal: 10000, isReversal: true, isReversed: false },
        { transactionId: "t3", code: "TXN-0102", date: "2026-11-05T08:00:00Z", description: "Commission: October (corrected)", receivedInto: "KCB - 001", amount: 2000, runningTotal: 12000, isReversal: false, isReversed: false },
      ] }] } : undefined));
    await withBrowser(async () => {
      const m = mount(IncomeStatement, { account: accounts[0], initialFrom: "2026-11-01", initialTo: "2026-11-20", onBack() {} });
      for (let i = 0; i < 6; i++) { await tick(10); m.render(); }
      const t = text(m.tree);
      expect(/Commission: statement/.test(t), "no title");
      expect(/Earned before 01 Nov 2026\s*KES 10,000/.test(t), `opening: ${t.slice(0, 500)}`);
      const lineEl = (code) => find(m.tree, (e) => e.props && e.props["data-code"] === code)[0];
      const line = (code) => (lineEl(code) ? text(lineEl(code)) : "");
      expect(/TXN-0101/.test(line("TXN-0101")) && /Reversed/.test(line("TXN-0101")) && /KES 15,000/.test(line("TXN-0101")), `line 1: ${line("TXN-0101")}`);
      expect(/−KES 5,000/.test(line("REV-0101")) && /KES 10,000/.test(line("REV-0101")), `reversal: ${line("REV-0101")}`);
      expect(/KCB - 001/.test(line("TXN-0102")) && /KES 12,000/.test(line("TXN-0102")), `line 3: ${line("TXN-0102")}`);
      expect(/Earned to 20 Nov 2026\s*KES 12,000/.test(t) && /Earned in these dates: KES 2,000/.test(t), "closing / period");
      const reverse = (code) => (lineEl(code) ? find(lineEl(code), (e) => tag(e) === "button" && /Reverse/.test(text(e))).length : -1);
      expect(reverse("TXN-0102") === 1 && reverse("TXN-0101") === 0 && reverse("REV-0101") === 0, "Reverse offered on a reversed line or a reversal");
    });
    const asked = server.requests.find((r) => r.url.includes("/statement"));
    expect(!!asked && /startDate=2026-11-01/.test(asked.url) && /endDate=2026-11-20/.test(asked.url), `asked: ${asked && asked.url}`);
  });

  await proof("I6", "Income is in the office menu, after Expenses; the mobile money page shows the float, not commission", async (expect) => {
    const { NAV } = app("components/office-shell/helpers");
    const ids = NAV.map((n) => n.id);
    expect(ids.indexOf("income") === ids.indexOf("expenses") + 1, `menu: ${ids.join(", ")}`);
    const { FloatPanel } = app("components/office/mpesa/sections/FloatPanel");
    server.reply((url) => (url.includes("/api/income/summary") ? { fromUtc: "", toUtcExclusive: "", byCurrency: [
      { currency: UGX, totalIncome: 0, byAccount: [], eFloat: 3000000, cashOnHand: 2000000 },
      { currency: KES, totalIncome: 0, byAccount: [], eFloat: 50000, cashOnHand: 0 }] } : undefined));
    const m = mount(FloatPanel, {});
    for (let i = 0; i < 4; i++) { await tick(10); m.render(); }
    const rowEl = (c) => find(m.tree, (e) => tag(e) === "tr" && e.props["data-currency"] === c)[0];
    const row = (c) => (rowEl(c) ? text(rowEl(c)) : "");
    expect(/UGX 3,000,000/.test(row("UGX")) && /UGX 5,000,000/.test(row("UGX")), `UGX: ${row("UGX")}`);
    expect(/KES 50,000/.test(row("KES")) && !/UGX/.test(row("KES")), `KES: ${row("KES")}`);
    expect(!/commission|tax/i.test(text(m.tree)), "the float panel still talks about commission or tax");
  });
});
